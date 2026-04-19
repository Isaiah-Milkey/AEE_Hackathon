<div align="center">

# ⚡ BTM Siting Engine
### AI-Driven Behind-the-Meter Data Center Site Selection
#### West Texas & ERCOT · Natural Gas Economics · ML Forecasting

<br/>

![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![LightGBM](https://img.shields.io/badge/LightGBM-4.6-brightgreen?style=flat-square)
![ERCOT](https://img.shields.io/badge/ERCOT-Live%20Data-orange?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

<br/>

> **Hyperscale AI data centers need gigawatts — now.**  
> Grid interconnection queues take 5–7 years. Behind-the-meter gas generation is the only path in.  
> This platform tells you *where* to build and *when* to run, 72 hours ahead.

<br/>

</div>

---

## What This Does

Siting a behind-the-meter (BTM) natural gas data center comes down to one question at every candidate location:

**Is generating your own power cheaper than buying from the grid — and for how long?**

This platform answers that question across **15 West Texas ERCOT settlement points**, in real time, using 8 trained LightGBM models forecasting electricity and gas prices **1h, 6h, 24h, and 72h ahead** — with SHAP explainability showing exactly what drove each forecast.

```
ERCOT LMP (15-min) ──┐
                      ├──▶  Feature Engineering  ──▶  8 LightGBM Models  ──▶  BTM Spread  ──▶  GENERATE / BUY GRID
EIA Gas Price (daily) ┘                                                         + SHAP Why
```

---

## Key Numbers

| Metric | Value |
|---|---|
| ERCOT nodes scored | 15 West Texas settlement points |
| Forecast horizons | 1h · 6h · 24h · 72h |
| Models | 8 LightGBM (4 electricity + 4 gas) |
| Features per model | 10 (price momentum + time + gas basis) |
| BTM heat rate assumption | 7.2 MMBtu/MWh |
| O&M cost assumption | $5.00/MWh |
| Forecast latency | < 1 second per node |
| Training data | 1 year of hourly ERCOT + EIA data |

---

## Why BTM Gas in West Texas

- **418 GW** sitting in ERCOT's interconnection queue — only **~23 GW** built per year *(Interconnection.fyi, 2025)*
- **Waha Hub recorded 158 negative-price days in 2024 (43% of the year)** — West Texas gas is often the cheapest fuel in the country *(AEGIS Hedging)*
- The first three hyperscale BTM gas deals — CloudBurst (1.2 GW), Fermi America (2 GW), Oracle/VoltaGrid (2.3 GW) — are **all in Texas** *(Global Energy Monitor, 2025)*
- Permian Basin industrial load projected to reach **24 GW by 2030** *(ERCOT 2025 Planning Report)*

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA SOURCES                                 │
│   ERCOT MIS (15-min LMP)  ·  EIA Open API (Henry Hub)  ·  Waha Basis│
└────────────────────────┬────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    FEATURE ENGINEERING                              │
│  henry_hub_price · hour · day_of_week · month · is_weekend         │
│  price_lag_1h · price_lag_24h · price_lag_168h                     │
│  gas_lag_24h · gas_lag_168h                                        │
└────────────────────────┬────────────────────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
┌─────────────────────┐   ┌─────────────────────┐
│  Electricity Models │   │    Gas Models        │
│  elec_1h  elec_6h   │   │  gas_1h   gas_6h    │
│  elec_24h elec_72h  │   │  gas_24h  gas_72h   │
│  LightGBM · 500 trees│   │  LightGBM · 500 trees│
└──────────┬──────────┘   └──────────┬──────────┘
           │                         │
           └──────────┬──────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      BTM ECONOMICS                                  │
│   Spread = LMP − (Gas Price × 7.2 heat rate + $5 O&M)             │
│   Decision = GENERATE if spread > 0, else BUY FROM GRID            │
│   SHAP = top-5 feature drivers explained in plain English          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Features

### Heatmap
Interactive map of West Texas ERCOT nodes color-coded by average BTM spread. Click any node to open the site panel.

| Color | Label | Avg Spread |
|---|---|---|
| 🟢 Deep green | Strong | > $15/MWh |
| 🟩 Green | Moderate | $8–15/MWh |
| 🟡 Yellow | Marginal | $2–8/MWh |
| 🟠 Orange | Weak | $0–2/MWh |
| 🔴 Red | Unfavorable | < $0/MWh |

### Forecast Tab
Click **Run Forecast** on any node to get ML predictions for all 4 horizons:
- Electricity price forecast ($/MWh)
- BTM generation cost ($/MWh)
- Spread with GENERATE / BUY GRID decision badge
- SHAP explainability panel: "Why did the model predict $X for 24h?"

### Analytics
- 30-day rolling volatility (standard deviation of spread)
- Risk classification: Stable / Moderate / Risky / Avoid
- Site scorecard: avg spread, % positive days, best/worst month

### Overlays
- Texas county boundaries
- Natural gas pipeline routes (HIFLD)
- Fiber & dark fiber proximity *(planned)*

---

## Project Structure

```
AEE_Hackathon/
├── global_site/
│   ├── backend/
│   │   ├── api/
│   │   │   └── routes.py              # All FastAPI endpoints
│   │   ├── services/
│   │   │   ├── ml_models.py           # LightGBM inference + SHAP
│   │   │   └── feature_engineering.py # 10-feature pipeline
│   │   ├── data/
│   │   │   ├── fetch_ercot.py         # ERCOT MIS LMP fetcher
│   │   │   ├── fetch_eia.py           # EIA Henry Hub gas prices
│   │   │   └── calculate_spread.py    # BTM spread scorer
│   │   ├── models/
│   │   │   ├── lgbm_elec_{1h,6h,24h,72h}.txt
│   │   │   └── lgbm_gas_{1h,6h,24h,72h}.txt
│   │   ├── db/
│   │   │   └── database.py            # SQLAlchemy ORM (SQLite)
│   │   ├── main.py                    # FastAPI app entry point
│   │   └── seed.py                    # One-command data pipeline
│   └── frontend/
│       └── src/
│           └── components/
│               ├── Map.jsx            # Leaflet heatmap
│               ├── SitePanel.jsx      # Forecast + SHAP panel
│               └── LayerToggles.jsx   # Layer controls
├── requirements.txt
└── ml_architecture_plot.py            # Architecture diagram generator
```

---

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Free EIA API key → [eia.gov/opendata](https://www.eia.gov/opendata/register.php)

### 1. Backend

```bash
cd global_site/backend

python -m venv venv
source venv/bin/activate      # Mac/Linux
# venv\Scripts\activate       # Windows

pip install -r requirements.txt

cp .env.example .env
# Add your EIA_API_KEY to .env

# Seed database — fetches LMP + gas prices, calculates spreads
python seed.py
# Quick test run:
# python seed.py --days 90

# Start API server
uvicorn main:app --reload --port 8000
```

API live at: `http://localhost:8000`  
Interactive docs: `http://localhost:8000/docs`

### 2. Frontend

```bash
cd global_site/frontend
npm install
npm run dev
```

App live at: `http://localhost:5173`

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/heatmap` | All nodes with spread scores + colors |
| `GET` | `/api/site/{node_id}` | LMP + gas + spread history for one node |
| `GET` | `/api/site/{node_id}/live` | Current conditions + dispatch recommendation |
| `POST` | `/api/site/{node_id}/forecast` | ML forecast with SHAP explanation per horizon |
| `GET` | `/api/site/{node_id}/analytics` | Volatility + risk classification |
| `GET` | `/api/site/{node_id}/scorecard` | Full site scorecard |
| `GET` | `/api/nearest?lat=&lng=` | Nearest node to any map coordinate |
| `GET` | `/api/location/economics` | Full economics payload for any lat/lng |
| `GET` | `/api/overlays/gas-pipelines` | HIFLD pipeline GeoJSON |
| `GET` | `/api/overlays/county-boundaries` | Texas county GeoJSON |

### Forecast Response Shape

```json
{
  "node_id": "MIDLAND_ALL",
  "status": "success",
  "forecasts": {
    "electricity": {
      "1h": {
        "price": 31.20,
        "timestamp": "2026-04-19T09:00:00",
        "btm_cost": 25.81,
        "spread": 5.39,
        "decision": "GENERATE",
        "explanation": [
          { "feature_name": "price_lag_1h",   "value": 34.2, "shap_impact": 8.4 },
          { "feature_name": "hour",            "value": 8,   "shap_impact": -3.1 }
        ]
      }
    }
  }
}
```

---

## Data Sources

| Source | Data | Access |
|---|---|---|
| [ERCOT MIS](https://mis.ercot.com) | 15-min LMP at all settlement points | Free (API key for live) |
| [EIA Open Data](https://www.eia.gov/opendata/) | Daily Henry Hub natural gas spot price | Free API key |
| [HIFLD](https://hifld-geoplatform.hub.arcgis.com/) | Natural gas pipeline routes | Public |
| [US Census / Plotly](https://github.com/plotly/datasets) | Texas county boundaries | Public |

> **Note:** `fetch_ercot.py` runs in simulation mode (realistic synthetic LMP) until ERCOT MIS credentials are configured. All endpoints and ML models are fully functional with simulated data.

---

## ERCOT Nodes Covered

| Node ID | Name | Zone | Type |
|---|---|---|---|
| `HB_WEST` | West Hub | West | Hub |
| `LZ_WEST` | West Load Zone | West | Load Zone |
| `ODESSA_ALL` | Odessa Area | Permian | Resource |
| `MIDLAND_ALL` | Midland Area | Permian | Resource |
| `BIG_SPRING` | Big Spring Area | Permian | Resource |
| `PECOS_ALL` | Pecos Area | Permian | Resource |
| `SAN_ANGELO` | San Angelo Area | West | Resource |
| `LUBBOCK_ALL` | Lubbock Area | West | Resource |
| `ABILENE_ALL` | Abilene Area | West | Resource |
| `WINKLER_WND` | Winkler Wind | Permian | Wind |
| `UPTON_WND` | Upton Wind | Permian | Wind |
| `REAGAN_WND` | Reagan Wind | Permian | Wind |
| `CRANE_ALL` | Crane Area | Permian | Resource |
| `WARD_ALL` | Ward County Area | Permian | Resource |
| `HB_BUSAVG` | Bus Average Hub | West | Hub |

---

## Deployment

### Backend → Railway
1. Connect GitHub repo to [Railway](https://railway.app)
2. Set root directory: `global_site/backend`
3. Add environment variable: `EIA_API_KEY=your_key`
4. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Frontend → Vercel
1. Connect GitHub repo to [Vercel](https://vercel.com)
2. Set root directory: `global_site/frontend`
3. Add environment variable: `VITE_API_URL=https://your-railway-url`

---

## Roadmap

- [ ] Connect live ERCOT MIS feed (stub ready in `fetch_ercot.py`)
- [ ] Add WECC nodes (CAISO / SPP) for Arizona & New Mexico coverage
- [ ] Confidence intervals on 72h forecasts
- [ ] Gas pipeline reliability index (Sub-problem B)
- [ ] Land parcel scoring layer (Sub-problem A)
- [ ] Full-stack site scorecard combining all three dimensions

---

## Built For

**AEE Hackathon 2026** — AI-Driven BTM Data Center Site Selection  
Sub-problem C: Wholesale power economics forecasting for BTM gas vs. grid power arbitrage on ERCOT

---

<div align="center">
<sub>Built with FastAPI · React · LightGBM · Leaflet · Recharts · SQLite</sub>
</div>
