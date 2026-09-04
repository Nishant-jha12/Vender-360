"""Pydantic request/response models.

Response models matter for more than tidiness here: the original build returned
raw SQLAlchemy objects, which leaked internal columns (vendor_id, sync_status)
straight to the browser.
"""
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    username: str = Field(min_length=3, max_length=40)
    email: str = Field(min_length=3, max_length=200)
    phone: str = Field(min_length=6, max_length=20)
    password: str = Field(min_length=8, max_length=200)
    store_name: Optional[str] = Field(default=None, max_length=140)

    @field_validator("username")
    @classmethod
    def username_is_simple(cls, v: str) -> str:
        cleaned = v.strip().lower()
        if not cleaned.replace("_", "").replace(".", "").isalnum():
            raise ValueError("Username may only contain letters, numbers, dots and underscores")
        return cleaned

    @field_validator("email")
    @classmethod
    def email_looks_valid(cls, v: str) -> str:
        cleaned = v.strip().lower()
        if "@" not in cleaned or "." not in cleaned.split("@")[-1]:
            raise ValueError("Enter a valid email address")
        return cleaned


class LoginRequest(BaseModel):
    identifier: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=1, max_length=200)


class OTPRequest(BaseModel):
    vendor_id: str
    otp: str = Field(min_length=4, max_length=8)


class ChallengeResponse(BaseModel):
    message: str
    vendor_id: str
    # Only populated when DEBUG_OTP is on, so the flow is testable without SMS.
    debug_otp: Optional[str] = None


class TokenResponse(BaseModel):
    message: str
    token: str
    token_type: str = "bearer"
    vendor_id: str
    name: str
    store_name: str


# --------------------------------------------------------------------------
# Vendor
# --------------------------------------------------------------------------
class VendorUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    store_name: str = Field(min_length=1, max_length=140)
    phone: Optional[str] = Field(default=None, max_length=20)
    upi_id: Optional[str] = Field(default=None, max_length=100)

    @field_validator("upi_id")
    @classmethod
    def upi_shape(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        cleaned = v.strip()
        if "@" not in cleaned or len(cleaned) < 5:
            raise ValueError("A UPI ID looks like yourname@bank")
        return cleaned


class VendorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    vendor_code: Optional[str] = None
    name: str
    store_name: str
    phone: Optional[str] = None
    upi_id: Optional[str] = None
    total_items: int = 0


# --------------------------------------------------------------------------
# Inventory
# --------------------------------------------------------------------------
class InventoryItemBase(BaseModel):
    sku_name: str = Field(min_length=1, max_length=160)
    category: Optional[str] = Field(default="General", max_length=80)
    unit: Optional[str] = Field(default="unit", max_length=30)
    current_qty: float = Field(default=0, ge=0)
    reorder_point: float = Field(default=10, ge=0)
    cost_price: float = Field(default=0, ge=0)
    selling_price: float = Field(default=0, ge=0)
    expiry_date: Optional[datetime] = None
    barcode: Optional[str] = Field(default=None, max_length=64)


class InventoryItemCreate(InventoryItemBase):
    pass


class InventoryItemUpdate(InventoryItemBase):
    pass


class InventoryItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    sku_name: str
    category: Optional[str] = None
    current_qty: float
    unit: Optional[str] = None
    reorder_point: float
    cost_price: float
    selling_price: float
    expiry_date: Optional[datetime] = None
    barcode: Optional[str] = None
    sale_count: Optional[int] = 0
    last_updated: Optional[datetime] = None


class StockAdjustRequest(BaseModel):
    qty_change: float
    reason: Optional[str] = Field(default="Manual adjustment", max_length=200)

    @field_validator("qty_change")
    @classmethod
    def non_zero(cls, v: float) -> float:
        if v == 0:
            raise ValueError("Quantity change cannot be zero")
        return v


class ExpiringItemResponse(InventoryItemResponse):
    days_left: int
    urgency: str
    estimated_loss_risk: float
    suggested_discount_pct: int
    suggested_price: float


# --------------------------------------------------------------------------
# Sales / billing
# --------------------------------------------------------------------------
class SaleLineRequest(BaseModel):
    item_id: Optional[str] = None
    sku_name: Optional[str] = Field(default=None, max_length=160)
    qty: float = Field(gt=0)
    unit_price: Optional[float] = Field(default=None, ge=0)


class SaleCreateRequest(BaseModel):
    items: List[SaleLineRequest] = Field(min_length=1)
    payment_mode: str
    customer_id: Optional[str] = None
    note: Optional[str] = Field(default=None, max_length=200)

    @field_validator("payment_mode")
    @classmethod
    def known_mode(cls, v: str) -> str:
        cleaned = v.strip().lower()
        if cleaned not in ("cash", "upi", "khata"):
            raise ValueError("payment_mode must be one of: cash, upi, khata")
        return cleaned


class SaleItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sku_name: str
    qty: float
    unit_price: float
    line_total: float


class SaleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    payment_mode: str
    total_amount: float
    profit: float
    customer_id: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime
    line_items: List[SaleItemResponse] = []


# --------------------------------------------------------------------------
# Khata
# --------------------------------------------------------------------------
class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=20)
    initial_credit_balance: float = Field(default=0.0, ge=0)


class TransactionCreate(BaseModel):
    amount: float = Field(gt=0)
    transaction_type: str
    notes: Optional[str] = Field(default=None, max_length=200)

    @field_validator("transaction_type")
    @classmethod
    def known_type(cls, v: str) -> str:
        cleaned = v.strip().lower()
        if cleaned not in ("credit", "payment"):
            raise ValueError("transaction_type must be 'credit' or 'payment'")
        return cleaned


class KhataTransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    customer_id: str
    amount: float
    transaction_type: str
    date: datetime
    notes: Optional[str] = None


class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    phone: Optional[str] = None
    total_credit_balance: float
    created_at: datetime
    khata_transactions: List[KhataTransactionResponse] = []
