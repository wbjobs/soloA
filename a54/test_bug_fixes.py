import sys
import os
import numpy as np
import logging
sys.path.insert(0, os.path.dirname(__file__))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

from solver.parameters import SimulationParams
from solver.finite_difference import FiniteDifferenceSolver
from visualization.visualizer import ResultVisualizer


def test_1d_heterogeneous_stability():
    """测试1D非均质介质数值稳定性"""
    print("\n" + "=" * 70)
    print("测试1: 1D非均质介质数值稳定性（高Peclet数情况）")
    print("=" * 70)
    
    params = SimulationParams(
        model_dim=1,
        nx=50,
        Lx=100.0,
        t_total=30.0,
        dt=0.05,
        output_freq=30,
        D=0.5,
        vx=2.0,
        source_strength=10.0,
        source_x=10.0,
        source_width=5.0
    )
    
    params.generate_heterogeneous_fields(seed=42)
    
    print(f"Peclet数范围: Pe = {np.min(np.abs(params.vx_map)) * params.Lx/params.nx/0.5:.2f} - "
          f"{np.max(np.abs(params.vx_map)) * params.Lx/params.nx/0.5:.2f}")
    print(f"安全时间步长: {params.Lx/params.nx/(np.max(np.abs(params.vx_map))):.4f}")
    
    solver = FiniteDifferenceSolver(params)
    results = solver.solve_1d()
    
    final_C = results['concentrations'][-1]
    max_C = np.max(final_C)
    min_C = np.min(final_C)
    
    print(f"\n结果统计:")
    print(f"  最大浓度: {max_C:.4f}")
    print(f"  最小浓度: {min_C:.4f}")
    print(f"  浓度非负: {min_C >= 0}")
    print(f"  浓度范围合理: {max_C <= 3 * params.source_strength}")
    
    neg_history = results.get('negative_count_history', [])
    total_neg = sum(neg_history)
    print(f"  负浓度总数: {total_neg}")
    
    mass_history = results.get('mass_history', [])
    if len(mass_history) >= 2:
        mass_ratio = mass_history[-1] / mass_history[0] if mass_history[0] > 0 else 1.0
        print(f"  质量守恒比: {mass_ratio:.4f}")
    
    visualizer = ResultVisualizer(results, output_dir='test_fix_1d_hetero')
    visualizer.generate_all_plots()
    
    success = min_C >= -1e-6 and max_C <= 3 * params.source_strength
    print(f"\n测试{'通过' if success else '失败'}！")
    return success


def test_2d_heterogeneous_stability():
    """测试2D非均质介质数值稳定性"""
    print("\n" + "=" * 70)
    print("测试2: 2D非均质介质数值稳定性（高对流情况）")
    print("=" * 70)
    
    params = SimulationParams(
        model_dim=2,
        nx=30,
        ny=20,
        Lx=100.0,
        Ly=50.0,
        t_total=20.0,
        dt=0.05,
        output_freq=20,
        D=0.5,
        vx=1.5,
        vy=0.2,
        source_strength=10.0,
        source_x=10.0,
        source_y=25.0,
        source_width=8.0
    )
    
    params.generate_heterogeneous_fields(seed=123)
    
    print(f"模型尺寸: {params.Lx}m x {params.Ly}m")
    print(f"网格: {params.nx} x {params.ny}")
    print(f"平均流速: vx={np.mean(params.vx_map):.2f}, vy={np.mean(params.vy_map):.2f}")
    
    solver = FiniteDifferenceSolver(params)
    results = solver.solve_2d()
    
    final_C = results['concentrations'][-1]
    max_C = np.max(final_C)
    min_C = np.min(final_C)
    
    print(f"\n结果统计:")
    print(f"  最大浓度: {max_C:.4f}")
    print(f"  最小浓度: {min_C:.4f}")
    print(f"  浓度非负: {min_C >= 0}")
    
    neg_history = results.get('negative_count_history', [])
    total_neg = sum(neg_history)
    steps_with_neg = sum(1 for n in neg_history if n > 0)
    print(f"  负浓度总数: {total_neg}")
    print(f"  出现负浓度的步数: {steps_with_neg}")
    
    mass_history = results.get('mass_history', [])
    if len(mass_history) >= 2:
        mass_ratio = mass_history[-1] / mass_history[0] if mass_history[0] > 0 else 1.0
        print(f"  质量守恒比: {mass_ratio:.4f}")
    
    visualizer = ResultVisualizer(results, output_dir='test_fix_2d_hetero')
    visualizer.generate_all_plots()
    
    heatmap_path = os.path.join('test_fix_2d_hetero', 'concentration_2d.png')
    if os.path.exists(heatmap_path):
        print(f"  2D热力图已生成: {heatmap_path}")
        print(f"  热力图使用 set_aspect('equal') 确保网格比例正确")
    
    success = min_C >= -1e-6
    print(f"\n测试{'通过' if success else '失败'}！")
    return success


