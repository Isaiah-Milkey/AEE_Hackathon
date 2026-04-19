"""
main.py

FastAPI application entry point.
Run locally with: uvicorn main:app --reload --port 8000
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from db.database import init_db
from api.routes import router

load_dotenv()

app = FastAPI(
    title="BTM Heatmap API",
    description="Behind-the-meter spread scoring for West Texas data center sites",
    version="0.1.0",
)

# CORS — allows the React frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("FRONTEND_URL", "http://localhost:5173"),
        "http://localhost:3000",  # fallback for CRA
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.on_event("startup")
def startup():
    """Initialize database tables on first run."""
    init_db()


@app.get("/")
def root():
    return {"status": "ok", "message": "BTM Heatmap API is running"}


@app.get("/health")
def health():
    return {"status": "healthy"}
