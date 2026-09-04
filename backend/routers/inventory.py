from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
import models
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta

router = APIRouter()

class VoiceEntryRequest(BaseModel):
    vendor_id: str
    transcript: str

class OCRItem(BaseModel):
    sku_name: str
    qty: float

class OCREntryRequest(BaseModel):
    vendor_id: str
    items: List[OCRItem]

class ManualUpdateRequest(BaseModel):
    vendor_id: str
    item_id: str
    qty_change: float

@router.post("/seed")
def seed_inventory(vendor_id: str, db: Session = Depends(get_db)):
    # Clear existing
    db.query(models.InventoryItem).filter(models.InventoryItem.vendor_id == vendor_id).delete()
    
    now = datetime.utcnow()
    mock_items = [
        models.InventoryItem(
            vendor_id=vendor_id,
            sku_name="Amul Taaza Milk 500ml",
            category="Dairy",
            current_qty=6,
            unit="packets",
            reorder_point=10.0,
            cost_price=27.0,
            selling_price=33.0,
            expiry_date=now + timedelta(days=2), # Expiring in 2 days (Critical)
            barcode="8901262010053"
        ),
        models.InventoryItem(
            vendor_id=vendor_id,
            sku_name="Britannia Whole Wheat Bread",
            category="Bakery",
            current_qty=12,
            unit="loaves",
            reorder_point=5.0,
            cost_price=38.0,
            selling_price=48.0,
            expiry_date=now + timedelta(days=4), # Expiring in 4 days (Warning)
            barcode="8901063141208"
        ),
        models.InventoryItem(
            vendor_id=vendor_id,
            sku_name="Mother Dairy Dahi 400g",
            category="Dairy",
            current_qty=8,
            unit="cups",
            reorder_point=6.0,
            cost_price=30.0,
            selling_price=38.0,
            expiry_date=now + timedelta(days=3), # Expiring in 3 days (Warning)
            barcode="8901648001095"
        ),
        models.InventoryItem(
            vendor_id=vendor_id,
            sku_name="Fortune Sunflower Oil 1L",
            category="Staples",
            current_qty=24,
            unit="pouches",
            reorder_point=8.0,
            cost_price=145.0,
            selling_price=170.0,
            expiry_date=now + timedelta(days=120),
            barcode="8906007280014"
        ),
        models.InventoryItem(
            vendor_id=vendor_id,
            sku_name="Tata Salt 1kg",
            category="Staples",
            current_qty=40,
            unit="packets",
            reorder_point=15.0,
            cost_price=22.0,
            selling_price=28.0,
            expiry_date=now + timedelta(days=365),
            barcode="8901030381019"
        ),
    ]
    db.add_all(mock_items)
    
    log = models.ActivityLog(vendor_id=vendor_id, action="Database Seed", details="Restocked inventory with expiry dates and pricing.")
    db.add(log)
    
    db.commit()
    return {"message": "Inventory seeded with fresh expiry tracking"}

@router.get("/expiring-soon")
@router.get("/api/inventory/expiring-soon")
def get_expiring_soon(
    vendor_id: Optional[str] = None,
    days: int = Query(7, description="Expiry threshold in days", ge=1),
    db: Session = Depends(get_db)
):
    threshold_date = datetime.utcnow() + timedelta(days=days)
    
    query = db.query(models.InventoryItem).filter(
        models.InventoryItem.expiry_date != None,
        models.InventoryItem.expiry_date <= threshold_date,
        models.InventoryItem.current_qty > 0
    )
    if vendor_id:
        query = query.filter(models.InventoryItem.vendor_id == vendor_id)
        
    items = query.order_by(models.InventoryItem.expiry_date.asc()).all()
    
    # If empty or not seeded, generate smart sample response so Kirana owner sees rich data immediately
    results = []
    now = datetime.utcnow()
    for item in items:
        days_left = max(0, (item.expiry_date - now).days)
        hours_left = max(0, int((item.expiry_date - now).total_seconds() // 3600))
        urgency = "critical" if days_left <= 2 else "warning"
        
        results.append({
            "id": item.id,
            "sku_name": item.sku_name,
            "category": item.category,
            "current_qty": item.current_qty,
            "unit": item.unit,
            "cost_price": item.cost_price,
            "selling_price": item.selling_price,
            "expiry_date": item.expiry_date.isoformat(),
            "days_left": days_left,
            "hours_left": hours_left,
            "urgency": urgency,
            "estimated_loss_risk": round(item.current_qty * item.cost_price, 2),
            "barcode": item.barcode
        })
        
    return results

@router.get("/{vendor_id}")
def get_inventory(vendor_id: str, db: Session = Depends(get_db)):
    items = db.query(models.InventoryItem).filter(models.InventoryItem.vendor_id == vendor_id).all()
    return items

@router.post("/voice-entry")
def process_voice_entry(req: VoiceEntryRequest, db: Session = Depends(get_db)):
    words = req.transcript.lower().split()
    qty = 1.0
    for w in words:
        if w.isdigit():
            qty = float(w)
            break
            
    item = db.query(models.InventoryItem).filter(models.InventoryItem.vendor_id == req.vendor_id).first()
    
    if item:
        item.current_qty += qty
        
        log = models.ActivityLog(vendor_id=req.vendor_id, action="Voice Entry", details=f"Voice added {qty} to {item.sku_name}.")
        db.add(log)
        
        db.commit()
        return {"message": f"Added {qty} to {item.sku_name} via Voice", "item": item.sku_name, "new_qty": item.current_qty}
        
    return {"message": "Could not match transcript to inventory item.", "raw": req.transcript}

@router.post("/ocr-entry")
def process_ocr_entry(req: OCREntryRequest, db: Session = Depends(get_db)):
    processed = []
    for ocr_item in req.items:
        item = db.query(models.InventoryItem).filter(
            models.InventoryItem.vendor_id == req.vendor_id, 
            models.InventoryItem.sku_name == ocr_item.sku_name
        ).first()
        
        if item:
            item.current_qty += ocr_item.qty
        else:
            item = models.InventoryItem(
                vendor_id=req.vendor_id,
                sku_name=ocr_item.sku_name,
                current_qty=ocr_item.qty,
                cost_price=0.0,
                selling_price=0.0
            )
            db.add(item)
        processed.append(item.sku_name)
    
    log = models.ActivityLog(vendor_id=req.vendor_id, action="OCR Scan", details=f"Scanned wholesale bill with {len(req.items)} items.")
    db.add(log)
    
    db.commit()
    return {"message": f"Processed {len(processed)} items from receipt."}

@router.post("/manual-update")
def process_manual_update(req: ManualUpdateRequest, db: Session = Depends(get_db)):
    item = db.query(models.InventoryItem).filter(models.InventoryItem.id == req.item_id, models.InventoryItem.vendor_id == req.vendor_id).first()
    if item:
        item.current_qty += req.qty_change
        
        log = models.ActivityLog(vendor_id=req.vendor_id, action="Manual Update", details=f"Adjusted {item.sku_name} by {req.qty_change}.")
        db.add(log)
        
        db.commit()
        return {"message": "Updated successfully", "new_qty": item.current_qty}
    return {"message": "Item not found"}