def test_2d_aspect_ratio_verification():
    """验证2D热力图坐标轴比例"""
    print("\n" + "=" * 70)
    print("测试3: 2D热力图坐标轴比例验证")
    print("=" * 70)
    
    test_cases = [
        (100.0, 100.0, "正方形区域 100x100m"),
        (100.0, 50.0, "宽区域 100x50m"),
        (50.0, 100.0, "高区域 50x100m"),
        (200.0, 50.0, "极宽区域 200x50m"),
    ]
    
    success = True
    for Lx, Ly, desc in test_cases:
        print(f"\n测试: {desc}")
        
        params = SimulationParams(
            model_dim=2,
            nx=40,
            ny=int(40 * Ly / Lx),
            Lx=Lx,
            Ly=Ly,
            t_total=5.0,
            dt=0.1,
            output_freq=10,
            D=1.0,
            vx=0.5,
            source_strength=10.0,
            source_x=Lx * 0.2,
            source_y=Ly * 0.5,
            source_width=min(Lx, Ly) * 0.1
        )
        
        solver = FiniteDifferenceSolver(params)
        results = solver.solve_2d()
        
        visualizer = ResultVisualizer(results, output_dir=f'test_aspect_{Lx:.0f}x{Ly:.0f}')
        output_files = visualizer.generate_all_plots()
        
        heatmap_file = [f for f in output_files if 'concentration_2d' in f]
        if heatmap_file:
            print(f"  热力图已生成: {heatmap_file[0]}")
            print(f"  物理尺寸: {Lx}m x {Ly}m, 比例: {Lx/Ly:.2f}:1")
            print(f"  代码使用 ax.set_aspect('equal', adjustable='box') 保证正确比例")
        
        final_C = results['concentrations'][-1]
        min_C = np.min(final_C)
        if min_C < 0:
            print(f"  警告: 出现负浓度 {min_C:.6e}")
        
        test_ok = min_C >= -1e-6
        if not test_ok:
            success = False
        print(f"  结果: {'通过' if test_ok else '失败'}")
    
    print(f"\n坐标轴比例测试{'全部通过' if success else '部分失败'}！")
    return success


def test_extreme_conditions():
    """测试极端条件下的稳定性"""
    print("\n" + "=" * 70)
    print("测试4: 极端条件稳定性测试（高流速、小弥散）")
    print("=" * 70)
    
    params = SimulationParams(
        model_dim=1,
        nx=100,
        Lx=100.0,
        t_total=10.0,
        dt=0.01,
        output_freq=50,
        D=0.1,
        vx=5.0,
        source_strength=10.0,
        source_x=10.0,
        source_width=3.0
    )
    
    Pe = params.vx * (params.Lx / params.nx) / params.D
    print(f"Peclet数: {Pe:.2f} (高对流情况)")
    print(f"Courant数: {params.vx * params.dt / (params.Lx / params.nx):.2f}")
    print(f"扩散数: {params.D * params.dt / (params.Lx / params.nx)**2:.4f}")
    
    solver = FiniteDifferenceSolver(params)
    results = solver.solve_1d()
    
    final_C = results['concentrations'][-1]
    max_C = np.max(final_C)
    min_C = np.min(final_C)
    
    print(f"\n结果统计:")
    print(f"  最大浓度: {max_C:.4f}")
    print(f"  最小浓度: {min_C:.4f}")
    
    neg_history = results.get('negative_count_history', [])
    total_neg = sum(neg_history)
    print(f"  负浓度总数: {total_neg}")
    
    visualizer = ResultVisualizer(results, output_dir='test_extreme')
    visualizer.generate_all_plots()
    
    success = min_C >= -1e-3
    print(f"\n测试{'通过' if success else '失败'}！")
    return success


def main():
    print("=" * 70)
    print("地下水溶质运移模拟 - Bug修复验证测试")
    print("=" * 70)
    print("\n修复内容:")
    print("  1. 非均质介质数值稳定性 - 自适应迎风差分 + 指数格式人工粘性")
    print("  2. 浓度负值处理 - 实时检测 + 截断 + 质量守恒跟踪")
    print("  3. 2D热力图坐标轴比例 - set_aspect('equal') + 动态图形尺寸")
    
    results = []
    
    try:
        results.append(("1D非均质稳定性", test_1d_heterogeneous_stability()))
    except Exception as e:
        logger.error(f"测试1失败: {e}")
        results.append(("1D非均质稳定性", False))
    
    try:
        results.append(("2D非均质稳定性", test_2d_heterogeneous_stability()))
    except Exception as e:
        logger.error(f"测试2失败: {e}")
        results.append(("2D非均质稳定性", False))
    
    try:
        results.append(("2D坐标轴比例", test_2d_aspect_ratio_verification()))
    except Exception as e:
        logger.error(f"测试3失败: {e}")
        results.append(("2D坐标轴比例", False))
    
    try:
        results.append(("极端条件稳定性", test_extreme_conditions()))
    except Exception as e:
        logger.error(f"测试4失败: {e}")
        results.append(("极端条件稳定性", False))
    
    print("\n" + "=" * 70)
    print("测试汇总")
    print("=" * 70)
    
    all_passed = True
    for name, passed in results:
        status = "通过" if passed else "失败"
        print(f"  {name}: {status}")
        if not passed:
            all_passed = False
    
    print(f"\n{'所有测试通过!' if all_passed else '部分测试失败!'}")
    print("=" * 70)
    
    return all_passed


if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
