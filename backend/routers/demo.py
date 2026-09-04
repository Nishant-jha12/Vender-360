"""Sample data, behind an explicit endpoint.

Seeding used to happen implicitly inside GET handlers, so a real shopkeeper's
first login showed invented customers owing them money. It now only ever happens
when someone asks for it, and only while DEMO_MODE is on.

The seed writes 30 days of actual Sale rows rather than stubbing the dashboard,
so the trend chart, health score and forecast all light up with numbers they
genuinely computed.
"""
import random
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import security
from config import settings
from database import get_db

router = APIRouter()

CATALOGUE = [
    # (name, category, unit, qty, reorder, cost, sell, expires_in_days, barcode, popularity)
    ("Amul Taaza Milk 500ml", "Dairy", "packets", 24, 10, 27.0, 33.0, 2, "8901262010053", 10),
    ("Britannia Whole Wheat Bread", "Bakery", "loaves", 12, 5, 38.0, 48.0, 4, "8901063141208", 8),
    ("Mother Dairy Dahi 400g", "Dairy", "cups", 8, 6, 30.0, 38.0, 3, "8901648001095", 6),
    ("Fortune Sunflower Oil 1L", "Staples", "pouches", 24, 8, 145.0, 170.0, 120, "8906007280014", 5),
    ("Tata Salt 1kg", "Staples", "packets", 40, 15, 22.0, 28.0, 365, "8901030381019", 4),
    ("Aashirvaad Atta 5kg", "Staples", "bags", 14, 6, 245.0, 285.0, 180, "8901030865278", 5),
    ("Maggi Noodles 70g", "Instant", "packets", 60, 20, 11.0, 14.0, 240, "8901058000009", 9),
    ("Parle-G Biscuits 100g", "Bakery", "packets", 50, 20, 8.0, 10.0, 200, "8901719101045", 7),
    ("Red Label Tea 250g", "Beverages", "packets", 18, 8, 125.0, 150.0, 300, "8901030629471", 4),
    ("Surf Excel 1kg", "Household", "packets", 10, 5, 165.0, 195.0, 500, "8901030773631", 3),
    ("Colgate Toothpaste 100g", "Personal Care", "tubes", 16, 6, 52.0, 65.0, 400, "8901314010016", 3),
    ("Sugar 1kg", "Staples", "packets", 30, 12, 42.0, 50.0, 300, None, 6),
]

CUSTOMERS = [
    ("Ramesh Kumar (Flat 402)", "+91 98231 44120", 1450.0),
    ("Sunita Verma", "+91 97110 52319", 620.0),
    ("Amit Patel (Shop #4)", "+91 99882 10924", 3100.0),
    ("Pooja Sharma", "+91 98450 11982", 0.0),
]


def _wipe_vendor_data(vendor: models.Vendor, db: Session) -> None:
    """Delete everything belonging to one vendor, children before parents."""
    sale_ids = [row.id for row in db.query(models.Sale.id).filter(models.Sale.vendor_id == vendor.id)]
    if sale_ids:
        db.query(models.SaleItem).filter(models.SaleItem.sale_id.in_(sale_ids)).delete(
            synchronize_session=False
        )

    customer_ids = [
        row.id for row in db.query(models.Customer.id).filter(models.Customer.vendor_id == vendor.id)
    ]
    if customer_ids:
        db.query(models.KhataTransaction).filter(
            models.KhataTransaction.customer_id.in_(customer_ids)
        ).delete(synchronize_session=False)

    for model in (models.Sale, models.Transaction, models.InventoryItem, models.Customer):
        db.query(model).filter(model.vendor_id == vendor.id).delete(synchronize_session=False)
    db.commit()


