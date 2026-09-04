"""UPI QR generation for counter payments.

The QR is built against the signed-in vendor's own UPI ID. It used to default to
a single hardcoded VPA, which meant every store's QR collected money into the
same account.
"""
import base64
import io
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query

import models
import security

router = APIRouter()

# Imported lazily so a missing optional dependency degrades to one clean 503 on
# this endpoint instead of crashing the whole API at startup.
try:
    import qrcode

    QR_AVAILABLE = True
    QR_IMPORT_ERROR = ""
except ImportError as exc:  # pragma: no cover
    QR_AVAILABLE = False
    QR_IMPORT_ERROR = str(exc)


@router.get("/generate-upi-qr")
def generate_upi_qr(
    amount: float = Query(..., description="Amount in INR", gt=0, le=100000),
    note: Optional[str] = Query(None, max_length=80),
    vendor: models.Vendor = Depends(security.get_current_vendor),
):
    if not vendor.upi_id:
        raise HTTPException(
            status_code=400,
            detail="Add your UPI ID under Account before collecting UPI payments.",
        )

    # NPCI UPI deep-link spec:
    # upi://pay?pa={vpa}&pn={payee}&am={amount}&cu=INR&tn={note}
    upi_url = (
        f"upi://pay?pa={quote(vendor.upi_id)}"
        f"&pn={quote(vendor.store_name)}"
        f"&am={amount:.2f}&cu=INR"
        f"&tn={quote(note or 'Store purchase')}"
    )

    if not QR_AVAILABLE:
        # The link still works even when the image cannot be rendered, so the
        # client can fall back to the "open in UPI app" button.
        raise HTTPException(
            status_code=503,
            detail="QR rendering needs the 'qrcode' package: pip install -r requirements.txt",
        )

    qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=2)
    qr.add_data(upi_url)
    qr.make(fit=True)

    buffer = io.BytesIO()
    qr.make_image(fill_color="#1a73e8", back_color="#FFFFFF").save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("utf-8")

    return {
        "amount": round(amount, 2),
        "store_upi_id": vendor.upi_id,
        "store_name": vendor.store_name,
        "upi_url": upi_url,
        "qr_base64": f"data:image/png;base64,{encoded}",
    }
