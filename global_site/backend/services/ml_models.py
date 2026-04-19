"""
ML Model Service for Price Forecasting

This module handles loading and running the 8 trained LightGBM models:
- lgbm_elec_1h.txt, lgbm_elec_6h.txt, lgbm_elec_24h.txt, lgbm_elec_72h.txt
- lgbm_gas_1h.txt, lgbm_gas_6h.txt, lgbm_gas_24h.txt, lgbm_gas_72h.txt
"""

import os
import numpy as np
import lightgbm as lgb
import shap
from typing import Dict, Optional, Tuple, List
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

class ModelLoadingError(Exception):
    """Raised when model files cannot be loaded."""
    pass

class ModelService:
    """
    Service for loading and running ML models for price forecasting.
    """

    def __init__(self, models_dir: str):
        """
        Initialize the model service.

        Args:
            models_dir: Directory containing the LightGBM model files
        """
        self.models_dir = models_dir
        self.models: Dict[str, lgb.Booster] = {}
        self.model_metadata = {}
        self._initialize_models()

    def _initialize_models(self):
        """Load all 8 LightGBM models into memory."""
        expected_models = [
            'lgbm_elec_1h.txt', 'lgbm_elec_6h.txt', 'lgbm_elec_24h.txt', 'lgbm_elec_72h.txt',
            'lgbm_gas_1h.txt', 'lgbm_gas_6h.txt', 'lgbm_gas_24h.txt', 'lgbm_gas_72h.txt'
        ]

        loaded_count = 0
        for model_file in expected_models:
            model_path = os.path.join(self.models_dir, model_file)

            try:
                if not os.path.exists(model_path):
                    logger.error(f"Model file not found: {model_path}")
                    continue

                # Load LightGBM model
                model = lgb.Booster(model_file=model_path)

                # Extract commodity and horizon from filename
                # e.g., 'lgbm_elec_1h.txt' -> ('elec', '1h')
                base_name = model_file.replace('lgbm_', '').replace('.txt', '')
                parts = base_name.split('_')
                if len(parts) != 2:
                    logger.error(f"Invalid model filename format: {model_file}")
                    continue

                commodity, horizon = parts
                model_key = f"{commodity}_{horizon}"

                self.models[model_key] = model
                self.model_metadata[model_key] = {
                    'file_path': model_path,
                    'commodity': commodity,
                    'horizon': horizon,
                    'loaded_at': datetime.now()
                }

                loaded_count += 1
                logger.info(f"Loaded model: {model_key}")

            except Exception as e:
                logger.error(f"Failed to load model {model_file}: {str(e)}")
                continue

        if loaded_count == 0:
            raise ModelLoadingError("No models could be loaded")

        logger.info(f"Successfully loaded {loaded_count}/8 models")

    def predict_single(self, features: np.ndarray, commodity: str, horizon: str) -> float:
        """
        Generate prediction for a single commodity/horizon combination.

        Args:
            features: 10-element feature array
            commodity: 'elec' or 'gas'
            horizon: '1h', '6h', '24h', or '72h'

        Returns:
            Predicted price value

        Raises:
            ModelLoadingError: If the requested model is not available
        """
        model_key = f"{commodity}_{horizon}"

        if model_key not in self.models:
            raise ModelLoadingError(f"Model not available: {model_key}")

        model = self.models[model_key]

        try:
            # LightGBM expects 2D array even for single prediction
            features_2d = features.reshape(1, -1)
            prediction = model.predict(features_2d)[0]
            return float(prediction)

        except Exception as e:
            logger.error(f"Prediction failed for {model_key}: {str(e)}")
            raise ModelLoadingError(f"Prediction failed for {model_key}: {str(e)}")

    def generate_forecast_suite(
        self,
        features: np.ndarray,
        forecast_time: datetime
    ) -> Dict[str, Dict[str, Dict[str, any]]]:
        """
        Run all 8 models and return complete forecast suite with explanations.

        Args:
            features: 10-element feature array
            forecast_time: Base timestamp for forecast

        Returns:
            Nested dictionary with structure:
            {
                'electricity': {
                    '1h': {
                        'price': 45.2,
                        'timestamp': '2026-04-19T15:30:00',
                        'btm_cost': 25.8,
                        'spread': 19.4,
                        'dispatch_decision': 'GENERATE',
                        'explanation': [
                            {'feature_name': 'price_lag_1h', 'value': 34.2, 'shap_impact': 8.4},
                            ...
                        ]
                    },
                    ...
                },
                'gas': { ... }
            }
        """
        results = {
            'electricity': {},
            'gas': {}
        }

        horizons = ['1h', '6h', '24h', '72h']
        commodities = {
            'elec': 'electricity',
            'gas': 'gas'
        }

        # Get henry_hub_price for BTM cost calculations (first feature)
        henry_hub_price = float(features[0])

        for model_commodity, result_commodity in commodities.items():
            for horizon in horizons:
                try:
                    # Generate prediction
                    price = self.predict_single(features, model_commodity, horizon)

                    # Generate SHAP explanation for electricity only (gas explanations less critical)
                    explanation = []
                    if result_commodity == 'electricity':
                        explanation = self.explain_prediction(features, model_commodity, horizon)

                    # Calculate target timestamp
                    hours_ahead = int(horizon.replace('h', ''))
                    target_timestamp = forecast_time + timedelta(hours=hours_ahead)

                    result_dict = {
                        'price': round(price, 2),
                        'timestamp': target_timestamp.isoformat()
                    }

                    # Add BTM economics for electricity forecasts
                    if result_commodity == 'electricity':
                        # BTM cost = henry_hub_price × 7.2 (heat rate) + 5 (O&M)
                        btm_cost = henry_hub_price * 7.2 + 5
                        spread = price - btm_cost
                        dispatch_decision = 'GENERATE' if spread > 0 else 'BUY FROM GRID'

                        result_dict.update({
                            'btm_cost': round(btm_cost, 2),
                            'spread': round(spread, 2),
                            'dispatch_decision': dispatch_decision,
                            'explanation': explanation
                        })

                    results[result_commodity][horizon] = result_dict

                except ModelLoadingError as e:
                    logger.error(f"Failed to predict {model_commodity}_{horizon}: {str(e)}")
                    # Set fallback/null value for missing predictions
                    results[result_commodity][horizon] = {
                        'price': None,
                        'timestamp': None,
                        'error': str(e)
                    }

        return results

    def get_model_status(self) -> Dict[str, any]:
        """
        Get status information about loaded models.

        Returns:
            Dictionary with model loading status and metadata
        """
        return {
            'total_models': 8,
            'loaded_models': len(self.models),
            'available_models': list(self.models.keys()),
            'missing_models': [
                f"{commodity}_{horizon}"
                for commodity in ['elec', 'gas']
                for horizon in ['1h', '6h', '24h', '72h']
                if f"{commodity}_{horizon}" not in self.models
            ],
            'models_dir': self.models_dir,
            'metadata': self.model_metadata
        }

    def validate_inputs(self, features: np.ndarray) -> None:
        """
        Validate input features before prediction.

        Args:
            features: Feature array to validate

        Raises:
            ValueError: If features are invalid
        """
        if features.shape != (10,):
            raise ValueError(f"Features must be shape (10,), got {features.shape}")

        if np.any(np.isnan(features)):
            raise ValueError("Features contain NaN values")

        if np.any(np.isinf(features)):
            raise ValueError("Features contain infinite values")

    def explain_prediction(
        self,
        features: np.ndarray,
        commodity: str,
        horizon: str
    ) -> List[Dict[str, any]]:
        """
        Generate SHAP explanations for a prediction.

        Args:
            features: 10-element feature array
            commodity: 'elec' or 'gas'
            horizon: '1h', '6h', '24h', or '72h'

        Returns:
            List of top 5 feature explanations sorted by absolute SHAP value:
            [
                {feature_name: 'price_lag_1h', value: 34.2, shap_impact: +8.4},
                {feature_name: 'hour', value: 8, shap_impact: -3.1},
                ...
            ]
        """
        model_key = f"{commodity}_{horizon}"

        if model_key not in self.models:
            raise ModelLoadingError(f"Model not available: {model_key}")

        model = self.models[model_key]

        # Feature names in order (matching the 10 features expected by models)
        feature_names = [
            'henry_hub_price',
            'hour',
            'day_of_week',
            'month',
            'is_weekend',
            'price_lag_1h',
            'price_lag_24h',
            'price_lag_168h',
            'gas_lag_24h',
            'gas_lag_168h'
        ]

        try:
            # Create SHAP explainer for this model
            explainer = shap.TreeExplainer(model)

            # Compute SHAP values - features should be 2D array
            features_2d = features.reshape(1, -1)
            shap_values = explainer.shap_values(features_2d)

            # shap_values is a 1D array for regression models
            if isinstance(shap_values, list):
                # For multi-class models, take first class
                shap_values = shap_values[0][0]
            else:
                # For regression models
                shap_values = shap_values[0]

            # Create feature explanations
            explanations = []
            for i, (feature_name, feature_value, shap_value) in enumerate(
                zip(feature_names, features, shap_values)
            ):
                explanations.append({
                    'feature_name': feature_name,
                    'value': float(feature_value),
                    'shap_impact': round(float(shap_value), 3)
                })

            # Sort by absolute SHAP value (most important first)
            explanations.sort(key=lambda x: abs(x['shap_impact']), reverse=True)

            # Return top 5 features
            return explanations[:5]

        except Exception as e:
            logger.error(f"SHAP explanation failed for {model_key}: {str(e)}")
            # Return fallback explanation
            return [
                {
                    'feature_name': 'explanation_unavailable',
                    'value': 0.0,
                    'shap_impact': 0.0
                }
            ]

    def predict_with_validation(
        self,
        features: np.ndarray,
        forecast_time: datetime
    ) -> Tuple[Dict[str, Dict[str, Dict[str, float]]], Dict[str, any]]:
        """
        Generate forecasts with input validation and model status.

        Args:
            features: 10-element feature array
            forecast_time: Base timestamp for forecast

        Returns:
            Tuple of (forecast_results, model_status)
        """
        # Validate inputs
        self.validate_inputs(features)

        # Generate forecasts
        forecast_results = self.generate_forecast_suite(features, forecast_time)

        # Get model status
        model_status = self.get_model_status()

        return forecast_results, model_status


# Global model service instance
_model_service: Optional[ModelService] = None

def get_model_service(models_dir: str) -> ModelService:
    """
    Get or create the global model service instance.

    Args:
        models_dir: Directory containing model files

    Returns:
        ModelService instance
    """
    global _model_service

    if _model_service is None:
        _model_service = ModelService(models_dir)

    return _model_service

def initialize_models(models_dir: str) -> None:
    """
    Initialize the global model service on application startup.

    Args:
        models_dir: Directory containing model files
    """
    global _model_service
    _model_service = ModelService(models_dir)
    logger.info(f"Model service initialized with {len(_model_service.models)} models")