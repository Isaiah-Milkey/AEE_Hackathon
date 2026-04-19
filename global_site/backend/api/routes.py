"""
routes.py

All API endpoints for the BTM heatmap backend.
"""

import math
import time
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from db.database import get_db, Node, LMPRecord, GasPriceRecord, SpreadScore

router = APIRouter(prefix="/api")
PIPELINE_QUERY_URL = "https://arcgis.netl.doe.gov/server/rest/services/Hosted/Natural_Gas_Pipelines/FeatureServer/10/query"
TEXAS_OUTLINE_URL = "https://raw.githubusercontent.com/glynnbird/usstatesgeojson/master/texas.geojson"
WEST_TEXAS_BBOX = {
    "xmin": -106.8,
    "ymin": 29.0,
    "xmax": -99.0,
    "ymax": 34.8,
}
OVERLAY_CACHE_TTL_SECONDS = 60 * 60 * 6
_overlay_cache: dict[str, dict] = {}


async def _get_cached_json(cache_key: str, url: str, params: dict | None = None) -> dict:
    cached = _overlay_cache.get(cache_key)
    now = time.time()
    if cached and (now - cached["timestamp"]) < OVERLAY_CACHE_TTL_SECONDS:
        return cached["data"]

    async with httpx.AsyncClient(timeout=45) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()

    _overlay_cache[cache_key] = {
        "timestamp": now,
        "data": data,
    }
    return data


# ---------------------------------------------------------------------------
# GET /api/heatmap
# Returns all nodes with their spread score — loaded on map startup
# ---------------------------------------------------------------------------
@router.get("/heatmap")
def get_heatmap(db: Session = Depends(get_db)):
    """
    Returns all West Texas nodes with coordinates and spread scores.
    This is the primary payload the map loads on startup.
    """
    try:
        nodes  = db.query(Node).all()
        scores = {s.node_id: s for s in db.query(SpreadScore).all()}
    except Exception as e:
        import traceback
        print(f"[ERROR] /api/heatmap failed: {e}")
        print(traceback.format_exc())
        raise

    result = []
    for node in nodes:
        score = scores.get(node.id)
        result.append({
            "id":           node.id,
            "name":         node.name,
            "lat":          node.lat,
            "lng":          node.lng,
            "zone":         node.zone,
            "node_type":    node.node_type,
            "avg_spread":   score.avg_spread   if score else None,
            "avg_lmp":      score.avg_lmp      if score else None,
            "avg_gas_cost": score.avg_gas_cost if score else None,
            # Spread-based coloring (original)
            "color":        score.spread_color if score else "#888888",
            "label":        score.spread_label if score else "No data",
            # LMP-based coloring (new)
            "lmp_color":    score.lmp_color    if score else "#888888",
            "lmp_label":    score.lmp_label    if score else "No data",
            "data_start":   score.data_start.isoformat() if score else None,
            "data_end":     score.data_end.isoformat()   if score else None,
        })

    return {"nodes": result, "count": len(result)}


@router.get("/overlays/texas-outline")
async def get_texas_outline():
    """Returns a cached Texas state outline as GeoJSON."""
    try:
        data = await _get_cached_json("texas-outline", TEXAS_OUTLINE_URL)
        return JSONResponse(content=data)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Texas outline fetch failed: {exc}") from exc


# Texas county boundaries GeoJSON URL (US Census Bureau)
TEXAS_COUNTIES_URL = "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json"

# We'll filter to Texas counties (FIPS codes starting with 48)
TX_COUNTY_FIPS_PREFIX = "48"


@router.get("/overlays/county-boundaries")
async def get_county_boundaries():
    """
    Returns Texas county boundaries as GeoJSON.
    Cached using the existing overlay-caching pattern.
    """
    try:
        data = await _get_cached_json("texas-counties", TEXAS_COUNTIES_URL)
        
        # Filter to only Texas counties (FIPS starting with 48)
        if "features" in data:
            texas_features = [
                f for f in data["features"]
                if f.get("id", "").startswith(TX_COUNTY_FIPS_PREFIX)
            ]
            data["features"] = texas_features
        
        return JSONResponse(content=data)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"County boundaries fetch failed: {exc}") from exc


