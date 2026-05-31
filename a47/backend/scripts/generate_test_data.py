import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import random
from app.database import Neo4jClient
from app.config import settings

def generate_test_data():
    Neo4jClient.init(
        uri=settings.NEO4J_URI,
        user=settings.NEO4J_USER,
        password=settings.NEO4J_PASSWORD
    )

    clear_query = """
    MATCH (n) DETACH DELETE n
    """
    Neo4jClient.run_query(clear_query)
    print("Cleared existing data")

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

    for supplier in suppliers:
        query = """
        CREATE (s:Supplier {
            id: $id,
            name: $name,
            tier: $tier,
            category: $category,
            country: $country,
            latitude: $latitude,
            longitude: $longitude,
            capacity: $capacity,
            quality_score: $quality_score,
            risk_score: $risk_score
        })
        """
        Neo4jClient.run_query(query, supplier)
        print(f"Created supplier: {supplier['id']}")

    edges = [
        ("Tier1_A", "OEM", 200000, 7, 0.4),
        ("Tier1_B", "OEM", 150000, 5, 0.3),
        ("Tier1_C", "OEM", 180000, 10, 0.3),

        ("Tier2_A1", "Tier1_A", 150000, 5, 0.5),
        ("Tier2_A2", "Tier1_A", 100000, 8, 0.3),
        ("Tier2_B1", "Tier1_B", 120000, 3, 0.6),
        ("Tier2_C1", "Tier1_C", 300000, 21, 0.4),
        ("Tier2_C2", "Tier1_C", 250000, 14, 0.4),

        ("Tier3_A1a", "Tier2_A1", 250000, 10, 0.4),
        ("Tier3_A1b", "Tier2_A1", 180000, 8, 0.3),
        ("Tier3_A2a", "Tier2_A2", 400000, 12, 0.6),
        ("Tier3_B1a", "Tier2_B1", 300000, 6, 0.5),
        ("Tier3_C1a", "Tier2_C1", 800000, 35, 0.4),
        ("Tier3_C1b", "Tier2_C1", 500000, 30, 0.3),
        ("Tier3_C2a", "Tier2_C2", 600000, 7, 0.5),

        ("Tier4_A1a1", "Tier3_A1a", 1000000, 20, 0.5),
        ("Tier4_A1a2", "Tier3_A1a", 800000, 25, 0.3),
        ("Tier4_A1b1", "Tier3_A1b", 1000000, 18, 0.4),
        ("Tier4_C1a1", "Tier3_C1a", 500000, 28, 0.6)
    ]

    for source, target, volume, lead_time, dependency_ratio in edges:
        query = """
        MATCH (s:Supplier {id: $source}), (t:Supplier {id: $target})
        CREATE (s)-[:SUPPLIES {
            volume: $volume,
            lead_time: $lead_time,
            dependency_ratio: $dependency_ratio
        }]->(t)
        """
        Neo4jClient.run_query(query, {
            "source": source,
            "target": target,
            "volume": volume,
            "lead_time": lead_time,
            "dependency_ratio": dependency_ratio
        })
        print(f"Created edge: {source} -> {target}")

    Neo4jClient.close()
    print("\nTest data generation complete!")
    print(f"Total suppliers: {len(suppliers)}")
    print(f"Total edges: {len(edges)}")


if __name__ == "__main__":
    generate_test_data()
