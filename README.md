# BTM Heatmap — West Texas

Behind-the-meter spread scoring for data center site selection.
Visualizes whether self-generation (BTM gas) is cheaper than grid power
at ERCOT settlement points across West Texas.

---

## Project Structure

```
btm-heatmap/
├── backend/
│   ├── data/
│   │   ├── fetch_ercot.py        # Pull LMP from ERCOT MIS
│   │   ├── fetch_eia.py          # Pull gas prices from EIA
│   │   └── calculate_spread.py  # Calculate spread scores
│   ├── db/
│   │   └── database.py          # SQLAlchemy models + DB setup
│   ├── api/
│   │   └── routes.py            # FastAPI endpoints
│   ├── main.py                  # App entry point
│   ├── seed.py                  # Run full pipeline in one command
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Map.jsx          # Leaflet map with colored dots
│   │   │   ├── SitePanel.jsx    # Click-through detail panel
│   │   │   └── LayerToggles.jsx # Layer on/off controls
│   │   ├── App.jsx              # Root component
│   │   └── index.jsx            # React entry point
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

---

## Quick Start

### 1. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Mac/Linux
# venv\Scripts\activate         # Windows

pip install -r requirements.txt

cp .env.example .env
# Edit .env — add your EIA API key (free at eia.gov/opendata)

# Run full data pipeline — fetches and calculates everything
python seed.py

# Faster test run:
# python seed.py --days 90

# Start API
uvicorn main:app --reload --port 8000
```

API: http://localhost:8000
Docs: http://localhost:8000/docs

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173

---

## API Endpoints

| Endpoint | Description |
|---|---|
| GET /api/heatmap | All nodes with spread scores |
| GET /api/site/{node_id} | Full history for one node |
| GET /api/site/{node_id}/live | Current live conditions |
| GET /api/nearest?lat=&lng= | Nearest node to map click coordinates |

---

## Data Sources

| Source | What it provides | Access |
|---|---|---|
| ERCOT MIS | 15-min LMP at West Texas nodes | Free — mis.ercot.com |
| EIA Open Data | Daily Waha + Henry Hub prices | Free key — eia.gov/opendata |

Note: fetch_ercot.py runs in simulation mode until you have an ERCOT key.
All endpoints work with simulated data for demo purposes.

---

## Generator Assumptions (edit in calculate_spread.py)

| Parameter | Default | Meaning |
|---|---|---|
| Heat rate | 8.5 MMBtu/MWh | Gas burned per MWh output |
| O&M cost | $3.50/MWh | Variable operating cost |

---

## Spread Score Scale

| Color | Label | Spread |
|---|---|---|
| Deep green | Strong | > $15/MWh |
| Medium green | Moderate | $8-15/MWh |
| Yellow | Marginal | $2-8/MWh |
| Orange | Weak | $0-2/MWh |
| Red | Unfavorable | < $0/MWh |

---

## Deployment

Backend → Railway: connect GitHub repo, add EIA_API_KEY env var, deploy.
Frontend → Vercel: connect GitHub repo, add VITE_API_URL env var, deploy.

---

## Expanding

- New layers (wind/solar/pipelines): add data fetch + API endpoint + Map.jsx layer
- Forecast model: add /api/forecast/{node_id} endpoint + chart in SitePanel
- WECC sites: add nodes to DB, add CAISO fetcher, adjust map center
