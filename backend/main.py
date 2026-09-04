import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import models
from config import settings
from database import engine
from routers import analytics, auth, checkout, demo, inventory, khata, sales, vendor

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
log = logging.getLogger("vendor360")

models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Vendor360 API",
    version="2.0.0",
    description="Inventory, billing and digital khata for neighbourhood retail.",
)

# Explicit origins only. "*" with allow_credentials=True is rejected by browsers,
# so it can never be the default here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# One registration per router, one decorator per route. The previous build
# mounted khata and checkout twice while their routes also hardcoded "/api/...",
# which produced paths like /api/checkout/checkout/generate-upi-qr.
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(vendor.router, prefix="/api/vendor", tags=["Vendor Profile"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["Inventory"])
app.include_router(sales.router, prefix="/api/sales", tags=["Billing"])
app.include_router(khata.router, prefix="/api", tags=["Digital Khata"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(checkout.router, prefix="/api/checkout", tags=["UPI Checkout"])
app.include_router(demo.router, prefix="/api/demo", tags=["Demo Data"])


@app.on_event("startup")
def startup_checks():
    if settings.SECRET_KEY_IS_EPHEMERAL:
        log.warning(
            "SECRET_KEY is not set, so a random one was generated. It rotates on every "
            "restart, which signs everyone out. Set SECRET_KEY in backend/.env."
        )
    if settings.DEBUG_OTP:
        log.warning(
            "DEBUG_OTP is on: the code '%s' is accepted for any account and login "
            "responses include the generated OTP. Set DEBUG_OTP=false before deploying.",
            settings.DEBUG_OTP_CODE,
        )
    if not checkout.QR_AVAILABLE:
        log.warning(
            "The 'qrcode' package is missing, so UPI QR generation will return 503. "
            "Run: pip install -r requirements.txt"
        )


@app.get("/", tags=["Health"])
def read_root():
    return {
        "service": "Vendor360 API",
        "version": "2.0.0",
        "docs": "/docs",
        "status": "ok",
    }


@app.get("/api/health", tags=["Health"])
def health():
    return {"status": "ok", "demo_mode": settings.DEMO_MODE, "debug_otp": settings.DEBUG_OTP}
