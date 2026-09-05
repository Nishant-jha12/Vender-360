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

    # Printed on stock-intake summaries so they stand up as input-credit records.
    gstin = Column(String, nullable=True)

    language_pref = Column(String, default="en")
    created_at = Column(DateTime, default=datetime.utcnow)

    # Short-lived login OTP. Stored hashed, never in plaintext.
    otp_code_hash = Column(String, nullable=True)
    otp_expires_at = Column(DateTime, nullable=True)
    # Wrong guesses against the current code. A six-digit code is only a second
    # factor while the number of tries is small.
    otp_attempts = Column(Integer, default=0)

    # A password-reset link is single use: the signed token carries a nonce that
    # must still match this hash, so a link cannot be replayed from an inbox.
    reset_nonce_hash = Column(String, nullable=True)
    reset_expires_at = Column(DateTime, nullable=True)

    # Raised to invalidate every token already issued for this account -- on a
    # password change, or an explicit sign-out-everywhere. Without it a stolen
    # token stays live for its full lifetime with no way to stop it.
    token_epoch = Column(Integer, default=0, nullable=False)

    items = relationship("InventoryItem", back_populates="vendor", cascade="all, delete")
    transactions = relationship("Transaction", back_populates="vendor", cascade="all, delete")
    activities = relationship("ActivityLog", back_populates="vendor", cascade="all, delete")
    customers = relationship("Customer", back_populates="vendor", cascade="all, delete")
    sales = relationship("Sale", back_populates="vendor", cascade="all, delete")
    intakes = relationship("StockIntake", back_populates="vendor", cascade="all, delete")


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
    mfg_date = Column(DateTime, nullable=True)
    barcode = Column(String, index=True, nullable=True)

    # How this product arrives from the wholesaler.
    #   'loose'  -> scanned one at a time; a scan is one unit
    #   'carton' -> scanned by the case; a scan is units_per_pack units
    # This is what lets the scanner add 24 without the shopkeeper typing 24.
    pack_type = Column(String, default="loose")
    units_per_pack = Column(Float, default=1.0)

    # Purchase-side tax fields, so a stock intake can be printed as a GST
    # input-credit document rather than just a stock note.
    hsn_code = Column(String, nullable=True)
    gst_rate = Column(Float, default=0.0)

    # Counts how often the item is billed, so the billing screen can put the
    # things a shop actually sells within one thumb-tap.
    sale_count = Column(Integer, default=0)

    is_archived = Column(Boolean, default=False)
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    sync_status = Column(String, default="synced")

    vendor = relationship("Vendor", back_populates="items")
    transactions = relationship("Transaction", back_populates="item", cascade="all, delete")
    batches = relationship("StockBatch", back_populates="item", cascade="all, delete")


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
    batch_links = relationship("SaleItemBatch", cascade="all, delete")

    @property
    def line_total(self) -> float:
        return round((self.qty or 0.0) * (self.unit_price or 0.0), 2)


class StockBatch(Base):
    """One dated lot of one product, and how much of it is left.

    A single expiry_date on the product cannot describe two lots sitting on the
    same shelf, which is how a fresh carton used to cancel the warning on
    short-dated stock behind it. Quantity lives here now; the item's
    current_qty is a cache of the sum, kept by stock.reconcile().

    A lot with no expiry_date is not urgent, it is unknown -- those are consumed
    last, so dated stock always moves first.
    """

    __tablename__ = "stock_batches"
    id = Column(String, primary_key=True, default=generate_uuid)
    vendor_id = Column(String, ForeignKey("vendors.id"), index=True)
    item_id = Column(String, ForeignKey("inventory_items.id"), index=True)
    intake_line_id = Column(String, ForeignKey("stock_intake_lines.id"), nullable=True)

    batch_no = Column(String, nullable=True)
    mfg_date = Column(DateTime, nullable=True)
    expiry_date = Column(DateTime, nullable=True, index=True)

    qty_received = Column(Float, default=0.0)
    qty_remaining = Column(Float, default=0.0, index=True)
    unit_cost = Column(Float, default=0.0)

    received_at = Column(DateTime, default=datetime.utcnow, index=True)

    item = relationship("InventoryItem", back_populates="batches")

    @property
    def value_at_cost(self) -> float:
        return round((self.qty_remaining or 0.0) * (self.unit_cost or 0.0), 2)


