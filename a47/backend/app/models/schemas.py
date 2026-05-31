from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from enum import Enum


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SupplierNode(BaseModel):
    id: str
    name: str
    tier: int = Field(default=-1)
    category: str = Field(default="")
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    capacity: float = Field(default=0.0)
    quality_score: float = Field(default=0.5)
    risk_score: float = Field(default=0.5)
    country: str = Field(default="")

    class Config:
        from_attributes = True


class SupplyEdge(BaseModel):
    source: str
    target: str
    volume: float = Field(default=1.0)
    lead_time: float = Field(default=1.0)
    dependency_ratio: float = Field(default=0.5)

    class Config:
        from_attributes = True


class GraphData(BaseModel):
    nodes: List[SupplierNode]
    edges: List[SupplyEdge]


class CentralityMetrics(BaseModel):
    betweenness: float
    pagerank: float
    in_degree: float
    out_degree: float
    total_degree: float
    closeness: float


class RiskSimulationRequest(BaseModel):
    initial_failure_nodes: List[str]
    dependency_threshold: float = Field(default=0.3, ge=0.0, le=1.0)
    max_iterations: int = Field(default=100, ge=1)


class CascadeResultResponse(BaseModel):
    failed_nodes: List[str]
    propagation_path: List[List[str]]
    propagation_depth: int
    affected_edges: List[List[str]]
    total_impact: float


class MonteCarloRequest(BaseModel):
    num_simulations: int = Field(default=1000, ge=1)
    base_failure_probability: float = Field(default=0.05, ge=0.0, le=1.0)
    risk_factor_weight: float = Field(default=0.5, ge=0.0, le=1.0)
    dependency_threshold: float = Field(default=0.3, ge=0.0, le=1.0)


class MonteCarloResultResponse(BaseModel):
    failure_probability: Dict[str, float]
    expected_impact: float
    risk_distribution: Dict[str, float]
    simulation_count: int
    confidence_interval: Optional[Dict[str, float]] = None


class TargetedSimulationRequest(BaseModel):
    target_node: str
    num_simulations: int = Field(default=100, ge=1)
    failure_probability: float = Field(default=1.0, ge=0.0, le=1.0)
    dependency_threshold: float = Field(default=0.3, ge=0.0, le=1.0)


class RecommendationRequest(BaseModel):
    failed_supplier_id: str
    weights: Optional[Dict[str, float]] = None
    top_n: int = Field(default=10, ge=1)


class RecommendationResponse(BaseModel):
    id: str
    name: str
    category: str
    tier: int
    country: str
    weighted_score: float
    scores: Dict[str, float]
    distance_km: float
    capacity: float
    historical_quality: float


class RiskHeatmapResponse(BaseModel):
    node_id: str
    risk_level: RiskLevel
    risk_value: float


class NTierRiskResponse(BaseModel):
    tier: int
    total_nodes: int
    failed_nodes: int
    failure_ratio: float
    risk_exposure: float


class DashboardMetrics(BaseModel):
    total_nodes: int
    total_edges: int
    max_tier: int
    critical_path_length: float
    top_betweenness_nodes: List[Dict[str, Any]]
    top_pagerank_nodes: List[Dict[str, Any]]
