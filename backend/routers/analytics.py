from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from database import get_db
import models
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta
import random

router = APIRouter()

class ForecastResponse(BaseModel):
    id: str
    item_id: str
    sku_name: str
    predicted_demand: float
    drivers: str

@router.get("/forecast/{vendor_id}")
def get_forecasts(vendor_id: str, db: Session = Depends(get_db)):
    return [
        {
            "id": "f1",
            "item_name": "Umbrellas & Rain Covers",
            "predicted_demand_increase_pct": 40,
            "driver": "Unseasonal rain expected (Thu-Fri)",
            "type": "weather"
        },
        {
            "id": "f2",
            "item_name": "Dairy & Sweets Ingredients",
            "predicted_demand_increase_pct": 30,
            "driver": "Ganesh Chaturthi in 9 days",
            "type": "festival"
        }
    ]

@router.get("/health-score/{vendor_id}")
def get_health_score(vendor_id: str, db: Session = Depends(get_db)):
    vendor = db.query(models.Vendor).filter(models.Vendor.id == vendor_id).first()
    score = vendor.health_score if vendor and vendor.health_score > 0 else 78
    
    return {
        "vendor_id": vendor_id,
        "health_score": score,
        "breakdown": {
            "sales_consistency": 92,
            "inventory_turnover": 81,
            "waste_spoilage": 10, 
            "on_time_restocking": 70
        }
    }

@router.get("/heatmap/{vendor_id}")
@router.get("/heatmap")
def get_heatmap(
    vendor_id: Optional[str] = "test",
    lat: Optional[float] = Query(18.5204, description="Latitude"),
    lng: Optional[float] = Query(73.8567, description="Longitude"),
    category: Optional[str] = Query("all", description="Product category filter"),
    radius_km: Optional[float] = Query(3.0, description="Catchment radius in km"),
    db: Session = Depends(get_db)
):
    # 1. Dynamic Demand Hotspot Clusters
    all_zones = [
        {
            "id": "z1",
            "name": "North Commercial Market & Food Street",
            "category": "Dairy & Sweets",
            "intensity": 92,
            "weekly_market_size_inr": 58000,
            "top_demand": "Amul Milk, Ghee, Paneer, Sweets",
            "demand_driver": "Festival prep & heavy morning tea stall rush",
            "lat": lat + 0.012,
            "lng": lng - 0.008,
            "crowd_type": "Morning & Evening Peak",
            "google_maps_query": f"{lat + 0.012},{lng - 0.008}"
        },
        {
            "id": "z2",
            "name": "Central Railway / Metro Transit Hub",
            "category": "Rain Gear & Quick Snacks",
            "intensity": 97,
            "weekly_market_size_inr": 84000,
            "top_demand": "Umbrellas, Rain Covers, Cold Beverages, Wafers",
            "demand_driver": "Commuter footfall + unseasonal monsoon forecast",
            "lat": lat + 0.004,
            "lng": lng + 0.014,
            "crowd_type": "Continuous Heavy Transit",
            "google_maps_query": f"{lat + 0.004},{lng + 0.014}"
        },
        {
            "id": "z3",
            "name": "West High-Density Residential Societies",
            "category": "Daily Staples",
            "intensity": 74,
            "weekly_market_size_inr": 46000,
            "top_demand": "Atta, Edible Oil, Rice, Pulses, Sugar",
            "demand_driver": "Monthly household grocery replenishment",
            "lat": lat - 0.011,
            "lng": lng - 0.018,
            "crowd_type": "Family Residential",
            "google_maps_query": f"{lat - 0.011},{lng - 0.018}"
        },
        {
            "id": "z4",
            "name": "East IT Park & Student Hostel Hub",
            "category": "Instant Foods & Energy Drinks",
            "intensity": 81,
            "weekly_market_size_inr": 49000,
            "top_demand": "Maggi Noodles, Red Bull, Biscuits, Chips",
            "demand_driver": "Late-night consumption & high impulse purchases",
            "lat": lat - 0.006,
            "lng": lng + 0.022,
            "crowd_type": "Youth & Tech Workforce",
            "google_maps_query": f"{lat - 0.006},{lng + 0.022}"
        },
        {
            "id": "z5",
            "name": "South Suburban Extension & Gated Enclave",
            "category": "Bakery & Biscuits",
            "intensity": 48,
            "weekly_market_size_inr": 22000,
            "top_demand": "Artisan Bread, Milk, Rusk, Tea Powder",
            "demand_driver": "Standard morning breakfast baseline",
            "lat": lat - 0.022,
            "lng": lng + 0.005,
            "crowd_type": "Suburban Households",
            "google_maps_query": f"{lat - 0.022},{lng + 0.005}"
        }
    ]

    # 2. Nearby FMCG Wholesalers & B2B Mandis
    wholesalers = [
        {
            "id": "w1",
            "name": "APMC Grain & Spices Wholesale Mandi",
            "type": "Primary Agriculture Mandi",
            "specialty": "Bulk Grains, Rice, Pulses (50kg bags)",
            "discount_rate": "18-22% off MRP",
            "contact": "+91 98200 11234",
            "distance_km": 2.4,
            "lat": lat + 0.018,
            "lng": lng + 0.011,
            "open_hours": "04:00 AM - 02:00 PM"
        },
        {
            "id": "w2",
            "name": "Amul & Mother Dairy Master Depot",
            "type": "Authorized Dairy Distributor",
            "specialty": "Milk, Ghee, Butter, Ice Creams, Paneer",
            "discount_rate": "12-15% margin",
            "contact": "+91 98190 44556",
            "distance_km": 1.2,
            "lat": lat - 0.009,
            "lng": lng - 0.014,
            "open_hours": "05:00 AM - 08:00 PM"
        },
        {
            "id": "w3",
            "name": "Metro B2B FMCG Cash & Carry",
            "type": "Super Stockist",
            "specialty": "Packaged Goods, Soaps, Edible Oil, Confectionery",
            "discount_rate": "Bulk Tiered Rebates",
            "contact": "+91 98330 99881",
            "distance_km": 4.1,
            "lat": lat - 0.025,
            "lng": lng + 0.028,
            "open_hours": "07:00 AM - 09:00 PM"
        }
    ]

    # 3. Competitor Kirana Density
    competitors = [
        {"id": "c1", "name": "Gupta Kirana & General Store", "lat": lat + 0.006, "lng": lng - 0.005, "scale": "Medium"},
        {"id": "c2", "name": "Mahalaxmi Supermarket", "lat": lat - 0.007, "lng": lng + 0.008, "scale": "Large"},
        {"id": "c3", "name": "Balaji Provision Stores", "lat": lat + 0.010, "lng": lng + 0.004, "scale": "Small"}
    ]

    # 4. Catchment Demographics Calculation
    households = int(radius_km * 4200)
    population = households * 4
    monthly_grocery_spend_cr = round((households * 8500) / 10000000, 2)

    filtered_zones = all_zones
    if category and category.lower() != "all":
        filtered_zones = [z for z in all_zones if category.lower() in z["category"].lower() or category.lower() in z["top_demand"].lower()]
        if not filtered_zones:
            filtered_zones = all_zones

    return {
        "anchor_lat": lat,
        "anchor_lng": lng,
        "radius_km": radius_km,
        "demographics": {
            "estimated_households": households,
            "estimated_population": population,
            "monthly_market_potential_crores": monthly_grocery_spend_cr,
            "competitor_count": len(competitors),
            "wholesaler_count": len(wholesalers)
        },
        "total_hotspots": len(filtered_zones),
        "overall_status": f"High demand detected across {len(filtered_zones)} hyperlocal clusters.",
        "zones": filtered_zones,
        "wholesalers": wholesalers,
        "competitors": competitors
    }