class SaleItemBatch(Base):
    """Which lots a sale line actually came out of.

    Without this a void has to guess where to put stock back, and would put a
    voided sale of old stock onto the newest lot.
    """

    __tablename__ = "sale_item_batches"
    id = Column(String, primary_key=True, default=generate_uuid)
    sale_item_id = Column(String, ForeignKey("sale_items.id"), index=True)
    batch_id = Column(String, ForeignKey("stock_batches.id"), index=True)
    qty = Column(Float, default=0.0)
    unit_cost = Column(Float, default=0.0)


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


class StockIntake(Base):
    """One trip to the wholesaler, captured at the scanner.

    A session groups everything scanned in one go so the shopkeeper gets a
    single summary to check, print, and keep for the input-tax claim. Stock is
    written the moment a line is added -- the session is the paperwork, not a
    pending basket, so closing the app mid-delivery never loses counted stock.
    """

    __tablename__ = "stock_intakes"
    id = Column(String, primary_key=True, default=generate_uuid)
    vendor_id = Column(String, ForeignKey("vendors.id"), index=True)

    status = Column(String, default="open", index=True)  # 'open' | 'closed'
    supplier_name = Column(String, nullable=True)
    supplier_gstin = Column(String, nullable=True)
    invoice_no = Column(String, nullable=True)
    invoice_date = Column(DateTime, nullable=True)
    note = Column(String, nullable=True)

    started_at = Column(DateTime, default=datetime.utcnow, index=True)
    closed_at = Column(DateTime, nullable=True)

    vendor = relationship("Vendor", back_populates="intakes")
    lines = relationship(
        "StockIntakeLine",
        back_populates="intake",
        cascade="all, delete",
        order_by="StockIntakeLine.created_at",
    )


class StockIntakeLine(Base):
    """One scan. Denormalised the same way SaleItem is, so a printed intake
    still reads correctly after the product is renamed or its price changes."""

    __tablename__ = "stock_intake_lines"
    id = Column(String, primary_key=True, default=generate_uuid)
    intake_id = Column(String, ForeignKey("stock_intakes.id"), index=True)
    item_id = Column(String, ForeignKey("inventory_items.id"), nullable=True, index=True)

    sku_name = Column(String)
    barcode = Column(String, nullable=True)
    hsn_code = Column(String, nullable=True)

    pack_type = Column(String, default="loose")
    packs = Column(Float, default=1.0)  # cartons scanned (1 for loose)
    units_per_pack = Column(Float, default=1.0)
    qty_units = Column(Float, default=0.0)  # packs * units_per_pack -- what stock moved

    unit_cost = Column(Float, default=0.0)  # purchase rate per unit, before GST
    unit_price = Column(Float, default=0.0)  # counter price, for the record
    gst_rate = Column(Float, default=0.0)

    batch_no = Column(String, nullable=True)
    mfg_date = Column(DateTime, nullable=True)
    expiry_date = Column(DateTime, nullable=True)

    source = Column(String, default="barcode")  # 'barcode' | 'manual'
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # What the product looked like before this line existed, so undoing a scan
    # reverses everything it changed rather than only the quantity. A weighted
    # cost average cannot be un-blended, and a restored expiry that outlives its
    # stock would raise an alert about goods no longer on the shelf.
    cost_price_before = Column(Float, nullable=True)
    expiry_date_before = Column(DateTime, nullable=True)

    intake = relationship("StockIntake", back_populates="lines")
    item = relationship("InventoryItem")

    @property
    def taxable_value(self) -> float:
        return round((self.qty_units or 0.0) * (self.unit_cost or 0.0), 2)

    @property
    def gst_amount(self) -> float:
        return round(self.taxable_value * (self.gst_rate or 0.0) / 100.0, 2)

    @property
    def line_total(self) -> float:
        return round(self.taxable_value + self.gst_amount, 2)


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id = Column(String, primary_key=True, default=generate_uuid)
    vendor_id = Column(String, ForeignKey("vendors.id"), index=True)
    action = Column(String)
    details = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    vendor = relationship("Vendor", back_populates="activities")
