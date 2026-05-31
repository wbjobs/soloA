import networkx as nx
import numpy as np
from typing import Dict, List, Any, Set, Tuple, Optional
import logging
from dataclasses import dataclass
import sys

logger = logging.getLogger(__name__)

MAX_PATH_LENGTH = 50
MAX_VISITS_PER_NODE = 3


@dataclass
class CascadeResult:
    failed_nodes: Set[str]
    propagation_path: List[List[str]]
    propagation_depth: int
    affected_edges: List[Tuple[str, str]]
    total_impact: float
    cycle_detected: bool = False
    cycles_found: List[List[str]] = None


class CascadeFailureSimulator:
    def __init__(self, graph: nx.DiGraph):
        self.graph = graph
        self._cycles = self._detect_cycles()
        self._has_cycle = len(self._cycles) > 0

        if self._has_cycle:
            logger.warning(
                f"Detected {len(self._cycles)} cycles in the supply chain graph. "
                f"Will use cycle-safe algorithms for path calculations."
            )

    def _detect_cycles(self) -> List[List[str]]:
        """检测图中的所有简单循环"""
        cycles = []
        try:
            cycles = list(nx.simple_cycles(self.graph))
            if cycles:
                logger.info(f"Found {len(cycles)} cycles in graph")
        except Exception as e:
            logger.warning(f"Error detecting cycles: {e}")
        return cycles

    def _safe_has_path(self, source: str, target: str, max_depth: int = MAX_PATH_LENGTH) -> bool:
        """安全的路径检测，避免循环导致的无限搜索"""
        if source == target:
            return True

        visited = {}
        queue = [(source, 0)]
        visited[source] = 0

        while queue:
            current, depth = queue.pop(0)

            if depth > max_depth:
                continue

            for neighbor in self.graph.successors(current):
                if neighbor == target:
                    return True

                if neighbor not in visited:
                    visited[neighbor] = depth + 1
                    queue.append((neighbor, depth + 1))

        return False

    def _safe_shortest_path_length(
        self,
        source: str,
        target: str,
        max_depth: int = MAX_PATH_LENGTH
    ) -> Optional[int]:
        """安全的最短路径长度计算，使用 BFS 避免循环问题"""
        if source == target:
            return 0

        visited = {}
        queue = [(source, 0)]
        visited[source] = 0

        while queue:
            current, depth = queue.pop(0)

            if depth > max_depth:
                continue

            for neighbor in self.graph.successors(current):
                if neighbor == target:
                    return depth + 1

                if neighbor not in visited:
                    visited[neighbor] = depth + 1
                    queue.append((neighbor, depth + 1))

        return None

    def _safe_shortest_path_length_weighted(
        self,
        source: str,
        target: str,
        weight: str = "lead_time",
        max_iterations: int = 1000
    ) -> Optional[float]:
        """安全的加权最短路径长度计算，使用修改的 Dijkstra 避免负权循环"""
        if source == target:
            return 0

        distances = {source: 0}
        visited = set()
        iterations = 0

        while iterations < max_iterations:
            min_node = None
            min_dist = float('inf')

            for node, dist in distances.items():
                if node not in visited and dist < min_dist:
                    min_dist = dist
                    min_node = node

            if min_node is None or min_dist == float('inf'):
                break

            if min_node == target:
                return min_dist

            visited.add(min_node)

            for neighbor in self.graph.successors(min_node):
                edge_data = self.graph.edges.get((min_node, neighbor), {})
                edge_weight = edge_data.get(weight, 1)

                if edge_weight < 0:
                    edge_weight = abs(edge_weight)

                new_dist = min_dist + edge_weight

                if neighbor not in distances or new_dist < distances[neighbor]:
                    if neighbor in visited:
                        if new_dist >= distances[neighbor]:
                            continue

                    distances[neighbor] = new_dist

            iterations += 1

        return None

    def simulate_cascade(
        self,
        initial_failure_nodes: List[str],
        failure_threshold: float = 0.5,
        dependency_threshold: float = 0.3,
        max_iterations: int = 100
    ) -> CascadeResult:
        valid_initial_nodes = [n for n in initial_failure_nodes if n in self.graph.nodes]

        if not valid_initial_nodes:
            return CascadeResult(
                failed_nodes=set(),
                propagation_path=[],
                propagation_depth=0,
                affected_edges=[],
                total_impact=0.0,
                cycle_detected=self._has_cycle,
                cycles_found=self._cycles if self._has_cycle else []
            )

        failed_nodes = set(valid_initial_nodes)
        propagation_path = [list(valid_initial_nodes)]
        affected_edges = []
        current_depth = 0
        previously_failed = set(failed_nodes)

        for iteration in range(max_iterations):
            new_failures = set()

            for node in self.graph.nodes:
                if node in failed_nodes:
                    continue

                upstream_dependencies = list(self.graph.predecessors(node))
                failed_upstream = [n for n in upstream_dependencies if n in failed_nodes]

                if not failed_upstream:
                    continue

                total_dependency = sum(
                    self.graph.edges.get((pred, node), {}).get("dependency_ratio", 0)
                    for pred in upstream_dependencies
                )

                failed_dependency = sum(
                    self.graph.edges.get((pred, node), {}).get("dependency_ratio", 0)
                    for pred in failed_upstream
                )

                if total_dependency > 0:
                    dependency_ratio = failed_dependency / total_dependency
                    if dependency_ratio >= dependency_threshold:
                        new_failures.add(node)

            if not new_failures:
                break

            truly_new = new_failures - previously_failed
            if not truly_new:
                logger.warning("No new failures added, stopping to prevent infinite loop")
                break

            for node in truly_new:
                for pred in self.graph.predecessors(node):
                    if pred in failed_nodes:
                        affected_edges.append((pred, node))

            previously_failed.update(failed_nodes)
            failed_nodes.update(truly_new)
            propagation_path.append(list(truly_new))
            current_depth = iteration + 1

        total_impact = self._calculate_total_impact(failed_nodes)

        return CascadeResult(
            failed_nodes=failed_nodes,
            propagation_path=propagation_path,
            propagation_depth=current_depth,
            affected_edges=affected_edges,
            total_impact=total_impact,
            cycle_detected=self._has_cycle,
            cycles_found=self._cycles if self._has_cycle else []
        )

    def _calculate_total_impact(self, failed_nodes: Set[str]) -> float:
        total_capacity_lost = 0
        total_nodes = self.graph.number_of_nodes()

        for node in failed_nodes:
            attrs = self.graph.nodes.get(node, {})
            capacity = attrs.get("capacity", 0)
            risk_score = attrs.get("risk_score", 0.5)
            total_capacity_lost += capacity * (1 + risk_score)

        if total_nodes > 0:
            return (len(failed_nodes) / total_nodes) * 100

        return 0

    def identify_critical_paths(
        self,
        start_node: str,
        end_node: str,
        max_paths: int = 5
    ) -> List[List[str]]:
        """找出关键路径，使用安全的 BFS 方法避免循环问题"""
        if start_node == end_node:
            return [[start_node]]

        if start_node not in self.graph.nodes or end_node not in self.graph.nodes:
            return []

        if not self._safe_has_path(start_node, end_node):
            logger.warning(f"No path found between {start_node} and {end_node}")
            return []

        try:
            if self._has_cycle:
                return self._find_shortest_path_safe(start_node, end_node, max_paths)
            else:
                all_paths = list(nx.all_shortest_paths(
                    self.graph,
                    source=start_node,
                    target=end_node,
                    weight="lead_time"
                ))
                return all_paths[:max_paths]
        except nx.NetworkXNoPath:
            logger.warning(f"No path found between {start_node} and {end_node}")
            return []
        except Exception as e:
            logger.warning(f"Error finding paths, using safe method: {e}")
            return self._find_shortest_path_safe(start_node, end_node, max_paths)

    def _find_shortest_path_safe(
        self,
        start: str,
        end: str,
        max_paths: int = 5
    ) -> List[List[str]]:
        """安全的最短路径查找，使用修改的 BFS 避免循环"""
        from collections import deque

        queue = deque()
        queue.append((start, [start], 0))
        visited = {}
        paths = []
        min_length = None

        while queue:
            current, path, length = queue.popleft()

            if min_length is not None and length > min_length:
                break

            if current == end:
                paths.append(path)
                if min_length is None:
                    min_length = length
                if len(paths) >= max_paths:
                    break
                continue

            if current in visited and visited[current] < length:
                continue
            visited[current] = length

            for neighbor in self.graph.successors(current):
                edge_data = self.graph.edges.get((current, neighbor), {})
                lead_time = edge_data.get("lead_time", 1)

                if lead_time < 0:
                    lead_time = abs(lead_time)

                new_length = length + lead_time

                if neighbor not in visited or visited[neighbor] > new_length:
                    queue.append((neighbor, path + [neighbor], new_length))

        return paths

    def get_risk_heatmap(self, failed_nodes: Set[str]) -> Dict[str, Dict]:
        heatmap = {}

        for node in self.graph.nodes:
            attrs = dict(self.graph.nodes.get(node, {}))

            if node in failed_nodes:
                risk_level = "critical"
                risk_value = 1.0
            else:
                upstream_failures = sum(
                    1 for pred in self.graph.predecessors(node)
                    if pred in failed_nodes
                )
                total_upstream = len(list(self.graph.predecessors(node)))

                if total_upstream > 0:
                    risk_ratio = upstream_failures / total_upstream
                    if risk_ratio >= 0.7:
                        risk_level = "high"
                        risk_value = 0.7
                    elif risk_ratio >= 0.4:
                        risk_level = "medium"
                        risk_value = 0.4
                    else:
                        risk_level = "low"
                        risk_value = 0.1
                else:
                    risk_level = "low"
                    risk_value = 0.1

            heatmap[node] = {
                "risk_level": risk_level,
                "risk_value": risk_value,
                **attrs
            }

        return heatmap

    def calculate_n_tier_risk(
        self,
        failed_nodes: Set[str],
        max_tier: int = 5
    ) -> Dict[int, Dict]:
        tier_risk = {}

        for tier in range(max_tier + 1):
            tier_nodes = [
                node for node, attrs in self.graph.nodes(data=True)
                if attrs.get("tier", -1) == tier
            ]

            if not tier_nodes:
                continue

            failed_in_tier = [n for n in tier_nodes if n in failed_nodes]

            total_exposure = 0
            for node in tier_nodes:
                exposure = self._calculate_node_exposure(node, failed_nodes)
                total_exposure += exposure

            tier_risk[tier] = {
                "total_nodes": len(tier_nodes),
                "failed_nodes": len(failed_in_tier),
                "failure_ratio": len(failed_in_tier) / len(tier_nodes) if tier_nodes else 0,
                "risk_exposure": total_exposure / len(tier_nodes) if tier_nodes else 0
            }

        return tier_risk

    def _calculate_node_exposure(self, node: str, failed_nodes: Set[str]) -> float:
        if node in failed_nodes:
            return 1.0

        if not failed_nodes:
            return 0.0

        min_distance = None

        for failed in failed_nodes:
            try:
                if self._has_cycle:
                    distance = self._safe_shortest_path_length_weighted(
                        failed, node, weight="lead_time"
                    )
                else:
                    if nx.has_path(self.graph, failed, node):
                        distance = nx.shortest_path_length(
                            self.graph,
                            source=failed,
                            target=node,
                            weight="lead_time"
                        )
                    else:
                        distance = None

                if distance is not None and (min_distance is None or distance < min_distance):
                    min_distance = distance

            except Exception as e:
                logger.debug(f"Error calculating distance from {failed} to {node}: {e}")
                continue

        if min_distance is None:
            return 0.0

        return 1.0 / (1 + min_distance)

    def find_critical_path_length(self, root_node: str = "OEM") -> float:
        if root_node not in self.graph.nodes:
            return 0

        max_length = 0

        if self._has_cycle:
            for node in self.graph.nodes:
                if node == root_node:
                    continue
                try:
                    path_length = self._safe_shortest_path_length_weighted(
                        root_node,
                        node,
                        weight="lead_time"
                    )
                    if path_length is not None:
                        max_length = max(max_length, path_length)
                except Exception as e:
                    logger.debug(f"Error calculating path length to {node}: {e}")
                    continue
        else:
            for node in self.graph.nodes:
                if node == root_node:
                    continue
                try:
                    path_length = nx.shortest_path_length(
                        self.graph,
                        source=root_node,
                        target=node,
                        weight="lead_time"
                    )
                    max_length = max(max_length, path_length)
                except nx.NetworkXNoPath:
                    continue
                except Exception as e:
                    logger.debug(f"Error calculating path length to {node}: {e}")
                    continue

        return max_length
