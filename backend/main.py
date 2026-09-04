from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import models
from database import engine

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Vendor360 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from routers import inventory, analytics, vendor, auth, khata, checkout

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["Inventory"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(vendor.router, prefix="/api/vendor", tags=["Vendor Profile"])
app.include_router(khata.router, prefix="/api/khata", tags=["Digital Khata"])
app.include_router(checkout.router, prefix="/api/checkout", tags=["Checkout & UPI Payments"])

# Direct non-prefixed routes for flexibility (e.g. /customers, /checkout/generate-upi-qr)
app.include_router(khata.router, tags=["Khata Direct"])
app.include_router(checkout.router, tags=["Checkout Direct"])

@app.get("/")
def read_root():
    return {"message": "Welcome to Vendor360 API - Phase 2"}
