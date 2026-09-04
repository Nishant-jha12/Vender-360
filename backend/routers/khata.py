"""Digital khata: customers and their running credit balance."""
from typing import List, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

import models
import schemas
import security
from database import get_db

router = APIRouter()


def _owned_customer(customer_id: str, vendor: models.Vendor, db: Session) -> models.Customer:
    customer = (
        db.query(models.Customer)
        .filter(models.Customer.id == customer_id, models.Customer.vendor_id == vendor.id)
        .first()
    )
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.get("/customers", response_model=List[schemas.CustomerResponse])
def list_customers(
    search: Optional[str] = Query(None, max_length=120),
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Read-only. The previous version inserted four invented customers when the
    table was empty, so a real shopkeeper's first login showed strangers owing
    them money. Sample data now lives behind POST /api/demo/seed."""
    query = (
        db.query(models.Customer)
        .options(joinedload(models.Customer.khata_transactions))
        .filter(models.Customer.vendor_id == vendor.id)
    )
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(models.Customer.name.ilike(pattern) | models.Customer.phone.ilike(pattern))

    return query.order_by(models.Customer.total_credit_balance.desc()).all()


@router.post("/customers", response_model=schemas.CustomerResponse, status_code=201)
def create_customer(
    req: schemas.CustomerCreate,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    customer = models.Customer(
        vendor_id=vendor.id,
        name=req.name.strip(),
        phone=(req.phone or "").strip() or None,
        total_credit_balance=req.initial_credit_balance,
    )
    db.add(customer)
    db.flush()

    if req.initial_credit_balance > 0:
        db.add(
            models.KhataTransaction(
                customer_id=customer.id,
                amount=req.initial_credit_balance,
                transaction_type="credit",
                notes="Opening balance",
            )
        )
        db.add(
            models.ActivityLog(
                vendor_id=vendor.id,
                action="Khata opened",
                details=f"{customer.name} opened with Rs {req.initial_credit_balance:.2f} outstanding.",
            )
        )

    db.commit()
    db.refresh(customer)
    return customer


@router.get("/customers/{customer_id}", response_model=schemas.CustomerResponse)
def get_customer(
    customer_id: str,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    return _owned_customer(customer_id, vendor, db)


@router.delete("/customers/{customer_id}", status_code=204)
def delete_customer(
    customer_id: str,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    customer = _owned_customer(customer_id, vendor, db)
    if (customer.total_credit_balance or 0) > 0:
        raise HTTPException(
            status_code=409,
            detail=f"{customer.name} still owes Rs {customer.total_credit_balance:.2f}. Settle the balance first.",
        )
    db.delete(customer)
    db.commit()
    return None


@router.post("/customers/{customer_id}/transaction", response_model=schemas.CustomerResponse)
def add_transaction(
    customer_id: str,
    req: schemas.TransactionCreate,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    customer = _owned_customer(customer_id, vendor, db)
    balance = customer.total_credit_balance or 0.0

    if req.transaction_type == "credit":
        customer.total_credit_balance = round(balance + req.amount, 2)
        action = "Credit given"
        detail = f"Rs {req.amount:.2f} udhaar to {customer.name}"
    else:
        # Overpayments used to be swallowed by max(0.0, balance - amount): pay
        # Rs 2000 against Rs 1450 and Rs 550 of the customer's money vanished.
        # A negative balance now correctly means the shop is holding an advance.
        customer.total_credit_balance = round(balance - req.amount, 2)
        action = "Payment received"
        detail = f"Rs {req.amount:.2f} settled by {customer.name}"
        if customer.total_credit_balance < 0:
            detail += f" (Rs {abs(customer.total_credit_balance):.2f} held as advance)"

    db.add(
        models.KhataTransaction(
            customer_id=customer.id,
            amount=req.amount,
            transaction_type=req.transaction_type,
            notes=req.notes,
        )
    )
    db.add(models.ActivityLog(vendor_id=vendor.id, action=action, details=detail))

    db.commit()
    db.refresh(customer)
    return customer


@router.get("/customers/{customer_id}/reminder")
def payment_reminder(
    customer_id: str,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Build a WhatsApp reminder link for an outstanding balance.

    wa.me needs no API key and no cost, and WhatsApp is how this money actually
    gets chased in practice.
    """
    customer = _owned_customer(customer_id, vendor, db)
    balance = customer.total_credit_balance or 0.0
    if balance <= 0:
        raise HTTPException(status_code=400, detail=f"{customer.name} has nothing outstanding")

    oldest = (
        db.query(models.KhataTransaction)
        .filter(
            models.KhataTransaction.customer_id == customer.id,
            models.KhataTransaction.transaction_type == "credit",
        )
        .order_by(models.KhataTransaction.date.asc())
        .first()
    )
    since = oldest.date.strftime("%d %b") if oldest else None

    message = (
        f"Namaste {customer.name}, "
        f"this is a gentle reminder from {vendor.store_name}. "
        f"Your pending balance is Rs {balance:.2f}"
        + (f" (since {since})" if since else "")
        + "."
    )
    if vendor.upi_id:
        message += f" You can pay by UPI to {vendor.upi_id}. Thank you!"
    else:
        message += " Thank you!"

    digits = "".join(ch for ch in (customer.phone or "") if ch.isdigit())
    if not digits:
        raise HTTPException(status_code=400, detail=f"No phone number saved for {customer.name}")
    if len(digits) == 10:
        digits = "91" + digits  # assume India when no country code is stored

    return {
        "customer_name": customer.name,
        "balance": round(balance, 2),
        "message": message,
        "whatsapp_url": f"https://wa.me/{digits}?text={quote(message)}",
        "sms_url": f"sms:+{digits}?body={quote(message)}",
    }
