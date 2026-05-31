import networkx as nx
from typing import Dict, List, Any, Optional
from app.graph_analysis import SupplyChainGraph, CentralityAnalyzer
from app.models import (
    SupplierNode,
    SupplyEdge,
    GraphData,
    DashboardMetrics
)
import logging

logger = logging.getLogger(__name__)

_graph_instance: Optional[SupplyChainGraph] = None


def get_graph_service() -> 'GraphService':
    global _graph_instance
    if _graph_instance is None:
        _graph_instance = SupplyChainGraph()
        try:
            _graph_instance.load_from_neo4j()
        except Exception as e:
            logger.warning(f"Could not load from Neo4j: {e}. Using empty graph.")
    return GraphService(_graph_instance)


class GraphService:
    def __init__(self, graph: SupplyChainGraph):
        self.graph_builder = graph
        self.graph = graph.graph
        self.centrality = CentralityAnalyzer(self.graph)

    def get_full_graph(self, max_depth: int = 5) -> GraphData:
        try:
            self.graph_builder.load_from_neo4j(max_depth)
            self.graph = self.graph_builder.graph
            self.centrality = CentralityAnalyzer(self.graph)
        except Exception as e:
            logger.warning(f"Could not refresh graph from Neo4j: {e}")

        return self._convert_to_graph_data()

    def get_node(self, node_id: str) -> Optional[SupplierNode]:
        if node_id not in self.graph.nodes:
            return None

        attrs = dict(self.graph.nodes[node_id])
        return SupplierNode(
            id=node_id,
            name=attrs.get("name", node_id),
            tier=attrs.get("tier", -1),
            category=attrs.get("category", ""),
            latitude=attrs.get("latitude"),
            longitude=attrs.get("longitude"),
            capacity=attrs.get("capacity", 0.0),
            quality_score=attrs.get("quality_score", 0.5),
            risk_score=attrs.get("risk_score", 0.5),
            country=attrs.get("country", "")
        )

    def get_subgraph(self, node_id: str, direction: str = "downstream", depth: int = 2) -> Optional[GraphData]:
        if node_id not in self.graph.nodes:
            try:
                subgraph = self.graph_builder.load_subgraph(node_id, direction, depth)
            except Exception as e:
                logger.warning(f"Could not load subgraph from Neo4j: {e}")
                return None
        else:
            subgraph = self._extract_subgraph(node_id, direction, depth)

        if subgraph.number_of_nodes() == 0:
            return None

        return self._convert_subgraph_to_graph_data(subgraph)

    def _extract_subgraph(self, node_id: str, direction: str, depth: int) -> nx.DiGraph:
        subgraph = nx.DiGraph()
        visited = set()
        queue = [(node_id, 0)]
        visited.add(node_id)

        while queue:
            current, current_depth = queue.pop(0)

            if current_depth < depth:
                if direction == "downstream" or direction == "both":
                    for neighbor in self.graph.successors(current):
                        if neighbor not in visited:
                            visited.add(neighbor)
                            queue.append((neighbor, current_depth + 1))

                if direction == "upstream" or direction == "both":
                    for neighbor in self.graph.predecessors(current):
                        if neighbor not in visited:
                            visited.add(neighbor)
                            queue.append((neighbor, current_depth + 1))

        return self.graph.subgraph(visited).copy()

    def get_neighbors(self, node_id: str, direction: str = "all") -> List[SupplierNode]:
        neighbors = self.graph_builder.get_neighbors(node_id, direction)

        result = []
        for neighbor_id in neighbors:
            node = self.get_node(neighbor_id)
            if node:
                result.append(node)

        return result

    def get_node_centrality(self, node_id: str) -> Optional[Dict[str, float]]:
        if node_id not in self.graph.nodes:
            return None

        metrics = self.centrality.get_all_centrality_metrics()
        return metrics.get(node_id)

    def get_top_nodes(self, metric: str, top_n: int = 10) -> List[Dict[str, Any]]:
        return self.centrality.get_top_nodes(metric, top_n)

    def get_dashboard_metrics(self) -> DashboardMetrics:
        total_nodes = self.graph.number_of_nodes()
        total_edges = self.graph.number_of_edges()

        tiers = [attrs.get("tier", -1) for _, attrs in self.graph.nodes(data=True)]
        max_tier = max(tiers) if tiers else 0

        top_betweenness = self.centrality.get_top_nodes("betweenness", top_n=5)
        top_pagerank = self.centrality.get_top_nodes("pagerank", top_n=5)

        return DashboardMetrics(
            total_nodes=total_nodes,
            total_edges=total_edges,
            max_tier=max_tier,
            critical_path_length=0.0,
            top_betweenness_nodes=top_betweenness,
            top_pagerank_nodes=top_pagerank
        )

    def _convert_to_graph_data(self) -> GraphData:
        nodes = []
        for node_id, attrs in self.graph.nodes(data=True):
            nodes.append(SupplierNode(
                id=node_id,
                name=attrs.get("name", node_id),
                tier=attrs.get("tier", -1),
                category=attrs.get("category", ""),
                latitude=attrs.get("latitude"),
                longitude=attrs.get("longitude"),
                capacity=attrs.get("capacity", 0.0),
                quality_score=attrs.get("quality_score", 0.5),
                risk_score=attrs.get("risk_score", 0.5),
                country=attrs.get("country", "")
            ))

        edges = []
        for source, target, attrs in self.graph.edges(data=True):
            edges.append(SupplyEdge(
                source=source,
                target=target,
                volume=attrs.get("volume", 1.0),
                lead_time=attrs.get("lead_time", 1.0),
                dependency_ratio=attrs.get("dependency_ratio", 0.5)
            ))

        return GraphData(nodes=nodes, edges=edges)

    def _convert_subgraph_to_graph_data(self, subgraph: nx.DiGraph) -> GraphData:
        nodes = []
        for node_id, attrs in subgraph.nodes(data=True):
            nodes.append(SupplierNode(
                id=node_id,
                name=attrs.get("name", node_id),
                tier=attrs.get("tier", -1),
                category=attrs.get("category", ""),
                latitude=attrs.get("latitude"),
                longitude=attrs.get("longitude"),
                capacity=attrs.get("capacity", 0.0),
                quality_score=attrs.get("quality_score", 0.5),
                risk_score=attrs.get("risk_score", 0.5),
                country=attrs.get("country", "")
            ))

        edges = []
        for source, target, attrs in subgraph.edges(data=True):
            edges.append(SupplyEdge(
                source=source,
                target=target,
                volume=attrs.get("volume", 1.0),
                lead_time=attrs.get("lead_time", 1.0),
                dependency_ratio=attrs.get("dependency_ratio", 0.5)
            ))

        return GraphData(nodes=nodes, edges=edges)
