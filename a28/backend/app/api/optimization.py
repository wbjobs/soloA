from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.services.optimization_service import (
    predict_yield,
    optimize_conditions,
    train_yield_model,
)

router = APIRouter(prefix="/api/optimization", tags=["Optimization"])


@router.get("/predict")
def predict(
    temperature: float = Query(..., ge=-273, le=500, description="Temperature in °C"),
    reaction_time: float = Query(..., gt=0, le=1000, description="Reaction time in hours"),
    pressure: float = Query(1.0, gt=0, le=100, description="Pressure in atm"),
    solvent: Optional[str] = Query(None, description="Solvent name"),
    catalyst: Optional[str] = Query(None, description="Catalyst name"),
    db: Session = Depends(get_db),
):
    try:
        return predict_yield(
            db=db,
            temperature=temperature,
            reaction_time=reaction_time,
            pressure=pressure,
            solvent=solvent,
            catalyst=catalyst,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Prediction failed: {str(e)}")


@router.get("/optimize")
def optimize(
    min_temp: float = Query(20.0, ge=-273, le=500, description="Minimum temperature"),
    max_temp: float = Query(120.0, ge=-273, le=500, description="Maximum temperature"),
    min_time: float = Query(0.5, gt=0, le=1000, description="Minimum reaction time"),
    max_time: float = Query(24.0, gt=0, le=1000, description="Maximum reaction time"),
    db: Session = Depends(get_db),
):
    if min_temp >= max_temp:
        raise HTTPException(status_code=400, detail="min_temp must be less than max_temp")
    if min_time >= max_time:
        raise HTTPException(status_code=400, detail="min_time must be less than max_time")

    try:
        return optimize_conditions(
            db=db,
            min_temp=min_temp,
            max_temp=max_temp,
            min_time=min_time,
            max_time=max_time,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Optimization failed: {str(e)}")


@router.get("/model")
def model_info(db: Session = Depends(get_db)):
    try:
        return train_yield_model(db)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get model info: {str(e)}")
