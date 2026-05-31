import sys
import os
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))

from solver.parameters import SimulationParams
from solver.finite_difference import FiniteDifferenceSolver
from visualization.visualizer import ResultVisualizer
from sensitivity.sensitivity_analysis import SensitivityAnalyzer

print("=" * 60)
print("测试3: 2D模拟")
print("=" * 60)

params = SimulationParams(
    model_dim=2,
    nx=30,
    ny=20,
    Lx=100.0,
    Ly=50.0,
    t_total=10.0,
    dt=0.05,
    output_freq=10,
    D=1.0,
    vx=0.5,
    vy=0.0,
    source_strength=10.0,
    source_x=10.0,
    source_y=25.0,
    source_width=5.0
)

print(f"参数验证: {params.validate()}")

solver = FiniteDifferenceSolver(params)
results = solver.solve_2d()

print(f"模拟时间步数: {len(results['times'])}")
final_C = results['concentrations'][-1]
print(f"最终最大浓度: {np.max(final_C)}")
print(f"最终最小浓度: {np.min(final_C)}")

visualizer = ResultVisualizer(results, output_dir='test_output_2d')
output_files = visualizer.generate_all_plots()
print(f"生成文件数: {len(output_files)}")
for f in output_files:
    print(f"  - {f}")

print("\n" + "=" * 60)
print("测试4: 参数敏感性分析")
print("=" * 60)

base_params = SimulationParams(
    model_dim=1,
    nx=50,
    Lx=100.0,
    t_total=10.0,
    dt=0.05,
    output_freq=10,
    D=1.0,
    vx=0.5,
    source_strength=10.0,
    source_x=10.0,
    source_width=5.0
)

analyzer = SensitivityAnalyzer(base_params, output_dir='test_sensitivity')
results = analyzer.run_analysis('D', [0.5, 1.0, 2.0, 5.0])

print(f"敏感性分析完成，参数: {results['parameter']}")
print(f"参数值: {results['values']}")

print("\n" + "=" * 60)
print("所有2D和敏感性测试完成!")
print("=" * 60)