@router.post("/seed")
def seed_demo_data(
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    if not settings.DEMO_MODE:
        raise HTTPException(status_code=403, detail="Demo seeding is disabled (DEMO_MODE=false)")

    # Clear this vendor's existing state so the endpoint is repeatable.
    # Children first, since SQLite is not enforcing the foreign keys for us.
    _wipe_vendor_data(vendor, db)

    now = datetime.utcnow()

    if not vendor.upi_id:
        vendor.upi_id = "demostore@okaxis"

    items = []
    weights = []
    for name, category, unit, qty, reorder, cost, sell, expires_in, barcode, popularity in CATALOGUE:
        item = models.InventoryItem(
            vendor_id=vendor.id,
            sku_name=name,
            category=category,
            unit=unit,
            current_qty=qty,
            reorder_point=reorder,
            cost_price=cost,
            selling_price=sell,
            expiry_date=now + timedelta(days=expires_in),
            barcode=barcode,
        )
        db.add(item)
        items.append(item)
        weights.append(popularity)
    db.flush()

    customers = []
    for name, phone, balance in CUSTOMERS:
        customer = models.Customer(
            vendor_id=vendor.id, name=name, phone=phone, total_credit_balance=balance
        )
        db.add(customer)
        customers.append(customer)
        if balance > 0:
            db.flush()
            db.add(
                models.KhataTransaction(
                    customer_id=customer.id,
                    amount=balance,
                    transaction_type="credit",
                    notes="Opening balance",
                    date=now - timedelta(days=random.randint(4, 20)),
                )
            )
    db.flush()

    # 30 days of trading history so analytics have something real to read.
    rng = random.Random(42)  # fixed seed keeps demos reproducible
    sales_made = 0
    for days_ago in range(29, -1, -1):
        day = now - timedelta(days=days_ago)
        # Weekends are busier; Mondays are quiet.
        weekday = day.weekday()
        bill_count = rng.randint(9, 16) if weekday >= 5 else rng.randint(5, 11)

        for _ in range(bill_count):
            line_count = rng.randint(1, 4)
            chosen = rng.choices(items, weights=weights, k=line_count)
            mode = rng.choices(["cash", "upi", "khata"], weights=[50, 38, 12])[0]
            customer = rng.choice(customers) if mode == "khata" else None

            sale = models.Sale(
                vendor_id=vendor.id,
                customer_id=customer.id if customer else None,
                payment_mode=mode,
                created_at=day.replace(
                    hour=rng.randint(7, 21), minute=rng.randint(0, 59), second=0, microsecond=0
                ),
            )
            db.add(sale)
            db.flush()

            total_amount = 0.0
            total_cost = 0.0
            for item in chosen:
                qty = float(rng.randint(1, 3))
                db.add(
                    models.SaleItem(
                        sale_id=sale.id,
                        item_id=item.id,
                        sku_name=item.sku_name,
                        qty=qty,
                        unit_price=item.selling_price,
                        unit_cost=item.cost_price,
                    )
                )
                total_amount += qty * item.selling_price
                total_cost += qty * item.cost_price
                item.sale_count = (item.sale_count or 0) + 1

            sale.total_amount = round(total_amount, 2)
            sale.total_cost = round(total_cost, 2)
            sales_made += 1

    db.add(
        models.ActivityLog(
            vendor_id=vendor.id,
            action="Demo data loaded",
            details=f"{len(items)} products, {len(customers)} khata customers, {sales_made} sales over 30 days.",
        )
    )
    db.commit()

    return {
        "message": "Demo data loaded",
        "products": len(items),
        "customers": len(customers),
        "sales": sales_made,
        "note": "Sales history is synthetic, but every dashboard number is computed from these real rows.",
    }


@router.delete("/reset", status_code=204)
def reset_data(
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Wipe this vendor's data back to an empty store."""
    if not settings.DEMO_MODE:
        raise HTTPException(status_code=403, detail="Disabled (DEMO_MODE=false)")

    _wipe_vendor_data(vendor, db)
    db.query(models.ActivityLog).filter(models.ActivityLog.vendor_id == vendor.id).delete(
        synchronize_session=False
    )
    db.commit()
    return None
