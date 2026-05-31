import json
import os
from typing import Dict, List, Set, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class SensorNode:
    device_id: str
    sensor_type: str
    node_id: str = ""
    
    def __post_init__(self):
        if not self.node_id:
            self.node_id = f"{self.device_id}_{self.sensor_type}"
    
    def __hash__(self):
        return hash(self.node_id)
    
    def __eq__(self, other):
        if isinstance(other, SensorNode):
            return self.node_id == other.node_id
        return False


@dataclass
class TopologyEdge:
    from_node: str
    to_node: str
    relationship: str = "connected"
    weight: float = 1.0
    description: str = ""


class DeviceTopologyManager:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self.nodes: Dict[str, SensorNode] = {}
        self.edges: List[TopologyEdge] = []
        self.adjacency_list: Dict[str, List[Tuple[str, float, str]]] = {}
        self._initialized = False
        
        self._initialize_default_topology()
    
    def _initialize_default_topology(self):
        default_relationships = [
            ("device_001_vibration", "device_001_temperature", "causes", 2.0, "振动导致温度升高"),
            ("device_001_temperature", "device_001_current", "influences", 1.5, "温度影响电流"),
            ("device_002_vibration", "device_002_temperature", "causes", 2.0, "振动导致温度升高"),
            ("device_002_pressure", "device_002_vibration", "influences", 1.8, "压力影响振动"),
            ("device_001_current", "device_002_voltage", "influences", 1.2, "电流影响电压"),
            ("device_003_vibration", "device_003_temperature", "causes", 2.0, "振动导致温度升高"),
            ("device_003_humidity", "device_003_temperature", "influences", 1.3, "湿度影响温度"),
        ]
        
        for from_node, to_node, rel, weight, desc in default_relationships:
            self._add_edge_internal(from_node, to_node, rel, weight, desc)
        
        self._initialized = True
    
    def _add_edge_internal(self, from_node: str, to_node: str, relationship: str, weight: float, description: str):
        edge = TopologyEdge(
            from_node=from_node,
            to_node=to_node,
            relationship=relationship,
            weight=weight,
            description=description
        )
        self.edges.append(edge)
        
        if from_node not in self.adjacency_list:
            self.adjacency_list[from_node] = []
        self.adjacency_list[from_node].append((to_node, weight, relationship))
    
    def add_device_sensor(self, device_id: str, sensor_type: str) -> SensorNode:
        node_id = f"{device_id}_{sensor_type}"
        if node_id not in self.nodes:
            node = SensorNode(device_id=device_id, sensor_type=sensor_type)
            self.nodes[node_id] = node
        return self.nodes[node_id]
    
    def add_relationship(
        self,
        from_device: str,
        from_sensor: str,
        to_device: str,
        to_sensor: str,
        relationship: str = "connected",
        weight: float = 1.0,
        description: str = "",
        bidirectional: bool = False
    ):
        from_node = f"{from_device}_{from_sensor}"
        to_node = f"{to_device}_{to_sensor}"
        
        self.add_device_sensor(from_device, from_sensor)
        self.add_device_sensor(to_device, to_sensor)
        
        self._add_edge_internal(from_node, to_node, relationship, weight, description)
        
        if bidirectional:
            reverse_rel = {
                "causes": "caused_by",
                "influences": "influenced_by",
                "connected": "connected"
            }.get(relationship, relationship)
            self._add_edge_internal(to_node, from_node, reverse_rel, weight, description)
    
    def get_neighbors(
        self,
        device_id: str,
        sensor_type: str,
        direction: str = "both"
    ) -> List[Tuple[str, str, float, str]]:
        node_id = f"{device_id}_{sensor_type}"
        neighbors = []
        
        if direction in ["out", "both"]:
            if node_id in self.adjacency_list:
                for to_node, weight, rel in self.adjacency_list[node_id]:
                    parts = to_node.split("_", 1)
                    neighbors.append((parts[0], parts[1] if len(parts) > 1 else "", weight, rel))
        
        if direction in ["in", "both"]:
            for from_node_id, edges in self.adjacency_list.items():
                for to_node, weight, rel in edges:
                    if to_node == node_id:
                        parts = from_node_id.split("_", 1)
                        neighbors.append((parts[0], parts[1] if len(parts) > 1 else "", weight, rel))
        
        return neighbors
    
    def find_path(
        self,
        from_device: str,
        from_sensor: str,
        to_device: str,
        to_sensor: str,
        max_depth: int = 3
    ) -> Optional[List[Tuple[str, str, str, float]]]:
        start = f"{from_device}_{from_sensor}"
        end = f"{to_device}_{to_sensor}"
        
        if start == end:
            return []
        
        visited = set()
        queue = [(start, [])]
        
        while queue:
            current, path = queue.pop(0)
            
            if len(path) > max_depth:
                continue
            
            if current in visited:
                continue
            visited.add(current)
            
            if current in self.adjacency_list:
                for to_node, weight, rel in self.adjacency_list[current]:
                    new_path = path + [(current, to_node, rel, weight)]
                    
                    if to_node == end:
                        result = []
                        for from_n, to_n, r, w in new_path:
                            from_parts = from_n.split("_", 1)
                            to_parts = to_n.split("_", 1)
                            result.append((
                                from_parts[0],
                                from_parts[1] if len(from_parts) > 1 else "",
                                r,
                                w
                            ))
                        return result
                    
                    queue.append((to_node, new_path))
        
        return None
    
    def find_all_related_nodes(
        self,
        device_id: str,
        sensor_type: str,
        max_depth: int = 3,
        min_weight: float = 1.0
    ) -> Dict[str, List[Dict]]:
        node_id = f"{device_id}_{sensor_type}"
        related = {"upstream": [], "downstream": []}
        
        visited = set()
        queue = [(node_id, 0, "", 0.0)]
        
        while queue:
            current, depth, direction, total_weight = queue.pop(0)
            
            if depth > max_depth:
                continue
            
            if current in visited:
                continue
            visited.add(current)
            
            if depth > 0:
                parts = current.split("_", 1)
                node_info = {
                    "device_id": parts[0],
                    "sensor_type": parts[1] if len(parts) > 1 else "",
                    "node_id": current,
                    "depth": depth,
                    "total_weight": total_weight,
                    "direction": direction
                }
                
                if direction == "downstream" and total_weight >= min_weight:
                    related["downstream"].append(node_info)
                elif direction == "upstream" and total_weight >= min_weight:
                    related["upstream"].append(node_info)
            
            if current in self.adjacency_list:
                for to_node, weight, rel in self.adjacency_list[current]:
                    if to_node not in visited:
                        queue.append((to_node, depth + 1, "downstream", total_weight + weight))
        
        visited_in = set()
        for from_node, edges in self.adjacency_list.items():
            for to_node, weight, rel in edges:
                if to_node == node_id and from_node not in visited_in:
                    queue_in = [(from_node, 1, weight)]
                    while queue_in:
                        current, depth, total_w = queue_in.pop(0)
                        if depth > max_depth or current in visited_in:
                            continue
                        visited_in.add(current)
                        
                        parts = current.split("_", 1)
                        related["upstream"].append({
                            "device_id": parts[0],
                            "sensor_type": parts[1] if len(parts) > 1 else "",
                            "node_id": current,
                            "depth": depth,
                            "total_weight": total_w,
                            "direction": "upstream"
                        })
                        
                        for f_node, e_list in self.adjacency_list.items():
                            for t_node, w, r in e_list:
                                if t_node == current and f_node not in visited_in:
                                    queue_in.append((f_node, depth + 1, total_w + w))
        
        return related
    
    def get_all_devices(self) -> Set[str]:
        devices = set()
        for node_id in self.nodes:
            parts = node_id.split("_", 1)
            devices.add(parts[0])
        return devices
    
    def get_topology_summary(self) -> Dict:
        return {
            "nodes_count": len(self.nodes),
            "edges_count": len(self.edges),
            "devices": list(self.get_all_devices()),
            "adjacency_list_keys": list(self.adjacency_list.keys())
        }
    
    def clear(self):
        self.nodes.clear()
        self.edges.clear()
        self.adjacency_list.clear()
        self._initialized = False
