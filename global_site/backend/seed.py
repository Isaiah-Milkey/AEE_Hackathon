"""
seed.py

Run this once to populate the database with historical data.
Order matters: ERCOT first, EIA second, spread calculation third.

Usage:
    cd backend
    python seed.py

Optional: pass --days to control how much history to fetch
    python seed.py --days 730   # 2 years
    python seed.py --days 365   # 1 year (default)
    python seed.py --days 90    # 3 months (fastest for testing)
"""

import asyncio
import sys
from db.database import init_db
from data.fetch_ercot import fetch_and_store_lmp
from data.fetch_eia import fetch_and_store_gas_prices
from data.calculate_spread import calculate_spreads


async def main(days: int = 365):
    print("=" * 50)
    print("BTM Heatmap — Data Pipeline")
    print("=" * 50)

    print("\n[1/3] Initializing database...")
    init_db()

    print(f"\n[2/3] Fetching ERCOT LMP data ({days} days)...")
    await fetch_and_store_lmp(days_back=days)

    print(f"\n[3/3] Fetching EIA gas prices ({days} days)...")
    await fetch_and_store_gas_prices(days_back=days)

    print("\n[4/4] Calculating spread scores...")
    calculate_spreads()

    print("\n" + "=" * 50)
    print("Pipeline complete. Start the API with:")
    print("  uvicorn main:app --reload --port 8000")
    print("=" * 50)


if __name__ == "__main__":
    days = 365
    if "--days" in sys.argv:
        idx = sys.argv.index("--days")
        days = int(sys.argv[idx + 1])

    asyncio.run(main(days=days))
