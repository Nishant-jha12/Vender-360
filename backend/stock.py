"""Batch-level stock movement.

Quantity lives in StockBatch rows, one per dated lot. InventoryItem.current_qty
is a cache of their sum -- kept rather than derived on read, because the billing
grid, the reorder list and every list screen already read it, and because it
gives this change a clean way back out.

The rule that makes the cache safe: nothing outside this module moves stock.
Every path that adds (intake, restock, voice, OCR, opening balance, demo seed)
calls add_stock; everything that removes (a sale, a downward correction) calls
consume_stock; both reconcile the item before returning.

Lots are consumed first-expiry-first. A lot with no expiry date is not urgent,
it is unknown, so it goes last and dated stock always moves before it.
"""
from datetime import datetime
from typing import List, NamedTuple, Optional, Tuple

from sqlalchemy.orm import Session

import models

# Quantities are rounded to this many places throughout, so repeated part-lot
# depletion cannot leave 0.30000000000000004 of a packet behind.
_QTY_DP = 3
_COST_EPSILON = 0.005


class Allocation(NamedTuple):
    batch: models.StockBatch
    qty: float


class ConsumeResult(NamedTuple):
    allocations: List[Allocation]
    cost: float          # what the units taken actually cost, in total
    shortfall: float     # asked for beyond what the lots held

    @property
    def unit_cost(self) -> float:
        taken = sum(a.qty for a in self.allocations) + self.shortfall
        return round(self.cost / taken, 4) if taken else 0.0


def fefo_query(db: Session, item: models.InventoryItem):
    """Open lots, soonest to expire first, undated last."""
    return (
        db.query(models.StockBatch)
        .filter(
            models.StockBatch.item_id == item.id,
            models.StockBatch.qty_remaining > 0,
        )
        .order_by(
            # False (0) sorts before True (1), so dated lots come first.
            models.StockBatch.expiry_date.is_(None),
            models.StockBatch.expiry_date.asc(),
            models.StockBatch.received_at.asc(),
        )
    )


def reconcile(db: Session, item: models.InventoryItem) -> None:
    """Refresh the caches on the product from its lots.

    current_qty is the sum of what is left. expiry_date becomes the soonest
    live lot, which is what the clearance alert and the list badge want -- and
    is why intake no longer needs its own rule for which date wins.
    """
    batches = (
        db.query(models.StockBatch)
        .filter(models.StockBatch.item_id == item.id)
        .all()
    )
    item.current_qty = round(sum(b.qty_remaining or 0.0 for b in batches), _QTY_DP)

    live_dates = [
        b.expiry_date for b in batches if (b.qty_remaining or 0.0) > 0 and b.expiry_date
    ]
    item.expiry_date = min(live_dates) if live_dates else None
    item.last_updated = datetime.utcnow()


def add_stock(
    db: Session,
    item: models.InventoryItem,
    qty: float,
    *,
    unit_cost: Optional[float] = None,
    batch_no: Optional[str] = None,
    mfg_date: Optional[datetime] = None,
    expiry_date: Optional[datetime] = None,
    intake_line_id: Optional[str] = None,
    received_at: Optional[datetime] = None,
) -> Optional[models.StockBatch]:
    """Put qty into a lot, merging into an open lot that matches.

    Matching mirrors how an intake line merges repeat scans: same batch number,
    same expiry and the same price. Two deliveries of the same thing on the same
    terms are one lot, not two rows to scroll past.
    """
    if qty <= 0:
        return None

    qty = round(qty, _QTY_DP)
    cost = item.cost_price or 0.0 if unit_cost is None else unit_cost

    existing = next(
        (
            b
            for b in db.query(models.StockBatch)
            .filter(
                models.StockBatch.item_id == item.id,
                models.StockBatch.qty_remaining > 0,
            )
            .all()
            if (b.batch_no or "") == (batch_no or "")
            and b.expiry_date == expiry_date
            and abs((b.unit_cost or 0.0) - cost) < _COST_EPSILON
        ),
        None,
    )

    if existing is not None:
        existing.qty_received = round((existing.qty_received or 0.0) + qty, _QTY_DP)
        existing.qty_remaining = round((existing.qty_remaining or 0.0) + qty, _QTY_DP)
        batch = existing
    else:
        batch = models.StockBatch(
            vendor_id=item.vendor_id,
            item_id=item.id,
            intake_line_id=intake_line_id,
            batch_no=batch_no,
            mfg_date=mfg_date,
            expiry_date=expiry_date,
            qty_received=qty,
            qty_remaining=qty,
            unit_cost=cost,
            received_at=received_at or datetime.utcnow(),
        )
        db.add(batch)
        db.flush()

    reconcile(db, item)
    return batch