@router.get("/overlays/gas-pipelines")
async def get_gas_pipelines(
    xmin: float = Query(default=WEST_TEXAS_BBOX["xmin"]),
    ymin: float = Query(default=WEST_TEXAS_BBOX["ymin"]),
    xmax: float = Query(default=WEST_TEXAS_BBOX["xmax"]),
    ymax: float = Query(default=WEST_TEXAS_BBOX["ymax"]),
    max_allowable_offset: float = Query(default=0.01),
):
    """
    Returns a cached subset of HIFLD gas pipelines as GeoJSON.
    Defaults to a West Texas bounding box for performance.
    """
    params = {
        "where": "1=1",
        "outFields": "objectid,typepipe,operator",
        "returnGeometry": "true",
        "outSR": "4326",
        "resultType": "tile",
        "cacheHint": "true",
        "geometryPrecision": 5,
        "maxAllowableOffset": max_allowable_offset,
        "geometryType": "esriGeometryEnvelope",
        "spatialRel": "esriSpatialRelIntersects",
        "inSR": "4326",
        "geometry": f"{xmin},{ymin},{xmax},{ymax}",
        "f": "geojson",
    }
    cache_key = f"gas-pipelines:{xmin:.3f}:{ymin:.3f}:{xmax:.3f}:{ymax:.3f}:{max_allowable_offset:.4f}"
    try:
        data = await _get_cached_json(cache_key, PIPELINE_QUERY_URL, params=params)
        return JSONResponse(content=data)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Gas pipeline fetch failed: {exc}") from exc


# ---------------------------------------------------------------------------
# GET /api/site/{node_id}
# Returns full history for one node — called when user clicks a known dot
# ---------------------------------------------------------------------------
@router.get("/site/{node_id}")
def get_site_detail(
    node_id: str,
    window: str = Query(default="90d", description="Time window: 30d, 90d, 1y, or custom"),
    start_date: str | None = Query(default=None, description="Start date for custom window (YYYY-MM-DD)"),
    end_date: str | None = Query(default=None, description="End date for custom window (YYYY-MM-DD)"),
    db: Session = Depends(get_db)
):
    """
    Returns LMP history, gas price history, and spread history for one node.
    Used to populate the side panel charts.
    
    Supports time-window filtering:
    - 30d: last 30 days
    - 90d: last 90 days (default)
    - 1y: last 365 days
    - custom: use start_date and end_date parameters
    """
    from datetime import datetime, timedelta
    
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")

    score = db.query(SpreadScore).filter(SpreadScore.node_id == node_id).first()

    # Calculate date range based on window parameter
    now = datetime.now()
    if window == "30d":
        start_dt = now - timedelta(days=30)
        end_dt = now
    elif window == "90d":
        start_dt = now - timedelta(days=90)
        end_dt = now
    elif window == "1y":
        start_dt = now - timedelta(days=365)
        end_dt = now
    elif window == "custom":
        if not start_date or not end_date:
            raise HTTPException(status_code=400, detail="Custom window requires start_date and end_date")
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        raise HTTPException(status_code=400, detail=f"Invalid window: {window}. Use 30d, 90d, 1y, or custom")

    # Daily averages for charting (too many points at 15-min resolution)
    lmp_records = db.query(
        func.date(LMPRecord.timestamp).label("date"),
        func.avg(LMPRecord.lmp).label("avg_lmp"),
        func.min(LMPRecord.lmp).label("min_lmp"),
        func.max(LMPRecord.lmp).label("max_lmp"),
    ).filter(
        LMPRecord.node_id == node_id,
        LMPRecord.timestamp >= start_dt,
        LMPRecord.timestamp <= end_dt,
    ).group_by(
        func.date(LMPRecord.timestamp)
    ).order_by(
        func.date(LMPRecord.timestamp)
    ).all()

    gas_records = db.query(GasPriceRecord).order_by(
        GasPriceRecord.date
    ).all()

    # Build gas price lookup by date string
    gas_by_date = {
        str(g.date.date()): {
            "waha":  g.waha_price,
            "henry": g.henry_hub_price,
            "basis": g.basis_differential,
        }
        for g in gas_records
    }

    # Build daily chart data — join LMP + gas by date
    HEAT_RATE = 8.5
    OM_COST   = 3.50
    chart_data = []

    for row in lmp_records:
        date_str = str(row.date)
        gas = gas_by_date.get(date_str)
        if not gas:
            continue

        cost = (gas["waha"] * HEAT_RATE) + OM_COST
        spread = row.avg_lmp - cost

        chart_data.append({
            "date":       date_str,
            "lmp":        round(row.avg_lmp, 2),
            "lmp_min":    round(row.min_lmp,  2),
            "lmp_max":    round(row.max_lmp,  2),
            "gas_cost":   round(cost,          2),
            "waha_price": round(gas["waha"],   4),
            "spread":     round(spread,         2),
        })

    return {
        "node": {
            "id":       node.id,
            "name":     node.name,
            "lat":      node.lat,
            "lng":      node.lng,
            "zone":     node.zone,
        },
        "score": {
            "avg_spread":   score.avg_spread   if score else None,
            "avg_lmp":      score.avg_lmp      if score else None,
            "avg_gas_cost": score.avg_gas_cost if score else None,
            "label":        score.spread_label if score else "No data",
            "color":        score.spread_color if score else "#888888",
        },
        "chart_data":  chart_data,
        "total_days":  len(chart_data),
    }


