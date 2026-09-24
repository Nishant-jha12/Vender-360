"""Timezone helpers for shop-local operations.

Stores timestamps in naive UTC in the database, while slicing day, month,
and shift boundaries in the shop's operational timezone (settings.SHOP_TZ).
"""
from datetime import datetime, time, timedelta, timezone
from typing import Optional, Tuple
from zoneinfo import ZoneInfo

from config import settings


def get_shop_tz() -> ZoneInfo:
    try:
        return ZoneInfo(settings.SHOP_TZ)
    except Exception:
        return ZoneInfo("Asia/Kolkata")


def to_shop_tz(dt: datetime) -> datetime:
    """Convert a datetime (naive UTC or aware) to shop timezone."""
    tz = get_shop_tz()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(tz)


def shop_day_bounds_utc(day_str: Optional[str] = None) -> Tuple[datetime, datetime, str]:
    """Given an optional 'YYYY-MM-DD' in shop tz (or None for today in shop tz),
    returns (start_utc_naive, end_utc_naive, local_day_str).
    """
    tz = get_shop_tz()
    now_local = datetime.now(tz)
    if day_str:
        local_date = datetime.strptime(day_str, "%Y-%m-%d").date()
    else:
        local_date = now_local.date()

    local_start = datetime.combine(local_date, time.min, tzinfo=tz)
    local_end = local_start + timedelta(days=1)

    start_utc = local_start.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = local_end.astimezone(timezone.utc).replace(tzinfo=None)

    return start_utc, end_utc, local_date.strftime("%Y-%m-%d")


def shop_month_bounds_utc(year: int, month: int) -> Tuple[datetime, datetime]:
    """Given (year, month), returns (start_utc_naive, end_utc_naive) for that
    calendar month in the shop's timezone.
    """
    tz = get_shop_tz()
    local_start = datetime(year, month, 1, 0, 0, 0, tzinfo=tz)
    next_year = year + (month == 12)
    next_month = (month % 12) + 1
    local_end = datetime(next_year, next_month, 1, 0, 0, 0, tzinfo=tz)

    start_utc = local_start.astimezone(timezone.utc).replace(tzinfo=None)
    end_utc = local_end.astimezone(timezone.utc).replace(tzinfo=None)

    return start_utc, end_utc
