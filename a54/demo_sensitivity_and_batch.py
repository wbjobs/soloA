#!/usr/bin/env python
"""
演示参数敏感性分析和批量模拟功能
"""
import sys
import os
import logging
sys.path.insert(0, os.path.dirname(__file__))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

from solver.parameters import SimulationParams
from sensitivity.sensitivity_analysis import SensitivityAnalyzer, run_multi_parameter_sensitivity
from batch.batch_runner import BatchRunner, create_example_config


def demo_1d_sensitivity():
    """演示1D模型参数敏感性分析"""
    print("\n" + "=" * 80)
    print("DEMO 1: 1D模型 - 弥散系数(D)敏感性分析")
    print("=" * 80)
    
    params = SimulationParams(
        model_dim=1,
        nx=50,
        Lx=100.0,
        t_total=30.0,
        dt=0.05,
        output_freq=30,
        D=1.0,
        vx=0.5,
        porosity=0.3,
        retardation=1.0,
        source_strength=10.0,
        source_x=10.0,
        source_width=5.0
    )
    
    analyzer = SensitivityAnalyzer(params, output_dir='demo_sensitivity_1d_D')
    results = analyzer.run_analysis(
        param_name='D',
        values=[0.25, 0.5, 1.0, 2.0, 4.0],
        metric_point=(50.0, 0)
    )
    
    print("\n敏感性分析结果:")
    for metric, indices in results.get('sensitivity_indices', {}).items():
        print(f"  {metric}: correlation={indices.get('correlation', 0):.4f}")
    
    return results


def demo_2d_sensitivity():
    """演示2D模型参数敏感性分析"""
    print("\n" + "=" * 80)
    print("DEMO 2: 2D模型 - 流速(vx)敏感性分析")
    print("=" * 80)
    
    params = SimulationParams(
        model_dim=2,
        nx=30,
        ny=20,
        Lx=100.0,
        Ly=50.0,
        t_total=20.0,
        dt=0.1,
        output_freq=20,
        D=1.0,
        vx=0.5,
        vy=0.0,
        source_strength=10.0,
        source_x=10.0,
        source_y=25.0,
        source_width=5.0
    )
    
    analyzer = SensitivityAnalyzer(params, output_dir='demo_sensitivity_2d_vx')
    results = analyzer.run_analysis(
        param_name='vx',
        values=[0.1, 0.25, 0.5, 1.0, 2.0],
        metric_point=(50.0, 25.0)
    )
    
    print("\n敏感性分析结果:")
    for metric, indices in results.get('sensitivity_indices', {}).items():
        print(f"  {metric}: correlation={indices.get('correlation', 0):.4f}")
    
    return results


def demo_multi_parameter_sensitivity():
    """演示多参数敏感性分析"""
    print("\n" + "=" * 80)
    print("DEMO 3: 多参数敏感性分析 (D 和 vx)")
    print("=" * 80)
    
    params = SimulationParams(
        model_dim=1,
        nx=40,
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
    
    parameter_configs = [
        {'name': 'D', 'values': [0.5, 1.0, 2.0, 4.0]},
        {'name': 'vx', 'values': [0.25, 0.5, 1.0, 2.0]}
    ]
    
    results = run_multi_parameter_sensitivity(
        base_params=params,
        parameter_configs=parameter_configs,
        output_dir='demo_multi_sensitivity',
        metric_point=(50.0, 0)
    )
    
    print("\n多参数敏感性分析完成!")
    print("输出目录: demo_multi_sensitivity/")
    
    return results


def demo_batch_simulation_json():
    """演示JSON配置文件批量模拟"""
    print("\n" + "=" * 80)
    print("DEMO 4: JSON配置文件批量模拟")
    print("=" * 80)
    
    config_path = create_example_config('demo_batch_config.json')
    print(f"已创建示例配置文件: {config_path}")
    
    runner = BatchRunner(output_dir='demo_batch_json')
    results = runner.run_from_file(config_path)
    
    success_count = sum(1 for r in results if r['status'] == 'success')
    print(f"\n批量模拟完成: 成功 {success_count}/{len(results)}")
    
    return results


def demo_batch_simulation_csv():
    """演示CSV配置文件批量模拟"""
    print("\n" + "=" * 80)
    print("DEMO 5: CSV配置文件批量模拟")
    print("=" * 80)
    
    import csv
    
    csv_path = 'demo_batch_config.csv'
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow([
            'name', 'description', 'model_dim', 'nx', 'ny', 'Lx', 'Ly',
            't_total', 'dt', 'D', 'vx', 'source_strength', 'source_x', 'source_y', 'source_width'
        ])
        writer.writerow([
            'Low_D', 'Low dispersion case', 1, 50, 0, 100, 0,
            30, 0.05, 0.5, 0.5, 10, 10, 0, 5
        ])
        writer.writerow([
            'High_D', 'High dispersion case', 1, 50, 0, 100, 0,
            30, 0.05, 2.0, 0.5, 10, 10, 0, 5
        ])
        writer.writerow([
            'High_vx', 'High velocity case', 1, 50, 0, 100, 0,
            30, 0.025, 1.0, 1.0, 10, 10, 0, 5
        ])
    
    print(f"已创建CSV配置文件: {csv_path}")
    
    runner = BatchRunner(output_dir='demo_batch_csv')
    results = runner.run_from_file(csv_path)
    
    success_count = sum(1 for r in results if r['status'] == 'success')
    print(f"\n批量模拟完成: 成功 {success_count}/{len(results)}")
    
    return results


def main():
    print("=" * 80)
    print("地下水溶质运移模拟 - 敏感性分析和批量模拟演示")
    print("=" * 80)
    
    results = {}
    
    try:
        results['1d_sensitivity'] = demo_1d_sensitivity()
    except Exception as e:
        logger.error(f"1D敏感性分析失败: {e}")
    
    try:
        results['2d_sensitivity'] = demo_2d_sensitivity()
    except Exception as e:
        logger.error(f"2D敏感性分析失败: {e}")
    
    try:
        results['multi_sensitivity'] = demo_multi_parameter_sensitivity()
    except Exception as e:
        logger.error(f"多参数敏感性分析失败: {e}")
    
    try:
        results['batch_json'] = demo_batch_simulation_json()
    except Exception as e:
        logger.error(f"JSON批量模拟失败: {e}")
    
    try:
        results['batch_csv'] = demo_batch_simulation_csv()
    except Exception as e:
        logger.error(f"CSV批量模拟失败: {e}")
    
    print("\n" + "=" * 80)
    print("所有演示完成!")
    print("=" * 80)
    print("\n生成的输出目录:")
    print("  - demo_sensitivity_1d_D/     - 1D D参数敏感性分析")
    print("  - demo_sensitivity_2d_vx/    - 2D vx参数敏感性分析")
    print("  - demo_multi_sensitivity/    - 多参数敏感性分析")
    print("  - demo_batch_json/           - JSON配置批量模拟")
    print("  - demo_batch_csv/            - CSV配置批量模拟")
    
    return results


if __name__ == '__main__':
    main()
