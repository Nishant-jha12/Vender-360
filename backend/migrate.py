"""Bring an existing vendor360.db up to the current schema.

A stopgap until Alembic is introduced -- it adds missing columns in place so
existing development databases keep their data. Safe to run repeatedly.

    python migrate.py
"""
import sqlite3
from pathlib import Path

from config import settings

# (table, column, SQL type)
COLUMNS = [
    ("vendors", "upi_id", "VARCHAR"),
    ("vendors", "otp_code_hash", "VARCHAR"),
    ("vendors", "otp_expires_at", "DATETIME"),
    ("inventory_items", "expiry_date", "DATETIME"),
    ("inventory_items", "barcode", "VARCHAR"),
    ("inventory_items", "sale_count", "INTEGER DEFAULT 0"),
    ("inventory_items", "is_archived", "BOOLEAN DEFAULT 0"),
]


def _sqlite_path() -> Path:
    url = settings.DATABASE_URL
    if not url.startswith("sqlite"):
        raise SystemExit(f"migrate.py only handles SQLite; DATABASE_URL is {url}")
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


def main() -> None:
    path = _sqlite_path()
    print(f"Migrating {path}")
    add_missing_columns(path)

    # Creates anything still missing, including the new sales/sale_items tables.
    from database import engine
    from models import Base

    Base.metadata.create_all(bind=engine)
    print("Schema is up to date.")
    print(
        "\nNote: password hashes from the old build are upgraded automatically "
        "the next time each vendor logs in."
    )


if __name__ == "__main__":
    main()
