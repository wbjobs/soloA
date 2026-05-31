from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any
from app.services.recommendation_service import get_recommendation_service
from app.models import RecommendationRequest
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/recommendation", tags=["recommendation"])


@router.post("/alternatives")
async def find_alternative_suppliers(request: RecommendationRequest):
    try:
        service = get_recommendation_service()
        recommendations = service.find_alternatives(
            failed_supplier_id=request.failed_supplier_id,
            weights=request.weights,
            top_n=request.top_n
        )
        return recommendations
    except Exception as e:
        logger.error(f"Error finding alternative suppliers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alternatives/{supplier_id}")
async def get_alternatives_for_supplier(
    supplier_id: str,
    top_n: int = Query(default=10, ge=1, le=50),
    capacity_weight: float = Query(default=0.35, ge=0.0, le=1.0),
    distance_weight: float = Query(default=0.25, ge=0.0, le=1.0),
    quality_weight: float = Query(default=0.40, ge=0.0, le=1.0)
):
    try:
        service = get_recommendation_service()
        weights = {
            "capacity": capacity_weight,
            "distance": distance_weight,
            "quality": quality_weight
        }
        return service.find_alternatives(
            failed_supplier_id=supplier_id,
            weights=weights,
            top_n=top_n
        )
    except Exception as e:
        logger.error(f"Error getting alternatives for supplier {supplier_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/impact-analysis")
async def analyze_impact(
    failed_supplier_id: str,
    alternatives: List[str] = Query(default=[])
):
    try:
        service = get_recommendation_service()
        return service.analyze_impact(failed_supplier_id, alternatives)
    except Exception as e:
        logger.error(f"Error analyzing impact for supplier {failed_supplier_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
