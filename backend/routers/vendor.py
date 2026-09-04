from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import models
from pydantic import BaseModel

router = APIRouter()

class VendorUpdate(BaseModel):
    name: str
    store_name: str
    phone: str

@router.get("/{vendor_id}")
def get_vendor(vendor_id: str, db: Session = Depends(get_db)):
    vendor = db.query(models.Vendor).filter(models.Vendor.id == vendor_id).first()
    
    # If the database was just created and not seeded yet, create a dummy test_vendor
    if not vendor and vendor_id == "test_vendor":
        vendor = models.Vendor(id=vendor_id, name="Rakesh Sharma", store_name="Sharma General Store", phone="+91 9876543210")
        db.add(vendor)
        db.commit()
        db.refresh(vendor)
    elif not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
        
    # Make sure vendor_code is present for existing vendors (schema migration polyfill)
    if not vendor.vendor_code:
        vendor.vendor_code = models.generate_vendor_code()
        db.commit()
        db.refresh(vendor)

    items_count = db.query(models.InventoryItem).filter(models.InventoryItem.vendor_id == vendor_id).count()
    
    return {
        "id": vendor.id,
        "vendor_code": vendor.vendor_code,
        "name": vendor.name,
        "store_name": vendor.store_name,
        "phone": vendor.phone or "+91 9876543210",
        "total_items": items_count
    }

@router.put("/{vendor_id}")
def update_vendor(vendor_id: str, req: VendorUpdate, db: Session = Depends(get_db)):
    vendor = db.query(models.Vendor).filter(models.Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    
    vendor.name = req.name
    vendor.store_name = req.store_name
    vendor.phone = req.phone
    db.commit()
    return {"message": "Profile updated successfully"}
