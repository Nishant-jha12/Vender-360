from sqlalchemy import Column, String, Integer, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base
import uuid
import random
import string

def generate_uuid():
    return str(uuid.uuid4())

def generate_vendor_code():
    chars = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
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
    phone = Column(String, unique=True, index=True)
    language_pref = Column(String, default="en")
    health_score = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    items = relationship("InventoryItem", back_populates="vendor", cascade="all, delete")
    transactions = relationship("Transaction", back_populates="vendor", cascade="all, delete")
    activities = relationship("ActivityLog", back_populates="vendor", cascade="all, delete")
    customers = relationship("Customer", back_populates="vendor", cascade="all, delete")

class Customer(Base):
    __tablename__ = "customers"
    id = Column(String, primary_key=True, default=generate_uuid)
    vendor_id = Column(String, ForeignKey("vendors.id"))
    name = Column(String, nullable=False)
    phone = Column(String, index=True)
    total_credit_balance = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    vendor = relationship("Vendor", back_populates="customers")
    khata_transactions = relationship("KhataTransaction", back_populates="customer", cascade="all, delete")

class KhataTransaction(Base):
    __tablename__ = "khata_transactions"
    id = Column(String, primary_key=True, default=generate_uuid)
    customer_id = Column(String, ForeignKey("customers.id"))
    amount = Column(Float, nullable=False)
    transaction_type = Column(String) # 'credit' (added to balance) or 'payment' (settled)
    date = Column(DateTime, default=datetime.utcnow)
    notes = Column(String)
    
    customer = relationship("Customer", back_populates="khata_transactions")

class InventoryItem(Base):
    __tablename__ = "inventory_items"
    id = Column(String, primary_key=True, default=generate_uuid)
    vendor_id = Column(String, ForeignKey("vendors.id"))
    sku_name = Column(String, index=True)
    category = Column(String)
    current_qty = Column(Float, default=0.0)
    unit = Column(String, default="unit")
    reorder_point = Column(Float, default=10.0)
    
    # Financials & Phase 2 additions
    cost_price = Column(Float, default=0.0)
    selling_price = Column(Float, default=0.0)
    expiry_date = Column(DateTime, nullable=True)
    barcode = Column(String, index=True, nullable=True)
    
    last_updated = Column(DateTime, default=datetime.utcnow)
    sync_status = Column(String, default="synced")

    vendor = relationship("Vendor", back_populates="items")
    transactions = relationship("Transaction", back_populates="item", cascade="all, delete")

class Transaction(Base):
    __tablename__ = "transactions"
    id = Column(String, primary_key=True, default=generate_uuid)
    vendor_id = Column(String, ForeignKey("vendors.id"))
    item_id = Column(String, ForeignKey("inventory_items.id"))
    type = Column(String)
    qty = Column(Float)
    source = Column(String)
    confidence = Column(Float, default=1.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    vendor = relationship("Vendor", back_populates="transactions")
    item = relationship("InventoryItem", back_populates="transactions")

class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id = Column(String, primary_key=True, default=generate_uuid)
    vendor_id = Column(String, ForeignKey("vendors.id"))
    action = Column(String)
    details = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    vendor = relationship("Vendor", back_populates="activities")

class Forecast(Base):
    __tablename__ = "forecasts"
    id = Column(String, primary_key=True, default=generate_uuid)
    item_id = Column(String, ForeignKey("inventory_items.id"))
    horizon_date = Column(DateTime)
    predicted_demand = Column(Float)
    model_version = Column(String)
    features_used = Column(String)