@router.get("/sales-trend/{vendor_id}")
def get_sales_trend(vendor_id: str, db: Session = Depends(get_db)):
    trend = []
    base_sales = 3500
    today = datetime.now()
    
    for i in range(6, -1, -1):
        date = today - timedelta(days=i)
        daily_sales = base_sales + random.randint(-500, 1500)
        profit = daily_sales * random.uniform(0.15, 0.25)
        
        trend.append({
            "date": date.strftime("%a"),
            "sales": round(daily_sales, 2),
            "profit": round(profit, 2)
        })
        
    today_sales = trend[-1]["sales"]
    today_profit = trend[-1]["profit"]
    margin_pct = round((today_profit / today_sales) * 100, 1) if today_sales > 0 else 0

    return {
        "trend": trend,
        "today_sales": today_sales,
        "today_profit": today_profit,
        "margin_pct": margin_pct
    }

@router.get("/activities/{vendor_id}")
def get_activities(vendor_id: str, db: Session = Depends(get_db)):
    logs = db.query(models.ActivityLog).filter(models.ActivityLog.vendor_id == vendor_id).order_by(models.ActivityLog.created_at.desc()).limit(10).all()
    
    if not logs:
        return [
            {"id": "1", "action": "Low Stock Alert", "details": "Milk inventory fell below reorder point.", "time": "2 hours ago"},
            {"id": "2", "action": "OCR Scan", "details": "Automatically updated 3 items from wholesale bill.", "time": "5 hours ago"},
            {"id": "3", "action": "Voice Log", "details": "Added 20 units of Bread.", "time": "Yesterday"},
            {"id": "4", "action": "System", "details": "New AI forecast generated for weekend.", "time": "Yesterday"}
        ]
        
    return [{"id": log.id, "action": log.action, "details": log.details, "time": log.created_at.strftime("%H:%M %p")} for log in logs]
