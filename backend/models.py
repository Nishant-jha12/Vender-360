import random
import string
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from database import Base


def generate_uuid():
    return str(uuid.uuid4())


def generate_vendor_code():
    chars = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
    return f"V360-{chars}"


class Vendor(Base):
    __tablename__ = "vendors"
    id = Column(String, primary_key=True, default=generate_uuid)
    vendor_code = Column(String, unique=True, index=True, default=generate_vendor_code)

    username = Column(String, unique=True, index=True, nullable=True)
    email = Column(String, unique=True, index=True, nullable=True)
    password_hash = Column(String, nullable=True)

    name = Column(String, nullable=False)
    store_name = Column(String, nullable=False)
    phone = Column(String, index=True)

    # Each vendor is paid at their OWN UPI address. Previously this was a single
    # hardcoded VPA, which meant every store's QR collected money to one account.
    upi_id = Column(String, nullable=True)

    language_pref = Column(String, default="en")
    created_at = Column(DateTime, default=datetime.utcnow)

    # Short-lived login OTP. Stored hashed, never in plaintext.
    otp_code_hash = Column(String, nullable=True)
    otp_expires_at = Column(DateTime, nullable=True)

    items = relationship("InventoryItem", back_populates="vendor", cascade="all, delete")
    transactions = relationship("Transaction", back_populates="vendor", cascade="all, delete")
    activities = relationship("ActivityLog", back_populates="vendor", cascade="all, delete")
    customers = relationship("Customer", back_populates="vendor", cascade="all, delete")
    sales = relationship("Sale", back_populates="vendor", cascade="all, delete")


class Customer(Base):
    __tablename__ = "customers"
    id = Column(String, primary_key=True, default=generate_uuid)
    vendor_id = Column(String, ForeignKey("vendors.id"), index=True)
    name = Column(String, nullable=False)
    phone = Column(String, index=True)
    total_credit_balance = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("Vendor", back_populates="customers")
    khata_transactions = relationship(
        "KhataTransaction", back_populates="customer", cascade="all, delete"
    )


class KhataTransaction(Base):
    __tablename__ = "khata_transactions"
    id = Column(String, primary_key=True, default=generate_uuid)
    customer_id = Column(String, ForeignKey("customers.id"), index=True)
    amount = Column(Float, nullable=False)
    # 'credit'  -> udhaar given, balance goes up
    # 'payment' -> settlement received, balance goes down
    transaction_type = Column(String)
    date = Column(DateTime, default=datetime.utcnow, index=True)
    notes = Column(String)

    customer = relationship("Customer", back_populates="khata_transactions")


class InventoryItem(Base):
    __tablename__ = "inventory_items"
    id = Column(String, primary_key=True, default=generate_uuid)
    vendor_id = Column(String, ForeignKey("vendors.id"), index=True)
    sku_name = Column(String, index=True)
    category = Column(String)
    current_qty = Column(Float, default=0.0)
    unit = Column(String, default="unit")
    reorder_point = Column(Float, default=10.0)

    cost_price = Column(Float, default=0.0)
    selling_price = Column(Float, default=0.0)
    expiry_date = Column(DateTime, nullable=True, index=True)
    barcode = Column(String, index=True, nullable=True)

    # Counts how often the item is billed, so the billing screen can put the
    # things a shop actually sells within one thumb-tap.
    sale_count = Column(Integer, default=0)

    is_archived = Column(Boolean, default=False)
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    sync_status = Column(String, default="synced")

    vendor = relationship("Vendor", back_populates="items")
    transactions = relationship("Transaction", back_populates="item", cascade="all, delete")


class Sale(Base):
    """One completed transaction at the counter.

    This is the table the whole app was missing. Revenue, margin, stock
    movement, the health score and the forecast all read from here, so none of
    them have to invent numbers any more.
    """

    __tablename__ = "sales"
    id = Column(String, primary_key=True, default=generate_uuid)
    vendor_id = Column(String, ForeignKey("vendors.id"), index=True)
    customer_id = Column(String, ForeignKey("customers.id"), nullable=True, index=True)

    payment_mode = Column(String)  # 'cash' | 'upi' | 'khata'
    total_amount = Column(Float, default=0.0)
    # Cost of goods at the time of sale, captured so margin stays historically
    # accurate even after the item's cost_price is later edited.
    total_cost = Column(Float, default=0.0)
    note = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    vendor = relationship("Vendor", back_populates="sales")
    customer = relationship("Customer")
    line_items = relationship("SaleItem", back_populates="sale", cascade="all, delete")

    @property
    def profit(self) -> float:
        return round((self.total_amount or 0.0) - (self.total_cost or 0.0), 2)


class SaleItem(Base):
    __tablename__ = "sale_items"
    id = Column(String, primary_key=True, default=generate_uuid)
    sale_id = Column(String, ForeignKey("sales.id"), index=True)
    item_id = Column(String, ForeignKey("inventory_items.id"), nullable=True, index=True)

    # Denormalised so a receipt still reads correctly if the product is
    # renamed or deleted later.
    sku_name = Column(String)
    qty = Column(Float, default=0.0)
    unit_price = Column(Float, default=0.0)
    unit_cost = Column(Float, default=0.0)

    sale = relationship("Sale", back_populates="line_items")
    item = relationship("InventoryItem")

    @property
    def line_total(self) -> float:
        return round((self.qty or 0.0) * (self.unit_price or 0.0), 2)


class Transaction(Base):
    """Stock movement audit trail: every add, sale, correction and scan."""

    __tablename__ = "transactions"
    id = Column(String, primary_key=True, default=generate_uuid)
    vendor_id = Column(String, ForeignKey("vendors.id"), index=True)
    item_id = Column(String, ForeignKey("inventory_items.id"), index=True)
    type = Column(String)  # 'sale' | 'restock' | 'adjustment' | 'voice' | 'ocr'
    qty = Column(Float)  # signed: negative removes stock
    source = Column(String)
    confidence = Column(Float, default=1.0)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    vendor = relationship("Vendor", back_populates="transactions")
    item = relationship("InventoryItem", back_populates="transactions")


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id = Column(String, primary_key=True, default=generate_uuid)
    vendor_id = Column(String, ForeignKey("vendors.id"), index=True)
    action = Column(String)
    details = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    vendor = relationship("Vendor", back_populates="activities")
