"""
Feature Engineering Service for ML Model Forecasts

This module prepares the 10 features required by the LightGBM models:
1. henry_hub_price - Current/baseline Henry Hub gas price ($/MMBtu)
2. hour - Hour of day (0-23)
3. day_of_week - Day of week (0-6, 0=Sunday)
4. month - Month (1-12)
5. is_weekend - Binary flag (0 or 1)
6. price_lag_1h - Price value from 1 hour ago
7. price_lag_24h - Price value from 24 hours ago
8. price_lag_168h - Price value from 168 hours (1 week) ago
9. gas_lag_24h - Gas value from 24 hours ago
10. gas_lag_168h - Gas value from 168 hours ago
"""

import numpy as np
from datetime import datetime, timedelta
from typing import List, Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from db.database import LMPRecord, GasPriceRecord

def aggregate_lmp_to_hourly(
    db: Session,
    node_id: str,
    start_time: datetime,
    end_time: datetime
) -> List[Tuple[datetime, float]]:
    """
    Convert 15-minute LMP records to hourly averages.

    Args:
        db: Database session
        node_id: ERCOT settlement point ID
        start_time: Start of time range
        end_time: End of time range

    Returns:
        List of (timestamp, avg_lmp) tuples for each hour
    """
    # Use SQLite-compatible date truncation (strftime instead of date_trunc)
    query = (
        db.query(
            func.strftime('%Y-%m-%d %H:00:00', LMPRecord.timestamp).label('hour'),
            func.avg(LMPRecord.lmp).label('avg_lmp')
        )
        .filter(
            LMPRecord.node_id == node_id,
            LMPRecord.timestamp >= start_time,
            LMPRecord.timestamp <= end_time
        )
        .group_by(func.strftime('%Y-%m-%d %H:00:00', LMPRecord.timestamp))
        .order_by(func.strftime('%Y-%m-%d %H:00:00', LMPRecord.timestamp))
    )

    results = query.all()
    # Convert hour string back to datetime object for consistency
    return [(datetime.strptime(row.hour, '%Y-%m-%d %H:00:00'), float(row.avg_lmp)) for row in results]


def interpolate_gas_prices(
    db: Session,
    start_date: datetime,
    end_date: datetime
) -> List[Tuple[datetime, float]]:
    """
    Create hourly gas price series from daily data using linear interpolation.

    Args:
        db: Database session
        start_date: Start of date range
        end_date: End of date range

    Returns:
        List of (timestamp, henry_hub_price) tuples for each hour
    """
    # Get daily gas prices
    query = (
        db.query(GasPriceRecord.date, GasPriceRecord.henry_hub_price)
        .filter(
            GasPriceRecord.date >= start_date.date(),
            GasPriceRecord.date <= end_date.date()
        )
        .order_by(GasPriceRecord.date)
    )

    daily_prices = query.all()
    if not daily_prices:
        raise ValueError(f"No gas price data found for date range {start_date.date()} to {end_date.date()}")

    # Convert to hourly by repeating daily values
    # In production, you might want more sophisticated interpolation
    hourly_prices = []
    for price_record in daily_prices:
        for hour in range(24):
            timestamp = datetime.combine(price_record.date, datetime.min.time()) + timedelta(hours=hour)
            if start_date <= timestamp <= end_date:
                hourly_prices.append((timestamp, float(price_record.henry_hub_price)))

    return hourly_prices


def compute_lagged_features(
    hourly_lmp_data: List[Tuple[datetime, float]],
    hourly_gas_data: List[Tuple[datetime, float]],
    forecast_time: datetime
) -> dict:
    """
    Calculate lagged features for the ML models.

    Args:
        hourly_lmp_data: List of (timestamp, lmp) tuples
        hourly_gas_data: List of (timestamp, gas_price) tuples
        forecast_time: The time we're generating forecast for

    Returns:
        Dictionary with lag features: price_lag_1h, price_lag_24h, price_lag_168h,
                                     gas_lag_24h, gas_lag_168h
    """
    # Convert to dictionaries for easy lookup
    lmp_dict = {ts: price for ts, price in hourly_lmp_data}
    gas_dict = {ts: price for ts, price in hourly_gas_data}

    # Calculate lag timestamps
    lag_1h = forecast_time - timedelta(hours=1)
    lag_24h = forecast_time - timedelta(hours=24)
    lag_168h = forecast_time - timedelta(hours=168)

    # Get lagged values
    lag_features = {}

    # Price lags (LMP)
    lag_features['price_lag_1h'] = lmp_dict.get(lag_1h)
    lag_features['price_lag_24h'] = lmp_dict.get(lag_24h)
    lag_features['price_lag_168h'] = lmp_dict.get(lag_168h)

    # Gas lags
    lag_features['gas_lag_24h'] = gas_dict.get(lag_24h)
    lag_features['gas_lag_168h'] = gas_dict.get(lag_168h)

    # Check for missing values
    for key, value in lag_features.items():
        if value is None:
            raise ValueError(f"Missing {key} data for timestamp {forecast_time}")

    return lag_features


