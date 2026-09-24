"""Analytics computed from real Sale rows.

Every number here used to be invented -- the sales trend was random.randint(),
so the dashboard showed different revenue on every refresh, and the health score
was the literal integer 78. Each endpoint now returns a `has_data` flag so the
UI can show an honest empty state instead of a fabricated one.
"""
import math
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

import models
import security
import tz_utils
from database import get_db

router = APIRouter()


@router.get("/sales-trend")
def sales_trend(
    days: int = Query(7, ge=1, le=90),
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    local_today = datetime.now(tz_utils.get_shop_tz()).date()
    local_start_date = local_today - timedelta(days=days - 1)
    start_utc, _, _ = tz_utils.shop_day_bounds_utc(local_start_date.strftime("%Y-%m-%d"))

    sales = (
        db.query(models.Sale)
        .filter(models.Sale.vendor_id == vendor.id, models.Sale.created_at >= start_utc)
        .all()
    )

    buckets = defaultdict(lambda: {"sales": 0.0, "profit": 0.0, "bills": 0})
    for sale in sales:
        local_dt = tz_utils.to_shop_tz(sale.created_at)
        key = local_dt.strftime("%Y-%m-%d")
        buckets[key]["sales"] += sale.total_amount or 0.0
        buckets[key]["profit"] += (sale.total_amount or 0.0) - (sale.total_cost or 0.0)
        buckets[key]["bills"] += 1

    trend = []
    for offset in range(days):
        day = local_start_date + timedelta(days=offset)
        bucket = buckets[day.strftime("%Y-%m-%d")]
        trend.append(
            {
                "date": day.strftime("%a"),
                "full_date": day.strftime("%Y-%m-%d"),
                "sales": round(bucket["sales"], 2),
                "profit": round(bucket["profit"], 2),
                "bills": bucket["bills"],
            }
        )

    today_sales = trend[-1]["sales"] if trend else 0.0
    today_profit = trend[-1]["profit"] if trend else 0.0
    week_sales = round(sum(d["sales"] for d in trend), 2)
    week_profit = round(sum(d["profit"] for d in trend), 2)

    return {
        "has_data": len(sales) > 0,
        "trend": trend,
        "today_sales": today_sales,
        "today_profit": today_profit,
        "today_bills": trend[-1]["bills"] if trend else 0,
        "week_sales": week_sales,
        "week_profit": week_profit,
        "margin_pct": round((today_profit / today_sales) * 100, 1) if today_sales > 0 else 0.0,
    }


@router.get("/health-score")
def health_score(
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """A score built from this shop's own behaviour, with every input shown.

    Deliberately explainable: a shopkeeper should be able to see exactly why the
    number moved. A score is only returned once there is enough history to mean
    something -- an invented credit-readiness number is worse than none.
    """
    now = datetime.utcnow()
    local_today = datetime.now(tz_utils.get_shop_tz()).date()
    window_start_local = local_today - timedelta(days=30)
    window_start_utc, _, _ = tz_utils.shop_day_bounds_utc(window_start_local.strftime("%Y-%m-%d"))

    sales = (
        db.query(models.Sale)
        .filter(models.Sale.vendor_id == vendor.id, models.Sale.created_at >= window_start_utc)
        .all()
    )
    items = (
        db.query(models.InventoryItem)
        .filter(
            models.InventoryItem.vendor_id == vendor.id,
            models.InventoryItem.is_archived.is_(False),
        )
        .all()
    )

    if len(sales) < 5:
        return {
            "has_data": False,
            "health_score": None,
            "days_of_history": len({tz_utils.to_shop_tz(s.created_at).date() for s in sales}),
            "sales_recorded": len(sales),
            "message": "Record at least 5 sales and your score will appear here.",
            "breakdown": {},
        }

    # 1. Sales consistency: proportion of the last 30 days with any trade.
    active_days = len({tz_utils.to_shop_tz(s.created_at).date() for s in sales})
    sales_consistency = min(100, round((active_days / 30) * 100))

    # 2. Inventory turnover: units sold against units held.
    units_sold = sum(line.qty or 0 for s in sales for line in s.line_items)
    units_held = sum(i.current_qty or 0 for i in items) or 1
    inventory_turnover = min(100, round((units_sold / units_held) * 100))

    # 3. Spoilage risk: value already expired against total stock value.
    # Measured per lot, so a product holding good stock alongside expired stock
    # is penalised for the expired part only.
    batches = (
        db.query(models.StockBatch)
        .filter(
            models.StockBatch.vendor_id == vendor.id,
            models.StockBatch.qty_remaining > 0,
        )
        .all()
    )
    stock_value = sum(b.value_at_cost for b in batches) or 1
    expired_value = sum(
        b.value_at_cost for b in batches if b.expiry_date and b.expiry_date < now
    )
    waste_pct = round((expired_value / stock_value) * 100)
    waste_control = max(0, 100 - waste_pct * 3)  # spoilage is penalised steeply

    # 4. Restocking: share of the catalogue currently above its reorder point.
    if items:
        in_stock = sum(1 for i in items if (i.current_qty or 0) > (i.reorder_point or 0))
        restocking = round((in_stock / len(items)) * 100)
    else:
        restocking = 0

    score = round(
        sales_consistency * 0.35
        + inventory_turnover * 0.25
        + waste_control * 0.20
        + restocking * 0.20
    )

    return {
        "has_data": True,
        "health_score": score,
        "days_of_history": active_days,
        "sales_recorded": len(sales),
        "breakdown": {
            "sales_consistency": sales_consistency,
            "inventory_turnover": inventory_turnover,
            "waste_control": waste_control,
            "on_time_restocking": restocking,
        },
        "weights": {
            "sales_consistency": 35,
            "inventory_turnover": 25,
            "waste_control": 20,
            "on_time_restocking": 20,
        },
        "expired_stock_value": round(expired_value, 2),
    }


@router.get("/forecast")
def forecast(
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Day-of-week demand, learned from this shop's own sales.

    A moving average against a weekday factor: simple, explainable and honest.
    Until there is enough history it says so rather than shipping a hardcoded
    list of predictions labelled 'AI'.
    """
    tz = tz_utils.get_shop_tz()
    now_local = datetime.now(tz)
    start_local = now_local.date() - timedelta(days=56)
    start_utc, _, _ = tz_utils.shop_day_bounds_utc(start_local.strftime("%Y-%m-%d"))

    sales = (
        db.query(models.Sale)
        .options(joinedload(models.Sale.line_items))
        .filter(models.Sale.vendor_id == vendor.id, models.Sale.created_at >= start_utc)
        .all()
    )

    distinct_days = len({tz_utils.to_shop_tz(s.created_at).date() for s in sales})
    if distinct_days < 14:
        return {
            "has_data": False,
            "days_of_history": distinct_days,
            "days_needed": 14,
            "message": f"{distinct_days} of 14 days of sales recorded. Forecasts start once there is a fortnight to learn from.",
            "predictions": [],
        }

    # Revenue per item per weekday.
    per_weekday = defaultdict(lambda: defaultdict(float))
    per_item_total = defaultdict(float)
    weekday_days = defaultdict(set)

    for sale in sales:
        local_dt = tz_utils.to_shop_tz(sale.created_at)
        weekday = local_dt.strftime("%A")
        weekday_days[weekday].add(local_dt.date())
        for line in sale.line_items:
            value = (line.qty or 0) * (line.unit_price or 0)
            per_weekday[weekday][line.sku_name] += value
            per_item_total[line.sku_name] += value

    total_days = distinct_days or 1
    tomorrow = (now_local + timedelta(days=1)).strftime("%A")
    tomorrow_day_count = len(weekday_days.get(tomorrow, set())) or 1

    predictions = []
    for sku, total in sorted(per_item_total.items(), key=lambda kv: kv[1], reverse=True)[:6]:
        overall_daily_avg = total / total_days
        tomorrow_avg = per_weekday[tomorrow][sku] / tomorrow_day_count
        if overall_daily_avg <= 0:
            continue
        change_pct = round(((tomorrow_avg - overall_daily_avg) / overall_daily_avg) * 100)
        predictions.append(
            {
                "sku_name": sku,
                "expected_value": round(tomorrow_avg, 2),
                "daily_average": round(overall_daily_avg, 2),
                "change_pct": change_pct,
                "driver": f"{tomorrow}s run {'above' if change_pct >= 0 else 'below'} your daily average",
            }
        )

    predictions.sort(key=lambda p: abs(p["change_pct"]), reverse=True)

    return {
        "has_data": True,
        "days_of_history": distinct_days,
        "forecast_for": tomorrow,
        "predictions": predictions,
        "method": "Day-of-week average against a 56-day baseline",
    }


@router.get("/reorder-list")
def reorder_list(
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    """Everything at or below its reorder point, ready to send to a wholesaler."""
    items = (
        db.query(models.InventoryItem)
        .filter(
            models.InventoryItem.vendor_id == vendor.id,
            models.InventoryItem.is_archived.is_(False),
            models.InventoryItem.current_qty <= models.InventoryItem.reorder_point,
        )
        .order_by(models.InventoryItem.category.asc(), models.InventoryItem.sku_name.asc())
        .all()
    )

    lines = []
    estimated_cost = 0.0
    for item in items:
        # Restock to twice the reorder point so there is headroom before the
        # next trip to the wholesaler.
        suggested = max(1, round((item.reorder_point or 0) * 2 - (item.current_qty or 0)))
        estimated_cost += suggested * (item.cost_price or 0)
        lines.append(
            {
                "id": item.id,
                "sku_name": item.sku_name,
                "category": item.category,
                "current_qty": item.current_qty,
                "reorder_point": item.reorder_point,
                "suggested_qty": suggested,
                "unit": item.unit,
                "estimated_cost": round(suggested * (item.cost_price or 0), 2),
            }
        )

    share_text = f"{vendor.store_name} - restock order\n\n" + "\n".join(
        f"{i + 1}. {line['sku_name']} - {line['suggested_qty']} {line['unit']}"
        for i, line in enumerate(lines)
    )

    return {
        "has_data": len(lines) > 0,
        "items": lines,
        "estimated_cost": round(estimated_cost, 2),
        "share_text": share_text if lines else "",
    }


@router.get("/activities")
def activities(
    limit: int = Query(20, ge=1, le=100),
    vendor: models.Vendor = Depends(security.get_current_vendor),
    db: Session = Depends(get_db),
):
    logs = (
        db.query(models.ActivityLog)
        .filter(models.ActivityLog.vendor_id == vendor.id)
        .order_by(models.ActivityLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": log.id,
            "action": log.action,
            "details": log.details,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]


# --------------------------------------------------------------------------
# Heatmap -- sample data, clearly labelled
# --------------------------------------------------------------------------
@router.get("/heatmap")
def heatmap(
    lat: float = Query(18.5204),
    lng: float = Query(73.8567),
    category: Optional[str] = Query("all"),
    radius_km: float = Query(3.0, ge=0.5, le=25),
    vendor: models.Vendor = Depends(security.get_current_vendor),
):
    """SAMPLE DATA. Every zone, wholesaler, competitor and demographic figure
    below is illustrative -- there is no hyperlocal data source behind this yet.
    The is_demo flag drives the badge the UI shows, so nobody mistakes these for
    real measurements."""
    if not (math.isfinite(lat) and math.isfinite(lng) and math.isfinite(radius_km)):
        raise HTTPException(status_code=422, detail="Latitude, longitude, and radius must be finite numbers")
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
        raise HTTPException(status_code=422, detail="Latitude must be between -90 and 90, longitude between -180 and 180")
    zones = [
        {
            "id": "z1",
            "name": "North Commercial Market & Food Street",
            "category": "Dairy & Sweets",
            "intensity": 92,
            "weekly_market_size_inr": 58000,
            "top_demand": "Milk, Ghee, Paneer, Sweets",
            "demand_driver": "Festival prep and the morning tea-stall rush",
            "lat": lat + 0.012,
            "lng": lng - 0.008,
            "crowd_type": "Morning & Evening Peak",
        },
        {
            "id": "z2",
            "name": "Central Railway / Metro Transit Hub",
            "category": "Rain Gear & Quick Snacks",
            "intensity": 97,
            "weekly_market_size_inr": 84000,
            "top_demand": "Umbrellas, Rain Covers, Cold Drinks, Wafers",
            "demand_driver": "Commuter footfall",
            "lat": lat + 0.004,
            "lng": lng + 0.014,
            "crowd_type": "Continuous Heavy Transit",
        },
        {
            "id": "z3",
            "name": "West High-Density Residential",
            "category": "Daily Staples",
            "intensity": 74,
            "weekly_market_size_inr": 46000,
            "top_demand": "Atta, Oil, Rice, Pulses, Sugar",
            "demand_driver": "Monthly household replenishment",
            "lat": lat - 0.011,
            "lng": lng - 0.018,
            "crowd_type": "Family Residential",
        },
        {
            "id": "z4",
            "name": "East IT Park & Student Hostels",
            "category": "Instant Foods & Energy Drinks",
            "intensity": 81,
            "weekly_market_size_inr": 49000,
            "top_demand": "Noodles, Energy Drinks, Biscuits, Chips",
            "demand_driver": "Late-night consumption, high impulse purchase",
            "lat": lat - 0.006,
            "lng": lng + 0.022,
            "crowd_type": "Youth & Tech Workforce",
        },
        {
            "id": "z5",
            "name": "South Suburban Extension",
            "category": "Bakery & Biscuits",
            "intensity": 48,
            "weekly_market_size_inr": 22000,
            "top_demand": "Bread, Milk, Rusk, Tea Powder",
            "demand_driver": "Morning breakfast baseline",
            "lat": lat - 0.022,
            "lng": lng + 0.005,
            "crowd_type": "Suburban Households",
        },
    ]

    wholesalers = [
        {
            "id": "w1",
            "name": "APMC Grain & Spices Wholesale Mandi",
            "type": "Primary Agriculture Mandi",
            "specialty": "Bulk grains, rice, pulses",
            "discount_rate": "18-22% off MRP",
            "distance_km": 2.4,
            "lat": lat + 0.018,
            "lng": lng + 0.011,
            "open_hours": "04:00 - 14:00",
        },
        {
            "id": "w2",
            "name": "Dairy Master Depot",
            "type": "Authorised Dairy Distributor",
            "specialty": "Milk, ghee, butter, paneer",
            "discount_rate": "12-15% margin",
            "distance_km": 1.2,
            "lat": lat - 0.009,
            "lng": lng - 0.014,
            "open_hours": "05:00 - 20:00",
        },
        {
            "id": "w3",
            "name": "Metro B2B FMCG Cash & Carry",
            "type": "Super Stockist",
            "specialty": "Packaged goods, soaps, oil",
            "discount_rate": "Bulk tiered rebates",
            "distance_km": 4.1,
            "lat": lat - 0.025,
            "lng": lng + 0.028,
            "open_hours": "07:00 - 21:00",
        },
    ]

    competitors = [
        {"id": "c1", "name": "Neighbourhood Kirana", "lat": lat + 0.006, "lng": lng - 0.005, "scale": "Medium"},
        {"id": "c2", "name": "Local Supermarket", "lat": lat - 0.007, "lng": lng + 0.008, "scale": "Large"},
        {"id": "c3", "name": "Provision Store", "lat": lat + 0.010, "lng": lng + 0.004, "scale": "Small"},
    ]

    if category and category.lower() != "all":
        needle = category.lower()
        filtered = [z for z in zones if needle in z["category"].lower() or needle in z["top_demand"].lower()]
        zones = filtered or zones

    households = int(radius_km * 4200)
    return {
        "is_demo": True,
        "demo_notice": "Illustrative sample data, not a live measurement of your area.",
        "anchor_lat": lat,
        "anchor_lng": lng,
        "radius_km": radius_km,
        "demographics": {
            "estimated_households": households,
            "estimated_population": households * 4,
            "monthly_market_potential_crores": round((households * 8500) / 10_000_000, 2),
            "competitor_count": len(competitors),
            "wholesaler_count": len(wholesalers),
        },
        "total_hotspots": len(zones),
        "zones": zones,
        "wholesalers": wholesalers,
        "competitors": competitors,
    }
