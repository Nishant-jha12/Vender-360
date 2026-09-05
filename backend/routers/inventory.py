"""Inventory: full CRUD, stock adjustments, expiry tracking, voice and OCR entry.

Every route derives its vendor from the bearer token. The old build accepted a
vendor_id in the path or body, which let anyone read or edit any store's stock.
"""
import difflib
import re
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import models
import schemas
import security
import stock
from database import get_db

router = APIRouter()


def _owned_item(item_id: str, vendor: models.Vendor, db: Session) -> models.InventoryItem:
    item = (
        db.query(models.InventoryItem)
        .filter(models.InventoryItem.id == item_id, models.InventoryItem.vendor_id == vendor.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


# --------------------------------------------------------------------------
# Read
# --------------------------------------------------------------------------
@router.get("", response_model=List[schemas.InventoryItemResponse])
@router.get("/", response_model=List[schemas.InventoryItemResponse], include_in_schema=False)
def list_inventory(
    search: Optional[str] = Query(None, max_length=120),
    low_stock_only: bool = False,
    limit: int = Query(500, ge=1, le=2000),
    offset: int = Query(0, ge=0),
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    query = db.query(models.InventoryItem).filter(
        models.InventoryItem.vendor_id == vendor.id,
        models.InventoryItem.is_archived.is_(False),
    )
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            models.InventoryItem.sku_name.ilike(pattern) | models.InventoryItem.barcode.ilike(pattern)
        )
    if low_stock_only:
        query = query.filter(models.InventoryItem.current_qty <= models.InventoryItem.reorder_point)

    return query.order_by(models.InventoryItem.sku_name.asc()).offset(offset).limit(limit).all()


@router.get("/frequent", response_model=List[schemas.InventoryItemResponse])
def frequent_items(
    limit: int = Query(12, ge=1, le=50),
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """The handful of SKUs this shop actually sells, for the billing grid.

    Most kirana stores move a few dozen items; putting them one tap away is the
    difference between a 10-second bill and a 40-second one.
    """
    return (
        db.query(models.InventoryItem)
        .filter(
            models.InventoryItem.vendor_id == vendor.id,
            models.InventoryItem.is_archived.is_(False),
        )
        .order_by(models.InventoryItem.sale_count.desc(), models.InventoryItem.sku_name.asc())
        .limit(limit)
        .all()
    )


@router.get("/expiring-soon", response_model=List[schemas.ExpiringItemResponse])
def expiring_soon(
    days: int = Query(7, ge=1, le=365),
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    threshold = now + timedelta(days=days)

    # One row per lot, not per product: two batches of the same thing dated a
    # month apart are two different problems, and the older one used to be
    # invisible behind the newer one's date.
    results = []
    for batch, item in stock.expiring_batches(db, vendor.id, threshold):
        days_left = max(0, (batch.expiry_date - now).days)
        urgency = "critical" if days_left <= 2 else "warning"

        # Clear it at a discount rather than write it off: anything above cost
        # beats throwing it away. The steeper cut goes to the tighter deadline.
        discount_pct = 30 if days_left <= 1 else 20 if days_left <= 2 else 10
        suggested = round((item.selling_price or 0) * (1 - discount_pct / 100), 2)
        # Never suggest selling below what this lot cost.
        lot_cost = batch.unit_cost or item.cost_price or 0
        if lot_cost and suggested < lot_cost:
            suggested = round(lot_cost, 2)

        payload = schemas.InventoryItemResponse.model_validate(item).model_dump()
        payload.update(
            # The lot's own date and quantity, so the row describes the stock
            # actually at risk rather than everything with that name.
            expiry_date=batch.expiry_date,
            current_qty=batch.qty_remaining,
            batch_id=batch.id,
            batch_no=batch.batch_no,
            qty_at_risk=batch.qty_remaining,
            days_left=days_left,
            urgency=urgency,
            estimated_loss_risk=round((batch.qty_remaining or 0) * lot_cost, 2),
            suggested_discount_pct=discount_pct,
            suggested_price=suggested,
        )
        results.append(payload)

    return results


@router.get("/{item_id}/batches", response_model=List[schemas.StockBatchResponse])
def item_batches(
    item_id: str,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """The lots making up this product's stock, in the order they will sell."""
    item = _owned_item(item_id, vendor, db)
    return stock.open_batches(db, item)


@router.get("/{item_id}", response_model=schemas.InventoryItemResponse)
def get_item(
    item_id: str,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    return _owned_item(item_id, vendor, db)


# --------------------------------------------------------------------------
# Write
# --------------------------------------------------------------------------
@router.post("", response_model=schemas.InventoryItemResponse, status_code=201)
@router.post("/", response_model=schemas.InventoryItemResponse, status_code=201, include_in_schema=False)
def create_item(
    req: schemas.InventoryItemCreate,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    if req.barcode:
        clash = (
            db.query(models.InventoryItem)
            .filter(
                models.InventoryItem.vendor_id == vendor.id,
                models.InventoryItem.barcode == req.barcode,
                models.InventoryItem.is_archived.is_(False),
            )
            .first()
        )
        if clash:
            raise HTTPException(status_code=409, detail=f"That barcode is already on {clash.sku_name}")

    fields = req.model_dump()
    # Quantity lives in lots now, so the product starts empty and the opening
    # balance is added as one -- otherwise current_qty would claim stock that no
    # lot backs, and the next reconcile would wipe it.
    opening_qty = fields.pop("current_qty", 0.0) or 0.0
    item = models.InventoryItem(vendor_id=vendor.id, current_qty=0.0, **fields)
    db.add(item)
    db.flush()

    if opening_qty > 0:
        stock.add_stock(
            db,
            item,
            opening_qty,
            unit_cost=item.cost_price,
            mfg_date=item.mfg_date,
            expiry_date=item.expiry_date,
        )

    db.add(
        models.ActivityLog(
            vendor_id=vendor.id, action="Product added", details=f"Added {item.sku_name} to the catalogue."
        )
    )
    db.commit()
    db.refresh(item)
    return item


@router.put("/{item_id}", response_model=schemas.InventoryItemResponse)
def update_item(
    item_id: str,
    req: schemas.InventoryItemUpdate,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    item = _owned_item(item_id, vendor, db)
    fields = req.model_dump()
    requested_qty = fields.pop("current_qty", None)
    requested_expiry = fields.get("expiry_date")
    had_expiry = item.expiry_date

    for field, value in fields.items():
        setattr(item, field, value)

    # An edited expiry belongs to the stock on the shelf, not to the product
    # alone -- written there, the next reconcile would overwrite it from the
    # lots. This runs before any quantity change so that the common case, one
    # lot, ends up with the whole shelf carrying the date that was typed.
    if requested_expiry != had_expiry:
        soonest = stock.open_batches(db, item)
        if soonest:
            soonest[0].expiry_date = requested_expiry

    # Editing the quantity on the product is a correction to the shelf, so it
    # moves lots rather than overwriting the total they add up to. Added units
    # take the same date, which lets them merge into the lot above instead of
    # leaving a second, near-identical row behind after every edit.
    if requested_qty is not None:
        delta = round(requested_qty - (item.current_qty or 0.0), 3)
        if delta > 0:
            stock.add_stock(
                db, item, delta, unit_cost=item.cost_price, expiry_date=requested_expiry
            )
        elif delta < 0:
            stock.consume_stock(db, item, -delta)

    stock.reconcile(db, item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(
    item_id: str,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Archives rather than deletes, so past sales keep their product link."""
    item = _owned_item(item_id, vendor, db)
    item.is_archived = True
    db.add(
        models.ActivityLog(
            vendor_id=vendor.id, action="Product removed", details=f"Removed {item.sku_name}."
        )
    )
    db.commit()
    return None


@router.post("/{item_id}/adjust", response_model=schemas.InventoryItemResponse)
def adjust_stock(
    item_id: str,
    req: schemas.StockAdjustRequest,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    item = _owned_item(item_id, vendor, db)
    if req.qty_change > 0:
        stock.add_stock(db, item, req.qty_change, unit_cost=item.cost_price)
    else:
        stock.consume_stock(db, item, -req.qty_change)

    db.add(
        models.Transaction(
            vendor_id=vendor.id,
            item_id=item.id,
            type="restock" if req.qty_change > 0 else "adjustment",
            qty=req.qty_change,
            source="manual",
        )
    )
    db.add(
        models.ActivityLog(
            vendor_id=vendor.id,
            action="Stock adjusted",
            details=f"{item.sku_name} {req.qty_change:+g} ({req.reason})",
        )
    )
    db.commit()
    db.refresh(item)
    return item


# --------------------------------------------------------------------------
# Voice entry
# --------------------------------------------------------------------------
class VoiceEntryRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=300)
    commit: bool = False
    item_id: Optional[str] = None
    qty: Optional[float] = None


# Intent keywords, including the Roman-script Hindi/Marathi a phone's speech
# recogniser typically returns.
_SOLD_WORDS = {"sold", "sell", "bika", "bike", "becha", "bechi", "gaya", "vikla", "vikale", "minus", "less"}
_ADDED_WORDS = {"added", "add", "received", "receive", "aaya", "aayi", "liya", "kharida", "stock", "plus", "more", "aale"}

_NUMBER_WORDS = {
    "ek": 1, "one": 1, "do": 2, "two": 2, "teen": 3, "three": 3, "char": 4, "four": 4,
    "panch": 5, "paanch": 5, "five": 5, "chah": 6, "chhah": 6, "six": 6, "saat": 7,
    "seven": 7, "aath": 8, "eight": 8, "nau": 9, "nine": 9, "das": 10, "dus": 10,
    "ten": 10, "bees": 20, "twenty": 20, "pachas": 50, "fifty": 50, "sau": 100, "hundred": 100,
}


def _parse_transcript(transcript: str, items: List[models.InventoryItem]) -> dict:
    """Work out quantity, direction and which product was meant.

    The previous implementation grabbed the first number and applied it to
    whichever row happened to come back first from the database, ignoring the
    words entirely -- so "sold 5 bread" added 5 milk.
    """
    text = transcript.lower().strip()
    words = re.findall(r"[a-z0-9ऀ-ॿ]+", text)

    qty = None
    for word in words:
        if word.isdigit():
            qty = float(word)
            break
        if word in _NUMBER_WORDS:
            qty = float(_NUMBER_WORDS[word])
            break
    if qty is None:
        qty = 1.0

    direction = -1 if any(w in _SOLD_WORDS for w in words) else 1
    if any(w in _ADDED_WORDS for w in words):
        direction = 1

    # Match the spoken words against product names. Compare against each word of
    # the SKU too, so "bread" finds "Britannia Whole Wheat Bread".
    best_item = None
    best_score = 0.0
    for item in items:
        name = (item.sku_name or "").lower()
        if not name:
            continue
        score = difflib.SequenceMatcher(None, text, name).ratio()
        name_tokens = re.findall(r"[a-z0-9ऀ-ॿ]+", name)
        for spoken in words:
            if len(spoken) < 3 or spoken.isdigit():
                continue
            if spoken in name:
                score = max(score, 0.8)
            for token in name_tokens:
                score = max(score, difflib.SequenceMatcher(None, spoken, token).ratio() * 0.95)
        if score > best_score:
            best_score, best_item = score, item

    return {
        "qty": qty,
        "direction": direction,
        "item": best_item if best_score >= 0.55 else None,
        "confidence": round(best_score, 2),
    }


@router.post("/voice-entry")
def voice_entry(
    req: VoiceEntryRequest,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Two-phase by design: interpret first, write only once confirmed.

    Call with commit=false to get an interpretation the shopkeeper can check,
    then call again with commit=true plus the confirmed item_id and qty.
    """
    items = (
        db.query(models.InventoryItem)
        .filter(
            models.InventoryItem.vendor_id == vendor.id,
            models.InventoryItem.is_archived.is_(False),
        )
        .all()
    )

    if not req.commit:
        parsed = _parse_transcript(req.transcript, items)
        item = parsed["item"]
        return {
            "understood": item is not None,
            "transcript": req.transcript,
            "item_id": item.id if item else None,
            "sku_name": item.sku_name if item else None,
            "qty": parsed["qty"],
            "direction": parsed["direction"],
            "confidence": parsed["confidence"],
            "message": (
                f"{'Remove' if parsed['direction'] < 0 else 'Add'} {parsed['qty']:g} "
                f"{'from' if parsed['direction'] < 0 else 'to'} {item.sku_name}?"
                if item
                else "Could not match that to a product. Pick one below."
            ),
            # Offers alternatives so a near-miss is one tap from correct.
            "candidates": [
                {"id": i.id, "sku_name": i.sku_name, "current_qty": i.current_qty}
                for i in items[:20]
            ],
        }

    if not req.item_id or req.qty is None:
        raise HTTPException(status_code=400, detail="Confirm the product and quantity before saving")

    item = _owned_item(req.item_id, vendor, db)
    if req.qty > 0:
        stock.add_stock(db, item, req.qty, unit_cost=item.cost_price)
    else:
        stock.consume_stock(db, item, -req.qty)

    db.add(
        models.Transaction(
            vendor_id=vendor.id, item_id=item.id, type="voice", qty=req.qty, source="voice", confidence=0.9
        )
    )
    db.add(
        models.ActivityLog(
            vendor_id=vendor.id,
            action="Voice entry",
            details=f"{item.sku_name} {req.qty:+g} (heard: \"{req.transcript[:80]}\")",
        )
    )
    db.commit()
    db.refresh(item)
    return {"message": f"{item.sku_name} updated", "sku_name": item.sku_name, "new_qty": item.current_qty}


# --------------------------------------------------------------------------
# OCR entry
# --------------------------------------------------------------------------
class OCRItem(BaseModel):
    sku_name: str = Field(min_length=1, max_length=160)
    qty: float = Field(gt=0)
    cost_price: Optional[float] = Field(default=None, ge=0)


class OCREntryRequest(BaseModel):
    items: List[OCRItem] = Field(min_length=1, max_length=200)


@router.post("/ocr-entry")
def ocr_entry(
    req: OCREntryRequest,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    created, updated = [], []
    for entry in req.items:
        item = (
            db.query(models.InventoryItem)
            .filter(
                models.InventoryItem.vendor_id == vendor.id,
                models.InventoryItem.sku_name == entry.sku_name,
                models.InventoryItem.is_archived.is_(False),
            )
            .first()
        )
        if item:
            if entry.cost_price:
                item.cost_price = entry.cost_price
            updated.append(item.sku_name)
        else:
            item = models.InventoryItem(
                vendor_id=vendor.id,
                sku_name=entry.sku_name,
                category="Uncategorised",
                current_qty=0.0,
                cost_price=entry.cost_price or 0.0,
                selling_price=0.0,
            )
            db.add(item)
            db.flush()
            created.append(item.sku_name)

        stock.add_stock(db, item, entry.qty, unit_cost=entry.cost_price or item.cost_price)

        db.add(
            models.Transaction(
                vendor_id=vendor.id, item_id=item.id, type="ocr", qty=entry.qty, source="receipt-scan", confidence=0.7
            )
        )

    db.add(
        models.ActivityLog(
            vendor_id=vendor.id,
            action="Receipt scanned",
            details=f"{len(created)} new, {len(updated)} restocked from a wholesale bill.",
        )
    )
    db.commit()
    return {
        "message": f"{len(created) + len(updated)} item(s) processed",
        "created": created,
        "updated": updated,
    }
