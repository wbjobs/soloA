import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import networkx as nx
import sys

sys.setrecursionlimit(200)


def create_cyclic_graph():
    """创建一个包含循环依赖的供应链网络"""
    G = nx.DiGraph()

    G.add_node("A", name="Supplier A", tier=1, capacity=1000, risk_score=0.3, quality_score=0.8,
               latitude=48.0, longitude=10.0, country="Germany", category="Category A")
    G.add_node("B", name="Supplier B", tier=2, capacity=800, risk_score=0.4, quality_score=0.75,
               latitude=49.0, longitude=11.0, country="France", category="Category B")
    G.add_node("C", name="Supplier C", tier=2, capacity=600, risk_score=0.5, quality_score=0.7,
               latitude=50.0, longitude=12.0, country="Poland", category="Category C")
    G.add_node("D", name="Supplier D", tier=3, capacity=400, risk_score=0.6, quality_score=0.65,
               latitude=51.0, longitude=13.0, country="Czech", category="Category D")

    G.add_edge("D", "A", volume=200, lead_time=5, dependency_ratio=0.4)
    G.add_edge("A", "B", volume=300, lead_time=3, dependency_ratio=0.5)
    G.add_edge("B", "C", volume=250, lead_time=4, dependency_ratio=0.6)

    G.add_edge("C", "A", volume=100, lead_time=7, dependency_ratio=0.3)
    G.add_edge("B", "D", volume=150, lead_time=6, dependency_ratio=0.35)

    return G


def create_acyclic_graph():
    """创建一个无环的供应链网络用于对比"""
    G = nx.DiGraph()

    G.add_node("OEM", name="Main OEM", tier=0, capacity=5000, risk_score=0.1, quality_score=0.95,
               latitude=48.7758, longitude=9.1829, country="Germany", category="OEM")
    G.add_node("T1_A", name="Tier 1 A", tier=1, capacity=3000, risk_score=0.2, quality_score=0.9,
               latitude=48.1351, longitude=11.5820, country="Germany", category="Systems")
    G.add_node("T1_B", name="Tier 1 B", tier=1, capacity=2500, risk_score=0.25, quality_score=0.85,
               latitude=50.1109, longitude=8.6821, country="Germany", category="Drivetrain")
    G.add_node("T2_A", name="Tier 2 A", tier=2, capacity=1500, risk_score=0.3, quality_score=0.8,
               latitude=50.0755, longitude=14.4378, country="Czech", category="Metal")
    G.add_node("T2_B", name="Tier 2 B", tier=2, capacity=2000, risk_score=0.35, quality_score=0.75,
               latitude=52.2297, longitude=21.0122, country="Poland", category="Plastic")
    G.add_node("T3_A", name="Tier 3 A", tier=3, capacity=1000, risk_score=0.4, quality_score=0.7,
               latitude=50.4501, longitude=30.5234, country="Ukraine", category="Steel")

    G.add_edge("T1_A", "OEM", volume=2000, lead_time=7, dependency_ratio=0.4)
    G.add_edge("T1_B", "OEM", volume=1500, lead_time=5, dependency_ratio=0.3)
    G.add_edge("T2_A", "T1_A", volume=1000, lead_time=5, dependency_ratio=0.5)
    G.add_edge("T2_B", "T1_A", volume=800, lead_time=8, dependency_ratio=0.3)
    G.add_edge("T3_A", "T2_A", volume=500, lead_time=10, dependency_ratio=0.4)

    return G


def print_header(title):
    print("\n" + "=" * 80)
    print(f"  {title}")
    print("=" * 80)


def test_cycle_detection():
    """测试循环检测功能"""
    print_header("Test 1: Cycle Detection")

    from app.risk_simulation.cascade_failure import CascadeFailureSimulator

    cyclic_graph = create_cyclic_graph()
    acyclic_graph = create_acyclic_graph()

    print("\nCyclic graph nodes:", list(cyclic_graph.nodes()))
    print("Cyclic graph edges:", list(cyclic_graph.edges()))

    cyclic_sim = CascadeFailureSimulator(cyclic_graph)
    acyclic_sim = CascadeFailureSimulator(acyclic_graph)

    print(f"\n✓ Cyclic graph cycle detected: {cyclic_sim._has_cycle}")
    print(f"  Cycles found: {cyclic_sim._cycles}")
    print(f"✓ Acyclic graph cycle detected: {acyclic_sim._has_cycle}")

    assert cyclic_sim._has_cycle == True, "Should detect cycle in cyclic graph"
    assert acyclic_sim._has_cycle == False, "Should NOT detect cycle in acyclic graph"

    print("\n✓ Test 1 PASSED: Cycle detection works correctly")


def test_safe_path_algorithms():
    """测试安全路径算法"""
    print_header("Test 2: Safe Path Algorithms")

    from app.risk_simulation.cascade_failure import CascadeFailureSimulator

    cyclic_graph = create_cyclic_graph()
    sim = CascadeFailureSimulator(cyclic_graph)

    print("\nTesting safe path detection in cyclic graph...")
    print(f"Path exists from A to B: {sim._safe_has_path('A', 'B')}")
    print(f"Path exists from A to D: {sim._safe_has_path('A', 'D')}")
    print(f"Path exists from D to C: {sim._safe_has_path('D', 'C')}")

    dist = sim._safe_shortest_path_length('A', 'B')
    print(f"Shortest path length (unweighted) from A to B: {dist}")

    dist_weighted = sim._safe_shortest_path_length_weighted('A', 'C', weight='lead_time')
    print(f"Shortest path length (weighted) from A to C: {dist_weighted}")

    assert sim._safe_has_path('A', 'B') == True
    assert dist is not None
    assert dist_weighted is not None

    print("\n✓ Test 2 PASSED: Safe path algorithms work in cyclic graph")


