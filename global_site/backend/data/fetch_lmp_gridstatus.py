"""
fetch_lmp_gridstatus.py

Fetches real LMP data from GridStatus.io API for ERCOT settlement points.
Uses the GridStatusClient to get historical LMP by settlement point.

API Key: bb1007f956d34e388c7a7e10947c9c26 (from user's provided code)

Usage:
    python fetch_lmp_gridstatus.py --start 2026-04-17 --end 2026-04-20
"""

import os
import sys
from datetime import datetime, timedelta

import pandas as pd

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from gridstatusio import GridStatusClient
from sqlalchemy.orm import Session
from db.database import SessionLocal, Node, LMPRecord, init_db


# GridStatus API key
GRIDSTATUS_API_KEY = os.getenv("GRIDSTATUS_API_KEY", "bb1007f956d34e388c7a7e10947c9c26")

# ERCOT settlement point names that map to our West Texas nodes
# These are the actual settlement point names in ERCOT/GridStatus
SETTLEMENT_POINT_MAP = {
    "HB_WEST": "HB_WEST",
    "LZ_WEST": "LZ_WEST",
    "HB_BUSAVG": "HB_BUSAVG",
    "ODESSA_ALL": "ODESSA_ALL",
    "MIDLAND_ALL": "MIDLAND_ALL",
    "SAN_ANGELO": "SAN_ANGELO",
    "BIG_SPRING": "BIG_SPRING",
    "LUBBOCK_ALL": "LUBBOCK_ALL",
    "ABILENE_ALL": "ABILENE_ALL",
    "PECOS_ALL": "PECOS_ALL",
    "WINKLER_WND": "WINKLER_WND",
    "UPTON_WND": "UPTON_WND",
    "REAGAN_WND": "REAGAN_WND",
    "CRANE_ALL": "CRANE_ALL",
    "WARD_ALL": "WARD_ALL",
}


def fetch_lmp_from_gridstatus(start_date: str, end_date: str, settlement_points: list = None) -> dict:
    """
    Fetch LMP data from GridStatus.io API.
    
    Args:
        start_date: Start date in YYYY-MM-DD format
        end_date: End date in YYYY-MM-DD format
        settlement_points: Optional list of specific settlement points to fetch
        
    Returns:
        Dictionary mapping settlement point names to list of LMP records
    """
    print(f"Connecting to GridStatus.io API...")
    print(f"Fetching LMP data from {start_date} to {end_date}")
    
    client = GridStatusClient(GRIDSTATUS_API_KEY)
    
    try:
        # Fetch data as pandas DataFrame
        df = client.get_dataset(
            dataset="ercot_lmp_by_settlement_point",
            start=start_date,
            end=end_date,
            timezone="market",
        )
        
        print(f"Received {len(df)} records from API")
        print(f"Columns: {list(df.columns)}")
        
        # Process the data
        return process_lmp_data(df, settlement_points)
        
    except Exception as e:
        print(f"Error fetching from GridStatus API: {e}")
        raise


def process_lmp_data(df, settlement_points: list = None) -> dict:
    """
    Process the pandas DataFrame from GridStatus API.
    
    Expected columns from ercot_lmp_by_settlement_point dataset:
    - interval_start_utc (or interval_start_local)
    - location (settlement point name)
    - lmp
    """
    result = {}
    
    # Use known column names from the API response
    time_col = 'interval_start_utc' if 'interval_start_utc' in df.columns else 'interval_start_local'
    sp_col = 'location'  # The API uses 'location' for settlement point
    lmp_col = 'lmp'
    
    print(f"Mapping columns: time={time_col}, location={sp_col}, lmp={lmp_col}")
    
    # Get unique locations in the data
    unique_locations = df[sp_col].unique()
    print(f"Total unique locations in API response: {len(unique_locations)}")
    
    # If settlement_points specified, find matching locations
    if settlement_points:
        sp_set = set(sp.upper() for sp in settlement_points)
        # Find locations that match (case-insensitive)
        matching_locations = [loc for loc in unique_locations if loc.upper() in sp_set]
        print(f"Matching West Texas nodes found: {len(matching_locations)} - {matching_locations[:10]}")
        
        # Filter to only matching locations
        df = df[df[sp_col].isin(matching_locations)]
        print(f"Filtered to {len(df)} records for West Texas nodes")
    
    # Group by settlement point
    for sp_name, group in df.groupby(sp_col):
        records = []
        for _, row in group.iterrows():
            timestamp = row[time_col]
            if isinstance(timestamp, str):
                timestamp = pd.to_datetime(timestamp)
            
            record = {
                "timestamp": timestamp,
                "lmp": row[lmp_col],
                "congestion": 0,  # Not provided in this dataset
                "loss": 0,         # Not provided in this dataset
            }
            records.append(record)
        
        result[sp_name] = records
    
    return result


def store_lmp_records(db: Session, node_id: str, records: list) -> int:
    """
    Store LMP records in the database.
    Returns the number of records stored.
    """
    count = 0
    for record in records:
        # Check if record already exists
        existing = db.query(LMPRecord).filter(
            LMPRecord.node_id == node_id,
            LMPRecord.timestamp == record["timestamp"]
        ).first()
        
        if not existing:
            db.add(LMPRecord(
                node_id=node_id,
                timestamp=record["timestamp"],
                lmp=record["lmp"],
                congestion=record.get("congestion", 0),
                loss=record.get("loss", 0),
            ))
            count += 1
    
    return count


def fetch_and_store_lmp(start_date: str, end_date: str):
    """
    Main function to fetch LMP data and store in database.
    """
    init_db()
    db = SessionLocal()
    
    try:
        # Get all nodes from database
        nodes = db.query(Node).all()
        node_ids = [n.id for n in nodes]
        
        print(f"Found {len(nodes)} nodes in database")
        
        # Fetch LMP data from GridStatus
        lmp_data = fetch_lmp_from_gridstatus(
            start_date=start_date,
            end_date=end_date,
            settlement_points=node_ids
        )
        
        # Store records for each settlement point
        total_stored = 0
        for sp_name, records in lmp_data.items():
            # Map settlement point name to node ID
            node_id = sp_name
            if sp_name not in node_ids:
                # Try to find matching node
                node_id = next((n.id for n in nodes if n.id.upper() == sp_name.upper()), None)
            
            if not node_id:
                print(f"Skipping {sp_name} - not found in database")
                continue
            
            count = store_lmp_records(db, node_id, records)
            total_stored += count
            print(f"  Stored {count} LMP records for {node_id}")
        
        db.commit()
        print(f"\nTotal LMP records stored: {total_stored}")
        
    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Fetch LMP data from GridStatus.io")
    parser.add_argument("--start", default="2026-04-17", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", default="2026-04-20", help="End date (YYYY-MM-DD)")
    
    args = parser.parse_args()
    
    fetch_and_store_lmp(args.start, args.end)