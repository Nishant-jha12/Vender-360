from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
import models
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

router = APIRouter()

class CustomerCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    vendor_id: Optional[str] = None
    initial_credit_balance: Optional[float] = 0.0

class TransactionCreate(BaseModel):
    amount: float
    transaction_type: str  # 'credit' (add udhaar) or 'payment' (settlement)
    notes: Optional[str] = None

class TransactionResponse(BaseModel):
    id: str
    customer_id: str
    amount: float
    transaction_type: str
    date: datetime
    notes: Optional[str] = None

    class Config:
        from_attributes = True

class CustomerResponse(BaseModel):
    id: str
    name: str
    phone: Optional[str]
    total_credit_balance: float
    created_at: datetime
    khata_transactions: List[TransactionResponse] = []

    class Config:
        from_attributes = True

@router.post("/customers", response_model=CustomerResponse)
@router.post("/api/customers", response_model=CustomerResponse)
def create_customer(req: CustomerCreate, db: Session = Depends(get_db)):
    # Fallback to first vendor if none provided
    vendor_id = req.vendor_id
    if not vendor_id:
        first_vendor = db.query(models.Vendor).first()
        vendor_id = first_vendor.id if first_vendor else None

    customer = models.Customer(
        name=req.name,
        phone=req.phone,
        vendor_id=vendor_id,
        total_credit_balance=req.initial_credit_balance or 0.0
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    
    # If initial credit > 0, log an initial transaction
    if req.initial_credit_balance and req.initial_credit_balance > 0:
        tx = models.KhataTransaction(
            customer_id=customer.id,
            amount=req.initial_credit_balance,
            transaction_type="credit",
            notes="Initial credit balance"
        )
        db.add(tx)
        
        if vendor_id:
            log = models.ActivityLog(
                vendor_id=vendor_id,
                action="Khata Initial Credit",
                details=f"Opened Khata account for {customer.name} with Rs {req.initial_credit_balance} credit."
            )
            db.add(log)
            
        db.commit()
        db.refresh(customer)

    return customer

@router.get("/customers", response_model=List[CustomerResponse])
@router.get("/api/customers", response_model=List[CustomerResponse])
def get_customers(vendor_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.Customer)
    if vendor_id:
        query = query.filter(models.Customer.vendor_id == vendor_id)
    customers = query.order_by(models.Customer.total_credit_balance.desc()).all()
    
    # If database has no customers, populate with default sample kirana customers for preview
    if not customers:
        default_vendor = db.query(models.Vendor).first()
        v_id = vendor_id or (default_vendor.id if default_vendor else None)
        
        sample_customers = [
            models.Customer(vendor_id=v_id, name="Ramesh Kumar (Flat 402)", phone="+91 98231 44120", total_credit_balance=1450.0),
            models.Customer(vendor_id=v_id, name="Sunita Verma", phone="+91 97110 52319", total_credit_balance=620.0),
            models.Customer(vendor_id=v_id, name="Amit Patel (Shop #4)", phone="+91 99882 10924", total_credit_balance=3100.0),
            models.Customer(vendor_id=v_id, name="Pooja Sharma", phone="+91 98450 11982", total_credit_balance=0.0),
        ]
        db.add_all(sample_customers)
        db.commit()
        
        # Add sample transactions
        for c in sample_customers:
            if c.total_credit_balance > 0:
                db.add(models.KhataTransaction(
                    customer_id=c.id,
                    amount=c.total_credit_balance,
                    transaction_type="credit",
                    notes="Previous week grocery credit"
                ))
        db.commit()
        customers = query.order_by(models.Customer.total_credit_balance.desc()).all()

    return customers

@router.post("/khata/{customer_id}/transaction", response_model=CustomerResponse)
@router.post("/api/khata/{customer_id}/transaction", response_model=CustomerResponse)
def add_khata_transaction(customer_id: str, req: TransactionCreate, db: Session = Depends(get_db)):
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    if req.amount <= 0:
        raise HTTPException(status_code=400, detail="Transaction amount must be greater than zero")

    # Update balance
    if req.transaction_type.lower() == "credit":
        customer.total_credit_balance += req.amount
        action_name = "Khata Credit Given"
        detail_msg = f"Added Rs {req.amount} credit for {customer.name} ({req.notes or 'Udhaar'})"
    elif req.transaction_type.lower() == "payment":
        customer.total_credit_balance = max(0.0, customer.total_credit_balance - req.amount)
        action_name = "Khata Payment Received"
        detail_msg = f"Recorded Rs {req.amount} settlement payment from {customer.name}"
    else:
        raise HTTPException(status_code=400, detail="Invalid transaction_type. Must be 'credit' or 'payment'")

    transaction = models.KhataTransaction(
        customer_id=customer.id,
        amount=req.amount,
        transaction_type=req.transaction_type.lower(),
        notes=req.notes
    )
    db.add(transaction)

    # Activity log
    if customer.vendor_id:
        log = models.ActivityLog(
            vendor_id=customer.vendor_id,
            action=action_name,
            details=detail_msg
        )
        db.add(log)

    db.commit()
    db.refresh(customer)
    return customer
