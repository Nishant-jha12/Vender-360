"""Billing -- the counter transaction.

This is the table the rest of the app reads from. Recording a sale here is what
makes stock go down, revenue real, margin real, and the khata balance update
itself. Everything in analytics/ is a query over these rows.
"""
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

import models
import schemas
import security
import stock
from database import get_db

router = APIRouter()


@router.post("", status_code=201)
@router.post("/", status_code=201, include_in_schema=False)
def create_sale(
    req: schemas.SaleCreateRequest,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    customer: Optional[models.Customer] = None
    if req.payment_mode == "khata":
        if not req.customer_id:
            raise HTTPException(status_code=400, detail="Pick a customer to put this on khata")
        customer = (
            db.query(models.Customer)
            .filter(
                models.Customer.id == req.customer_id,
                models.Customer.vendor_id == vendor.id,
            )
            .first()
        )
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")

    sale = models.Sale(
        vendor_id=vendor.id,
        customer_id=customer.id if customer else None,
        payment_mode=req.payment_mode,
        note=req.note,
        total_amount=0.0,
        total_cost=0.0,
    )
    db.add(sale)
    db.flush()  # assigns sale.id without committing

    total_amount = 0.0
    total_cost = 0.0
    stock_warnings: List[str] = []

    for line in req.items:
        item: Optional[models.InventoryItem] = None
        if line.item_id:
            item = (
                db.query(models.InventoryItem)
                .filter(
                    models.InventoryItem.id == line.item_id,
                    models.InventoryItem.vendor_id == vendor.id,
                )
                .first()
            )
            if not item:
                raise HTTPException(status_code=404, detail=f"Item {line.item_id} is not in your inventory")

        # A price on the request wins (counter-level discounts and haggling are
        # normal), otherwise fall back to the catalogue price.
        unit_price = line.unit_price if line.unit_price is not None else (item.selling_price if item else 0.0)
        sku_name = (item.sku_name if item else line.sku_name) or "Unlisted item"

        # Take the stock first: which lots it comes out of is what the units
        # actually cost, and that is more honest than the product's average.
        consumed = stock.consume_stock(db, item, line.qty) if item else None
        unit_cost = consumed.unit_cost if consumed else 0.0

        sale_item = models.SaleItem(
            sale_id=sale.id,
            item_id=item.id if item else None,
            sku_name=sku_name,
            qty=line.qty,
            unit_price=unit_price,
            unit_cost=unit_cost,
        )
        db.add(sale_item)

        total_amount += line.qty * unit_price
        total_cost += consumed.cost if consumed else 0.0

        if item:
            # Never block a sale because the counted stock disagrees with
            # reality -- there is a customer standing there. Sell it, and tell
            # the shopkeeper the count needs fixing.
            if consumed.shortfall > 0:
                counted = line.qty - consumed.shortfall
                stock_warnings.append(
                    f"{item.sku_name}: sold {line.qty:g} but only {counted:g} were counted"
                )

            # Needs the SaleItem's id before the lots can be linked to it.
            db.flush()
            stock.record_allocations(db, sale_item, consumed)

            item.sale_count = (item.sale_count or 0) + 1

            db.add(
                models.Transaction(
                    vendor_id=vendor.id,
                    item_id=item.id,
                    type="sale",
                    qty=-line.qty,
                    source="billing",
                    confidence=1.0,
                )
            )

    sale.total_amount = round(total_amount, 2)
    sale.total_cost = round(total_cost, 2)

    if customer:
        customer.total_credit_balance = round(
            (customer.total_credit_balance or 0.0) + sale.total_amount, 2
        )
        db.add(
            models.KhataTransaction(
                customer_id=customer.id,
                amount=sale.total_amount,
                transaction_type="credit",
                notes=req.note or "Counter sale on udhaar",
            )
        )

    db.add(
        models.ActivityLog(
            vendor_id=vendor.id,
            action="Sale recorded",
            details=(
                f"{len(req.items)} item(s), Rs {sale.total_amount:.2f} via {req.payment_mode}"
                + (f" ({customer.name})" if customer else "")
            ),
        )
    )

    db.commit()
    db.refresh(sale)

    return {
        "sale": schemas.SaleResponse.model_validate(sale).model_dump(),
        "stock_warnings": stock_warnings,
        "customer_balance": customer.total_credit_balance if customer else None,
    }


@router.get("/recent", response_model=List[schemas.SaleResponse])
def recent_sales(
    limit: int = Query(20, ge=1, le=100),
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    return (
        db.query(models.Sale)
        .options(joinedload(models.Sale.line_items))
        .filter(models.Sale.vendor_id == vendor.id)
        .order_by(models.Sale.created_at.desc())
        .limit(limit)
        .all()
    )


@router.get("/day-close")
def day_close(
    day: Optional[str] = Query(None, description="YYYY-MM-DD, defaults to today"),
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """The evening summary: what came in, how it was paid, what sold best.

    Shopkeepers close their books daily -- this is the screen that earns the
    habit.
    """
    if day:
        try:
            start = datetime.strptime(day, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Use YYYY-MM-DD for the day")
    else:
        now = datetime.utcnow()
        start = datetime(now.year, now.month, now.day)
    end = start + timedelta(days=1)

    sales = (
        db.query(models.Sale)
        .options(joinedload(models.Sale.line_items))
        .filter(
            models.Sale.vendor_id == vendor.id,
            models.Sale.created_at >= start,
            models.Sale.created_at < end,
        )
        .all()
    )

    by_mode = {"cash": 0.0, "upi": 0.0, "khata": 0.0}
    revenue = 0.0
    cost = 0.0
    item_totals: dict = {}

    for sale in sales:
        revenue += sale.total_amount or 0.0
        cost += sale.total_cost or 0.0
        by_mode[sale.payment_mode] = round(by_mode.get(sale.payment_mode, 0.0) + (sale.total_amount or 0.0), 2)
        for line in sale.line_items:
            entry = item_totals.setdefault(line.sku_name, {"sku_name": line.sku_name, "qty": 0.0, "amount": 0.0})
            entry["qty"] += line.qty or 0.0
            entry["amount"] = round(entry["amount"] + (line.qty or 0) * (line.unit_price or 0), 2)

    top_items = sorted(item_totals.values(), key=lambda e: e["amount"], reverse=True)[:5]
    profit = round(revenue - cost, 2)

    return {
        "date": start.strftime("%Y-%m-%d"),
        "bill_count": len(sales),
        "revenue": round(revenue, 2),
        "profit": profit,
        "margin_pct": round((profit / revenue) * 100, 1) if revenue > 0 else 0.0,
        "average_bill": round(revenue / len(sales), 2) if sales else 0.0,
        "by_payment_mode": by_mode,
        "top_items": top_items,
        # Money handed out as credit today is money not in the drawer.
        "cash_in_hand": round(by_mode.get("cash", 0.0), 2),
    }


@router.delete("/{sale_id}", status_code=204)
def void_sale(
    sale_id: str,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Undo a mis-punched bill: restores stock and reverses any khata credit."""
    sale = (
        db.query(models.Sale)
        .options(joinedload(models.Sale.line_items))
        .filter(models.Sale.id == sale_id, models.Sale.vendor_id == vendor.id)
        .first()
    )
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    for line in sale.line_items:
        if line.item_id:
            item = db.query(models.InventoryItem).filter(models.InventoryItem.id == line.item_id).first()
            # Back into the lots it actually came out of, so voiding a sale of
            # old stock does not quietly turn it into new stock.
            stock.restore_sale_item(db, line, item)
            if item:
                item.sale_count = max(0, (item.sale_count or 0) - 1)

    if sale.customer_id:
        customer = db.query(models.Customer).filter(models.Customer.id == sale.customer_id).first()
        if customer:
            customer.total_credit_balance = round(
                max(0.0, (customer.total_credit_balance or 0.0) - (sale.total_amount or 0.0)), 2
            )

    db.add(
        models.ActivityLog(
            vendor_id=vendor.id,
            action="Sale voided",
            details=f"Reversed bill of Rs {sale.total_amount:.2f}",
        )
    )
    db.delete(sale)
    db.commit()
    return None
