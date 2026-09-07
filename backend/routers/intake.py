"""Stock intake -- restocking by scanning the delivery in.

The shape of the problem: a kirana delivery is a mix of loose singles and
cartons. Scanning a loose packet means "one more of these", and there is nothing
to ask about, so it is written immediately. Scanning a carton means "one case of
however many this SKU comes in", which is a number worth showing the shopkeeper
before it lands in their stock -- so a carton scan returns the pack details and
waits for a confirmation, the same interpret-then-confirm pattern voice entry
uses.

Everything scanned in one delivery is grouped into a StockIntake session, which
is what gets printed or saved as a PDF afterwards. Stock moves as each line is
added rather than at the end, so a phone that dies mid-delivery has not lost the
counting already done.
"""
from datetime import datetime
from typing import List, NamedTuple, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

import barcodes
import models
import schemas
import security
import stock
from config import settings
from database import get_db

router = APIRouter()


class AppliedLine(NamedTuple):
    """The result of one scan landing in stock.

    `units` is what this scan added, which is not `line.qty_units` once a line
    has absorbed a repeat scan -- and it is the per-scan figure that the cost
    average has to be built from.
    """

    line: models.StockIntakeLine
    units: float
    prior_qty: float
    prior_cost: float
    prior_expiry: Optional[datetime]


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _open_session(vendor: models.Vendor, db: Session) -> models.StockIntake:
    """The delivery currently being counted, opening one if needed."""
    session = (
        db.query(models.StockIntake)
        .filter(
            models.StockIntake.vendor_id == vendor.id,
            models.StockIntake.status == "open",
        )
        .order_by(models.StockIntake.started_at.desc())
        .first()
    )
    if session is None:
        session = models.StockIntake(vendor_id=vendor.id, status="open")
        db.add(session)
        db.flush()
    return session


