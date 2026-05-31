from typing import Dict, List, Any
from app.models import (
    GraphData,
    SupplierNode,
    SupplyEdge,
    DashboardMetrics
)


def get_sample_graph_data() -> GraphData:
    suppliers = [
        {"id": "OEM", "name": "Main Automaker", "tier": 0, "category": "Automotive OEM", "country": "Germany",
         "latitude": 48.7758, "longitude": 9.1829, "capacity": 500000, "quality_score": 0.95, "risk_score": 0.1},

        {"id": "Tier1_A", "name": "Auto Systems GmbH", "tier": 1, "category": "Integrated Systems", "country": "Germany",
         "latitude": 48.1351, "longitude": 11.5820, "capacity": 300000, "quality_score": 0.92, "risk_score": 0.15},
        {"id": "Tier1_B", "name": "Drive Tech AG", "tier": 1, "category": "Drivetrain", "country": "Germany",
         "latitude": 50.1109, "longitude": 8.6821, "capacity": 250000, "quality_score": 0.90, "risk_score": 0.18},
        {"id": "Tier1_C", "name": "Electronics Plus", "tier": 1, "category": "Electronics", "country": "France",
         "latitude": 48.8566, "longitude": 2.3522, "capacity": 400000, "quality_score": 0.88, "risk_score": 0.22},

        {"id": "Tier2_A1", "name": "Metal Works Co.", "tier": 2, "category": "Metal Components", "country": "Czech Republic",
         "latitude": 50.0755, "longitude": 14.4378, "capacity": 500000, "quality_score": 0.85, "risk_score": 0.25},
        {"id": "Tier2_A2", "name": "Plastic Solutions", "tier": 2, "category": "Plastic Components", "country": "Poland",
         "latitude": 52.2297, "longitude": 21.0122, "capacity": 600000, "quality_score": 0.82, "risk_score": 0.28},
        {"id": "Tier2_B1", "name": "Gear Masters", "tier": 2, "category": "Gears", "country": "Hungary",
         "latitude": 47.4979, "longitude": 19.0402, "capacity": 350000, "quality_score": 0.88, "risk_score": 0.20},
        {"id": "Tier2_C1", "name": "PCB Tech", "tier": 2, "category": "PCB Manufacturing", "country": "China",
         "latitude": 31.2304, "longitude": 121.4737, "capacity": 1000000, "quality_score": 0.80, "risk_score": 0.40},
        {"id": "Tier2_C2", "name": "Sensor Innovations", "tier": 2, "category": "Sensors", "country": "Japan",
         "latitude": 35.6762, "longitude": 139.6503, "capacity": 800000, "quality_score": 0.95, "risk_score": 0.12},

        {"id": "Tier3_A1a", "name": "Steel Suppliers Inc.", "tier": 3, "category": "Raw Steel", "country": "Ukraine",
         "latitude": 50.4501, "longitude": 30.5234, "capacity": 2000000, "quality_score": 0.78, "risk_score": 0.65},
        {"id": "Tier3_A1b", "name": "Aluminum Corp", "tier": 3, "category": "Aluminum", "country": "Russia",
         "latitude": 55.7558, "longitude": 37.6173, "capacity": 1500000, "quality_score": 0.82, "risk_score": 0.55},
        {"id": "Tier3_A2a", "name": "PetroChem Group", "tier": 3, "category": "Raw Plastic", "country": "Saudi Arabia",
         "latitude": 24.7136, "longitude": 46.6753, "capacity": 3000000, "quality_score": 0.85, "risk_score": 0.35},
        {"id": "Tier3_B1a", "name": "Metal Forging Ltd", "tier": 3, "category": "Metal Forging", "country": "Romania",
         "latitude": 44.4268, "longitude": 26.1025, "capacity": 700000, "quality_score": 0.75, "risk_score": 0.30},
        {"id": "Tier3_C1a", "name": "Chip Manufacturing", "tier": 3, "category": "Semiconductors", "country": "Taiwan",
         "latitude": 25.0330, "longitude": 121.5654, "capacity": 5000000, "quality_score": 0.97, "risk_score": 0.45},
        {"id": "Tier3_C1b", "name": "Copper Suppliers", "tier": 3, "category": "Copper", "country": "Chile",
         "latitude": -33.4489, "longitude": -70.6693, "capacity": 2500000, "quality_score": 0.88, "risk_score": 0.25},
        {"id": "Tier3_C2a", "name": "MEMS Technology", "tier": 3, "category": "MEMS Devices", "country": "South Korea",
         "latitude": 37.5665, "longitude": 126.9780, "capacity": 1200000, "quality_score": 0.93, "risk_score": 0.20},

        {"id": "Tier4_A1a1", "name": "Iron Ore Mining", "tier": 4, "category": "Iron Ore", "country": "Australia",
         "latitude": -33.8688, "longitude": 151.2093, "capacity": 10000000, "quality_score": 0.80, "risk_score": 0.20},
        {"id": "Tier4_A1a2", "name": "Coking Coal", "tier": 4, "category": "Coal", "country": "Australia",
         "latitude": -27.4698, "longitude": 153.0251, "capacity": 8000000, "quality_score": 0.75, "risk_score": 0.25},
        {"id": "Tier4_A1b1", "name": "Bauxite Mining", "tier": 4, "category": "Bauxite", "country": "Guinea",
         "latitude": 9.6412, "longitude": -13.5784, "capacity": 5000000, "quality_score": 0.70, "risk_score": 0.40},
        {"id": "Tier4_C1a1", "name": "Rare Earth Elements", "tier": 4, "category": "Rare Earth", "country": "China",
         "latitude": 39.9042, "longitude": 116.4074, "capacity": 1000000, "quality_score": 0.85, "risk_score": 0.50}
    ]

    edges = [
        {"source": "Tier1_A", "target": "OEM", "volume": 200000, "lead_time": 7, "dependency_ratio": 0.4},
        {"source": "Tier1_B", "target": "OEM", "volume": 150000, "lead_time": 5, "dependency_ratio": 0.3},
        {"source": "Tier1_C", "target": "OEM", "volume": 180000, "lead_time": 10, "dependency_ratio": 0.3},

        {"source": "Tier2_A1", "target": "Tier1_A", "volume": 150000, "lead_time": 5, "dependency_ratio": 0.5},
        {"source": "Tier2_A2", "target": "Tier1_A", "volume": 100000, "lead_time": 8, "dependency_ratio": 0.3},
        {"source": "Tier2_B1", "target": "Tier1_B", "volume": 120000, "lead_time": 3, "dependency_ratio": 0.6},
        {"source": "Tier2_C1", "target": "Tier1_C", "volume": 300000, "lead_time": 21, "dependency_ratio": 0.4},
        {"source": "Tier2_C2", "target": "Tier1_C", "volume": 250000, "lead_time": 14, "dependency_ratio": 0.4},

        {"source": "Tier3_A1a", "target": "Tier2_A1", "volume": 250000, "lead_time": 10, "dependency_ratio": 0.4},
        {"source": "Tier3_A1b", "target": "Tier2_A1", "volume": 180000, "lead_time": 8, "dependency_ratio": 0.3},
        {"source": "Tier3_A2a", "target": "Tier2_A2", "volume": 400000, "lead_time": 12, "dependency_ratio": 0.6},
        {"source": "Tier3_B1a", "target": "Tier2_B1", "volume": 300000, "lead_time": 6, "dependency_ratio": 0.5},
        {"source": "Tier3_C1a", "target": "Tier2_C1", "volume": 800000, "lead_time": 35, "dependency_ratio": 0.4},
        {"source": "Tier3_C1b", "target": "Tier2_C1", "volume": 500000, "lead_time": 30, "dependency_ratio": 0.3},
        {"source": "Tier3_C2a", "target": "Tier2_C2", "volume": 600000, "lead_time": 7, "dependency_ratio": 0.5},

        {"source": "Tier4_A1a1", "target": "Tier3_A1a", "volume": 1000000, "lead_time": 20, "dependency_ratio": 0.5},
        {"source": "Tier4_A1a2", "target": "Tier3_A1a", "volume": 800000, "lead_time": 25, "dependency_ratio": 0.3},
        {"source": "Tier4_A1b1", "target": "Tier3_A1b", "volume": 1000000, "lead_time": 18, "dependency_ratio": 0.4},
        {"source": "Tier4_C1a1", "target": "Tier3_C1a", "volume": 500000, "lead_time": 28, "dependency_ratio": 0.6}
    ]

    nodes = [SupplierNode(**s) for s in suppliers]
    edge_list = [SupplyEdge(**e) for e in edges]

    return GraphData(nodes=nodes, edges=edge_list)