def consume_stock(db: Session, item: models.InventoryItem, qty: float) -> ConsumeResult:
    """Take qty off the lots that expire soonest.

    Never refuses: there is a customer at the counter, and a count that
    disagrees with the shelf is the count's problem. Anything beyond what the
    lots hold comes back as `shortfall` for the caller to warn about, costed at
    the product's average so margin still means something.
    """
    remaining = round(max(0.0, qty), _QTY_DP)
    allocations: List[Allocation] = []
    cost = 0.0

    for batch in fefo_query(db, item).all():
        if remaining <= 0:
            break
        take = round(min(batch.qty_remaining or 0.0, remaining), _QTY_DP)
        if take <= 0:
            continue
        batch.qty_remaining = round((batch.qty_remaining or 0.0) - take, _QTY_DP)
        allocations.append(Allocation(batch=batch, qty=take))
        cost += take * (batch.unit_cost or 0.0)
        remaining = round(remaining - take, _QTY_DP)

    if remaining > 0:
        cost += remaining * (item.cost_price or 0.0)

    reconcile(db, item)
    return ConsumeResult(
        allocations=allocations, cost=round(cost, 2), shortfall=remaining
    )


def record_allocations(
    db: Session, sale_item: models.SaleItem, result: ConsumeResult
) -> None:
    """Remember which lots a sale line came out of, so a void can undo it."""
    for allocation in result.allocations:
        db.add(
            models.SaleItemBatch(
                sale_item_id=sale_item.id,
                batch_id=allocation.batch.id,
                qty=allocation.qty,
                unit_cost=allocation.batch.unit_cost or 0.0,
            )
        )


def restore_sale_item(
    db: Session, sale_item: models.SaleItem, item: Optional[models.InventoryItem]
) -> None:
    """Put a voided line back where it came from.

    Sales recorded before batches existed have no allocations, so they fall back
    to a plain top-up rather than being silently lost.
    """
    links = (
        db.query(models.SaleItemBatch)
        .filter(models.SaleItemBatch.sale_item_id == sale_item.id)
        .all()
    )

    if links:
        for link in links:
            batch = (
                db.query(models.StockBatch)
                .filter(models.StockBatch.id == link.batch_id)
                .first()
            )
            if batch is not None:
                batch.qty_remaining = round(
                    (batch.qty_remaining or 0.0) + (link.qty or 0.0), _QTY_DP
                )
            elif item is not None:
                # The lot was deleted underneath us; keep the units rather than
                # dropping them on the floor.
                add_stock(db, item, link.qty or 0.0, unit_cost=link.unit_cost)
        if item is not None:
            reconcile(db, item)
        return

    if item is not None and (sale_item.qty or 0.0) > 0:
        add_stock(db, item, sale_item.qty, unit_cost=sale_item.unit_cost)


def reverse_intake_line(
    db: Session, item: models.InventoryItem, line: models.StockIntakeLine
) -> bool:
    """Take an intake line's units back out of the lot it created.

    Returns False when the lot no longer holds them, which means they have been
    sold. Un-selling is not this function's business, so the caller refuses --
    a correcting entry is the honest way to fix a delivery that has already
    been trading.
    """
    qty = round(line.qty_units or 0.0, _QTY_DP)
    if qty <= 0:
        return True

    batch = (
        db.query(models.StockBatch)
        .filter(models.StockBatch.intake_line_id == line.id)
        .first()
    )
    if batch is None:
        # add_stock folded these units into an older lot on identical terms.
        batch = next(
            (
                b
                for b in open_batches(db, item)
                if (b.batch_no or "") == (line.batch_no or "")
                and b.expiry_date == line.expiry_date
                and abs((b.unit_cost or 0.0) - (line.unit_cost or 0.0)) < _COST_EPSILON
            ),
            None,
        )

    if batch is None or (batch.qty_remaining or 0.0) < qty:
        return False

    batch.qty_remaining = round((batch.qty_remaining or 0.0) - qty, _QTY_DP)
    # Only clear away a lot this line created; an older one it merged into stays.
    if batch.qty_remaining <= 0 and batch.intake_line_id == line.id:
        db.delete(batch)

    reconcile(db, item)
    return True


def open_batches(db: Session, item: models.InventoryItem) -> List[models.StockBatch]:
    return fefo_query(db, item).all()


def expiring_batches(
    db: Session, vendor_id: str, threshold: datetime
) -> List[Tuple[models.StockBatch, models.InventoryItem]]:
    """Live lots dated on or before the threshold, soonest first."""
    return (
        db.query(models.StockBatch, models.InventoryItem)
        .join(models.InventoryItem, models.StockBatch.item_id == models.InventoryItem.id)
        .filter(
            models.StockBatch.vendor_id == vendor_id,
            models.StockBatch.qty_remaining > 0,
            models.StockBatch.expiry_date.isnot(None),
            models.StockBatch.expiry_date <= threshold,
            models.InventoryItem.is_archived.is_(False),
        )
        .order_by(models.StockBatch.expiry_date.asc())
        .all()
    )
