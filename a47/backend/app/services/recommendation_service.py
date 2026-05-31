from typing import Dict, List, Any, Optional
from app.services.graph_service import get_graph_service
from app.recommendation import SupplierRecommender
import logging

logger = logging.getLogger(__name__)


def get_recommendation_service() -> 'RecommendationService':
    graph_service = get_graph_service()
    return RecommendationService(graph_service.graph)


class RecommendationService:
    def __init__(self, graph):
        self.graph = graph
        self.recommender = SupplierRecommender(graph)

    def find_alternatives(
        self,
        failed_supplier_id: str,
        weights: Optional[Dict[str, float]] = None,
        top_n: int = 10
    ):
        recommendations = self.recommender.find_alternative_suppliers(
            failed_supplier_id=failed_supplier_id,
            weights=weights,
            top_n=top_n
        )

        detailed = self.recommender.get_recommendation_details(recommendations)

        impact_analysis = self.recommender.analyze_supply_chain_impact(
            failed_supplier_id=failed_supplier_id,
            recommendations=recommendations
        )

        return {
            "failed_supplier": failed_supplier_id,
            "alternatives": detailed,
            "impact_analysis": impact_analysis
        }

    def analyze_impact(
        self,
        failed_supplier_id: str,
        alternatives: List[str]
    ):
        recommendations = []

        for alt_id in alternatives:
            if alt_id in self.graph.nodes:
                attrs = dict(self.graph.nodes[alt_id])
                recommendations.append({
                    "id": alt_id,
                    "name": attrs.get("name", alt_id),
                    "category": attrs.get("category", ""),
                    "tier": attrs.get("tier", -1),
                    "country": attrs.get("country", ""),
                    "weighted_score": 0.5,
                    "capacity_match": 0.5,
                    "distance_score": 0.5,
                    "quality_score": attrs.get("quality_score", 0.5),
                    "distance_km": 0,
                    "capacity": attrs.get("capacity", 0),
                    "historical_quality": attrs.get("quality_score", 0.5)
                })

        return {
            "failed_supplier": failed_supplier_id,
            "selected_alternatives": alternatives,
            "analysis": {
                "total_alternatives": len(alternatives),
                "avg_quality": sum(r["historical_quality"] for r in recommendations) / len(recommendations) if recommendations else 0,
                "avg_capacity": sum(r["capacity"] for r in recommendations) / len(recommendations) if recommendations else 0
            }
        }
