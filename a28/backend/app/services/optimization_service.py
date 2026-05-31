import json
import numpy as np
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from sqlalchemy.orm import Session
from app.models import Experiment


SOLVENT_ENCODING = {
    "Water": 0,
    "Ethanol": 1,
    "Methanol": 2,
    "Toluene": 3,
    "Dichloromethane": 4,
    "Hexane": 5,
    "Ethyl Acetate": 6,
    "Diethyl Ether": 7,
    "THF": 8,
    "Acetone": 9,
    "DMF": 10,
    "DMSO": 11,
    "Other": 12,
}

CATALYST_ENCODING = {
    "None": 0,
    "H2SO4": 1,
    "HCl": 2,
    "NaOH": 3,
    "KOH": 4,
    "Pyridine": 5,
    "Triethylamine": 6,
    "Pd/C": 7,
    "PtO2": 8,
    "Ni": 9,
    "AlCl3": 10,
    "FeCl3": 11,
    "Other": 12,
}


def _encode_solvent(solvent: Optional[str]) -> int:
    if not solvent:
        return SOLVENT_ENCODING["Other"]
    for key in SOLVENT_ENCODING:
        if key.lower() in solvent.lower() or solvent.lower() in key.lower():
            return SOLVENT_ENCODING[key]
    return SOLVENT_ENCODING["Other"]


def _encode_catalyst(catalyst: Optional[str]) -> int:
    if not catalyst:
        return CATALYST_ENCODING["None"]
    for key in CATALYST_ENCODING:
        if key.lower() in catalyst.lower() or catalyst.lower() in key.lower():
            return CATALYST_ENCODING[key]
    return CATALYST_ENCODING["Other"]


def _collect_training_data(db: Session, min_samples: int = 5) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    experiments = db.query(Experiment).filter(
        Experiment.yield_percent.isnot(None)
    ).all()

    if len(experiments) < min_samples:
        return np.array([]), np.array([]), []

    features = []
    yields = []
    feature_names = [
        "temperature",
        "reaction_time",
        "pressure",
        "solvent_encoded",
        "catalyst_encoded",
    ]

    for exp in experiments:
        row = [
            exp.temperature if exp.temperature is not None else 25,
            exp.reaction_time if exp.reaction_time is not None else 1.0,
            exp.pressure if exp.pressure is not None else 1.0,
            _encode_solvent(exp.solvent),
            _encode_catalyst(exp.catalyst),
        ]
        features.append(row)
        yields.append(exp.yield_percent)

    X = np.array(features, dtype=np.float64)
    y = np.array(yields, dtype=np.float64)

    return X, y, feature_names


def _linear_regression(X: np.ndarray, y: np.ndarray) -> Tuple[np.ndarray, float]:
    if len(X) < 2:
        return np.zeros(X.shape[1] if X.ndim > 1 else 1), 0.0

    X_with_intercept = np.hstack([X, np.ones((X.shape[0], 1))])

    try:
        coefficients = np.linalg.lstsq(X_with_intercept, y, rcond=None)[0]
        weights = coefficients[:-1]
        intercept = coefficients[-1]

        predictions = X_with_intercept @ coefficients
        residuals = y - predictions
        ss_res = np.sum(residuals ** 2)
        ss_tot = np.sum((y - np.mean(y)) ** 2)
        r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0

        return np.append(weights, intercept), float(r2)
    except Exception:
        return np.zeros(X.shape[1] + 1 if X.ndim > 1 else 2), 0.0


def _predict_yield(
    temperature: float,
    reaction_time: float,
    pressure: float,
    solvent: Optional[str],
    catalyst: Optional[str],
    model_params: np.ndarray,
) -> float:
    solvent_code = _encode_solvent(solvent)
    catalyst_code = _encode_catalyst(catalyst)

    features = np.array([
        temperature,
        reaction_time,
        pressure,
        solvent_code,
        catalyst_code,
    ])

    weights = model_params[:-1]
    intercept = model_params[-1]

    predicted = np.dot(features, weights) + intercept

    return max(0.0, min(100.0, float(predicted)))


