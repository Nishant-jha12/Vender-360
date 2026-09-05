"""The signed-in vendor's own profile. No vendor_id is ever taken from the client."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
import security
from database import get_db

router = APIRouter()


def _profile(vendor: models.Vendor, db: Session) -> schemas.VendorResponse:
    total_items = (
        db.query(models.InventoryItem)
        .filter(
            models.InventoryItem.vendor_id == vendor.id,
            models.InventoryItem.is_archived.is_(False),
        )
        .count()
    )
    # Backfill for rows created before vendor_code existed.
    if not vendor.vendor_code:
        vendor.vendor_code = models.generate_vendor_code()
        db.commit()

    return schemas.VendorResponse(
        id=vendor.id,
        vendor_code=vendor.vendor_code,
        name=vendor.name,
        store_name=vendor.store_name,
        phone=vendor.phone,
        upi_id=vendor.upi_id,
        gstin=vendor.gstin,
        total_items=total_items,
    )


@router.get("/me", response_model=schemas.VendorResponse)
def get_profile(
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    return _profile(vendor, db)


@router.put("/me", response_model=schemas.VendorResponse)
def update_profile(
    req: schemas.VendorUpdate,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    if req.phone:
        clash = (
            db.query(models.Vendor)
            .filter(models.Vendor.phone == req.phone.strip(), models.Vendor.id != vendor.id)
            .first()
        )
        if clash:
            raise HTTPException(status_code=409, detail="That phone number is already registered")

    vendor.name = req.name.strip()
    vendor.store_name = req.store_name.strip()
    vendor.phone = (req.phone or "").strip() or None
    vendor.upi_id = req.upi_id
    vendor.gstin = req.gstin
    db.commit()
    db.refresh(vendor)
    return _profile(vendor, db)
