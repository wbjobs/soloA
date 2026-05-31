import networkx as nx
import numpy as np
from typing import Dict, List, Any, Set
import logging
from dataclasses import dataclass, field
from .cascade_failure import CascadeFailureSimulator

logger = logging.getLogger(__name__)


@dataclass
class MonteCarloResult:
    failure_probability: Dict[str, float]
    expected_impact: float
    risk_distribution: Dict[str, float]
    simulation_count: int
    confidence_interval: Dict[str, float] = field(default_factory=dict)


class MonteCarloSimulator:
    def __init__(self, graph: nx.DiGraph):
        self.graph = graph
        self.cascade_simulator = CascadeFailureSimulator(graph)

    def run_monte_carlo(
        self,
        num_simulations: int = 1000,
        base_failure_probability: float = 0.05,
        risk_factor_weight: float = 0.5,
        dependency_threshold: float = 0.3
    ) -> MonteCarloResult:
        node_failure_counts: Dict[str, int] = {node: 0 for node in self.graph.nodes}
        impact_distribution: List[float] = []

        for simulation in range(num_simulations):
            initial_failures = self._generate_initial_failures(
                base_failure_probability,
                risk_factor_weight
            )

            if not initial_failures:
                continue

            cascade_result = self.cascade_simulator.simulate_cascade(
                initial_failures,
                dependency_threshold=dependency_threshold
            )

            for node in cascade_result.failed_nodes:
                if node in node_failure_counts:
                    node_failure_counts[node] += 1

            impact_distribution.append(cascade_result.total_impact)

        failure_probability = {
            node: count / num_simulations
            for node, count in node_failure_counts.items()
        }

        expected_impact = np.mean(impact_distribution) if impact_distribution else 0

        risk_distribution = self._calculate_risk_distribution(failure_probability)

        confidence_interval = {}
        if len(impact_distribution) > 1:
            mean = np.mean(impact_distribution)
            std = np.std(impact_distribution)
            confidence_interval = {
                "mean": mean,
                "std": std,
                "lower_95": mean - 1.96 * std / np.sqrt(num_simulations),
                "upper_95": mean + 1.96 * std / np.sqrt(num_simulations)
            }

        return MonteCarloResult(
            failure_probability=failure_probability,
            expected_impact=expected_impact,
            risk_distribution=risk_distribution,
            simulation_count=num_simulations,
            confidence_interval=confidence_interval
        )

    def _generate_initial_failures(
        self,
        base_probability: float,
        risk_weight: float
    ) -> List[str]:
        failures = []

        for node in self.graph.nodes:
            attrs = self.graph.nodes.get(node, {})
            risk_score = attrs.get("risk_score", 0.5)

            adjusted_prob = base_probability * (1 + risk_weight * (risk_score - 0.5) * 2)

            if np.random.random() < adjusted_prob:
                failures.append(node)

        return failures

    def _calculate_risk_distribution(
        self,
        failure_probability: Dict[str, float]
    ) -> Dict[str, float]:
        tiers = {}
        for node, prob in failure_probability.items():
            attrs = self.graph.nodes.get(node, {})
            tier = attrs.get("tier", -1)
            if tier not in tiers:
                tiers[tier] = []
            tiers[tier].append(prob)

        return {
            str(tier): np.mean(probs) if probs else 0
            for tier, probs in tiers.items()
        }

    def run_targeted_simulation(
        self,
        target_node: str,
        num_simulations: int = 100,
        failure_probability: float = 1.0,
        dependency_threshold: float = 0.3
    ) -> Dict[str, Any]:
        if target_node not in self.graph.nodes:
            raise ValueError(f"Target node {target_node} not found in graph")

        results = []
        all_failed_nodes: Set[str] = set()

        for simulation in range(num_simulations):
            if np.random.random() < failure_probability:
                cascade_result = self.cascade_simulator.simulate_cascade(
                    [target_node],
                    dependency_threshold=dependency_threshold
                )
                results.append({
                    "simulation": simulation,
                    "failed_count": len(cascade_result.failed_nodes),
                    "propagation_depth": cascade_result.propagation_depth,
                    "total_impact": cascade_result.total_impact
                })
                all_failed_nodes.update(cascade_result.failed_nodes)

        if not results:
            return {
                "target_node": target_node,
                "probability_of_spread": 0,
                "expected_failed_nodes": 0,
                "expected_impact": 0,
                "affected_nodes": []
            }

        avg_failed = np.mean([r["failed_count"] for r in results])
        avg_impact = np.mean([r["total_impact"] for r in results])

        return {
            "target_node": target_node,
            "probability_of_spread": len(results) / num_simulations,
            "expected_failed_nodes": avg_failed,
            "expected_impact": avg_impact,
            "affected_nodes": list(all_failed_nodes),
            "simulation_details": results
        }

    def identify_high_risk_nodes(
        self,
        num_simulations: int = 100,
        threshold: float = 0.7
    ) -> List[Dict[str, Any]]:
        high_risk_nodes = []

        for node in self.graph.nodes:
            result = self.run_targeted_simulation(
                target_node=node,
                num_simulations=num_simulations,
                failure_probability=1.0
            )

            if result["probability_of_spread"] >= threshold:
                attrs = dict(self.graph.nodes.get(node, {}))
                high_risk_nodes.append({
                    "id": node,
                    "name": attrs.get("name", node),
                    "tier": attrs.get("tier", -1),
                    "category": attrs.get("category", ""),
                    "spread_probability": result["probability_of_spread"],
                    "expected_failed_nodes": result["expected_failed_nodes"],
                    "expected_impact": result["expected_impact"]
                })

        high_risk_nodes.sort(key=lambda x: x["expected_impact"], reverse=True)
        return high_risk_nodes