# ---------------------------------------------------------------------------
# GET /api/site/{node_id}/live
# Returns current/most recent data for a node — shown at top of side panel
# ---------------------------------------------------------------------------
@router.get("/site/{node_id}/live")
def get_site_live(node_id: str, db: Session = Depends(get_db)):
    """
    Returns the most recent LMP record and most recent gas price.
    Shows "right now" conditions in the side panel.
    """
    latest_lmp = db.query(LMPRecord).filter(
        LMPRecord.node_id == node_id
    ).order_by(LMPRecord.timestamp.desc()).first()

    latest_gas = db.query(GasPriceRecord).order_by(
        GasPriceRecord.date.desc()
    ).first()

    if not latest_lmp or not latest_gas:
        raise HTTPException(status_code=404, detail="No live data available")

    HEAT_RATE = 8.5
    OM_COST   = 3.50
    cost = (latest_gas.waha_price * HEAT_RATE) + OM_COST
    spread = latest_lmp.lmp - cost

    return {
        "timestamp":      latest_lmp.timestamp.isoformat(),
        "lmp":            round(latest_lmp.lmp, 2),
        "waha_price":     round(latest_gas.waha_price, 4),
        "henry_price":    round(latest_gas.henry_hub_price, 4),
        "basis":          round(latest_gas.basis_differential, 4),
        "cost_to_gen":    round(cost, 2),
        "current_spread": round(spread, 2),
        "recommendation": "Generate" if spread > 0 else "Import from grid",
    }


# ---------------------------------------------------------------------------
# POST /api/site/{node_id}/forecast
# Placeholder endpoint for future site-level ML forecasts
# ---------------------------------------------------------------------------
@router.post("/site/{node_id}/forecast")
def request_site_forecast(
    node_id: str,
    forecast_params: dict = Body(default={}),
    db: Session = Depends(get_db)
):
    """
    Placeholder endpoint for generating a forecast for a specific node.
    Future implementation will run an ML model using the selected node's features and historical data.
    """
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")

    return {
        "node_id": node_id,
        "status": "placeholder",
        "message": "Forecast endpoint placeholder. ML model integration coming soon.",
        "requested_params": forecast_params,
    }


# ---------------------------------------------------------------------------
# GET /api/nearest?lat=&lng=
# Finds closest known node to arbitrary map coordinates
# Called when user clicks a blank spot on the map
# ---------------------------------------------------------------------------
@router.get("/nearest")
def get_nearest_node(lat: float, lng: float, db: Session = Depends(get_db)):
    """
    Takes arbitrary lat/lng coordinates (from a blank map click).
    Finds the nearest known settlement point and returns its data.
    Also returns distance so the frontend can show a proximity warning.
    """
    nodes = db.query(Node).all()
    if not nodes:
        raise HTTPException(status_code=404, detail="No nodes in database")

    def haversine_miles(lat1, lng1, lat2, lng2) -> float:
        """Straight-line distance between two lat/lng points in miles."""
        R = 3958.8  # Earth radius in miles
        d_lat = math.radians(lat2 - lat1)
        d_lng = math.radians(lng2 - lng1)
        a = (math.sin(d_lat / 2) ** 2 +
             math.cos(math.radians(lat1)) *
             math.cos(math.radians(lat2)) *
             math.sin(d_lng / 2) ** 2)
        return R * 2 * math.asin(math.sqrt(a))

    nearest = min(nodes, key=lambda n: haversine_miles(lat, lng, n.lat, n.lng))
    distance = haversine_miles(lat, lng, nearest.lat, nearest.lng)

    score = db.query(SpreadScore).filter(
        SpreadScore.node_id == nearest.id
    ).first()

    return {
        "clicked_lat":   lat,
        "clicked_lng":   lng,
        "nearest_node":  nearest.id,
        "nearest_name":  nearest.name,
        "distance_miles": round(distance, 1),
        "accuracy_flag": distance > 20,  # Warn if more than 20 miles away
        "avg_spread":    score.avg_spread   if score else None,
        "color":         score.spread_color if score else "#888888",
        "label":         score.spread_label if score else "No data",
    }