def get_current_gas_price(db: Session, reference_date: datetime) -> float:
    """
    Get the most recent gas price for the forecast baseline.

    Args:
        db: Database session
        reference_date: Date to find gas price for (or nearest available)

    Returns:
        Henry Hub gas price in $/MMBtu
    """
    query = (
        db.query(GasPriceRecord.henry_hub_price)
        .filter(GasPriceRecord.date <= reference_date.date())
        .order_by(GasPriceRecord.date.desc())
        .limit(1)
    )

    result = query.first()
    if not result:
        raise ValueError(f"No gas price data found for date {reference_date.date()} or earlier")

    return float(result.henry_hub_price)


def create_model_features(db: Session, node_id: str, forecast_time: datetime) -> np.ndarray:
    """
    Main orchestrator function that creates the 10-feature array for ML models.

    Args:
        db: Database session
        node_id: ERCOT settlement point ID
        forecast_time: Timestamp to generate forecast for

    Returns:
        numpy array with 10 features in the correct order for the models
    """
    # Round forecast_time to the nearest hour for alignment with hourly data
    forecast_time_hour = forecast_time.replace(minute=0, second=0, microsecond=0)

    # Define time window for historical data (need 168 hours back)
    start_time = forecast_time_hour - timedelta(hours=168)
    end_time = forecast_time_hour

    # Get hourly aggregated data
    hourly_lmp_data = aggregate_lmp_to_hourly(db, node_id, start_time, end_time)
    hourly_gas_data = interpolate_gas_prices(db, start_time, end_time)

    if not hourly_lmp_data:
        raise ValueError(f"No LMP data found for node {node_id} in time range")

    if not hourly_gas_data:
        raise ValueError(f"No gas price data found for time range")

    # Get current gas price for baseline
    henry_hub_price = get_current_gas_price(db, forecast_time_hour)

    # Calculate time-based features using rounded forecast time
    hour = forecast_time_hour.hour
    day_of_week = forecast_time_hour.weekday()  # Python weekday: 0=Monday, but models expect 0=Sunday
    day_of_week = (day_of_week + 1) % 7  # Convert to 0=Sunday format
    month = forecast_time_hour.month
    is_weekend = 1 if forecast_time_hour.weekday() >= 5 else 0  # Saturday=5, Sunday=6

    # Calculate lagged features using rounded forecast time
    lag_features = compute_lagged_features(hourly_lmp_data, hourly_gas_data, forecast_time_hour)

    # Assemble the 10 features in the exact order expected by models
    features = np.array([
        henry_hub_price,                    # 1. henry_hub_price
        hour,                              # 2. hour
        day_of_week,                       # 3. day_of_week
        month,                             # 4. month
        is_weekend,                        # 5. is_weekend
        lag_features['price_lag_1h'],      # 6. price_lag_1h
        lag_features['price_lag_24h'],     # 7. price_lag_24h
        lag_features['price_lag_168h'],    # 8. price_lag_168h
        lag_features['gas_lag_24h'],       # 9. gas_lag_24h
        lag_features['gas_lag_168h']       # 10. gas_lag_168h
    ], dtype=np.float32)

    return features


def validate_feature_array(features: np.ndarray, node_id: str) -> None:
    """
    Validate the feature array before sending to ML models.

    Args:
        features: 10-element feature array
        node_id: Node ID for error messages

    Raises:
        ValueError: If validation fails
    """
    if features.shape != (10,):
        raise ValueError(f"Feature array must have shape (10,), got {features.shape}")

    if np.any(np.isnan(features)):
        raise ValueError(f"Feature array contains NaN values for node {node_id}")

    if np.any(np.isinf(features)):
        raise ValueError(f"Feature array contains infinite values for node {node_id}")

    # Basic range checks based on model training data
    if features[0] < 0 or features[0] > 20:  # henry_hub_price reasonable range
        raise ValueError(f"Henry Hub price {features[0]} outside expected range [0, 20] for node {node_id}")

    if features[1] < 0 or features[1] > 23:  # hour
        raise ValueError(f"Hour {features[1]} outside valid range [0, 23] for node {node_id}")

    if features[3] < 1 or features[3] > 12:  # month
        raise ValueError(f"Month {features[3]} outside valid range [1, 12] for node {node_id}")