def test_cascade_simulation():
    """测试级联失效模拟"""
    print_header("Test 3: Cascade Simulation")

    from app.risk_simulation.cascade_failure import CascadeFailureSimulator

    cyclic_graph = create_cyclic_graph()
    sim = CascadeFailureSimulator(cyclic_graph)

    print("\nRunning cascade simulation with initial failure: A")
    print(f"Graph has cycle: {sim._has_cycle}")

    result = sim.simulate_cascade(
        initial_failure_nodes=["A"],
        dependency_threshold=0.3,
        max_iterations=50
    )

    print(f"\nResult:")
    print(f"  Total failed nodes: {len(result.failed_nodes)}")
    print(f"  Failed nodes: {result.failed_nodes}")
    print(f"  Propagation depth: {result.propagation_depth}")
    print(f"  Total impact: {result.total_impact:.2f}%")
    print(f"  Cycle detected: {result.cycle_detected}")
    print(f"  Cycles: {result.cycles_found}")

    assert result.failed_nodes is not None
    assert len(result.failed_nodes) >= 1

    print("\n✓ Test 3 PASSED: Cascade simulation completed without infinite loop")


def test_node_exposure_calculation():
    """测试节点暴露度计算"""
    print_header("Test 4: Node Exposure Calculation")

    from app.risk_simulation.cascade_failure import CascadeFailureSimulator

    cyclic_graph = create_cyclic_graph()
    sim = CascadeFailureSimulator(cyclic_graph)

    print("\nTesting node exposure calculation in cyclic graph...")

    failed_nodes = {"A"}

    for node in cyclic_graph.nodes():
        exposure = sim._calculate_node_exposure(node, failed_nodes)
        print(f"  Exposure of {node}: {exposure:.4f}")

    exposure_A = sim._calculate_node_exposure("A", failed_nodes)
    assert exposure_A == 1.0, "Failed node should have exposure 1.0"

    print("\n✓ Test 4 PASSED: Node exposure calculation works")


def test_critical_path_algorithms():
    """测试关键路径算法"""
    print_header("Test 5: Critical Path Algorithms")

    from app.risk_simulation.cascade_failure import CascadeFailureSimulator

    acyclic_graph = create_acyclic_graph()
    sim = CascadeFailureSimulator(acyclic_graph)

    print("\nTesting critical path in acyclic graph...")

    paths = sim.identify_critical_paths("T3_A", "OEM", max_paths=3)
    print(f"Paths from T3_A to OEM: {paths}")

    crit_length = sim.find_critical_path_length("OEM")
    print(f"Critical path length from OEM: {crit_length}")

    print("\nTesting critical path in cyclic graph...")

    cyclic_graph = create_cyclic_graph()
    sim_cyclic = CascadeFailureSimulator(cyclic_graph)

    paths_cyclic = sim_cyclic.identify_critical_paths("D", "C", max_paths=3)
    print(f"Paths from D to C: {paths_cyclic}")

    crit_length_cyclic = sim_cyclic.find_critical_path_length("A")
    print(f"Critical path length from A (cyclic): {crit_length_cyclic}")

    print("\n✓ Test 5 PASSED: Critical path algorithms work")


def test_n_tier_risk():
    """测试 N-Tier 风险计算"""
    print_header("Test 6: N-Tier Risk Calculation")

    from app.risk_simulation.cascade_failure import CascadeFailureSimulator

    cyclic_graph = create_cyclic_graph()
    sim = CascadeFailureSimulator(cyclic_graph)

    print("\nTesting N-Tier risk calculation in cyclic graph...")

    failed_nodes = {"A"}
    tier_risk = sim.calculate_n_tier_risk(failed_nodes, max_tier=5)

    print(f"Tier risk: {tier_risk}")

    print("\n✓ Test 6 PASSED: N-Tier risk calculation works")


def run_all_tests():
    """运行所有测试"""
    print("\n" + "=" * 80)
    print("  SUPPLY CHAIN RISK SIMULATION - CYCLE FIX TEST SUITE")
    print("  Testing fixes for cyclic graph handling")
    print("=" * 80)

    tests = [
        ("Cycle Detection", test_cycle_detection),
        ("Safe Path Algorithms", test_safe_path_algorithms),
        ("Cascade Simulation", test_cascade_simulation),
        ("Node Exposure Calculation", test_node_exposure_calculation),
        ("Critical Path Algorithms", test_critical_path_algorithms),
        ("N-Tier Risk Calculation", test_n_tier_risk),
    ]

    passed = 0
    failed = 0

    for test_name, test_func in tests:
        try:
            test_func()
            passed += 1
        except Exception as e:
            print(f"\n✗ Test FAILED: {test_name}")
            print(f"  Error: {e}")
            import traceback
            traceback.print_exc()
            failed += 1

    print("\n" + "=" * 80)
    print(f"  TEST SUMMARY: {passed} passed, {failed} failed")
    print("=" * 80)

    return failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
