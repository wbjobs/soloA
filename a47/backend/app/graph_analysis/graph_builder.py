import networkx as nx
from typing import Dict, List, Any, Optional
from app.database import Neo4jClient
import logging

logger = logging.getLogger(__name__)


class SupplyChainGraph:
    def __init__(self):
        self.graph: nx.DiGraph = nx.DiGraph()

    def load_from_neo4j(self, max_depth: int = 5) -> None:
        query = """
        MATCH path = (root:Supplier {tier: 0})-[:SUPPLIES*1..$max_depth]->(supplier:Supplier)
        UNWIND nodes(path) AS n
        UNWIND relationships(path) AS r
        WITH DISTINCT n, r
        RETURN 
            collect(DISTINCT {
                id: n.id,
                name: n.name,
                tier: n.tier,
                category: n.category,
                latitude: n.latitude,
                longitude: n.longitude,
                capacity: n.capacity,
                quality_score: n.quality_score,
                risk_score: n.risk_score,
                country: n.country
            }) AS nodes,
            collect(DISTINCT {
                source: startNode(r).id,
                target: endNode(r).id,
                volume: r.volume,
                lead_time: r.lead_time,
                dependency_ratio: r.dependency_ratio
            }) AS edges
        """

        result = Neo4jClient.run_query(query, {"max_depth": max_depth})
        if not result:
            logger.warning("No data found in Neo4j")
            return

        data = result[0]
        self._build_graph(data.get("nodes", []), data.get("edges", []))
        logger.info(f"Loaded graph with {self.graph.number_of_nodes()} nodes and {self.graph.number_of_edges()} edges")

    def load_subgraph(self, node_id: str, direction: str = "downstream", depth: int = 2) -> nx.DiGraph:
        if direction == "downstream":
            query = """
            MATCH path = (start:Supplier {id: $node_id})-[:SUPPLIES*1..$depth]->(supplier:Supplier)
            UNWIND nodes(path) AS n
            UNWIND relationships(path) AS r
            WITH DISTINCT n, r
            RETURN 
                collect(DISTINCT {
                    id: n.id,
                    name: n.name,
                    tier: n.tier,
                    category: n.category,
                    latitude: n.latitude,
                    longitude: n.longitude,
                    capacity: n.capacity,
                    quality_score: n.quality_score,
                    risk_score: n.risk_score,
                    country: n.country
                }) AS nodes,
                collect(DISTINCT {
                    source: startNode(r).id,
                    target: endNode(r).id,
                    volume: r.volume,
                    lead_time: r.lead_time,
                    dependency_ratio: r.dependency_ratio
                }) AS edges
            """
        else:
            query = """
            MATCH path = (start:Supplier {id: $node_id})<-[:SUPPLIES*1..$depth]-(supplier:Supplier)
            UNWIND nodes(path) AS n
            UNWIND relationships(path) AS r
            WITH DISTINCT n, r
            RETURN 
                collect(DISTINCT {
                    id: n.id,
                    name: n.name,
                    tier: n.tier,
                    category: n.category,
                    latitude: n.latitude,
                    longitude: n.longitude,
                    capacity: n.capacity,
                    quality_score: n.quality_score,
                    risk_score: n.risk_score,
                    country: n.country
                }) AS nodes,
                collect(DISTINCT {
                    source: startNode(r).id,
                    target: endNode(r).id,
                    volume: r.volume,
                    lead_time: r.lead_time,
                    dependency_ratio: r.dependency_ratio
                }) AS edges
            """

        result = Neo4jClient.run_query(query, {"node_id": node_id, "depth": depth})
        if not result:
            return nx.DiGraph()

        data = result[0]
        subgraph = nx.DiGraph()
        self._add_nodes_to_graph(subgraph, data.get("nodes", []))
        self._add_edges_to_graph(subgraph, data.get("edges", []))
        return subgraph

    def _build_graph(self, nodes: List[Dict], edges: List[Dict]) -> None:
        self.graph = nx.DiGraph()
        self._add_nodes_to_graph(self.graph, nodes)
        self._add_edges_to_graph(self.graph, edges)

    def _add_nodes_to_graph(self, graph: nx.DiGraph, nodes: List[Dict]) -> None:
        for node_data in nodes:
            if node_data and "id" in node_data:
                graph.add_node(
                    node_data["id"],
                    **{k: v for k, v in node_data.items() if k != "id"}
                )

    def _add_edges_to_graph(self, graph: nx.DiGraph, edges: List[Dict]) -> None:
        for edge_data in edges:
            if edge_data and "source" in edge_data and "target" in edge_data:
                source = edge_data["source"]
                target = edge_data["target"]
                graph.add_edge(
                    source,
                    target,
                    **{k: v for k, v in edge_data.items() if k not in ["source", "target"]}
                )

    def get_graph_data(self) -> Dict:
        nodes = []
        for node_id, attrs in self.graph.nodes(data=True):
            nodes.append({
                "id": node_id,
                **attrs
            })

        edges = []
        for source, target, attrs in self.graph.edges(data=True):
            edges.append({
                "source": source,
                "target": target,
                **attrs
            })

        return {"nodes": nodes, "edges": edges}

    def get_node(self, node_id: str) -> Optional[Dict]:
        if node_id in self.graph.nodes:
            return {"id": node_id, **self.graph.nodes[node_id]}
        return None

    def get_neighbors(self, node_id: str, direction: str = "all") -> List[str]:
        if node_id not in self.graph.nodes:
            return []
        if direction == "upstream":
            return list(self.graph.predecessors(node_id))
        elif direction == "downstream":
            return list(self.graph.successors(node_id))
        return list(self.graph.neighbors(node_id))
