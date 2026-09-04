from fastapi import APIRouter, HTTPException, Query
import qrcode
import io
import base64
from urllib.parse import quote
from typing import Optional

router = APIRouter()

@router.get("/checkout/generate-upi-qr")
@router.get("/api/checkout/generate-upi-qr")
def generate_upi_qr(
    amount: float = Query(..., description="Amount in INR to be paid", gt=0),
    store_upi_id: str = Query("vendor360@okaxis", description="Merchant UPI ID (VPA)"),
    store_name: Optional[str] = Query("Sharma General Store", description="Store Name"),
    note: Optional[str] = Query("Vendor360 Instant Checkout", description="Transaction Note/Description")
):
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")

    # Standard NPCI UPI URI Specification
    # upi://pay?pa={vpa}&pn={payee_name}&am={amount}&cu=INR&tn={transaction_note}
    encoded_name = quote(store_name)
    encoded_note = quote(note)
    upi_intent_url = f"upi://pay?pa={store_upi_id}&pn={encoded_name}&am={amount:.2f}&cu=INR&tn={encoded_note}"

    try:
        # Generate QR code with high error correction and clean styling
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=2,
        )
        qr.add_data(upi_intent_url)
        qr.make(fit=True)

        img = qr.make_image(fill_color="#0F7A6B", back_color="#FFFFFF")
        
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        qr_base64_str = base64.b64encode(buffer.getvalue()).decode("utf-8")
        data_uri = f"data:image/png;base64,{qr_base64_str}"

        return {
            "status": "success",
            "amount": amount,
            "store_upi_id": store_upi_id,
            "store_name": store_name,
            "upi_url": upi_intent_url,
            "qr_base64": data_uri
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate UPI QR code: {str(e)}")