def train_yield_model(db: Session) -> Dict[str, Any]:
    X, y, feature_names = _collect_training_data(db)

    if len(X) == 0:
        return {
            "status": "not_enough_data",
            "message": "Not enough experiments with yield data to train the model",
            "sample_count": 0,
            "min_required": 5,
        }

    model_params, r2 = _linear_regression(X, y)

    weights_dict = {}
    for i, name in enumerate(feature_names):
        weights_dict[name] = float(model_params[i])

    return {
        "status": "success",
        "model_params": model_params.tolist(),
        "weights": weights_dict,
        "intercept": float(model_params[-1]),
        "r2_score": round(r2, 4),
        "sample_count": len(X),
        "feature_names": feature_names,
        "feature_importance": {
            name: abs(float(model_params[i]))
            for i, name in enumerate(feature_names)
        },
    }


def predict_yield(
    db: Session,
    temperature: float,
    reaction_time: float,
    pressure: Optional[float] = None,
    solvent: Optional[str] = None,
    catalyst: Optional[str] = None,
) -> Dict[str, Any]:
    model_info = train_yield_model(db)

    if model_info["status"] == "not_enough_data":
        return {
            "status": "not_enough_data",
            "message": "Not enough historical data for prediction",
            "min_required": 5,
            "current_count": model_info.get("sample_count", 0),
        }

    model_params = np.array(model_info["model_params"])

    predicted_yield = _predict_yield(
        temperature=temperature,
        reaction_time=reaction_time,
        pressure=pressure or 1.0,
        solvent=solvent,
        catalyst=catalyst,
        model_params=model_params,
    )

    feature_names = model_info["feature_names"]
    importance = model_info["feature_importance"]

    sorted_features = sorted(
        [(name, importance[name]) for name in feature_names],
        key=lambda x: x[1],
        reverse=True,
    )

    return {
        "status": "success",
        "predicted_yield": round(predicted_yield, 2),
        "model_r2": model_info["r2_score"],
        "sample_count": model_info["sample_count"],
        "input_conditions": {
            "temperature": temperature,
            "reaction_time": reaction_time,
            "pressure": pressure or 1.0,
            "solvent": solvent,
            "catalyst": catalyst,
        },
        "top_factors": [
            {"feature": name, "importance": round(imp, 4)}
            for name, imp in sorted_features[:3]
        ],
    }


def optimize_conditions(
    db: Session,
    min_temp: float = 20.0,
    max_temp: float = 120.0,
    min_time: float = 0.5,
    max_time: float = 24.0,
) -> Dict[str, Any]:
    model_info = train_yield_model(db)

    if model_info["status"] == "not_enough_data":
        return {
            "status": "not_enough_data",
            "message": "Not enough historical data for optimization",
            "min_required": 5,
            "current_count": model_info.get("sample_count", 0),
        }

    model_params = np.array(model_info["model_params"])

    best_yield = 0.0
    best_conditions = None
    all_conditions = []

    solvents_to_try = [None, "Water", "Ethanol", "Methanol", "Toluene", "THF"]
    catalysts_to_try = [None, "H2SO4", "NaOH", "Pyridine", "Triethylamine", "Pd/C"]

    for temp in np.linspace(min_temp, max_temp, 10):
        for time_val in np.linspace(min_time, max_time, 8):
            for solvent in solvents_to_try:
                for catalyst in catalysts_to_try:
                    yield_val = _predict_yield(
                        temperature=temp,
                        reaction_time=time_val,
                        pressure=1.0,
                        solvent=solvent,
                        catalyst=catalyst,
                        model_params=model_params,
                    )

                    all_conditions.append({
                        "temperature": round(temp, 1),
                        "reaction_time": round(time_val, 2),
                        "solvent": solvent,
                        "catalyst": catalyst,
                        "predicted_yield": round(yield_val, 2),
                    })

                    if yield_val > best_yield:
                        best_yield = yield_val
                        best_conditions = {
                            "temperature": round(temp, 1),
                            "reaction_time": round(time_val, 2),
                            "solvent": solvent,
                            "catalyst": catalyst,
                        }

    all_conditions.sort(key=lambda x: x["predicted_yield"], reverse=True)

    return {
        "status": "success",
        "best_conditions": best_conditions,
        "best_predicted_yield": round(best_yield, 2),
        "top_recommendations": all_conditions[:5],
        "model_r2": model_info["r2_score"],
        "sample_count": model_info["sample_count"],
    }