# ---------------------------------------------------------------------------
# GET /api/location/economics?lat=&lng=
# Returns complete economics payload for any lat/lng in one response
# Consolidates nearest node lookup + site detail + live data
# ---------------------------------------------------------------------------
@router.get("/location/economics")
def get_location_economics(lat: float, lng: float, db: Session = Depends(get_db)):
    """
    Takes arbitrary lat/lng coordinates (from any map click).
    Returns the complete economics payload in a single response:
    - Nearest node metadata
    - Distance from click point
    - LMP data
    - Waha gas price
    - Cost to generate
    - Live spread
    - Recommendation
    - Timestamp
    
    This endpoint consolidates what used to require 3 API calls
    (nearest + site detail + live) into one request.
    """
    nodes = db.query(Node).all()
    if not nodes:
        raise HTTPException(status_code=404, detail="No nodes in database")

    def haversine_miles(lat1, lng1, lat2, lng2) -> float:
        """Straight-line distance between two lat/lng points in miles."""
        R = 3958.8  # Earth radius in miles
        d_lat = math.radians(lat2 - lat1)
        d_lng = math.radians(lng2 - lng1)
        a = (math.sin(d_lat / 2) ** 2 +
             math.cos(math.radians(lat1)) *
             math.cos(math.radians(lat2)) *
             math.sin(d_lng / 2) ** 2)
        return R * 2 * math.asin(math.sqrt(a))

    # Find nearest node
    nearest = min(nodes, key=lambda n: haversine_miles(lat, lng, n.lat, n.lng))
    distance = haversine_miles(lat, lng, nearest.lat, nearest.lng)
    
    # Get score for nearest node
    score = db.query(SpreadScore).filter(
        SpreadScore.node_id == nearest.id
    ).first()
    
    # Get latest LMP for the node
    latest_lmp = db.query(LMPRecord).filter(
        LMPRecord.node_id == nearest.id
    ).order_by(LMPRecord.timestamp.desc()).first()
    
    # Get latest gas price
    latest_gas = db.query(GasPriceRecord).order_by(
        GasPriceRecord.date.desc()
    ).first()
    
    if not latest_lmp or not latest_gas:
        raise HTTPException(status_code=404, detail="No live data available for nearest node")
    
    HEAT_RATE = 8.5
    OM_COST = 3.50
    cost_to_gen = (latest_gas.waha_price * HEAT_RATE) + OM_COST
    live_spread = latest_lmp.lmp - cost_to_gen
    
    # Determine recommendation
    if live_spread > 10:
        recommendation = "Strong Generate"
    elif live_spread > 0:
        recommendation = "Generate"
    elif live_spread > -5:
        recommendation = "Import from grid"
    else:
        recommendation = "Avoid Generation"
    
    return {
        "location": {
            "clicked_lat": lat,
            "clicked_lng": lng,
        },
        "nearest_node": {
            "id": nearest.id,
            "name": nearest.name,
            "lat": nearest.lat,
            "lng": nearest.lng,
            "zone": nearest.zone,
            "node_type": nearest.node_type,
        },
        "distance_miles": round(distance, 1),
        "accuracy_flag": distance > 20,
        "live": {
            "timestamp": latest_lmp.timestamp.isoformat(),
            "lmp": round(latest_lmp.lmp, 2),
            "waha_price": round(latest_gas.waha_price, 4),
            "henry_price": round(latest_gas.henry_hub_price, 4),
            "basis": round(latest_gas.basis_differential, 4),
            "cost_to_gen": round(cost_to_gen, 2),
            "current_spread": round(live_spread, 2),
            "recommendation": recommendation,
        },
        "score": {
            "avg_spread": score.avg_spread if score else None,
            "avg_lmp": score.avg_lmp if score else None,
            "avg_gas_cost": score.avg_gas_cost if score else None,
            "label": score.spread_label if score else "No data",
            "color": score.spread_color if score else "#888888",
        },
    }


