import networkx as nx
from typing import Dict, Any, List
from app.graph_analysis.graph_builder import SupplyChainGraph
import logging

logger = logging.getLogger(__name__)


class CentralityAnalyzer:
    def __init__(self, graph: nx.DiGraph):
        self.graph = graph

    def calculate_betweenness_centrality(self, normalized: bool = True) -> Dict[str, float]:
        try:
            return nx.betweenness_centrality(
                self.graph,
                normalized=normalized,
                weight="volume"
            )
        except Exception as e:
            logger.error(f"Error calculating betweenness centrality: {e}")
            return {}

    def calculate_pagerank(self, alpha: float = 0.85) -> Dict[str, float]:
        try:
            return nx.pagerank(
                self.graph,
                alpha=alpha,
                weight="volume"
            )
        except Exception as e:
            logger.error(f"Error calculating PageRank: {e}")
            return {}

    def calculate_degree_centrality(self) -> Dict[str, float]:
        try:
            return {
                "in_degree": nx.in_degree_centrality(self.graph),
                "out_degree": nx.out_degree_centrality(self.graph),
                "total_degree": nx.degree_centrality(self.graph)
            }
        except Exception as e:
            logger.error(f"Error calculating degree centrality: {e}")
            return {"in_degree": {}, "out_degree": {}, "total_degree": {}}

    def calculate_closeness_centrality(self) -> Dict[str, float]:
        try:
            return nx.closeness_centrality(self.graph)
        except Exception as e:
            logger.error(f"Error calculating closeness centrality: {e}")
            return {}

    def get_all_centrality_metrics(self) -> Dict[str, Any]:
        betweenness = self.calculate_betweenness_centrality()
        pagerank = self.calculate_pagerank()
        degree = self.calculate_degree_centrality()
        closeness = self.calculate_closeness_centrality()

        all_nodes = set(betweenness.keys()) | set(pagerank.keys()) | set(degree["in_degree"].keys()) | set(closeness.keys())

        result = {}
        for node_id in all_nodes:
            result[node_id] = {
                "betweenness": betweenness.get(node_id, 0),
                "pagerank": pagerank.get(node_id, 0),
                "in_degree": degree["in_degree"].get(node_id, 0),
                "out_degree": degree["out_degree"].get(node_id, 0),
                "total_degree": degree["total_degree"].get(node_id, 0),
                "closeness": closeness.get(node_id, 0)
            }

        return result

    def get_top_nodes(self, metric: str, top_n: int = 10) -> List[Dict[str, Any]]:
        metrics = self.get_all_centrality_metrics()

        if metric not in ["betweenness", "pagerank", "in_degree", "out_degree", "total_degree", "closeness"]:
            raise ValueError(f"Unknown metric: {metric}")

        sorted_nodes = sorted(
            [(node_id, data[metric]) for node_id, data in metrics.items()],
            key=lambda x: x[1],
            reverse=True
        )

        top_nodes = []
        for node_id, value in sorted_nodes[:top_n]:
            node_attrs = dict(self.graph.nodes[node_id]) if node_id in self.graph.nodes else {}
            top_nodes.append({
                "id": node_id,
                "name": node_attrs.get("name", node_id),
                "tier": node_attrs.get("tier", -1),
                "category": node_attrs.get("category", ""),
                "value": value
            })

        return top_nodes
