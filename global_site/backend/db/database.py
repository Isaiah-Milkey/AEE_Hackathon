from sqlalchemy import create_engine, Column, String, Float, DateTime, Integer
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./btm_heatmap.db")

engine = create_engine(
    DATABASE_URL,
    # SQLite needs this arg; PostgreSQL does not — safe to leave for both
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Node(Base):
    """
    One row per ERCOT settlement point.
    lat/lng are used to plot dots on the map.
    """
    __tablename__ = "nodes"

    id         = Column(String, primary_key=True)  # e.g. "HB_WEST"
    name       = Column(String)                    # human readable name
    lat        = Column(Float)
    lng        = Column(Float)
    zone       = Column(String)                    # e.g. "West", "Permian"
    node_type  = Column(String)                    # "hub", "load_zone", "resource"


class LMPRecord(Base):
    """
    Raw 15-minute LMP pulled from ERCOT MIS.
    One row per node per timestamp.
    """
    __tablename__ = "lmp_history"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    node_id     = Column(String)
    timestamp   = Column(DateTime)
    lmp         = Column(Float)   # $/MWh total
    congestion  = Column(Float)   # $/MWh congestion component
    loss        = Column(Float)   # $/MWh loss component


class GasPriceRecord(Base):
    """
    Daily gas prices from EIA.
    One row per date.
    """
    __tablename__ = "gas_prices"

    id                   = Column(Integer, primary_key=True, autoincrement=True)
    date                 = Column(DateTime)
    henry_hub_price      = Column(Float)   # $/MMBtu
    waha_price           = Column(Float)   # $/MMBtu
    basis_differential   = Column(Float)   # waha - henry_hub (usually negative)


class SpreadScore(Base):
    """
    Calculated spread score per node.
    Rebuilt whenever new data is fetched.
    This is what the heatmap reads directly.
    """
    __tablename__ = "spread_scores"

    node_id          = Column(String, primary_key=True)
    avg_spread       = Column(Float)   # $/MWh — positive = BTM favorable
    avg_lmp          = Column(Float)   # $/MWh
    avg_gas_cost     = Column(Float)   # $/MWh (waha * heat_rate + om)
    spread_color     = Column(String)  # hex color for map dot
    spread_label     = Column(String)  # "Strong" / "Moderate" / "Marginal" / "Unfavorable"
    data_start       = Column(DateTime)
    data_end         = Column(DateTime)
    last_updated     = Column(DateTime, default=datetime.utcnow)


def init_db():
    """Create all tables. Safe to call repeatedly — skips existing tables."""
    Base.metadata.create_all(bind=engine)
    print("Database tables created.")


def get_db():
    """FastAPI dependency — yields a db session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