# ---------------------------------------------------------------------------
# POST /api/site/{node_id}/refresh
# Manual refresh for live values only - does not mutate historical data
# ---------------------------------------------------------------------------
@router.post("/site/{node_id}/refresh")
def refresh_site_live(node_id: str, db: Session = Depends(get_db)):
    """
    Manual refresh endpoint that updates only the latest live pricing fields.
    Does NOT mutate historical chart datasets - only refreshes current conditions.
    Returns updated live data with new timestamp.
    """
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    
    # Get latest LMP for the node
    latest_lmp = db.query(LMPRecord).filter(
        LMPRecord.node_id == node_id
    ).order_by(LMPRecord.timestamp.desc()).first()
    
    # Get latest gas price
    latest_gas = db.query(GasPriceRecord).order_by(
        GasPriceRecord.date.desc()
    ).first()
    
    if not latest_lmp or not latest_gas:
        raise HTTPException(status_code=404, detail="No live data available")
    
    HEAT_RATE = 8.5
    OM_COST = 3.50
    cost = (latest_gas.waha_price * HEAT_RATE) + OM_COST
    spread = latest_lmp.lmp - cost
    
    # Determine recommendation
    if spread > 10:
        recommendation = "Strong Generate"
    elif spread > 0:
        recommendation = "Generate"
    elif spread > -5:
        recommendation = "Import from grid"
    else:
        recommendation = "Avoid Generation"
    
    return {
        "refreshed": True,
        "timestamp": datetime.now().isoformat(),
        "lmp": round(latest_lmp.lmp, 2),
        "waha_price": round(latest_gas.waha_price, 4),
        "henry_price": round(latest_gas.henry_hub_price, 4),
        "basis": round(latest_gas.basis_differential, 4),
        "cost_to_gen": round(cost, 2),
        "current_spread": round(spread, 2),
        "recommendation": recommendation,
    }


