"""
Barnes-Hut 算法修复验证测试
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


def create_three_body_system():
    """创建双星 + 远距离行星的系统"""
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

    passed = rel_error < 0.01
    if passed:
        print("✓ 通过!")
    else:
        print("✗ 失败!")

    return passed


def test_energy_conservation():
    """测试双星系统的能量守恒"""
    print("\n" + "=" * 60)
    print("测试 2: 双星系统能量守恒测试 (200 步)")
    print("=" * 60)

    positions, velocities, masses = create_binary_star_system()
    G = 1.0
    dt = 0.005
    n_steps = 200

    initial_energy = compute_energy(positions, velocities, masses, G)

    print(f"初始总能量: {initial_energy:.6f}")

    pos_direct = positions.copy()
    vel_direct = velocities.copy()

    pos_bh = positions.copy()
    vel_bh = velocities.copy()

    energy_history_direct = [initial_energy]
    energy_history_bh = [initial_energy]

    for step in range(n_steps):
        acc_direct = compute_accelerations_direct(pos_direct, masses, G, np.zeros(2), 1e-10)
        acc_bh = compute_accelerations_barnes_hut(pos_bh, masses, G, theta=0.5, softening=1e-10)

        vel_direct_half = vel_direct + acc_direct * dt / 2
        pos_direct += vel_direct_half * dt
        acc_direct_new = compute_accelerations_direct(pos_direct, masses, G, np.zeros(2), 1e-10)
        vel_direct = vel_direct_half + acc_direct_new * dt / 2

        vel_bh_half = vel_bh + acc_bh * dt / 2
        pos_bh += vel_bh_half * dt
        acc_bh_new = compute_accelerations_barnes_hut(pos_bh, masses, G, theta=0.5, softening=1e-10)
        vel_bh = vel_bh_half + acc_bh_new * dt / 2

        energy_history_direct.append(compute_energy(pos_direct, vel_direct, masses, G))
        energy_history_bh.append(compute_energy(pos_bh, vel_bh, masses, G))

    final_energy_direct = energy_history_direct[-1]
    final_energy_bh = energy_history_bh[-1]

    drift_direct = abs(final_energy_direct - initial_energy) / abs(initial_energy)
    drift_bh = abs(final_energy_bh - initial_energy) / abs(initial_energy)

    print(f"\n直接算法最终能量: {final_energy_direct:.6f}")
    print(f"直接算法能量漂移: {drift_direct:.4%}")
    print(f"\nBarnes-Hut 最终能量: {final_energy_bh:.6f}")
    print(f"Barnes-Hut 能量漂移: {drift_bh:.4%}")

    passed = drift_bh < 0.05
    if drift_bh > 0.1:
        print(f"\n⚠️  严重: Barnes-Hut 能量漂移超过 10%!")
    elif drift_bh > 0.05:
        print(f"\n⚠️  警告: Barnes-Hut 能量漂移超过 5%")
    else:
        print(f"\n✓ Barnes-Hut 能量漂移在可接受范围内")

    return passed


def test_three_body_problem():
    """测试双星 + 远距离行星的场景"""
    print("\n" + "=" * 60)
    print("测试 3: 双星 + 远距离行星 (极端空间分布)")
    print("=" * 60)

    positions, velocities, masses = create_three_body_system()
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

    passed = max_rel_error < 0.05
    if passed:
        print("✓ 通过!")
    else:
        print("✗ 失败!")

    return passed


def test_orbit_stability():
    """测试双星轨道的稳定性"""
    print("\n" + "=" * 60)
    print("测试 4: 双星轨道稳定性测试 (10 个完整轨道)")
    print("=" * 60)

    positions, velocities, masses = create_binary_star_system()
    G = 1.0

    period = 2 * np.pi * 0.5 * np.sqrt((0.5) ** 3 / (G * 2.0))
    print(f"理论轨道周期: {period:.4f} 时间单位")

    dt = 0.001
    n_steps = int(period / dt) * 5

    print(f"模拟步数: {n_steps}")

    pos_bh = positions.copy()
    vel_bh = velocities.copy()

    initial_separation = np.linalg.norm(pos_bh[1] - pos_bh[0])
    print(f"初始双星距离: {initial_separation:.4f}")

    min_sep = float('inf')
    max_sep = 0.0

    for step in range(n_steps):
        acc_bh = compute_accelerations_barnes_hut(pos_bh, masses, G, theta=0.5, softening=1e-10)
        vel_bh += acc_bh * dt
        pos_bh += vel_bh * dt

        sep = np.linalg.norm(pos_bh[1] - pos_bh[0])
        min_sep = min(min_sep, sep)
        max_sep = max(max_sep, sep)

    final_separation = np.linalg.norm(pos_bh[1] - pos_bh[0])

    print(f"最小距离: {min_sep:.4f}")
    print(f"最大距离: {max_sep:.4f}")
    print(f"最终距离: {final_separation:.4f}")

    separation_error = abs(final_separation - initial_separation) / initial_separation
    print(f"\n距离相对变化: {separation_error:.4%}")

    passed = separation_error < 0.1
    if passed:
        print("✓ 通过! 轨道保持稳定")
    else:
        print("✗ 失败! 轨道发散")

    return passed


if __name__ == "__main__":
    print("Barnes-Hut 算法修复验证测试")
    print("=" * 60)

    results = []

    tests = [
        ("加速度比较", test_acceleration_comparison),
        ("能量守恒", test_energy_conservation),
        ("极端空间分布", test_three_body_problem),
        ("轨道稳定性", test_orbit_stability)
    ]

    for name, test_func in tests:
        try:
            results.append((name, test_func()))
        except Exception as e:
            print(f"\n✗ {name} 异常: {e}")
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
        print("✗ 部分测试失败，Barnes-Hut 算法仍需改进")
    print("=" * 60)
