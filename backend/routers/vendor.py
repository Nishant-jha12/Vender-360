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
@router.patch("/me", response_model=schemas.VendorResponse)
def update_profile(
    req: schemas.VendorUpdate,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    # V1: Use exclude_unset=True so updating one field (e.g. gstin) doesn't wipe
    # out existing values of omitted fields (e.g. phone or upi_id)
    fields = req.model_dump(exclude_unset=True)

    if "phone" in fields:
        phone_val = (fields["phone"] or "").strip() or None
        if phone_val:
            clash = (
                db.query(models.Vendor)
                .filter(models.Vendor.phone == phone_val, models.Vendor.id != vendor.id)
                .first()
            )
            if clash:
                raise HTTPException(status_code=409, detail="That phone number is already registered")
        vendor.phone = phone_val

    if "name" in fields and fields["name"] is not None:
        vendor.name = fields["name"].strip()
    if "store_name" in fields and fields["store_name"] is not None:
        vendor.store_name = fields["store_name"].strip()
    if "upi_id" in fields:
        vendor.upi_id = fields["upi_id"]
    if "gstin" in fields:
        vendor.gstin = fields["gstin"]

    db.commit()
    db.refresh(vendor)
    return _profile(vendor, db)
