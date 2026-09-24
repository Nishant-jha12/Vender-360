"""UPI QR generation, dynamic payment intents, auto-reconciliation,
and real-time soundbox webhook simulation.
"""
import asyncio
import base64
from collections import defaultdict
from datetime import datetime
import io
import json
import hashlib
import hmac
import secrets
from typing import Dict, List, Optional, Set
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from config import settings
from database import get_db
import models
import schemas
import security

router = APIRouter()

# Imported lazily so a missing optional dependency degrades gracefully
try:
    import qrcode

    QR_AVAILABLE = True
    QR_IMPORT_ERROR = ""
except ImportError as exc:  # pragma: no cover
    QR_AVAILABLE = False
    QR_IMPORT_ERROR = str(exc)


class PaymentEventBroadcaster:
    """Manages active SSE subscriber queues per vendor for instantaneous payment confirmation."""

    def __init__(self):
        self._listeners: Dict[str, Set[asyncio.Queue]] = defaultdict(set)

    def subscribe(self, vendor_id: str) -> asyncio.Queue:
        q = asyncio.Queue(maxsize=100)
        self._listeners[vendor_id].add(q)
        return q

    def unsubscribe(self, vendor_id: str, q: asyncio.Queue):
        if vendor_id in self._listeners:
            self._listeners[vendor_id].discard(q)
            if not self._listeners[vendor_id]:
                del self._listeners[vendor_id]

    async def broadcast_payment(self, vendor_id: str, data: dict):
        if vendor_id in self._listeners:
            for q in list(self._listeners[vendor_id]):
                try:
                    q.put_nowait(data)
                except asyncio.QueueFull:
                    pass


broadcaster = PaymentEventBroadcaster()


def _render_qr_base64(upi_url: str) -> Optional[str]:
    if not QR_AVAILABLE:
        return None
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(upi_url)
    qr.make(fit=True)
    buffer = io.BytesIO()
    qr.make_image(fill_color="#1a73e8", back_color="#FFFFFF").save(buffer, format="PNG")
    return f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode('utf-8')}"


def _generate_txn_ref() -> str:
    timestamp_part = int(datetime.utcnow().timestamp()) % 1000000
    random_part = secrets.token_hex(3).upper()
    return f"V360-{timestamp_part}-{random_part}"


@router.get("/generate-upi-qr")
def generate_upi_qr(
    amount: float = Query(..., description="Amount in INR", gt=0, le=100000),
    note: Optional[str] = Query(None, max_length=80),
    vendor: models.Vendor = Depends(security.get_current_vendor),
):
    """Static or legacy UPI QR generation."""
    if not vendor.upi_id:
        raise HTTPException(
            status_code=400,
            detail="Add your UPI ID under Account before collecting UPI payments.",
        )

    upi_url = (
        f"upi://pay?pa={quote(vendor.upi_id)}"
        f"&pn={quote(vendor.store_name)}"
        f"&am={amount:.2f}&cu=INR"
        f"&tn={quote(note or 'Store purchase')}"
    )

    qr_base64 = _render_qr_base64(upi_url)
    if not qr_base64 and not QR_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="QR rendering needs the 'qrcode' package: pip install -r requirements.txt",
        )

    return {
        "amount": round(amount, 2),
        "store_upi_id": vendor.upi_id,
        "store_name": vendor.store_name,
        "upi_url": upi_url,
        "qr_base64": qr_base64,
    }


