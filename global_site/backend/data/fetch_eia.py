"""
fetch_eia.py

Fetches daily Waha Hub and Henry Hub natural gas spot prices from EIA.
Free API — register at https://www.eia.gov/opendata/register.php

EIA series IDs used:
  Henry Hub:  NG.RNGWHHD.D   (Henry Hub Natural Gas Spot Price, Daily)
  Waha Hub:   NG.RNGWHHD.D   (West Texas Waha spot — see note below)

NOTE on Waha:
  EIA does not publish Waha as a standalone daily series in the open API.
  The best public proxy is to use Henry Hub + a historical basis adjustment.
  For production, subscribe to NGI (naturalgasintel.com) or Platts for
  daily Waha prices. For the hackathon, we simulate Waha as:
    waha = henry_hub + basis_differential
  where basis_differential averages -$1.50 to -$4.00 historically.
"""

import httpx
import asyncio
import os
import random
from datetime import datetime, timedelta
from dotenv import load_dotenv
from db.database import SessionLocal, GasPriceRecord, init_db

load_dotenv()

EIA_API_KEY = os.getenv("EIA_API_KEY", "")
EIA_BASE_URL = "https://api.eia.gov/v2"


async def fetch_henry_hub(start_date: str, end_date: str) -> list[dict]:
    """
    Fetch Henry Hub daily spot prices from EIA open data API.
    Returns list of {date, price} dicts.
    """
    if not EIA_API_KEY:
        print("No EIA_API_KEY found — using simulated gas prices.")
        return simulate_gas_prices(start_date, end_date)

    url = f"{EIA_BASE_URL}/natural-gas/pri/sum/data/"
    params = {
        "api_key":          EIA_API_KEY,
        "frequency":        "daily",
        "data[0]":          "value",
        "facets[series][]": "RNGWHHD",
        "start":            start_date,
        "end":              end_date,
        "sort[0][column]":  "period",
        "sort[0][direction]": "asc",
        "length":           500,
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        print(f"EIA request failed ({exc.__class__.__name__}): {exc}")
        print("Falling back to simulated gas prices so the demo can keep running.")
        return simulate_gas_prices(start_date, end_date)

    records = []
    for row in data.get("response", {}).get("data", []):
        records.append({
            "date":  datetime.strptime(row["period"], "%Y-%m-%d"),
            "price": float(row["value"]),
        })

    return records


def simulate_gas_prices(start_date: str, end_date: str) -> list[dict]:
    """
    Simulated Henry Hub prices for testing without an API key.
    Replace with real EIA data in production.
    Typical range: $2.00 - $6.00/MMBtu with occasional spikes.
    """
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end   = datetime.strptime(end_date,   "%Y-%m-%d")
    days  = (end - start).days

    records = []
    price = 3.00  # starting price

    for i in range(days):
        # Random walk with mean reversion
        change = random.gauss(0, 0.12)
        price = max(1.80, min(8.00, price + change + (3.00 - price) * 0.05))

        # Simulate Uri spike in Feb 2021
        date = start + timedelta(days=i)
        if date.month == 2 and date.year == 2021 and 10 <= date.day <= 20:
            price = random.uniform(60, 120)

        records.append({"date": date, "price": round(price, 4)})

    return records


def calculate_waha_basis(date: datetime) -> float:
    """
    Estimate Waha basis differential (Waha minus Henry Hub).
    Historically ranges from -$0.50 to -$5.00.
    Negative means Waha is cheaper than Henry Hub.

    In production: replace with actual Waha price data from NGI or Platts.
    """
    # Seasonal pattern: basis widens (more negative) in summer when
    # Permian production is high and pipeline takeaway is constrained
    import math
    month = date.month
    seasonal = -1.0 * (1 + 0.5 * math.sin((month - 6) * math.pi / 6))
    noise = random.gauss(0, 0.25)
    return round(seasonal + noise, 4)


async def fetch_and_store_gas_prices(days_back: int = 365):
    """
    Main entry point. Fetches gas prices and stores in database.
    """
    db = SessionLocal()

    end_date   = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days_back)

    print(f"Fetching Henry Hub prices from {start_date} to {end_date}...")
    henry_records = await fetch_henry_hub(
        start_date.strftime("%Y-%m-%d"),
        end_date.strftime("%Y-%m-%d")
    )

    stored = 0
    for record in henry_records:
        # Skip if already stored
        existing = db.query(GasPriceRecord).filter(
            GasPriceRecord.date == record["date"]
        ).first()
        if existing:
            continue

        basis = calculate_waha_basis(record["date"])
        waha  = round(record["price"] + basis, 4)

        db.add(GasPriceRecord(
            date                 = record["date"],
            henry_hub_price      = record["price"],
            waha_price           = waha,
            basis_differential   = basis,
        ))
        stored += 1

    db.commit()
    db.close()
    print(f"Stored {stored} gas price records.")


if __name__ == "__main__":
    init_db()
    asyncio.run(fetch_and_store_gas_prices(days_back=365))
