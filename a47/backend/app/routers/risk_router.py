from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any
from app.services.risk_service import get_risk_service
from app.models import (
    RiskSimulationRequest,
    CascadeResultResponse,
    MonteCarloRequest,
    MonteCarloResultResponse,
    TargetedSimulationRequest,
    RiskHeatmapResponse,
    NTierRiskResponse
)
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/risk", tags=["risk"])


@router.post("/simulate/cascade", response_model=CascadeResultResponse)
async def simulate_cascade(request: RiskSimulationRequest):
    try:
        service = get_risk_service()
        result = service.simulate_cascade(
            initial_failure_nodes=request.initial_failure_nodes,
            dependency_threshold=request.dependency_threshold,
            max_iterations=request.max_iterations
        )
        return result
    except Exception as e:
        logger.error(f"Error simulating cascade: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/simulate/montecarlo", response_model=MonteCarloResultResponse)
async def run_monte_carlo(request: MonteCarloRequest):
    try:
        service = get_risk_service()
        result = service.run_monte_carlo(
            num_simulations=request.num_simulations,
            base_failure_probability=request.base_failure_probability,
            risk_factor_weight=request.risk_factor_weight,
            dependency_threshold=request.dependency_threshold
        )
        return result
    except Exception as e:
        logger.error(f"Error running Monte Carlo simulation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/simulate/targeted")
async def run_targeted_simulation(request: TargetedSimulationRequest):
    try:
        service = get_risk_service()
        result = service.run_targeted_simulation(
            target_node=request.target_node,
            num_simulations=request.num_simulations,
            failure_probability=request.failure_probability,
            dependency_threshold=request.dependency_threshold
        )
        return result
    except Exception as e:
        logger.error(f"Error running targeted simulation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/heatmap", response_model=Dict[str, Any])
async def get_risk_heatmap(
    failed_nodes: List[str] = Query(default=[])
):
    try:
        service = get_risk_service()
        return service.get_risk_heatmap(failed_nodes)
    except Exception as e:
        logger.error(f"Error getting risk heatmap: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tier-risk", response_model=Dict[str, Any])
async def get_n_tier_risk(
    failed_nodes: List[str] = Query(default=[]),
    max_tier: int = Query(default=5, ge=0, le=10)
):
    try:
        service = get_risk_service()
        return service.get_n_tier_risk(failed_nodes, max_tier)
    except Exception as e:
        logger.error(f"Error getting N-tier risk: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/critical-path", response_model=Dict[str, Any])
async def get_critical_path(
    start_node: str = Query(default="OEM"),
    end_node: str = Query(...)
):
    try:
        service = get_risk_service()
        paths = service.get_critical_paths(start_node, end_node)
        return {
            "start_node": start_node,
            "end_node": end_node,
            "paths": paths,
            "path_count": len(paths)
        }
    except Exception as e:
        logger.error(f"Error getting critical path: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/high-risk-nodes", response_model=List[Dict[str, Any]])
async def get_high_risk_nodes(
    num_simulations: int = Query(default=50, ge=1, le=500),
    threshold: float = Query(default=0.7, ge=0.0, le=1.0)
):
    try:
        service = get_risk_service()
        return service.get_high_risk_nodes(num_simulations, threshold)
    except Exception as e:
        logger.error(f"Error getting high risk nodes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/critical-path-length")
async def get_critical_path_length(
    root_node: str = Query(default="OEM")
):
    try:
        service = get_risk_service()
        length = service.get_critical_path_length(root_node)
        return {
            "root_node": root_node,
            "critical_path_length": length
        }
    except Exception as e:
        logger.error(f"Error getting critical path length: {e}")
        raise HTTPException(status_code=500, detail=str(e))