@router.post("/create-intent", response_model=schemas.UpiPaymentResponse)
def create_upi_intent(
    req: schemas.UpiIntentCreateRequest,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Create a dynamic UPI Payment Intent with an embedded transaction reference.

    Enables auto-reconciliation and soundbox announcement as soon as the
    customer scans the BharatQR and pays.
    """
    if not vendor.upi_id:
        raise HTTPException(
            status_code=400,
            detail="Add your UPI ID under Account before collecting UPI payments.",
        )

    if req.customer_id:
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

    txn_ref = _generate_txn_ref()
    note_text = req.note or "Counter billing"

    # BharatQR / NPCI UPI URI with embedded txn_ref
    upi_url = (
        f"upi://pay?pa={quote(vendor.upi_id)}"
        f"&pn={quote(vendor.store_name)}"
        f"&am={req.amount:.2f}&cu=INR"
        f"&tr={quote(txn_ref)}"
        f"&tn={quote(f'{note_text} ({txn_ref})')}"
    )

    qr_base64 = _render_qr_base64(upi_url)

    payment = models.UpiPayment(
        vendor_id=vendor.id,
        txn_ref=txn_ref,
        amount=round(req.amount, 2),
        status="pending",
        note=note_text,
        customer_id=req.customer_id,
        upi_url=upi_url,
        created_at=datetime.utcnow(),
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    resp = schemas.UpiPaymentResponse.model_validate(payment).model_dump()
    resp["qr_base64"] = qr_base64
    return resp


@router.get("/intent/{txn_ref}/status", response_model=schemas.UpiPaymentResponse)
def get_intent_status(
    txn_ref: str,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Poll status of a pending UPI payment intent."""
    payment = (
        db.query(models.UpiPayment)
        .filter(
            models.UpiPayment.txn_ref == txn_ref,
            models.UpiPayment.vendor_id == vendor.id,
        )
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment intent not found")

    resp = schemas.UpiPaymentResponse.model_validate(payment).model_dump()
    resp["qr_base64"] = _render_qr_base64(payment.upi_url)
    return resp


@router.post("/simulate-payment", response_model=schemas.UpiPaymentResponse)
async def simulate_payment(
    req: schemas.UpiSimulationRequest,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Simulate a customer scanning and paying the UPI QR via PhonePe/GPay.

    Instantly reconciles the transaction, generates a bank UTR reference,
    and broadcasts the event to trigger the in-app soundbox voice announcement.
    """
    if not settings.DEMO_MODE:
        raise HTTPException(
            status_code=403,
            detail="Payment simulation is disabled outside DEMO_MODE",
        )

    payment = (
        db.query(models.UpiPayment)
        .filter(
            models.UpiPayment.txn_ref == req.txn_ref,
            models.UpiPayment.vendor_id == vendor.id,
        )
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment intent not found")

    if payment.status == "completed":
        resp = schemas.UpiPaymentResponse.model_validate(payment).model_dump()
        resp["qr_base64"] = _render_qr_base64(payment.upi_url)
        return resp

    # Generate realistic 12-digit Indian Bank UTR (RRN)
    utr_random = secrets.randbelow(89999999999) + 10000000000
    bank_ref = f"4{utr_random}"

    payment.status = "completed"
    payment.completed_at = datetime.utcnow()
    payment.payer_name = req.payer_name or "Amit Kumar (GPay)"
    payment.payer_vpa = req.payer_vpa or "customer@oksbi"
    payment.bank_ref_num = bank_ref

    db.add(
        models.ActivityLog(
            vendor_id=vendor.id,
            action="UPI Payment Received",
            details=f"Rs {payment.amount:.2f} received from {payment.payer_name} (UTR: {bank_ref})",
            created_at=datetime.utcnow(),
        )
    )
    db.commit()
    db.refresh(payment)

    # Broadcast event to connected soundbox listeners
    event_data = {
        "event": "payment_completed",
        "txn_ref": payment.txn_ref,
        "amount": payment.amount,
        "status": payment.status,
        "payer_name": payment.payer_name,
        "payer_vpa": payment.payer_vpa,
        "bank_ref_num": payment.bank_ref_num,
        "completed_at": payment.completed_at.isoformat() if payment.completed_at else None,
    }
    await broadcaster.broadcast_payment(vendor.id, event_data)

    resp = schemas.UpiPaymentResponse.model_validate(payment).model_dump()
    resp["qr_base64"] = _render_qr_base64(payment.upi_url)
    return resp


@router.post("/webhook")
async def payment_webhook(
    request: Request,
    db: Session = Depends(get_db),
):
    """Generic payment gateway webhook (Razorpay / Cashfree / Setu / Paytm UPI)."""
    raw = await request.body()
    sig = request.headers.get("x-webhook-signature", "")

    if not settings.WEBHOOK_SIGNING_SECRET:
        raise HTTPException(status_code=500, detail="Webhook signing secret not configured")

    expected = hmac.new(settings.WEBHOOK_SIGNING_SECRET.encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, sig):
        raise HTTPException(status_code=401, detail="Bad signature")

    try:
        payload = schemas.UpiWebhookPayload.model_validate_json(raw)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Malformed webhook payload: {e}")

    payment = (
        db.query(models.UpiPayment)
        .filter(models.UpiPayment.txn_ref == payload.txn_ref)
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Unknown transaction reference")

    if abs(payload.amount - payment.amount) > 0.01:
        raise HTTPException(status_code=400, detail="Amount mismatch")

    if payment.status != "completed":
        payment.status = payload.status
        if payload.status == "completed":
            payment.completed_at = datetime.utcnow()
        if payload.bank_ref_num:
            payment.bank_ref_num = payload.bank_ref_num
        if payload.payer_vpa:
            payment.payer_vpa = payload.payer_vpa
        if payload.payer_name:
            payment.payer_name = payload.payer_name

        db.commit()
        db.refresh(payment)

        # Broadcast: only claim payment_completed when status is actually completed
        event_name = "payment_completed" if payload.status == "completed" else f"payment_{payload.status}"
        event_data = {
            "event": event_name,
            "txn_ref": payment.txn_ref,
            "amount": payment.amount,
            "status": payment.status,
            "payer_name": payment.payer_name,
            "payer_vpa": payment.payer_vpa,
            "bank_ref_num": payment.bank_ref_num,
            "completed_at": payment.completed_at.isoformat() if payment.completed_at else None,
        }
        await broadcaster.broadcast_payment(payment.vendor_id, event_data)

    return {"status": "ok", "txn_ref": payment.txn_ref}


@router.get("/stream")
async def payment_stream(
    vendor: models.Vendor = Depends(security.get_current_vendor),
):
    """Server-Sent Events (SSE) stream for real-time UPI payment auto-reconciliation.

    Pushes instantaneous payment events to the cash register interface to trigger
    the soundbox voice announcement.
    """
    queue = broadcaster.subscribe(vendor.id)

    async def event_generator():
        try:
            yield "event: connected\ndata: {}\n\n"
            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"event: payment_completed\ndata: {json.dumps(data)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            broadcaster.unsubscribe(vendor.id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/recent-payments", response_model=List[schemas.UpiPaymentResponse])
def get_recent_payments(
    limit: int = Query(20, ge=1, le=100),
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Returns recent UPI payments for reconciliation logs."""
    payments = (
        db.query(models.UpiPayment)
        .filter(models.UpiPayment.vendor_id == vendor.id)
        .order_by(models.UpiPayment.created_at.desc())
        .limit(limit)
        .all()
    )
    return payments