# ---------------------------------------------------------------------------
# GET /api/site/{node_id}/analytics
# Returns volatility and risk assessment for a given time window
# ---------------------------------------------------------------------------
@router.get("/site/{node_id}/analytics")
def get_site_analytics(
    node_id: str,
    window: str = Query(default="90d", description="Time window: 30d, 90d, 1y, or custom"),
    start_date: str | None = Query(default=None, description="Start date for custom window"),
    end_date: str | None = Query(default=None, description="End date for custom window"),
    db: Session = Depends(get_db)
):
    """
    Returns volatility and risk assessment analytics for a node:
    - Average spread for the window
    - Standard deviation of spread
    - Rolling 30-day standard deviation series
    - Risk classification (Stable/Moderate/Risky/Avoid)
    
    Risk classification rules:
    - Stable: std_dev < 5 and avg_spread > 0
    - Moderate: std_dev < 10 and avg_spread > -5
    - Risky: std_dev < 15
    - Avoid: std_dev >= 15 or avg_spread < -10
    """
    from datetime import datetime, timedelta
    import statistics
    
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    
    # Calculate date range based on window parameter
    now = datetime.now()
    if window == "30d":
        start_dt = now - timedelta(days=30)
        end_dt = now
    elif window == "90d":
        start_dt = now - timedelta(days=90)
        end_dt = now
    elif window == "1y":
        start_dt = now - timedelta(days=365)
        end_dt = now
    elif window == "custom":
        if not start_date or not end_date:
            raise HTTPException(status_code=400, detail="Custom window requires start_date and end_date")
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        raise HTTPException(status_code=400, detail=f"Invalid window: {window}")
    
    # Get daily spread data for the window
    lmp_records = db.query(
        func.date(LMPRecord.timestamp).label("date"),
        func.avg(LMPRecord.lmp).label("avg_lmp"),
    ).filter(
        LMPRecord.node_id == node_id,
        LMPRecord.timestamp >= start_dt,
        LMPRecord.timestamp <= end_dt,
    ).group_by(
        func.date(LMPRecord.timestamp)
    ).order_by(
        func.date(LMPRecord.timestamp)
    ).all()
    
    gas_records = db.query(GasPriceRecord).filter(
        GasPriceRecord.date >= start_dt.date(),
        GasPriceRecord.date <= end_dt.date(),
    ).order_by(GasPriceRecord.date).all()
    
    gas_by_date = {str(g.date.date()): g.waha_price for g in gas_records}
    
    HEAT_RATE = 8.5
    OM_COST = 3.50
    
    spreads = []
    for row in lmp_records:
        date_str = str(row.date)
        waha = gas_by_date.get(date_str)
        if waha is None:
            continue
        cost = (waha * HEAT_RATE) + OM_COST
        spread = row.avg_lmp - cost
        spreads.append({
            "date": date_str,
            "spread": round(spread, 2),
        })
    
    if not spreads:
        raise HTTPException(status_code=404, detail="No data available for the selected window")
    
    spread_values = [s["spread"] for s in spreads]
    
    # Calculate statistics
    avg_spread = statistics.mean(spread_values)
    std_dev = statistics.stdev(spread_values) if len(spread_values) > 1 else 0
    
    # Calculate rolling 30-day standard deviation
    rolling_std = []
    for i in range(len(spreads)):
        if i < 29:
            rolling_std.append(None)  # Not enough data yet
        else:
            window_spreads = spread_values[i-29:i+1]
            if len(window_spreads) > 1:
                rolling_std.append(round(statistics.stdev(window_spreads), 2))
            else:
                rolling_std.append(None)
    
    # Determine risk classification
    if std_dev < 5 and avg_spread > 0:
        risk_label = "Stable"
    elif std_dev < 10 and avg_spread > -5:
        risk_label = "Moderate"
    elif std_dev < 15:
        risk_label = "Risky"
    else:
        risk_label = "Avoid"
    
    # Find extreme events (spread > 2 std devs from mean or < -2 std devs)
    extremes = []
    if std_dev > 0:
        upper_threshold = avg_spread + 2 * std_dev
        lower_threshold = avg_spread - 2 * std_dev
        for s in spreads:
            if s["spread"] > upper_threshold or s["spread"] < lower_threshold:
                extremes.append({
                    "date": s["date"],
                    "spread": s["spread"],
                    "type": "high" if s["spread"] > upper_threshold else "low",
                })
    
    return {
        "window": window,
        "start_date": start_dt.date().isoformat(),
        "end_date": end_dt.date().isoformat(),
        "metrics": {
            "avg_spread": round(avg_spread, 2),
            "std_dev": round(std_dev, 2),
            "min_spread": round(min(spread_values), 2),
            "max_spread": round(max(spread_values), 2),
            "positive_days": sum(1 for s in spread_values if s > 0),
            "total_days": len(spread_values),
            "pct_positive": round(sum(1 for s in spread_values if s > 0) / len(spread_values) * 100, 1),
        },
        "risk_label": risk_label,
        "spread_series": spreads,
        "rolling_std_series": [
            {"date": spreads[i]["date"], "std_dev": rolling_std[i]}
            for i in range(len(spreads)) if rolling_std[i] is not None
        ],
        "extremes": extremes[:20],  # Limit to 20 extreme events
    }


