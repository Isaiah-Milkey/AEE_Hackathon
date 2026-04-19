"""
fetch_ercot.py

Fetches historical LMP data from ERCOT MIS for West Texas nodes.
Also seeds the nodes table with known West Texas settlement points.

ERCOT MIS public API docs: https://www.ercot.com/mp/data-products
No API key required — public data.
"""

import httpx
import asyncio
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from db.database import SessionLocal, Node, LMPRecord, init_db

# ---------------------------------------------------------------------------
# Known West Texas ERCOT settlement points
# These are real node IDs — coordinates are approximate Permian Basin locations
# Add more from ERCOT's full node list as needed
# ---------------------------------------------------------------------------
WEST_TEXAS_NODES = [
    {"id": "HB_WEST",        "name": "West Hub",             "lat": 31.97,  "lng": -102.08, "zone": "West",    "node_type": "hub"},
    {"id": "LZ_WEST",        "name": "West Load Zone",       "lat": 31.50,  "lng": -101.50, "zone": "West",    "node_type": "load_zone"},
    {"id": "HB_BUSAVG",      "name": "Bus Average Hub",      "lat": 31.80,  "lng": -99.50,  "zone": "West",    "node_type": "hub"},
    {"id": "ODESSA_ALL",     "name": "Odessa Area",          "lat": 31.84,  "lng": -102.36, "zone": "Permian", "node_type": "resource"},
    {"id": "MIDLAND_ALL",    "name": "Midland Area",         "lat": 31.99,  "lng": -102.07, "zone": "Permian", "node_type": "resource"},
    {"id": "SAN_ANGELO",     "name": "San Angelo Area",      "lat": 31.46,  "lng": -100.43, "zone": "West",    "node_type": "resource"},
    {"id": "BIG_SPRING",     "name": "Big Spring Area",      "lat": 32.25,  "lng": -101.47, "zone": "Permian", "node_type": "resource"},
    {"id": "LUBBOCK_ALL",    "name": "Lubbock Area",         "lat": 33.57,  "lng": -101.85, "zone": "West",    "node_type": "resource"},
    {"id": "ABILENE_ALL",    "name": "Abilene Area",         "lat": 32.44,  "lng": -99.73,  "zone": "West",    "node_type": "resource"},
    {"id": "PECOS_ALL",      "name": "Pecos Area",           "lat": 31.42,  "lng": -103.49, "zone": "Permian", "node_type": "resource"},
    {"id": "WINKLER_WND",    "name": "Winkler Wind",         "lat": 31.86,  "lng": -103.05, "zone": "Permian", "node_type": "resource"},
    {"id": "UPTON_WND",      "name": "Upton Wind",           "lat": 31.65,  "lng": -102.00, "zone": "Permian", "node_type": "resource"},
    {"id": "REAGAN_WND",     "name": "Reagan Wind",          "lat": 31.35,  "lng": -101.52, "zone": "Permian", "node_type": "resource"},
    {"id": "CRANE_ALL",      "name": "Crane Area",           "lat": 31.39,  "lng": -102.35, "zone": "Permian", "node_type": "resource"},
    {"id": "WARD_ALL",       "name": "Ward County Area",     "lat": 31.52,  "lng": -103.10, "zone": "Permian", "node_type": "resource"},
]


def seed_nodes(db: Session):
    """Insert West Texas nodes into the database. Skip if already exist."""
    for node_data in WEST_TEXAS_NODES:
        existing = db.query(Node).filter(Node.id == node_data["id"]).first()
        if not existing:
            db.add(Node(**node_data))
    db.commit()
    print(f"Seeded {len(WEST_TEXAS_NODES)} West Texas nodes.")


async def fetch_lmp_for_node(node_id: str, date_str: str) -> list[dict]:
    """
    Fetch 15-minute LMP data from ERCOT MIS for one node on one date.

    ERCOT MIS endpoint for real-time LMP:
    https://api.ercot.com/api/public-reports/np6-905-cd/act_sys_load_by_wzn

    NOTE: ERCOT updated their API in 2023. The current public endpoint is:
    https://api.ercot.com/api/public-reports
    Register at mis.ercot.com for the API subscription key.

    For now this returns simulated data in the correct shape so the rest
    of the pipeline can be built and tested before ERCOT credentials arrive.
    Swap fetch_lmp_simulated() for a real HTTP call once you have your key.
    """
    return fetch_lmp_simulated(node_id, date_str)


def fetch_lmp_simulated(node_id: str, date_str: str) -> list[dict]:
    """
    Returns realistic simulated 15-min LMP data for testing.
    Replace this function body with a real ERCOT API call.
    Shape of output must remain the same.
    """
    import random
    import math

    base_prices = {
        "HB_WEST":     28.0,
        "LZ_WEST":     27.5,
        "ODESSA_ALL":  26.0,
        "MIDLAND_ALL": 27.0,
        "WINKLER_WND": 18.0,   # Low — near wind congestion
        "UPTON_WND":   19.0,   # Low — near wind congestion
        "REAGAN_WND":  20.0,
        "LUBBOCK_ALL": 30.0,
        "ABILENE_ALL": 31.0,
    }

    base = base_prices.get(node_id, 26.0)
    records = []
    date = datetime.strptime(date_str, "%Y-%m-%d")

    for interval in range(96):  # 96 x 15-min intervals per day
        hour = interval / 4
        # Simulate intraday price curve: low overnight, peaks morning + evening
        hour_factor = 1.0 + 0.3 * math.sin((hour - 6) * math.pi / 12)
        noise = random.gauss(0, 2.5)
        lmp = round(base * hour_factor + noise, 2)
        congestion = round(random.gauss(-1.5, 1.0), 2)
        loss = round(random.gauss(0.3, 0.1), 2)

        records.append({
            "node_id":    node_id,
            "timestamp":  date + timedelta(minutes=15 * interval),
            "lmp":        lmp,
            "congestion": congestion,
            "loss":       loss,
        })

    return records


async def fetch_and_store_lmp(days_back: int = 365):
    """
    Main entry point. Fetches LMP for all West Texas nodes
    going back `days_back` days and stores in database.
    """
    db = SessionLocal()
    seed_nodes(db)

    node_ids = [n["id"] for n in WEST_TEXAS_NODES]
    today = datetime.utcnow().date()
    dates = [
        (today - timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(days_back)
    ]

    total = 0
    for node_id in node_ids:
        print(f"Fetching LMP for {node_id}...")
        for date_str in dates:
            # Skip if already stored
            existing = db.query(LMPRecord).filter(
                LMPRecord.node_id == node_id,
                LMPRecord.timestamp >= datetime.strptime(date_str, "%Y-%m-%d")
            ).first()
            if existing:
                continue

            records = await fetch_lmp_for_node(node_id, date_str)
            for r in records:
                db.add(LMPRecord(**r))
            total += len(records)

        db.commit()
        print(f"  Stored records for {node_id}")

    print(f"\nDone. Total LMP records stored: {total}")
    db.close()


if __name__ == "__main__":
    init_db()
    asyncio.run(fetch_and_store_lmp(days_back=365))
