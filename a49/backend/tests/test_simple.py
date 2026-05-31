"""
极简 Barnes-Hut 修复验证测试
"""
import numpy as np
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def test_pairwise_force():
    """测试直接力计算"""
    from app.simulation.octree import _pairwise_force

    pos_i = np.array([0.0, 0.0, 0.0])
    pos_j = np.array([1.0, 0.0, 0.0])

    force = _pairwise_force(pos_i, 1.0, pos_j, 1.0, 1.0, 1e-20)
    expected = np.array([1.0, 0.0, 0.0])

    print(f"计算力: {force}")
    print(f"期望值: {expected}")
    print(f"误差: {np.abs(force - expected)}")

    return np.allclose(force, expected)


def test_two_body_force():
    """测试两体系统的力计算"""
    from app.simulation.octree import compute_forces_barnes_hut
    from app.simulation.gravity import compute_forces_direct

    positions = np.array([
        [-0.5, 0.0, 0.0],
        [0.5, 0.0, 0.0]
    ], dtype=np.float64)
    masses = np.array([1.0, 1.0], dtype=np.float64)
    G = 1.0

    forces_direct = compute_forces_direct(positions, masses, G, softening=1e-10)
    forces_bh = compute_forces_barnes_hut(positions, masses, G, theta=0.5, softening=1e-10)

    print(f"直接算法力:\n{forces_direct}")
    print(f"Barnes-Hut 力:\n{forces_bh}")

    error = np.max(np.abs(forces_direct - forces_bh))
    rel_error = np.max(np.abs(forces_direct - forces_bh) / (np.abs(forces_direct) + 1e-20))

    print(f"\n最大绝对误差: {error:.2e}")
    print(f"最大相对误差: {rel_error:.4%}")

    return rel_error < 0.01


def test_three_body_force():
    """测试三体系统（双星+远距离行星）"""
    from app.simulation.octree import compute_forces_barnes_hut
    from app.simulation.gravity import compute_forces_direct

    m1, m2, m3 = 1.0, 1.0, 0.001
    d_binary = 1.0
    d_planet = 100.0

    positions = np.array([
        [-d_binary/4, 0.0, 0.0],
        [d_binary/4, 0.0, 0.0],
        [d_planet, 0.0, 0.0]
    ], dtype=np.float64)
    masses = np.array([m1, m2, m3], dtype=np.float64)
    G = 1.0

    forces_direct = compute_forces_direct(positions, masses, G, softening=1e-10)
    forces_bh = compute_forces_barnes_hut(positions, masses, G, theta=0.5, softening=1e-10)

    print(f"直接算法力:\n{forces_direct}")
    print(f"Barnes-Hut 力:\n{forces_bh}")

    error = np.abs(forces_direct - forces_bh)
    rel_error = error / (np.abs(forces_direct) + 1e-20)

    print(f"\n绝对误差:\n{error}")
    print(f"相对误差:\n{rel_error}")

    max_rel_error = np.max(rel_error)
    print(f"\n最大相对误差: {max_rel_error:.4%}")

    return max_rel_error < 0.05


def test_energy_conservation():
    """测试能量守恒"""
    from app.simulation.octree import compute_accelerations_barnes_hut
    from app.simulation.gravity import compute_accelerations_direct

    def compute_energy(positions, velocities, masses, G=1.0):
        n = len(masses)
        kinetic = 0.5 * np.sum(masses * np.sum(velocities**2, axis=1))
        potential = 0.0
        for i in range(n):
            for j in range(i + 1, n):
                dx = positions[j, 0] - positions[i, 0]
                dy = positions[j, 1] - positions[i, 1]
                dz = positions[j, 2] - positions[i, 2]
                r = np.sqrt(dx * dx + dy * dy + dz * dz + 1e-20)
                potential -= G * masses[i] * masses[j] / r
        return kinetic + potential

    positions = np.array([
        [-0.25, 0.0, 0.0],
        [0.25, 0.0, 0.0]
    ], dtype=np.float64)

    v = np.sqrt(1.0 / (2 * 0.5))
    velocities = np.array([
        [0.0, v, 0.0],
        [0.0, -v, 0.0]
    ], dtype=np.float64)

    masses = np.array([1.0, 1.0], dtype=np.float64)
    G = 1.0
    dt = 0.005
    n_steps = 100

    initial_energy = compute_energy(positions, velocities, masses, G)
    print(f"初始能量: {initial_energy:.6f}")

    pos_bh = positions.copy()
    vel_bh = velocities.copy()

    for step in range(n_steps):
        acc_bh = compute_accelerations_barnes_hut(pos_bh, masses, G, theta=0.5, softening=1e-10)
        vel_bh += acc_bh * dt
        pos_bh += vel_bh * dt

    final_energy = compute_energy(pos_bh, vel_bh, masses, G)
    print(f"最终能量: {final_energy:.6f}")

    energy_drift = abs(final_energy - initial_energy) / abs(initial_energy)
    print(f"能量漂移: {energy_drift:.4%}")

    if energy_drift > 0.1:
        print("⚠️  严重: 能量漂移超过 10%!")
    elif energy_drift > 0.05:
        print("⚠️  警告: 能量漂移超过 5%")
    else:
        print("✓ 能量漂移在可接受范围内")

    return energy_drift < 0.05


if __name__ == "__main__":
    print("=" * 60)
    print("Barnes-Hut 算法修复验证 (极简测试)")
    print("=" * 60)

    tests = [
        ("直接力计算", test_pairwise_force),
        ("两体力计算", test_two_body_force),
        ("三体极端分布", test_three_body_force),
        ("能量守恒", test_energy_conservation)
    ]

    results = []
    for name, test_func in tests:
        print(f"\n[{name}]")
        print("-" * 60)
        try:
            passed = test_func()
            results.append((name, passed))
            status = "✓ 通过" if passed else "✗ 失败"
            print(f"结果: {status}")
        except Exception as e:
            print(f"异常: {e}")
            import traceback
            traceback.print_exc()
            results.append((name, False))

    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)

    all_passed = True
    for name, passed in results:
        status = "✓ 通过" if passed else "✗ 失败"
        print(f"{name}: {status}")
        if not passed:
            all_passed = False

    print("\n" + "=" * 60)
    if all_passed:
        print("✓ 所有测试通过! Barnes-Hut 算法修复成功!")
    else:
        print("✗ 部分测试失败")
    print("=" * 60)
