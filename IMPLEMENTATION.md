# BTM Heatmap Implementation Guide

## AGENT INSTRUCTIONS
Use this file to understand and implement new features into the project. After completing and implementing new features, may you update this file.

## Overview

BTM Heatmap is a data visualization platform for behind-the-meter (BTM) spread scoring across West Texas. It helps evaluate whether self-generation (natural gas) is more cost-effective than purchasing grid power at various ERCOT settlement points.

---

## Features

### Backend Features
- **ERCOT LMP Data Fetching**: Retrieves 15-minute Locational Marginal Pricing (LMP) data for West Texas nodes from ERCOT MIS (currently in simulation mode)
- **EIA Gas Price Integration**: Fetches daily Henry Hub natural gas spot prices from EIA Open Data API (with fallback simulation)
- **Spread Calculation Engine**: Computes BTM spread scores using the formula: `Spread = LMP - (Waha Price × Heat Rate + O&M Cost)`
- **SQLite Database**: Persistent storage for nodes, LMP records, gas prices, and calculated spread scores
- **RESTful API**: FastAPI endpoints for heatmap data, site details, live conditions, and nearest-node queries
- **CORS Support**: Enabled for frontend development on localhost:5173

### Frontend Features
- **Interactive Leaflet Map**: Displays West Texas with colored markers representing spread scores at each node
- **Layer Toggles**: Control visibility of county boundaries, heatmap visualization, and gas pipeline overlay
- **Site Detail Panel**: Click-through interface showing historical data and metrics for selected nodes
- **Filtering System**: Filter nodes by type (hub, load zone, resource) and spread value (positive, negative, all)
- **Search Functionality**: Search nodes by name, ID, or zone
- **Heatmap Metric Selection**: Switch between visualizing LMP, spread, or gas cost
- **Live Data Integration**: Optional real-time data fetching from API

---

## Architecture

```
btm-heatmap/
├── backend/
│   ├── data/                    # Data collection & processing
│   │   ├── fetch_ercot.py       # LMP data fetcher + node seeding
│   │   ├── fetch_eia.py         # Gas price fetcher
│   │   └── calculate_spread.py # Spread calculation engine
│   ├── db/
│   │   └── database.py          # SQLAlchemy models + session management
│   ├── api/
│   │   └── routes.py            # FastAPI endpoints
│   ├── static/data/             # Static GeoJSON assets
│   ├── main.py                  # FastAPI app entry point
│   └── seed.py                  # Full pipeline orchestration
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── Map.jsx          # Leaflet map component
    │   │   ├── SitePanel.jsx    # Site detail panel
    │   │   ├── LayerToggles.jsx # Layer controls
    │   │   └── MapControls.jsx  # Map controls
    │   ├── App.jsx              # Root React component
    │   └── index.jsx            # React entry point
    └── index.html
```

### Technology Stack
- **Backend**: Python, FastAPI, SQLAlchemy, SQLite
- **Frontend**: React, Vite, Leaflet, Axios
- **Data**: ERCOT MIS (LMP), EIA Open Data (gas prices)

---

## Data Flow

### 1. Data Collection

#### ERCOT LMP Data (`fetch_ercot.py`)
- **Source**: ERCOT MIS public API (mis.ercot.com)
- **Data Type**: 15-minute interval LMP values ($/MWh)
- **Components**: Total LMP, congestion component, loss component
- **Nodes**: 15 West Texas settlement points (HB_WEST, LZ_WEST, Odessa, Midland, Lubbock, etc.)
- **Current Status**: Simulation mode (generates realistic synthetic data)
- **To Enable Real Data**: Replace `fetch_lmp_simulated()` with actual ERCOT API call using subscription key

#### EIA Gas Prices (`fetch_eia.py`)
- **Source**: EIA Open Data API (api.eia.gov/v2)
- **Data Type**: Daily natural gas spot prices ($/MMBtu)
- **Series**: Henry Hub (NG.RNGWHHD)
- **Waha Hub**: Calculated as Henry Hub + basis differential (typically -$1.50 to -$4.00)
- **API Key Required**: Register at eia.gov/opendata
- **Current Status**: Falls back to simulation if no API key present

### 2. Data Storage

#### Database Schema (SQLite)

| Table | Description |
|-------|-------------|
| `nodes` | ERCOT settlement points with coordinates (lat, lng), zone, node_type |
| `lmp_history` | Raw 15-min LMP records per node per timestamp |
| `gas_prices` | Daily Henry Hub and Waha prices |
| `spread_scores` | Calculated aggregate spreads per node |

#### Key Fields
- **SpreadScore**: `avg_spread` ($/MWh), `avg_lmp`, `avg_gas_cost`, `spread_color`, `spread_label`
- **Spread Labels**: "Strong" (≥$15), "Moderate" (≥$8), "Marginal" (≥$2), "Weak" (≥-$5), "Unfavorable" (<-$5)

### 3. Spread Calculation (`calculate_spread.py`)

```
Cost to Generate = (Waha Price × Heat Rate) + O&M Cost
Spread = LMP - Cost to Generate

Where:
- Heat Rate = 8.5 MMBtu/MWh (typical gas reciprocating engine)
- O&M Cost = $3.50/MWh
```

Positive spread = Grid power is more expensive = BTM generation favorable
Negative spread = Grid power is cheaper = Purchase from grid

### 4. API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/heatmap` | All nodes with spread scores for map initialization |
| `GET /api/site/{node_id}` | Full historical data for a specific node |
| `GET /api/site/{node_id}/live` | Current live conditions for a node |
| `GET /api/nearest?lat=&lng=` | Find nearest node to coordinates |
| `GET /api/points` | GeoJSON feature collection of all nodes |
| `GET /data/points.json` | Static cached points data |
| `GET /data/texas-counties.geojson` | Texas county boundaries |

---

## Running the Pipeline

```bash
# Full data pipeline (fetch + calculate)
python seed.py

# Start API server
uvicorn main:app --reload --port 8000

# Start frontend
cd frontend && npm run dev
```

---

## Configuration

- **Environment Variables**: Set in `.env` file
  - `DATABASE_URL`: SQLite database path
  - `EIA_API_KEY`: EIA Open Data API key
  - `FRONTEND_URL`: Frontend URL for CORS

- **Generator Assumptions** (in `calculate_spread.py`):
  - `HEAT_RATE = 8.5` MMBtu/MWh
  - `OM_COST = $3.50`/MWh