# ---------------------------------------------------------------------------
# GET /api/site/{node_id}/scorecard
# Returns comprehensive scorecard for a node
# ---------------------------------------------------------------------------
@router.get("/site/{node_id}/scorecard")
def get_site_scorecard(
    node_id: str,
    window: str = Query(default="90d", description="Time window: 30d, 90d, 1y, or custom"),
    start_date: str | None = Query(default=None, description="Start date for custom window"),
    end_date: str | None = Query(default=None, description="End date for custom window"),
    db: Session = Depends(get_db)
):
    """
    Returns comprehensive scorecard for a node including:
    - Average spread for window
    - Standard deviation
    - Percentage of time positive
    - Best/worst month
    - Nearest node info and distance (for reference)
    - Risk label
    - Overall rating (Excellent/Good/Fair/Poor)
    
    Overall rating logic:
    - Excellent: avg_spread > 10 and pct_positive > 70 and std_dev < 5
    - Good: avg_spread > 5 and pct_positive > 50 and std_dev < 10
    - Fair: avg_spread > 0 and pct_positive > 30
    - Poor: otherwise
    """
    from datetime import datetime, timedelta
    import statistics
    
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    
    # Calculate date range
    now = datetime.now()
    if window == "30d":
        start_dt = now - timedelta(days=30)
        end_dt = now
    elif window == "90d":
        start_dt = now - timedelta(days=90)
        end_dt = now
    elif window == "1y":
        start_dt = now - timedelta(days=365)
        end_dt = now
    elif window == "custom":
        if not start_date or not end_date:
            raise HTTPException(status_code=400, detail="Custom window requires start_date and end_date")
        try:
            start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format")
    else:
        raise HTTPException(status_code=400, detail=f"Invalid window: {window}")
    
    # Get spread data
    lmp_records = db.query(
        func.date(LMPRecord.timestamp).label("date"),
        func.avg(LMPRecord.lmp).label("avg_lmp"),
    ).filter(
        LMPRecord.node_id == node_id,
        LMPRecord.timestamp >= start_dt,
        LMPRecord.timestamp <= end_dt,
    ).group_by(
        func.date(LMPRecord.timestamp)
    ).order_by(
        func.date(LMPRecord.timestamp)
    ).all()
    
    gas_records = db.query(GasPriceRecord).filter(
        GasPriceRecord.date >= start_dt.date(),
        GasPriceRecord.date <= end_dt.date(),
    ).order_by(GasPriceRecord.date).all()
    
    gas_by_date = {str(g.date.date()): g.waha_price for g in gas_records}
    
    HEAT_RATE = 8.5
    OM_COST = 3.50
    
    spreads = []
    monthly_spreads = {}  # {YYYY-MM: [spreads]}
    
    for row in lmp_records:
        date_str = str(row.date)
        waha = gas_by_date.get(date_str)
        if waha is None:
            continue
        cost = (waha * HEAT_RATE) + OM_COST
        spread = row.avg_lmp - cost
        spreads.append({"date": date_str, "spread": spread})
        
        # Track monthly for best/worst month
        month_key = date_str[:7]  # YYYY-MM
        if month_key not in monthly_spreads:
            monthly_spreads[month_key] = []
        monthly_spreads[month_key].append(spread)
    
    if not spreads:
        raise HTTPException(status_code=404, detail="No data available for the selected window")
    
    spread_values = [s["spread"] for s in spreads]
    
    # Calculate metrics
    avg_spread = statistics.mean(spread_values)
    std_dev = statistics.stdev(spread_values) if len(spread_values) > 1 else 0
    positive_days = sum(1 for s in spread_values if s > 0)
    pct_positive = positive_days / len(spread_values) * 100
    
    # Best and worst month
    monthly_avgs = {m: statistics.mean(v) for m, v in monthly_spreads.items() if v}
    best_month = max(monthly_avgs.items(), key=lambda x: x[1]) if monthly_avgs else (None, None)
    worst_month = min(monthly_avgs.items(), key=lambda x: x[1]) if monthly_avgs else (None, None)
    
    # Risk label
    if std_dev < 5 and avg_spread > 0:
        risk_label = "Stable"
    elif std_dev < 10 and avg_spread > -5:
        risk_label = "Moderate"
    elif std_dev < 15:
        risk_label = "Risky"
    else:
        risk_label = "Avoid"
    
    # Overall rating
    if avg_spread > 10 and pct_positive > 70 and std_dev < 5:
        overall_rating = "Excellent"
    elif avg_spread > 5 and pct_positive > 50 and std_dev < 10:
        overall_rating = "Good"
    elif avg_spread > 0 and pct_positive > 30:
        overall_rating = "Fair"
    else:
        overall_rating = "Poor"
    
    return {
        "node": {
            "id": node.id,
            "name": node.name,
            "lat": node.lat,
            "lng": node.lng,
            "zone": node.zone,
        },
        "window": window,
        "start_date": start_dt.date().isoformat(),
        "end_date": end_dt.date().isoformat(),
        "metrics": {
            "avg_spread": round(avg_spread, 2),
            "std_dev": round(std_dev, 2),
            "pct_positive": round(pct_positive, 1),
            "total_days": len(spread_values),
        },
        "best_month": {"month": best_month[0], "avg_spread": round(best_month[1], 2)} if best_month[0] else None,
        "worst_month": {"month": worst_month[0], "avg_spread": round(worst_month[1], 2)} if worst_month[0] else None,
        "risk_label": risk_label,
        "overall_rating": overall_rating,
    }
