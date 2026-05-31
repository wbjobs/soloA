import networkx as nx
from typing import Dict, List, Any, Tuple, Optional
from geopy.distance import geodesic
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class SupplierRecommendation:
    id: str
    name: str
    category: str
    tier: int
    country: str
    weighted_score: float
    capacity_match: float
    distance_score: float
    quality_score: float
    distance_km: float
    capacity: float
    historical_quality: float


class SupplierRecommender:
    def __init__(self, graph: nx.DiGraph):
        self.graph = graph

    def find_alternative_suppliers(
        self,
        failed_supplier_id: str,
        weights: Dict[str, float] = None,
        top_n: int = 10
    ) -> List[SupplierRecommendation]:
        default_weights = {
            "capacity": 0.35,
            "distance": 0.25,
            "quality": 0.40
        }
        weights = weights or default_weights

        total_weight = sum(weights.values())
        if total_weight > 0:
            weights = {k: v / total_weight for k, v in weights.items()}

        failed_supplier = self._get_supplier_data(failed_supplier_id)
        if not failed_supplier:
            logger.warning(f"Failed supplier {failed_supplier_id} not found")
            return []

        target_category = failed_supplier.get("category")
        target_capacity = failed_supplier.get("capacity", 0)
        target_location = (
            failed_supplier.get("latitude"),
            failed_supplier.get("longitude")
        )

        current_suppliers = self._get_current_suppliers(failed_supplier_id)

        candidates = self._find_candidate_suppliers(target_category, failed_supplier_id)

        recommendations = []
        for candidate_id in candidates:
            if candidate_id in current_suppliers:
                continue

            candidate_data = self._get_supplier_data(candidate_id)
            if not candidate_data:
                continue

            capacity_match = self._calculate_capacity_match(
                candidate_data.get("capacity", 0),
                target_capacity
            )

            distance_score, distance_km = self._calculate_distance_score(
                candidate_data.get("latitude"),
                candidate_data.get("longitude"),
                target_location
            )

            quality_score = candidate_data.get("quality_score", 0.5)

            weighted_score = (
                capacity_match * weights.get("capacity", 0.35) +
                distance_score * weights.get("distance", 0.25) +
                quality_score * weights.get("quality", 0.40)
            )

            recommendations.append(SupplierRecommendation(
                id=candidate_id,
                name=candidate_data.get("name", candidate_id),
                category=candidate_data.get("category", ""),
                tier=candidate_data.get("tier", -1),
                country=candidate_data.get("country", ""),
                weighted_score=weighted_score,
                capacity_match=capacity_match,
                distance_score=distance_score,
                quality_score=quality_score,
                distance_km=distance_km,
                capacity=candidate_data.get("capacity", 0),
                historical_quality=quality_score
            ))

        recommendations.sort(key=lambda x: x.weighted_score, reverse=True)
        return recommendations[:top_n]

    def _get_supplier_data(self, supplier_id: str) -> Optional[Dict[str, Any]]:
        if supplier_id in self.graph.nodes:
            return dict(self.graph.nodes[supplier_id])
        return None

    def _get_current_suppliers(self, failed_supplier_id: str) -> set:
        current_suppliers = set()

        for buyer in self.graph.predecessors(failed_supplier_id):
            for other_supplier in self.graph.predecessors(buyer):
                if other_supplier != failed_supplier_id:
                    current_suppliers.add(other_supplier)

        return current_suppliers

    def _find_candidate_suppliers(
        self,
        target_category: str,
        exclude_supplier_id: str
    ) -> List[str]:
        candidates = []

        for node_id, attrs in self.graph.nodes(data=True):
            if node_id == exclude_supplier_id:
                continue
            if attrs.get("category") == target_category:
                candidates.append(node_id)

        if not candidates:
            for node_id in self.graph.nodes:
                if node_id != exclude_supplier_id:
                    candidates.append(node_id)

        return candidates

    def _calculate_capacity_match(
        self,
        candidate_capacity: float,
        target_capacity: float
    ) -> float:
        if target_capacity <= 0:
            return 0.5

        if candidate_capacity <= 0:
            return 0.0

        ratio = candidate_capacity / target_capacity

        if ratio >= 1.0:
            return min(1.0, 0.8 + 0.2 * (1.0 / ratio))
        else:
            return ratio

    def _calculate_distance_score(
        self,
        candidate_lat: Optional[float],
        candidate_lon: Optional[float],
        target_location: Tuple[Optional[float], Optional[float]]
    ) -> Tuple[float, float]:
        target_lat, target_lon = target_location

        if None in [candidate_lat, candidate_lon, target_lat, target_lon]:
            return 0.5, 0.0

        try:
            distance_km = geodesic(
                (target_lat, target_lon),
                (candidate_lat, candidate_lon)
            ).kilometers
        except Exception:
            return 0.5, 0.0

        max_reference_distance = 20000.0
        normalized_distance = min(distance_km / max_reference_distance, 1.0)
        distance_score = 1.0 - normalized_distance

        return distance_score, distance_km

    def get_recommendation_details(
        self,
        recommendations: List[SupplierRecommendation]
    ) -> List[Dict[str, Any]]:
        return [
            {
                "id": rec.id,
                "name": rec.name,
                "category": rec.category,
                "tier": rec.tier,
                "country": rec.country,
                "weighted_score": rec.weighted_score,
                "scores": {
                    "capacity_match": rec.capacity_match,
                    "distance_score": rec.distance_score,
                    "quality_score": rec.quality_score
                },
                "distance_km": rec.distance_km,
                "capacity": rec.capacity,
                "historical_quality": rec.historical_quality
            }
            for rec in recommendations
        ]

    def analyze_supply_chain_impact(
        self,
        failed_supplier_id: str,
        recommendations: List[SupplierRecommendation]
    ) -> Dict[str, Any]:
        if not recommendations:
            return {
                "risk_mitigation_potential": 0,
                "replacement_options": 0,
                "best_option": None
            }

        best_option = recommendations[0]

        return {
            "risk_mitigation_potential": best_option.weighted_score * 100,
            "replacement_options": len(recommendations),
            "best_option": {
                "id": best_option.id,
                "name": best_option.name,
                "score": best_option.weighted_score
            },
            "avg_scores": {
                "capacity": sum(r.capacity_match for r in recommendations) / len(recommendations),
                "distance": sum(r.distance_score for r in recommendations) / len(recommendations),
                "quality": sum(r.quality_score for r in recommendations) / len(recommendations)
            }
        }
