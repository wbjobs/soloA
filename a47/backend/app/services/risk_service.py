from typing import Dict, List, Any, Set, Optional
from app.services.graph_service import get_graph_service
from app.risk_simulation import CascadeFailureSimulator, MonteCarloSimulator
from app.models import CascadeResultResponse
import logging

logger = logging.getLogger(__name__)


def get_risk_service() -> 'RiskService':
    graph_service = get_graph_service()
    return RiskService(graph_service.graph)


class RiskService:
    def __init__(self, graph):
        self.graph = graph
        self.cascade = CascadeFailureSimulator(graph)
        self.monte_carlo = MonteCarloSimulator(graph)

    def simulate_cascade(
        self,
        initial_failure_nodes: List[str],
        dependency_threshold: float = 0.3,
        max_iterations: int = 100
    ) -> CascadeResultResponse:
        result = self.cascade.simulate_cascade(
            initial_failure_nodes=initial_failure_nodes,
            dependency_threshold=dependency_threshold,
            max_iterations=max_iterations
        )

        affected_edges_list = [[src, tgt] for src, tgt in result.affected_edges]

        return CascadeResultResponse(
            failed_nodes=list(result.failed_nodes),
            propagation_path=result.propagation_path,
            propagation_depth=result.propagation_depth,
            affected_edges=affected_edges_list,
            total_impact=result.total_impact
        )

    def run_monte_carlo(
        self,
        num_simulations: int = 1000,
        base_failure_probability: float = 0.05,
        risk_factor_weight: float = 0.5,
        dependency_threshold: float = 0.3
    ):
        result = self.monte_carlo.run_monte_carlo(
            num_simulations=num_simulations,
            base_failure_probability=base_failure_probability,
            risk_factor_weight=risk_factor_weight,
            dependency_threshold=dependency_threshold
        )

        return {
            "failure_probability": result.failure_probability,
            "expected_impact": result.expected_impact,
            "risk_distribution": result.risk_distribution,
            "simulation_count": result.simulation_count,
            "confidence_interval": result.confidence_interval
        }

    def run_targeted_simulation(
        self,
        target_node: str,
        num_simulations: int = 100,
        failure_probability: float = 1.0,
        dependency_threshold: float = 0.3
    ):
        return self.monte_carlo.run_targeted_simulation(
            target_node=target_node,
            num_simulations=num_simulations,
            failure_probability=failure_probability,
            dependency_threshold=dependency_threshold
        )

    def get_risk_heatmap(self, failed_nodes: List[str]):
        failed_set = set(failed_nodes) if failed_nodes else set()
        heatmap = self.cascade.get_risk_heatmap(failed_set)

        result = []
        for node_id, data in heatmap.items():
            result.append({
                "node_id": node_id,
                "risk_level": data.get("risk_level", "low"),
                "risk_value": data.get("risk_value", 0.0),
                "name": data.get("name", node_id),
                "tier": data.get("tier", -1),
                "category": data.get("category", ""),
                "latitude": data.get("latitude"),
                "longitude": data.get("longitude")
            })

        return {"heatmap": result}

    def get_n_tier_risk(self, failed_nodes: List[str], max_tier: int = 5):
        failed_set = set(failed_nodes) if failed_nodes else set()
        tier_risk = self.cascade.calculate_n_tier_risk(failed_set, max_tier)

        result = []
        for tier, data in tier_risk.items():
            result.append({
                "tier": tier,
                **data
            })

        return {"tier_risk": result}

    def get_critical_paths(self, start_node: str, end_node: str):
        return self.cascade.identify_critical_paths(start_node, end_node)

    def get_high_risk_nodes(self, num_simulations: int = 50, threshold: float = 0.7):
        return self.monte_carlo.identify_high_risk_nodes(
            num_simulations=num_simulations,
            threshold=threshold
        )

    def get_critical_path_length(self, root_node: str = "OEM"):
        return self.cascade.find_critical_path_length(root_node)
