import sys
import os
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))

from solver.parameters import SimulationParams
from solver.finite_difference import FiniteDifferenceSolver
from visualization.visualizer import ResultVisualizer

print("=" * 60)
print("测试1: 1D均质介质模拟")
print("=" * 60)

params = SimulationParams(
    model_dim=1,
    nx=50,
    Lx=100.0,
    t_total=20.0,
    dt=0.05,
    output_freq=20,
    D=1.0,
    vx=0.5,
    porosity=0.3,
    retardation=1.0,
    source_strength=10.0,
    source_x=10.0,
    source_width=5.0
)

print(f"参数验证: {params.validate()}")

solver = FiniteDifferenceSolver(params)
results = solver.solve_1d()

print(f"模拟时间步数: {len(results['times'])}")
print(f"最终最大浓度: {max(np.max(C) for C in results['concentrations'])}")
print(f"最终最小浓度: {min(np.min(C) for C in results['concentrations'])}")

visualizer = ResultVisualizer(results, output_dir='test_output_1d')
output_files = visualizer.generate_all_plots()
print(f"生成文件数: {len(output_files)}")
for f in output_files:
    print(f"  - {f}")

print("\n" + "=" * 60)
print("测试2: 1D非均质介质模拟")
print("=" * 60)

params2 = SimulationParams(
    model_dim=1,
    nx=50,
    Lx=100.0,
    t_total=20.0,
    dt=0.05,
    output_freq=20,
    D=1.0,
    vx=0.5,
    source_strength=10.0,
    source_x=10.0,
    source_width=5.0
)
params2.generate_heterogeneous_fields(seed=42)

print(f"非均质参数验证: {params2.validate()}")

solver2 = FiniteDifferenceSolver(params2)
results2 = solver2.solve_1d()

print(f"模拟时间步数: {len(results2['times'])}")

visualizer2 = ResultVisualizer(results2, output_dir='test_output_1d_hetero')
output_files2 = visualizer2.generate_all_plots()
print(f"生成文件数: {len(output_files2)}")

print("\n" + "=" * 60)
print("所有测试完成!")
print("=" * 60)
