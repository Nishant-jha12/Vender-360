"""Bring an existing vendor360.db up to the current schema.

A stopgap until Alembic is introduced -- it adds missing columns in place so
existing development databases keep their data. Safe to run repeatedly.

    python migrate.py
"""
import sqlite3
from datetime import datetime
from pathlib import Path

from config import settings

# (table, column, SQL type)
COLUMNS = [
    ("vendors", "upi_id", "VARCHAR"),
    ("vendors", "gstin", "VARCHAR"),
    ("vendors", "otp_attempts", "INTEGER DEFAULT 0"),
    ("vendors", "token_epoch", "INTEGER DEFAULT 0"),
    ("vendors", "reset_nonce_hash", "VARCHAR"),
    ("vendors", "reset_expires_at", "DATETIME"),
    ("vendors", "otp_code_hash", "VARCHAR"),
    ("vendors", "otp_expires_at", "DATETIME"),
    ("inventory_items", "expiry_date", "DATETIME"),
    ("inventory_items", "barcode", "VARCHAR"),
    ("inventory_items", "sale_count", "INTEGER DEFAULT 0"),
    ("inventory_items", "is_archived", "BOOLEAN DEFAULT 0"),
    ("inventory_items", "mfg_date", "DATETIME"),
    ("inventory_items", "pack_type", "VARCHAR DEFAULT 'loose'"),
    ("inventory_items", "units_per_pack", "FLOAT DEFAULT 1"),
    ("inventory_items", "hsn_code", "VARCHAR"),
    ("inventory_items", "gst_rate", "FLOAT DEFAULT 0"),
    ("stock_intake_lines", "cost_price_before", "FLOAT"),
    ("stock_intake_lines", "expiry_date_before", "DATETIME"),
]


def _sqlite_path():
    """The database file, or None when this is not SQLite.

    The in-place ALTER TABLE approach below is SQLite-specific. On Postgres the
    tables are created by create_all and there is no column-adding path yet --
    that is what Alembic is for, and this says so rather than crashing.
    """
    url = settings.DATABASE_URL
    if not url.startswith("sqlite"):
        return None
    return Path(url.split("///")[-1]).resolve()


def add_missing_columns(path: Path) -> None:
    if not path.exists():
        print(f"No database at {path} yet -- create_all will build it on first run.")
        return

    conn = sqlite3.connect(path)
    cursor = conn.cursor()
    existing_tables = {
        row[0] for row in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }

    for table, column, sql_type in COLUMNS:
        if table not in existing_tables:
            continue
        present = {row[1] for row in cursor.execute(f"PRAGMA table_info({table})")}
        if column in present:
            continue
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}")
        print(f"  + {table}.{column}")

    conn.commit()
    conn.close()


def backfill_opening_batches() -> None:
    """Give stock that predates batch tracking one lot each.

    Quantity now lives in stock_batches, so an item holding 40 units with no
    lots would read as empty. Each stocked product gets a single opening lot
    carrying its current quantity, cost and expiry -- which is exactly what the
    product row was already claiming, so nothing changes on screen.

    Skips any item that already has lots, so this is safe to run again.
    """
    from sqlalchemy.orm import Session

    import models
    from database import engine

    with Session(engine) as db:
        items = (
            db.query(models.InventoryItem)
            .filter(
                models.InventoryItem.is_archived.is_(False),
                models.InventoryItem.current_qty > 0,
            )
            .all()
        )

        created = 0
        for item in items:
            already = (
                db.query(models.StockBatch)
                .filter(models.StockBatch.item_id == item.id)
                .count()
            )
            if already:
                continue
            db.add(
                models.StockBatch(
                    vendor_id=item.vendor_id,
                    item_id=item.id,
                    batch_no=None,
                    mfg_date=item.mfg_date,
                    expiry_date=item.expiry_date,
                    qty_received=item.current_qty or 0.0,
                    qty_remaining=item.current_qty or 0.0,
                    unit_cost=item.cost_price or 0.0,
                    received_at=item.last_updated or datetime.utcnow(),
                )
            )
            created += 1

        if created:
            db.commit()
            print(f"  + {created} opening stock batch(es) from existing quantities")


def main() -> None:
    path = _sqlite_path()
    if path is None:
        print(
            f"DATABASE_URL is {settings.DATABASE_URL}.\n"
            "In-place column migration is SQLite-only. create_all will build any "
            "missing tables on boot; adding columns to an existing Postgres "
            "database needs Alembic, which is not set up yet."
        )
    else:
        print(f"Migrating {path}")
        add_missing_columns(path)

    # Creates anything still missing, including the new sales/sale_items tables.
    from database import engine
    from models import Base

    Base.metadata.create_all(bind=engine)
    backfill_opening_batches()
    print("Schema is up to date.")
    print(
        "\nNote: password hashes from the old build are upgraded automatically "
        "the next time each vendor logs in."
    )


if __name__ == "__main__":
    main()
