"""
Barnes-Hut 算法 Bug 诊断测试
测试双星系统在 Barnes-Hut 下的能量守恒情况
"""
import numpy as np
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.simulation.gravity import compute_accelerations_direct
from app.simulation.octree import compute_accelerations_barnes_hut


def create_binary_star_system():
    """创建简化的双星系统（缩放后的单位，便于测试）"""
    m1 = 1.0
    m2 = 1.0
    d = 1.0

    r1 = d / 4
    r2 = d / 4

    v = np.sqrt(1.0 / (2 * d))

    positions = np.array([
        [-r1, 0.0, 0.0],
        [r2, 0.0, 0.0]
    ], dtype=np.float64)

    velocities = np.array([
        [0.0, v, 0.0],
        [0.0, -v, 0.0]
    ], dtype=np.float64)

    masses = np.array([m1, m2], dtype=np.float64)

    return positions, velocities, masses


def compute_energy(positions, velocities, masses, G=1.0):
    """计算系统总能量"""
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


def test_acceleration_comparison():
    """比较直接算法和 Barnes-Hut 的加速度计算差异"""
    print("=" * 60)
    print("测试 1: 双星系统加速度比较")
    print("=" * 60)

    positions, velocities, masses = create_binary_star_system()
    G = 1.0

    acc_direct = compute_accelerations_direct(positions, masses, G, np.zeros(2), 1e-10)
    acc_bh = compute_accelerations_barnes_hut(positions, masses, G, theta=0.5, softening=1e-10)

    print(f"直接算法加速度:\n{acc_direct}")
    print(f"Barnes-Hut 加速度:\n{acc_bh}")

    error = np.max(np.abs(acc_direct - acc_bh))
    rel_error = np.max(np.abs(acc_direct - acc_bh) / (np.abs(acc_direct) + 1e-20))

    print(f"\n最大绝对误差: {error:.2e}")
    print(f"最大相对误差: {rel_error:.2%}")

    return rel_error < 0.01


def test_energy_conservation():
    """测试双星系统的能量守恒"""
    print("\n" + "=" * 60)
    print("测试 2: 双星系统能量守恒测试 (100 步)")
    print("=" * 60)

    positions, velocities, masses = create_binary_star_system()
    G = 1.0
    dt = 0.01
    n_steps = 100

    initial_energy_direct = compute_energy(positions, velocities, masses, G)
    initial_energy_bh = compute_energy(positions, velocities, masses, G)

    print(f"初始总能量: {initial_energy_direct:.6f}")

    pos_direct = positions.copy()
    vel_direct = velocities.copy()

    pos_bh = positions.copy()
    vel_bh = velocities.copy()

    for step in range(n_steps):
        acc_direct = compute_accelerations_direct(pos_direct, masses, G, np.zeros(2), 1e-10)
        acc_bh = compute_accelerations_barnes_hut(pos_bh, masses, G, theta=0.5, softening=1e-10)

        vel_direct += acc_direct * dt
        pos_direct += vel_direct * dt

        vel_bh += acc_bh * dt
        pos_bh += vel_bh * dt

    final_energy_direct = compute_energy(pos_direct, vel_direct, masses, G)
    final_energy_bh = compute_energy(pos_bh, vel_bh, masses, G)

    drift_direct = abs(final_energy_direct - initial_energy_direct) / abs(initial_energy_direct)
    drift_bh = abs(final_energy_bh - initial_energy_bh) / abs(initial_energy_bh)

    print(f"\n直接算法最终能量: {final_energy_direct:.6f}")
    print(f"直接算法能量漂移: {drift_direct:.4%}")
    print(f"\nBarnes-Hut 最终能量: {final_energy_bh:.6f}")
    print(f"Barnes-Hut 能量漂移: {drift_bh:.4%}")

    if drift_bh > 0.1:
        print(f"\n⚠️  检测到严重 Bug: Barnes-Hut 能量漂移超过 10%!")
    elif drift_bh > 0.01:
        print(f"\n⚠️  检测到明显误差: Barnes-Hut 能量漂移超过 1%")
    else:
        print(f"\n✓ Barnes-Hut 能量漂移在可接受范围内")

    return drift_bh < 0.05


def test_three_body_problem():
    """测试双星 + 远距离行星的场景"""
    print("\n" + "=" * 60)
    print("测试 3: 双星 + 远距离行星 (极端空间分布)")
    print("=" * 60)

    m1 = 1.0
    m2 = 1.0
    m3 = 0.001

    d_binary = 1.0
    d_planet = 100.0

    r1 = d_binary / 4
    r2 = d_binary / 4

    v_binary = np.sqrt(1.0 / (2 * d_binary))
    v_planet = np.sqrt(2.0 / d_planet)

    positions = np.array([
        [-r1, 0.0, 0.0],
        [r2, 0.0, 0.0],
        [d_planet, 0.0, 0.0]
    ], dtype=np.float64)

    velocities = np.array([
        [0.0, v_binary, 0.0],
        [0.0, -v_binary, 0.0],
        [0.0, v_planet, 0.0]
    ], dtype=np.float64)

    masses = np.array([m1, m2, m3], dtype=np.float64)

    G = 1.0

    acc_direct = compute_accelerations_direct(positions, masses, G, np.zeros(3), 1e-10)
    acc_bh = compute_accelerations_barnes_hut(positions, masses, G, theta=0.5, softening=1e-10)

    print(f"直接算法加速度:\n{acc_direct}")
    print(f"Barnes-Hut 加速度:\n{acc_bh}")

    error = np.abs(acc_direct - acc_bh)
    rel_error = error / (np.abs(acc_direct) + 1e-20)

    print(f"\n误差矩阵:\n{error}")
    print(f"\n相对误差矩阵:\n{rel_error}")

    max_rel_error = np.max(rel_error)
    print(f"\n最大相对误差: {max_rel_error:.2%}")

    return max_rel_error < 0.05


if __name__ == "__main__":
    print("Barnes-Hut 算法 Bug 诊断")
    print("=" * 60)

    results = []

    try:
        results.append(("加速度比较", test_acceleration_comparison()))
    except Exception as e:
        print(f"测试 1 失败: {e}")
        import traceback
        traceback.print_exc()
        results.append(("加速度比较", False))

    try:
        results.append(("能量守恒", test_energy_conservation()))
    except Exception as e:
        print(f"测试 2 失败: {e}")
        import traceback
        traceback.print_exc()
        results.append(("能量守恒", False))

    try:
        results.append(("极端空间分布", test_three_body_problem()))
    except Exception as e:
        print(f"测试 3 失败: {e}")
        import traceback
        traceback.print_exc()
        results.append(("极端空间分布", False))

    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)
    all_passed = True
    for name, passed in results:
        status = "✓ 通过" if passed else "✗ 失败"
        print(f"{name}: {status}")
        if not passed:
            all_passed = False

    if all_passed:
        print("\n✓ 所有测试通过!")
    else:
        print("\n✗ 部分测试失败，需要修复 Barnes-Hut 算法")