def get_sample_dashboard_metrics() -> DashboardMetrics:
    return DashboardMetrics(
        total_nodes=20,
        total_edges=19,
        max_tier=4,
        critical_path_length=35,
        top_betweenness_nodes=[
            {"id": "OEM", "name": "Main Automaker", "tier": 0, "category": "Automotive OEM", "value": 0.15},
            {"id": "Tier1_A", "name": "Auto Systems GmbH", "tier": 1, "category": "Integrated Systems", "value": 0.12},
            {"id": "Tier1_C", "name": "Electronics Plus", "tier": 1, "category": "Electronics", "value": 0.10},
            {"id": "Tier2_C1", "name": "PCB Tech", "tier": 2, "category": "PCB Manufacturing", "value": 0.08},
            {"id": "Tier3_C1a", "name": "Chip Manufacturing", "tier": 3, "category": "Semiconductors", "value": 0.07}
        ],
        top_pagerank_nodes=[
            {"id": "OEM", "name": "Main Automaker", "tier": 0, "category": "Automotive OEM", "value": 0.25},
            {"id": "Tier1_A", "name": "Auto Systems GmbH", "tier": 1, "category": "Integrated Systems", "value": 0.18},
            {"id": "Tier1_B", "name": "Drive Tech AG", "tier": 1, "category": "Drivetrain", "value": 0.15},
            {"id": "Tier1_C", "name": "Electronics Plus", "tier": 1, "category": "Electronics", "value": 0.14},
            {"id": "Tier2_A1", "name": "Metal Works Co.", "tier": 2, "category": "Metal Components", "value": 0.10}
        ]
    )
