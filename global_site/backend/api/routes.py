"""
routes.py

All API endpoints for the BTM heatmap backend.
"""

import math
import time
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
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
    nodes  = db.query(Node).all()
    scores = {s.node_id: s for s in db.query(SpreadScore).all()}

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
            "color":        score.spread_color if score else "#888888",
            "label":        score.spread_label if score else "No data",
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
def get_site_detail(node_id: str, db: Session = Depends(get_db)):
    """
    Returns LMP history, gas price history, and spread history for one node.
    Used to populate the side panel charts.
    """
    node = db.query(Node).filter(Node.id == node_id).first()
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")

    score = db.query(SpreadScore).filter(SpreadScore.node_id == node_id).first()

    # Daily averages for charting (too many points at 15-min resolution)
    lmp_records = db.query(
        func.date(LMPRecord.timestamp).label("date"),
        func.avg(LMPRecord.lmp).label("avg_lmp"),
        func.min(LMPRecord.lmp).label("min_lmp"),
        func.max(LMPRecord.lmp).label("max_lmp"),
    ).filter(
        LMPRecord.node_id == node_id
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
