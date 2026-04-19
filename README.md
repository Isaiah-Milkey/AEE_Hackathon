# BTM Heatmap — West Texas

**AI-powered behind-the-meter spread scoring and forecasting for data center site selection.**

Combines real-time market data with machine learning to:
- ✅ **Analyze current economics** across West Texas ERCOT settlement points
- 🔮 **Predict future prices** using 8 trained LightGBM models (1h, 6h, 24h, 72h ahead)
- 🧠 **Explain AI decisions** with SHAP explainability for transparent forecasts
- 💰 **Calculate dispatch decisions** (generate vs. buy from grid) with BTM cost analysis

---

## Project Structure

```
btm-heatmap/
├── backend/
│   ├── data/
│   │   ├── fetch_ercot.py        # Pull LMP from ERCOT MIS
│   │   ├── fetch_eia.py          # Pull gas prices from EIA
│   │   └── calculate_spread.py   # Calculate spread scores
│   ├── services/                 # NEW: ML forecasting services
│   │   ├── feature_engineering.py # Prepare ML model features
│   │   └── ml_models.py          # LightGBM model loading & SHAP
│   ├── models/                   # NEW: 8 trained LightGBM models
│   │   ├── lgbm_elec_1h.txt      # Electricity 1-hour forecast
│   │   ├── lgbm_elec_6h.txt      # Electricity 6-hour forecast
│   │   ├── lgbm_elec_24h.txt     # Electricity 24-hour forecast
│   │   ├── lgbm_elec_72h.txt     # Electricity 72-hour forecast
│   │   ├── lgbm_gas_1h.txt       # Gas 1-hour forecast
│   │   ├── lgbm_gas_6h.txt       # Gas 6-hour forecast
│   │   ├── lgbm_gas_24h.txt      # Gas 24-hour forecast
│   │   └── lgbm_gas_72h.txt      # Gas 72-hour forecast
│   ├── db/
│   │   └── database.py           # SQLAlchemy models + DB setup
│   ├── api/
│   │   └── routes.py             # FastAPI endpoints + forecast API
│   ├── main.py                   # App entry point
│   ├── seed.py                   # Run full pipeline in one command
│   ├── requirements.txt          # Now includes LightGBM + SHAP
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Map.jsx           # Leaflet map with colored dots
│   │   │   ├── SitePanel.jsx     # Enhanced with ML forecasts & explainability
│   │   │   └── LayerToggles.jsx  # Layer on/off controls
│   │   ├── App.jsx               # Root component
│   │   └── index.jsx             # React entry point
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
| **POST /api/site/{node_id}/forecast** | **🔮 NEW: ML price forecasts + explanations** |
| GET /api/nearest?lat=&lng= | Nearest node to map click coordinates |
| GET /api/site/{node_id}/analytics | Risk metrics + volatility data |
| GET /api/site/{node_id}/scorecard | Historical performance ratings |

### 🔮 ML Forecast Endpoint

**Request:** `POST /api/site/{node_id}/forecast`

**Response:** Real-time ML predictions with SHAP explanations:
```json
{
  "forecasts": {
    "electricity": {
      "1h": {
        "price": 18.96,
        "btm_cost": 25.84,
        "spread": -6.88,
        "dispatch_decision": "BUY FROM GRID",
        "explanation": [
          {"feature_name": "hour", "value": 8.0, "shap_impact": -13.95},
          {"feature_name": "price_lag_1h", "value": 30.74, "shap_impact": 2.5}
        ]
      }
    }
  },
  "data_quality": {"models_loaded": "8/8"}
}
```

---

## Data Sources & ML Models

### Market Data Sources
| Source | What it provides | Access |
|---|---|---|
| ERCOT MIS | 15-min LMP at West Texas nodes | Free — mis.ercot.com |
| EIA Open Data | Daily Waha + Henry Hub prices | Free key — eia.gov/opendata |

### 🧠 ML Models (8 Pre-trained LightGBM Models)
| Model | Predicts | Horizon |
|---|---|---|
| `lgbm_elec_1h.txt` | Electricity prices | 1 hour ahead |
| `lgbm_elec_6h.txt` | Electricity prices | 6 hours ahead |
| `lgbm_elec_24h.txt` | Electricity prices | 24 hours ahead |
| `lgbm_elec_72h.txt` | Electricity prices | 72 hours ahead |
| `lgbm_gas_1h.txt` | Gas prices | 1 hour ahead |
| `lgbm_gas_6h.txt` | Gas prices | 6 hours ahead |
| `lgbm_gas_24h.txt` | Gas prices | 24 hours ahead |
| `lgbm_gas_72h.txt` | Gas prices | 72 hours ahead |

**Model Features (10 inputs):**
- Current gas price, hour, day of week, month, weekend flag
- Price lags: 1h, 24h, 168h (1 week) ago
- Gas price lags: 24h, 168h ago

Note: fetch_ercot.py runs in simulation mode until you have an ERCOT key.
All endpoints work with simulated data for demo purposes.

---

## BTM Generator Economics

### Current Analysis (calculate_spread.py)
| Parameter | Default | Meaning |
|---|---|---|
| Heat rate | 8.5 MMBtu/MWh | Gas burned per MWh output |
| O&M cost | $3.50/MWh | Variable operating cost |

### 🔮 Forecast Economics (ml_models.py) 
| Parameter | Default | Meaning |
|---|---|---|
| Heat rate | 7.2 MMBtu/MWh | More efficient forecast model |
| O&M cost | $5.00/MWh | Includes maintenance reserves |

**Dispatch Decision Logic:**
- `BTM Cost = Gas Price × Heat Rate + O&M Cost`
- `Spread = Electricity Price - BTM Cost`
- `Decision = 'GENERATE' if Spread > 0 else 'BUY FROM GRID'`

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

## 🚀 New Features: ML Forecasting & Explainability

### Frontend Enhancements
- **🎯 Horizon Cards:** 2x2 grid showing economics for 1h, 6h, 24h, 72h forecasts
- **🧠 SHAP Explanations:** Interactive charts showing why models made each prediction
- **📊 Economics Dashboard:** Real-time BTM costs, spreads, and dispatch decisions
- **🎨 Color-coded Decisions:** Green "GENERATE" vs Red "BUY FROM GRID"

### Backend ML Pipeline
- **⚡ Feature Engineering:** Automated lag feature calculation from 365 days of data
- **🔮 Real-time Inference:** All 8 models load on startup for sub-second predictions  
- **🧠 SHAP Integration:** Top 5 feature explanations for every forecast
- **💡 Transparent AI:** Users see exactly why models predict each price

### What Users Can Do
1. **Click any settlement point** → View current economics and risk metrics
2. **Click "Run forecast"** → Get AI predictions for next 1h, 6h, 24h, 72h
3. **Click horizon cards** → See SHAP explanations showing model reasoning
4. **Make investment decisions** → Know when to generate vs. buy from grid

---

## 🛠️ Technical Implementation

### ML Dependencies
```bash
pip install lightgbm>=4.0.0 shap>=0.43.0
```

### Model Loading
```python
from services.ml_models import get_model_service
model_service = get_model_service('models/')
forecasts, explanations = model_service.predict_with_validation(features, forecast_time)
```

### SHAP Explainability
```python
explainer = shap.TreeExplainer(model)
shap_values = explainer.shap_values(features)
# Returns top 5 features by absolute impact
```

---

## Expanding

- **New regions:** Add CAISO/PJM nodes, retrain models for different markets
- **More horizons:** Train 1-week, 1-month forecast models
- **Weather integration:** Add temperature, wind speed features
- **Storage optimization:** Add battery dispatch decisions
- **Risk modeling:** Forecast confidence intervals and value-at-risk
