from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
from app.services.graph_service import get_graph_service
from app.models import (
    GraphData,
    SupplierNode,
    SupplyEdge,
    DashboardMetrics,
    CentralityMetrics
)
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/graph", tags=["graph"])


@router.get("/full", response_model=GraphData)
async def get_full_graph(
    max_depth: int = Query(default=5, ge=1, le=10)
):
    try:
        service = get_graph_service()
        return service.get_full_graph(max_depth)
    except Exception as e:
        logger.error(f"Error getting full graph: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/node/{node_id}", response_model=Optional[SupplierNode])
async def get_node(node_id: str):
    try:
        service = get_graph_service()
        node = service.get_node(node_id)
        if not node:
            raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
        return node
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting node {node_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/node/{node_id}/subgraph", response_model=GraphData)
async def get_subgraph(
    node_id: str,
    direction: str = Query(default="downstream", regex="^(upstream|downstream|both)$"),
    depth: int = Query(default=2, ge=1, le=5)
):
    try:
        service = get_graph_service()
        subgraph = service.get_subgraph(node_id, direction, depth)
        if not subgraph:
            raise HTTPException(status_code=404, detail=f"No subgraph found for node {node_id}")
        return subgraph
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting subgraph for node {node_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/node/{node_id}/neighbors", response_model=List[SupplierNode])
async def get_neighbors(
    node_id: str,
    direction: str = Query(default="all", regex="^(upstream|downstream|all)$")
):
    try:
        service = get_graph_service()
        neighbors = service.get_neighbors(node_id, direction)
        return neighbors
    except Exception as e:
        logger.error(f"Error getting neighbors for node {node_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/centrality/{node_id}", response_model=CentralityMetrics)
async def get_node_centrality(node_id: str):
    try:
        service = get_graph_service()
        metrics = service.get_node_centrality(node_id)
        if not metrics:
            raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
        return metrics
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting centrality for node {node_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/centrality/top/{metric}", response_model=List[dict])
async def get_top_nodes_by_metric(
    metric: str = Query(regex="^(betweenness|pagerank|in_degree|out_degree|total_degree|closeness)$"),
    top_n: int = Query(default=10, ge=1, le=100)
):
    try:
        service = get_graph_service()
        return service.get_top_nodes(metric, top_n)
    except Exception as e:
        logger.error(f"Error getting top nodes by {metric}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dashboard", response_model=DashboardMetrics)
async def get_dashboard_metrics():
    try:
        service = get_graph_service()
        return service.get_dashboard_metrics()
    except Exception as e:
        logger.error(f"Error getting dashboard metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))