def _owned_session(intake_id: str, vendor: models.Vendor, db: Session) -> models.StockIntake:
    session = (
        db.query(models.StockIntake)
        .options(joinedload(models.StockIntake.lines))
        .filter(
            models.StockIntake.id == intake_id,
            models.StockIntake.vendor_id == vendor.id,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Intake not found")
    return session


def _find_item(
    req_item_id: Optional[str],
    barcode: Optional[str],
    vendor: models.Vendor,
    db: Session,
) -> Optional[models.InventoryItem]:
    query = db.query(models.InventoryItem).filter(
        models.InventoryItem.vendor_id == vendor.id,
        models.InventoryItem.is_archived.is_(False),
    )
    if req_item_id:
        return query.filter(models.InventoryItem.id == req_item_id).first()
    if barcode:
        return query.filter(models.InventoryItem.barcode == barcode).first()
    return None


def _units_per_pack(item: models.InventoryItem) -> float:
    if (item.pack_type or "loose") != "carton":
        return 1.0
    # A carton with no pack size recorded is treated as a single unit rather
    # than silently multiplying stock by a guess.
    return float(item.units_per_pack or 1.0)


def _apply_line(
    session: models.StockIntake,
    item: models.InventoryItem,
    vendor: models.Vendor,
    db: Session,
    *,
    packs: float,
    units_per_pack: float,
    unit_cost: float,
    unit_price: float,
    gst_rate: float,
    hsn_code: Optional[str],
    batch_no: Optional[str],
    mfg_date: Optional[datetime],
    expiry_date: Optional[datetime],
    source: str,
) -> "AppliedLine":
    """Move the stock and record the line. The only place intake writes stock."""
    qty_units = round(packs * units_per_pack, 3)

    # The product as it stood before this scan. The caller needs these to blend
    # the new cost into the stock already held, and to decide whether the new
    # expiry is really the soonest one on the shelf.
    prior_qty = max(0.0, item.current_qty or 0.0)
    prior_cost = item.cost_price or 0.0
    prior_expiry = item.expiry_date

    # Scanning the same thing twice in one delivery is counting, not two
    # separate lines -- as long as the batch and price agree.
    existing = next(
        (
            line
            for line in session.lines
            if line.item_id == item.id
            and (line.batch_no or "") == (batch_no or "")
            and line.expiry_date == expiry_date
            and abs((line.unit_cost or 0.0) - unit_cost) < 0.005
            and abs((line.units_per_pack or 1.0) - units_per_pack) < 0.005
        ),
        None,
    )

    if existing is not None:
        existing.packs = round((existing.packs or 0.0) + packs, 3)
        existing.qty_units = round((existing.qty_units or 0.0) + qty_units, 3)
        line = existing
    else:
        line = models.StockIntakeLine(
            intake_id=session.id,
            item_id=item.id,
            sku_name=item.sku_name,
            barcode=item.barcode,
            hsn_code=hsn_code,
            pack_type=item.pack_type or "loose",
            packs=packs,
            units_per_pack=units_per_pack,
            qty_units=qty_units,
            unit_cost=unit_cost,
            unit_price=unit_price,
            gst_rate=gst_rate,
            batch_no=batch_no,
            mfg_date=mfg_date,
            expiry_date=expiry_date,
            source=source,
            # Recorded once, when the line is born. A line that later absorbs
            # four more scans must still undo back to before the first of them.
            cost_price_before=prior_cost,
            expiry_date_before=prior_expiry,
        )
        db.add(line)
        session.lines.append(line)

    # The line's id has to exist before a lot can point back at it.
    db.flush()
    stock.add_stock(
        db,
        item,
        qty_units,
        unit_cost=unit_cost,
        batch_no=batch_no,
        mfg_date=mfg_date,
        expiry_date=expiry_date,
        intake_line_id=line.id,
    )

    db.add(
        models.Transaction(
            vendor_id=vendor.id,
            item_id=item.id,
            type="restock",
            qty=qty_units,
            source="scan",
            confidence=1.0,
        )
    )
    return AppliedLine(
        line=line,
        units=qty_units,
        prior_qty=prior_qty,
        prior_cost=prior_cost,
        prior_expiry=prior_expiry,
    )


def _blended_cost(applied: AppliedLine, incoming_cost: float) -> float:
    """Weighted average of what is on the shelf and what just arrived.

    Overwriting instead would rewrite the cost of stock bought weeks ago at a
    different price, which quietly moves margin, the value of the shelf in the
    health score, and the loss risk on expiring goods.
    """
    if applied.prior_qty > 0 and applied.prior_cost > 0:
        total_qty = applied.prior_qty + applied.units
        if total_qty > 0:
            return round(
                (applied.prior_qty * applied.prior_cost + applied.units * incoming_cost)
                / total_qty,
                2,
            )
    return incoming_cost


def _short_dated(expiry: Optional[datetime]) -> dict:
    """Flag stock that is close to dated as it comes off the van.

    Wholesalers push short-dated goods, and the confirm step is the last moment
    the carton can still be refused rather than written off later.
    """
    if expiry is None:
        return {"days_to_expiry": None, "short_dated": False}
    days = (expiry - datetime.utcnow()).days
    return {
        "days_to_expiry": days,
        "short_dated": days <= settings.SHORT_DATED_DAYS,
    }


def _is_interstate(store_gstin: Optional[str], supplier_gstin: Optional[str]) -> bool:
    """A GSTIN opens with a two-digit state code; different states mean IGST.

    With either side unknown this returns False, so the note keeps its local
    CGST/SGST split -- and says on its face that the split was assumed.
    """
    if not store_gstin or not supplier_gstin:
        return False
    return store_gstin.strip()[:2] != supplier_gstin.strip()[:2]


def _line_payload(line: models.StockIntakeLine) -> dict:
    return schemas.IntakeLineResponse.model_validate(line).model_dump()


# --------------------------------------------------------------------------
# Session
# --------------------------------------------------------------------------
@router.post("/session", response_model=schemas.IntakeSessionResponse)
def start_session(
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Open a delivery, or hand back the one already in progress."""
    session = _open_session(vendor, db)
    db.commit()
    db.refresh(session)
    return session


@router.get("/session/current", response_model=Optional[schemas.IntakeSessionResponse])
def current_session(
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """The delivery in progress, or null. Never creates one -- GETs don't write."""
    return (
        db.query(models.StockIntake)
        .options(joinedload(models.StockIntake.lines))
        .filter(
            models.StockIntake.vendor_id == vendor.id,
            models.StockIntake.status == "open",
        )
        .order_by(models.StockIntake.started_at.desc())
        .first()
    )


@router.put("/session/{intake_id}", response_model=schemas.IntakeSessionResponse)
def update_session(
    intake_id: str,
    req: schemas.IntakeSessionUpdate,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Supplier and invoice details -- what makes the printout a tax document."""
    session = _owned_session(intake_id, vendor, db)
    session.supplier_name = (req.supplier_name or "").strip() or None
    session.supplier_gstin = (req.supplier_gstin or "").strip().upper() or None
    session.invoice_no = (req.invoice_no or "").strip() or None
    session.invoice_date = req.invoice_date
    session.note = (req.note or "").strip() or None
    db.commit()
    db.refresh(session)
    return session


@router.get("/sessions")
def list_sessions(
    status_filter: Optional[str] = Query(None, alias="status", pattern="^(open|closed)$"),
    supplier: Optional[str] = Query(None, max_length=140),
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Past deliveries, so a GST summary can be printed again months later.

    Totals are computed here rather than left to the client, so a list of fifty
    deliveries is one request instead of fifty-one.
    """
    query = (
        db.query(models.StockIntake)
        .options(joinedload(models.StockIntake.lines))
        .filter(models.StockIntake.vendor_id == vendor.id)
    )
    if status_filter:
        query = query.filter(models.StockIntake.status == status_filter)
    if supplier:
        query = query.filter(models.StockIntake.supplier_name.ilike(f"%{supplier.strip()}%"))
    if from_date:
        query = query.filter(models.StockIntake.started_at >= from_date)
    if to_date:
        query = query.filter(models.StockIntake.started_at <= to_date)

    sessions = (
        query.order_by(models.StockIntake.started_at.desc()).offset(offset).limit(limit).all()
    )

    rows = []
    for session in sessions:
        taxable = round(sum(line.taxable_value for line in session.lines), 2)
        gst = round(sum(line.gst_amount for line in session.lines), 2)
        rows.append(
            {
                "id": session.id,
                "status": session.status,
                "supplier_name": session.supplier_name,
                "supplier_gstin": session.supplier_gstin,
                "invoice_no": session.invoice_no,
                "invoice_date": session.invoice_date,
                "started_at": session.started_at,
                "closed_at": session.closed_at,
                "line_count": len(session.lines),
                "total_units": round(sum(line.qty_units or 0.0 for line in session.lines), 3),
                "taxable_value": taxable,
                "gst_amount": gst,
                "grand_total": round(taxable + gst, 2),
            }
        )
    return rows


@router.get("/register")
def purchase_register(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """A month of closed deliveries, rate-wise -- what actually gets filed.

    One goods-received note proves a single purchase; the return wants the
    month totalled and split by rate, which is this.
    """
    year, mon = (int(part) for part in month.split("-"))
    if not 1 <= mon <= 12:
        raise HTTPException(status_code=422, detail="Month must be 01 to 12")

    start = datetime(year, mon, 1)
    end = datetime(year + (mon == 12), (mon % 12) + 1, 1)

    sessions = (
        db.query(models.StockIntake)
        .options(joinedload(models.StockIntake.lines))
        .filter(
            models.StockIntake.vendor_id == vendor.id,
            models.StockIntake.status == "closed",
            models.StockIntake.started_at >= start,
            models.StockIntake.started_at < end,
        )
        .order_by(models.StockIntake.started_at.asc())
        .all()
    )

    entries = []
    by_rate: dict = {}
    interstate_taxable = 0.0

    for session in sessions:
        interstate = _is_interstate(vendor.gstin, session.supplier_gstin)
        taxable = round(sum(line.taxable_value for line in session.lines), 2)
        gst = round(sum(line.gst_amount for line in session.lines), 2)
        if interstate:
            interstate_taxable += taxable

        for line in session.lines:
            bucket = by_rate.setdefault(
                line.gst_rate or 0.0,
                {"rate": line.gst_rate or 0.0, "taxable_value": 0.0, "gst_amount": 0.0,
                 "cgst": 0.0, "sgst": 0.0, "igst": 0.0},
            )
            bucket["taxable_value"] = round(bucket["taxable_value"] + line.taxable_value, 2)
            bucket["gst_amount"] = round(bucket["gst_amount"] + line.gst_amount, 2)
            if interstate:
                bucket["igst"] = round(bucket["igst"] + line.gst_amount, 2)
            else:
                half = round(line.gst_amount / 2.0, 2)
                bucket["cgst"] = round(bucket["cgst"] + half, 2)
                bucket["sgst"] = round(bucket["sgst"] + line.gst_amount - half, 2)

        entries.append(
            {
                "id": session.id,
                "date": session.started_at,
                "supplier_name": session.supplier_name,
                "supplier_gstin": session.supplier_gstin,
                "invoice_no": session.invoice_no,
                "invoice_date": session.invoice_date,
                "interstate": interstate,
                "line_count": len(session.lines),
                "taxable_value": taxable,
                "gst_amount": gst,
                "grand_total": round(taxable + gst, 2),
            }
        )

    taxable_total = round(sum(e["taxable_value"] for e in entries), 2)
    gst_total = round(sum(e["gst_amount"] for e in entries), 2)

    return {
        "month": month,
        "store": {"name": vendor.store_name, "gstin": vendor.gstin},
        "entries": entries,
        "gst_breakup": sorted(by_rate.values(), key=lambda b: b["rate"]),
        "totals": {
            "deliveries": len(entries),
            "taxable_value": taxable_total,
            "gst_amount": gst_total,
            "grand_total": round(taxable_total + gst_total, 2),
            "interstate_taxable_value": round(interstate_taxable, 2),
        },
        "gst_ready": bool(vendor.gstin) and gst_total > 0,
        "generated_at": datetime.utcnow(),
    }


# --------------------------------------------------------------------------
# Scanning
# --------------------------------------------------------------------------
@router.post("/scan")
def scan(
    req: schemas.IntakeScanRequest,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """One scan.

    Loose items are restocked on the spot. Cartons come back as a confirmation
    payload instead, because "+1" and "+24" are very different mistakes to make
    silently. An unrecognised barcode comes back as `unknown` so the UI can
    offer to create the product.
    """
    if not req.barcode and not req.item_id:
        raise HTTPException(status_code=400, detail="Scan a barcode or pick an item")

    session = _open_session(vendor, db)
    item = _find_item(req.item_id, req.barcode, vendor, db)

    if item is None:
        db.commit()  # keep the session that was just opened
        details = barcodes.describe(req.barcode or "")
        # Fill in what the number and the open product database know, so an
        # unknown barcode opens a form that is mostly already answered rather
        # than an empty one.
        product = (
            barcodes.lookup(details["barcode"], db)
            if details["barcode"] and details["check_digit_valid"] is not False
            else None
        )

        if details["check_digit_valid"] is False:
            message = (
                "That barcode's check digit does not add up, so it was probably "
                "misread or mistyped. Scan it again, or add the product by hand."
            )
        elif product:
            message = f"{product['sku_name']} -- found from the barcode. Check it and add it."
        else:
            message = (
                "That barcode isn't in your catalogue yet. Add it once and "
                "every future scan will know it."
            )

        return {
            "status": "unknown",
            "barcode": details["barcode"] or req.barcode,
            "intake_id": session.id,
            "details": details,
            "product": product,
            "message": message,
        }

    units_per_pack = _units_per_pack(item)

    if (item.pack_type or "loose") == "carton":
        db.commit()
        return {
            "status": "confirm",
            "intake_id": session.id,
            "item": schemas.InventoryItemResponse.model_validate(item).model_dump(),
            "suggestion": {
                "item_id": item.id,
                "sku_name": item.sku_name,
                "packs": req.packs,
                "units_per_pack": units_per_pack,
                "qty_units": round(req.packs * units_per_pack, 3),
                "unit_cost": item.cost_price or 0.0,
                "unit_price": item.selling_price or 0.0,
                "gst_rate": item.gst_rate or 0.0,
                "hsn_code": item.hsn_code,
                "mfg_date": item.mfg_date,
                "expiry_date": item.expiry_date,
                **_short_dated(item.expiry_date),
            },
            "message": f"{item.sku_name}: 1 box of {units_per_pack:g} {item.unit or 'units'}. "
            "Check the count, batch and expiry before adding.",
        }

    applied = _apply_line(
        session,
        item,
        vendor,
        db,
        packs=req.packs,
        units_per_pack=1.0,
        unit_cost=item.cost_price or 0.0,
        unit_price=item.selling_price or 0.0,
        gst_rate=item.gst_rate or 0.0,
        hsn_code=item.hsn_code,
        batch_no=None,
        mfg_date=item.mfg_date,
        expiry_date=item.expiry_date,
        source="barcode" if req.barcode else "manual",
    )
    line = applied.line
    db.commit()
    db.refresh(line)
    db.refresh(item)

    return {
        "status": "applied",
        "intake_id": session.id,
        "line": _line_payload(line),
        "item": schemas.InventoryItemResponse.model_validate(item).model_dump(),
        "message": f"{item.sku_name} +{req.packs:g} · now {item.current_qty:g} {item.unit or 'units'}",
    }


@router.post("/confirm")
def confirm(
    req: schemas.IntakeConfirmRequest,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Commit a reviewed scan -- the carton path, and any corrected loose line."""
    session = _open_session(vendor, db)
    item = _find_item(req.item_id, None, vendor, db)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")

    units_per_pack = req.units_per_pack if req.units_per_pack is not None else _units_per_pack(item)
    unit_cost = req.unit_cost if req.unit_cost is not None else (item.cost_price or 0.0)
    unit_price = req.unit_price if req.unit_price is not None else (item.selling_price or 0.0)
    gst_rate = req.gst_rate if req.gst_rate is not None else (item.gst_rate or 0.0)
    hsn_code = req.hsn_code or item.hsn_code
    expiry_date = req.expiry_date or item.expiry_date
    mfg_date = req.mfg_date or item.mfg_date

    applied = _apply_line(
        session,
        item,
        vendor,
        db,
        packs=req.packs,
        units_per_pack=units_per_pack,
        unit_cost=unit_cost,
        unit_price=unit_price,
        gst_rate=gst_rate,
        hsn_code=hsn_code,
        batch_no=(req.batch_no or "").strip() or None,
        mfg_date=mfg_date,
        expiry_date=expiry_date,
        source="barcode",
    )
    line = applied.line

    if req.remember:
        # Teach the product what the box looks like, so the next delivery of the
        # same carton is a single scan with nothing to type.
        if req.units_per_pack is not None:
            item.units_per_pack = req.units_per_pack
            item.pack_type = "carton" if req.units_per_pack > 1 else item.pack_type
        if req.unit_cost is not None:
            item.cost_price = _blended_cost(applied, req.unit_cost)
        if req.unit_price is not None:
            item.selling_price = req.unit_price
        if req.gst_rate is not None:
            item.gst_rate = req.gst_rate
        if req.hsn_code:
            item.hsn_code = req.hsn_code.strip()
        if req.mfg_date is not None:
            item.mfg_date = req.mfg_date
        # The expiry is not set here any more. It belongs to the lot this
        # delivery created, and stock.reconcile() derives the product's date
        # from whichever live lot expires soonest -- which is the rule the old
        # min() here was a stand-in for, now that two lots can coexist.

    db.commit()
    db.refresh(line)
    db.refresh(item)

    return {
        "status": "applied",
        "intake_id": session.id,
        "line": _line_payload(line),
        "item": schemas.InventoryItemResponse.model_validate(item).model_dump(),
        "message": f"{item.sku_name} +{line.qty_units:g} {item.unit or 'units'} added to stock",
    }


@router.delete("/lines/{line_id}", status_code=204)
def remove_line(
    line_id: str,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Undo a scan: takes the stock back off as well as dropping the line."""
    line = (
        db.query(models.StockIntakeLine)
        .join(models.StockIntake, models.StockIntakeLine.intake_id == models.StockIntake.id)
        .filter(
            models.StockIntakeLine.id == line_id,
            models.StockIntake.vendor_id == vendor.id,
        )
        .first()
    )
    if not line:
        raise HTTPException(status_code=404, detail="Line not found")

    if line.item_id:
        item = (
            db.query(models.InventoryItem)
            .filter(models.InventoryItem.id == line.item_id)
            .first()
        )
        if item:
            if not stock.reverse_intake_line(db, item, line):
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Some of that {line.sku_name} has already been sold, so the "
                        "delivery cannot be undone. Correct the count on the product instead."
                    ),
                )
            # A blended cost cannot be un-averaged, so the value from before the
            # line is restored outright. The expiry needs no such treatment any
            # more: reconcile() has just derived it from the lots that remain.
            if line.cost_price_before is not None:
                item.cost_price = line.cost_price_before
            db.add(
                models.Transaction(
                    vendor_id=vendor.id,
                    item_id=item.id,
                    type="adjustment",
                    qty=-(line.qty_units or 0.0),
                    source="scan-undo",
                )
            )

    db.delete(line)
    db.commit()
    return None


# --------------------------------------------------------------------------
# Summary
# --------------------------------------------------------------------------
def _summary(session: models.StockIntake, vendor: models.Vendor) -> dict:
    lines = sorted(session.lines, key=lambda line: line.created_at or datetime.utcnow())

    taxable_total = 0.0
    gst_total = 0.0
    unit_total = 0.0
    by_rate: dict = {}

    for line in lines:
        taxable_total += line.taxable_value
        gst_total += line.gst_amount
        unit_total += line.qty_units or 0.0
        bucket = by_rate.setdefault(
            line.gst_rate or 0.0,
            {"rate": line.gst_rate or 0.0, "taxable_value": 0.0, "gst_amount": 0.0},
        )
        bucket["taxable_value"] = round(bucket["taxable_value"] + line.taxable_value, 2)
        bucket["gst_amount"] = round(bucket["gst_amount"] + line.gst_amount, 2)

    # A local wholesaler is an intra-state purchase and the rate splits evenly
    # into CGST and SGST; a supplier in another state is IGST at the full rate,
    # with no split. Getting this backwards misstates the input-tax claim.
    interstate = _is_interstate(vendor.gstin, session.supplier_gstin)
    # True when there was not enough on file to tell, so the split below is an
    # assumption the document has to own up to.
    tax_basis_assumed = not (vendor.gstin and session.supplier_gstin)

    gst_breakup = []
    for bucket in sorted(by_rate.values(), key=lambda b: b["rate"]):
        if interstate:
            split = {"igst": bucket["gst_amount"], "cgst": 0.0, "sgst": 0.0}
        else:
            half = round(bucket["gst_amount"] / 2.0, 2)
            split = {
                "igst": 0.0,
                "cgst": half,
                # The remainder, so a rate that halves unevenly still adds up.
                "sgst": round(bucket["gst_amount"] - half, 2),
            }
        gst_breakup.append(
            {
                **bucket,
                **split,
                "total": round(bucket["taxable_value"] + bucket["gst_amount"], 2),
            }
        )

    return {
        "intake": schemas.IntakeSessionResponse.model_validate(session).model_dump(),
        "store": {
            "name": vendor.store_name,
            "owner": vendor.name,
            "phone": vendor.phone,
            "gstin": vendor.gstin,
        },
        "totals": {
            "line_count": len(lines),
            "total_units": round(unit_total, 3),
            "taxable_value": round(taxable_total, 2),
            "gst_amount": round(gst_total, 2),
            "grand_total": round(taxable_total + gst_total, 2),
        },
        "gst_breakup": gst_breakup,
        "interstate": interstate,
        "tax_basis_assumed": tax_basis_assumed,
        # A claim needs a GSTIN on it; say so rather than printing a document
        # that quietly is not one.
        "gst_ready": bool(vendor.gstin) and gst_total > 0,
        "generated_at": datetime.utcnow(),
    }


@router.get("/session/{intake_id}/summary")
def session_summary(
    intake_id: str,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    return _summary(_owned_session(intake_id, vendor, db), vendor)


@router.post("/session/{intake_id}/reopen", response_model=schemas.IntakeSessionResponse)
def reopen_session(
    intake_id: str,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Reopen a delivery closed by mistake, while its stock is still untouched.

    Once any of it has sold, editing history would make the numbers disagree
    with what actually happened -- a correcting intake is the honest fix, the
    same stance void_sale takes.
    """
    session = _owned_session(intake_id, vendor, db)
    if session.status == "open":
        return session

    for line in session.lines:
        if not line.item_id:
            continue
        item = (
            db.query(models.InventoryItem)
            .filter(models.InventoryItem.id == line.item_id)
            .first()
        )
        if item is None:
            continue
        batch = (
            db.query(models.StockBatch)
            .filter(models.StockBatch.intake_line_id == line.id)
            .first()
        )
        if batch is not None and (batch.qty_remaining or 0.0) < (line.qty_units or 0.0):
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Some of that {line.sku_name} has already been sold, so this delivery "
                    "can no longer be reopened. Record a correcting intake instead."
                ),
            )

    session.status = "open"
    session.closed_at = None
    db.add(
        models.ActivityLog(
            vendor_id=vendor.id,
            action="Stock intake reopened",
            details=f"{len(session.lines)} line(s) back in progress.",
        )
    )
    db.commit()
    db.refresh(session)
    return session


@router.post("/session/{intake_id}/close")
def close_session(
    intake_id: str,
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Finish the delivery and hand back the summary to print or save."""
    session = _owned_session(intake_id, vendor, db)
    if not session.lines:
        raise HTTPException(status_code=400, detail="Nothing was scanned into this delivery")

    if session.status == "open":
        session.status = "closed"
        session.closed_at = datetime.utcnow()
        db.add(
            models.ActivityLog(
                vendor_id=vendor.id,
                action="Stock intake closed",
                details=(
                    f"{len(session.lines)} line(s) scanned in"
                    + (f" from {session.supplier_name}" if session.supplier_name else "")
                ),
            )
        )
        db.commit()
        db.refresh(session)

    return _summary(session, vendor)
