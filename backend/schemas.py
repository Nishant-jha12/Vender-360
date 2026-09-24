"""Pydantic request/response models.

Response models matter for more than tidiness here: the original build returned
raw SQLAlchemy objects, which leaked internal columns (vendor_id, sync_status)
straight to the browser.
"""
from datetime import datetime, timezone
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


def as_naive_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Reduce an incoming datetime to the one kind this app stores.

    Browsers send Date.toISOString(), which carries a trailing Z, so Pydantic
    hands back a timezone-aware value -- while the database and every comparison
    in this codebase are naive UTC. Mixing the two raises "can't compare
    offset-naive and offset-aware datetimes" exactly where it matters most:
    working out which stock on the shelf expires first.
    """
    if value is None or value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


# --------------------------------------------------------------------------
# Auth
# --------------------------------------------------------------------------
# The handful of passwords that turn up first in every credential-stuffing list.
# Not a substitute for a breach corpus, but it costs nothing and stops the worst.
_COMMON_PASSWORDS = {
    "password", "password1", "password123", "12345678", "123456789", "1234567890",
    "qwertyuiop", "qwerty123", "iloveyou", "welcome1", "admin123", "letmein123",
    "abc12345", "passw0rd", "vendor360", "shopkeeper", "changeme", "secret123",
}


def _reject_weak_password(value: str) -> str:
    cleaned = value.strip()
    if len(cleaned) < 10:
        raise ValueError("Use at least 10 characters")
    if cleaned.lower() in _COMMON_PASSWORDS:
        raise ValueError("That password is too common. Pick something else")
    if len(set(cleaned)) < 4:
        raise ValueError("That password repeats too few characters")
    return cleaned


class SignupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    username: str = Field(min_length=3, max_length=40)
    email: str = Field(min_length=3, max_length=200)
    phone: str = Field(min_length=6, max_length=20)
    # Ten, not eight: length is the only thing that reliably buys time against
    # an offline attack on a stolen hash.
    password: str = Field(min_length=10, max_length=200)
    store_name: Optional[str] = Field(default=None, max_length=140)

    @field_validator("password")
    @classmethod
    def strong_enough(cls, v: str) -> str:
        return _reject_weak_password(v)

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
    # The signed proof that the password step just succeeded. This replaced a
    # client-supplied vendor_id, which let anyone holding an account id skip
    # the password entirely and brute-force the code.
    challenge_token: str = Field(min_length=10, max_length=2000)
    otp: str = Field(min_length=4, max_length=8)


class ResendOTPRequest(BaseModel):
    challenge_token: str = Field(min_length=10, max_length=2000)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=200)
    new_password: str = Field(min_length=10, max_length=200)

    @field_validator("new_password")
    @classmethod
    def not_trivially_weak(cls, v: str) -> str:
        return _reject_weak_password(v)


class ForgotPasswordRequest(BaseModel):
    identifier: str = Field(min_length=1, max_length=200)


class ResetPasswordRequest(BaseModel):
    reset_token: str = Field(min_length=10, max_length=2000)
    new_password: str = Field(min_length=10, max_length=200)

    @field_validator("new_password")
    @classmethod
    def not_trivially_weak(cls, v: str) -> str:
        return _reject_weak_password(v)


class ChallengeResponse(BaseModel):
    message: str
    vendor_id: str
    challenge_token: str
    # Only populated when DEBUG_OTP is on, so the flow is testable without SMS.
    debug_otp: Optional[str] = None


class TokenResponse(BaseModel):
    message: str
    token: str
    token_type: str = "bearer"
    vendor_id: str
    name: str
    store_name: str


class SecurityEventResponse(BaseModel):
    """One line of the account's security history, already in plain words.

    The wording is built on the server so all four languages' UIs, and anything
    reading the API directly, describe the same event the same way.
    """

    id: str
    event: str
    description: str
    outcome: str
    device: str
    ip: Optional[str] = None
    detail: Optional[str] = None
    at: datetime


# --------------------------------------------------------------------------
# Vendor
# --------------------------------------------------------------------------
class VendorUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    store_name: str = Field(min_length=1, max_length=140)
    phone: Optional[str] = Field(default=None, max_length=20)
    upi_id: Optional[str] = Field(default=None, max_length=100)
    gstin: Optional[str] = Field(default=None, max_length=20)

    @field_validator("gstin")
    @classmethod
    def gstin_shape(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        cleaned = v.strip().upper()
        if len(cleaned) != 15 or not cleaned.isalnum():
            raise ValueError("A GSTIN is 15 letters and digits")
        return cleaned

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
    gstin: Optional[str] = None
    total_items: int = 0


# --------------------------------------------------------------------------
# Inventory
# --------------------------------------------------------------------------
class InventoryItemBase(BaseModel):
    sku_name: str = Field(min_length=1, max_length=160)
    category: Optional[str] = Field(default="General", max_length=80)
    unit: Optional[str] = Field(default="unit", max_length=30)
    current_qty: float = Field(default=0, ge=0, allow_inf_nan=False)
    reorder_point: float = Field(default=10, ge=0, allow_inf_nan=False)
    cost_price: float = Field(default=0, ge=0, allow_inf_nan=False)
    selling_price: float = Field(default=0, ge=0, allow_inf_nan=False)
    expiry_date: Optional[datetime] = None
    mfg_date: Optional[datetime] = None
    barcode: Optional[str] = Field(default=None, max_length=64)
    pack_type: str = Field(default="loose")
    units_per_pack: float = Field(default=1, gt=0, allow_inf_nan=False)
    hsn_code: Optional[str] = Field(default=None, max_length=12)
    gst_rate: float = Field(default=0, ge=0, le=100, allow_inf_nan=False)

    _naive_dates = field_validator("expiry_date", "mfg_date")(as_naive_utc)

    @field_validator("pack_type")
    @classmethod
    def known_pack_type(cls, v: str) -> str:
        cleaned = (v or "loose").strip().lower()
        if cleaned not in ("loose", "carton"):
            raise ValueError("pack_type must be 'loose' or 'carton'")
        return cleaned


class InventoryItemCreate(InventoryItemBase):
    pass


class InventoryItemUpdate(BaseModel):
    sku_name: Optional[str] = Field(default=None, min_length=1, max_length=160)
    category: Optional[str] = Field(default=None, max_length=80)
    unit: Optional[str] = Field(default=None, max_length=30)
    current_qty: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    reorder_point: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    cost_price: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    selling_price: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    expiry_date: Optional[datetime] = None
    mfg_date: Optional[datetime] = None
    barcode: Optional[str] = Field(default=None, max_length=64)
    pack_type: Optional[str] = None
    units_per_pack: Optional[float] = Field(default=None, gt=0, allow_inf_nan=False)
    hsn_code: Optional[str] = Field(default=None, max_length=12)
    gst_rate: Optional[float] = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    last_updated: Optional[datetime] = None

    _naive_dates = field_validator("expiry_date", "mfg_date", "last_updated")(as_naive_utc)

    @field_validator("pack_type")
    @classmethod
    def known_pack_type(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cleaned = v.strip().lower()
        if cleaned not in ("loose", "carton"):
            raise ValueError("pack_type must be 'loose' or 'carton'")
        return cleaned


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
    mfg_date: Optional[datetime] = None
    barcode: Optional[str] = None
    pack_type: Optional[str] = "loose"
    units_per_pack: Optional[float] = 1.0
    hsn_code: Optional[str] = None
    gst_rate: Optional[float] = 0.0
    sale_count: Optional[int] = 0
    last_updated: Optional[datetime] = None


class StockAdjustRequest(BaseModel):
    qty_change: float = Field(allow_inf_nan=False)
    reason: Optional[str] = Field(default="Manual adjustment", max_length=200)

    @field_validator("qty_change")
    @classmethod
    def non_zero(cls, v: float) -> float:
        if v == 0:
            raise ValueError("Quantity change cannot be zero")
        return v


class StockBatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    batch_no: Optional[str] = None
    mfg_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    qty_received: float
    qty_remaining: float
    unit_cost: float
    received_at: datetime
    value_at_cost: float


class ExpiringItemResponse(InventoryItemResponse):
    days_left: int
    urgency: str
    estimated_loss_risk: float
    suggested_discount_pct: int
    suggested_price: float
    # Each row is one lot: expiry_date and current_qty above describe that lot,
    # not the product's whole shelf.
    batch_id: Optional[str] = None
    batch_no: Optional[str] = None
    qty_at_risk: float = 0.0


# --------------------------------------------------------------------------
# Sales / billing
# --------------------------------------------------------------------------
class SaleLineRequest(BaseModel):
    item_id: Optional[str] = None
    sku_name: Optional[str] = Field(default=None, max_length=160)
    qty: float = Field(gt=0, allow_inf_nan=False)
    unit_price: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)


class SaleCreateRequest(BaseModel):
    items: List[SaleLineRequest] = Field(min_length=1, max_length=200)
    payment_mode: str
    customer_id: Optional[str] = None
    note: Optional[str] = Field(default=None, max_length=200)
    offline_id: Optional[str] = Field(default=None, max_length=100)
    created_at: Optional[datetime] = None

    _naive_dates = field_validator("created_at")(as_naive_utc)

    @field_validator("payment_mode")
    @classmethod
    def known_mode(cls, v: str) -> str:
        cleaned = v.strip().lower()
        if cleaned not in ("cash", "upi", "khata"):
            raise ValueError("payment_mode must be one of: cash, upi, khata")
        return cleaned


class SaleSyncItem(BaseModel):
    offline_id: str = Field(min_length=1, max_length=100)
    items: List[SaleLineRequest] = Field(min_length=1, max_length=200)
    payment_mode: str
    customer_id: Optional[str] = None
    note: Optional[str] = Field(default=None, max_length=200)
    created_at: Optional[datetime] = None

    _naive_dates = field_validator("created_at")(as_naive_utc)

    @field_validator("payment_mode")
    @classmethod
    def known_mode(cls, v: str) -> str:
        cleaned = v.strip().lower()
        if cleaned not in ("cash", "upi", "khata"):
            raise ValueError("payment_mode must be one of: cash, upi, khata")
        return cleaned


class SaleBatchSyncRequest(BaseModel):
    sales: List[SaleSyncItem] = Field(min_length=1, max_length=500)


class SaleBatchSyncFailedItem(BaseModel):
    offline_id: str
    reason: str


class SaleBatchSyncResponse(BaseModel):
    synced_ids: List[str]
    duplicates_skipped: List[str]
    stock_warnings: List[str]
    failed: List[SaleBatchSyncFailedItem] = []
    synced_count: int


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
    offline_id: Optional[str] = None
    created_at: datetime
    line_items: List[SaleItemResponse] = []


# --------------------------------------------------------------------------
# UPI & Soundbox Checkout
# --------------------------------------------------------------------------
class UpiIntentCreateRequest(BaseModel):
    amount: float = Field(gt=0, le=100000, allow_inf_nan=False)
    note: Optional[str] = Field(default=None, max_length=80)
    customer_id: Optional[str] = None


class UpiPaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    txn_ref: str
    amount: float
    status: str
    note: Optional[str] = None
    customer_id: Optional[str] = None
    payer_vpa: Optional[str] = None
    payer_name: Optional[str] = None
    bank_ref_num: Optional[str] = None
    upi_url: str
    qr_base64: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class UpiSimulationRequest(BaseModel):
    txn_ref: str
    payer_name: Optional[str] = "Customer (UPI)"
    payer_vpa: Optional[str] = "customer@upi"


class UpiWebhookPayload(BaseModel):
    txn_ref: str
    amount: float = Field(gt=0, allow_inf_nan=False)
    status: Literal["completed", "failed", "expired"] = "completed"
    bank_ref_num: Optional[str] = None
    payer_vpa: Optional[str] = None
    payer_name: Optional[str] = None


# --------------------------------------------------------------------------
# Khata
# --------------------------------------------------------------------------
class CustomerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=20)
    initial_credit_balance: float = Field(default=0.0, ge=0, allow_inf_nan=False)


class TransactionCreate(BaseModel):
    amount: float = Field(gt=0, allow_inf_nan=False)
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


# --------------------------------------------------------------------------
# Stock intake (scanner)
# --------------------------------------------------------------------------
class IntakeScanRequest(BaseModel):
    """One scan at the counter. Either a barcode off the camera or a chosen item."""

    barcode: Optional[str] = Field(default=None, max_length=64)
    item_id: Optional[str] = None
    # Loose items default to one unit per scan; cartons to one case.
    packs: float = Field(default=1, gt=0, allow_inf_nan=False)

    @field_validator("barcode")
    @classmethod
    def tidy_barcode(cls, v: Optional[str]) -> Optional[str]:
        cleaned = (v or "").strip()
        return cleaned or None


class IntakeConfirmRequest(BaseModel):
    """Commit a scan the shopkeeper has reviewed -- the carton path, or a loose
    line they want to correct before it is written."""

    item_id: str
    packs: float = Field(default=1, gt=0, allow_inf_nan=False)
    units_per_pack: Optional[float] = Field(default=None, gt=0, allow_inf_nan=False)
    unit_cost: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    unit_price: Optional[float] = Field(default=None, ge=0, allow_inf_nan=False)
    gst_rate: Optional[float] = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    hsn_code: Optional[str] = Field(default=None, max_length=12)
    batch_no: Optional[str] = Field(default=None, max_length=40)
    mfg_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    # Write the pack size and tax details back onto the product, so the next
    # scan of the same carton needs no typing at all.
    remember: bool = True

    _naive_dates = field_validator("mfg_date", "expiry_date")(as_naive_utc)


class IntakeSessionUpdate(BaseModel):
    supplier_name: Optional[str] = Field(default=None, max_length=140)
    supplier_gstin: Optional[str] = Field(default=None, max_length=20)
    invoice_no: Optional[str] = Field(default=None, max_length=60)
    invoice_date: Optional[datetime] = None
    note: Optional[str] = Field(default=None, max_length=200)

    _naive_dates = field_validator("invoice_date")(as_naive_utc)


class IntakeLineResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    item_id: Optional[str] = None
    sku_name: str
    barcode: Optional[str] = None
    hsn_code: Optional[str] = None
    pack_type: str
    packs: float
    units_per_pack: float
    qty_units: float
    unit_cost: float
    unit_price: float
    gst_rate: float
    batch_no: Optional[str] = None
    mfg_date: Optional[datetime] = None
    expiry_date: Optional[datetime] = None
    source: str
    created_at: datetime
    taxable_value: float
    gst_amount: float
    line_total: float


class IntakeSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: str
    supplier_name: Optional[str] = None
    supplier_gstin: Optional[str] = None
    invoice_no: Optional[str] = None
    invoice_date: Optional[datetime] = None
    note: Optional[str] = None
    started_at: datetime
    closed_at: Optional[datetime] = None
    lines: List[IntakeLineResponse] = []
