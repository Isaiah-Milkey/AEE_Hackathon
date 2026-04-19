"""
calculate_spread.py

Joins LMP and gas price data, calculates BTM spread per node,
and writes spread scores to the database.

Spread = LMP at node — cost to self-generate
Cost   = (waha_price × heat_rate) + om_cost

Positive spread → grid is more expensive → run your BTM generator
Negative spread → grid is cheaper → buy from grid
"""

import os
import sys
from datetime import datetime
from sqlalchemy import func
from sqlalchemy.orm import Session

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.database import SessionLocal, Node, LMPRecord, GasPriceRecord, SpreadScore

# ---------------------------------------------------------------------------
# Generator assumptions — adjust these per the actual facility specs
# ---------------------------------------------------------------------------
HEAT_RATE = 8.5   # MMBtu per MWh — typical modern gas reciprocating engine
OM_COST   = 3.50  # $/MWh — variable operations and maintenance


def get_spread_color(avg_spread: float) -> tuple[str, str]:
    """
    Maps a spread value to a hex color and human label.
    Returns (hex_color, label)
    """
    if avg_spread >= 15:
        return "#1a7a1a", "Strong"       # deep green
    elif avg_spread >= 8:
        return "#5aaa2a", "Moderate"     # medium green
    elif avg_spread >= 2:
        return "#c8b400", "Marginal"     # yellow
    elif avg_spread >= -5:
        return "#e07b00", "Weak"         # orange
    else:
        return "#c0392b", "Unfavorable"  # red


def get_lmp_color(avg_lmp: float) -> tuple[str, str]:
    """
    Maps an LMP value to a hex color using a diverging green-red scale.
    Low LMP (cheap) = green, High LMP (expensive) = red.
    Returns (hex_color, label)
    
    LMP thresholds (in $/MWh):
    - < 20: Very Low (green)
    - 20-30: Low (light green)
    - 30-40: Moderate (yellow)
    - 40-50: High (orange)
    - > 50: Very High (red)
    """
    if avg_lmp < 20:
        return "#1a7a1a", "Very Low"       # deep green - cheap
    elif avg_lmp < 30:
        return "#5aaa2a", "Low"            # light green
    elif avg_lmp < 40:
        return "#c8b400", "Moderate"      # yellow
    elif avg_lmp < 50:
        return "#e07b00", "High"          # orange
    else:
        return "#c0392b", "Very High"      # red - expensive


def calculate_spreads():
    """
    Main function. Reads LMP + gas prices, calculates spread per node,
    writes SpreadScore records to database.
    """
    db: Session = SessionLocal()

    nodes = db.query(Node).all()
    if not nodes:
        print("No nodes found. Run fetch_ercot.py first.")
        db.close()
        return

    # Get gas price averages — use average Waha price across entire dataset
    gas_records = db.query(GasPriceRecord).all()
    if not gas_records:
        print("No gas prices found. Run fetch_eia.py first.")
        db.close()
        return

    # Build a date-keyed dict for gas prices for fast lookup
    gas_by_date = {}
    for g in gas_records:
        date_key = g.date.date() if hasattr(g.date, 'date') else g.date
        gas_by_date[date_key] = g.waha_price

    data_start = min(g.date for g in gas_records)
    data_end   = max(g.date for g in gas_records)

    print(f"Calculating spreads for {len(nodes)} nodes...")
    print(f"Data range: {data_start.date()} to {data_end.date()}")
    print(f"Assumptions: heat_rate={HEAT_RATE} MMBtu/MWh, O&M=${OM_COST}/MWh\n")

    for node in nodes:
        lmp_records = db.query(LMPRecord).filter(
            LMPRecord.node_id == node.id
        ).all()

        if not lmp_records:
            print(f"  Skipping {node.id} — no LMP records")
            continue

        spreads = []
        lmps    = []
        costs   = []

        for lmp_record in lmp_records:
            ts = lmp_record.timestamp
            date_key = ts.date() if hasattr(ts, 'date') else ts

            waha_price = gas_by_date.get(date_key)
            if waha_price is None:
                continue  # No gas price for this date — skip

            cost_to_generate = (waha_price * HEAT_RATE) + OM_COST
            spread = lmp_record.lmp - cost_to_generate

            spreads.append(spread)
            lmps.append(lmp_record.lmp)
            costs.append(cost_to_generate)

        if not spreads:
            print(f"  Skipping {node.id} — no matching gas+LMP records")
            continue

        avg_spread   = sum(spreads) / len(spreads)
        avg_lmp      = sum(lmps)    / len(lmps)
        avg_gas_cost = sum(costs)   / len(costs)

        spread_color, spread_label = get_spread_color(avg_spread)
        lmp_color, lmp_label = get_lmp_color(avg_lmp)

        # Upsert — delete existing score and replace
        db.query(SpreadScore).filter(SpreadScore.node_id == node.id).delete()
        db.add(SpreadScore(
            node_id      = node.id,
            avg_spread   = round(avg_spread,   2),
            avg_lmp      = round(avg_lmp,      2),
            avg_gas_cost = round(avg_gas_cost, 2),
            spread_color = spread_color,
            spread_label = spread_label,
            lmp_color    = lmp_color,
            lmp_label    = lmp_label,
            data_start   = data_start,
            data_end     = data_end,
            last_updated = datetime.utcnow(),
        ))

        print(f"  {node.name:25s} avg_spread=${avg_spread:+.2f}/MWh  [{spread_label}] (LMP: ${avg_lmp:.2f}/MWh [{lmp_label}])")

    db.commit()
    db.close()
    print("\nSpread scores calculated and stored.")


if __name__ == "__main__":
    calculate_spreads()
