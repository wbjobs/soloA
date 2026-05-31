import argparse
import logging
import os
import json
from typing import Dict, Any

from solver.parameters import SimulationParams
from solver.finite_difference import FiniteDifferenceSolver
from visualization.visualizer import ResultVisualizer
from sensitivity.sensitivity_analysis import SensitivityAnalyzer
from batch.batch_runner import BatchRunner


def setup_logging(output_dir: str = 'output'):
    os.makedirs(output_dir, exist_ok=True)
    log_file = os.path.join(output_dir, 'simulation.log')
    
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file, encoding='utf-8'),
            logging.StreamHandler()
        ]
    )


def run_simulation(args):
    logger = logging.getLogger(__name__)
    
    params = SimulationParams(
        model_dim=args.dim,
        nx=args.nx,
        ny=args.ny,
        Lx=args.Lx,
        Ly=args.Ly,
        t_total=args.t_total,
        dt=args.dt,
        output_freq=args.output_freq,
        D=args.D,
        vx=args.vx,
        vy=args.vy,
        porosity=args.porosity,
        retardation=args.retardation,
        decay=args.decay,
        source_strength=args.source_strength,
        source_x=args.source_x,
        source_y=args.source_y,
        source_width=args.source_width,
        C_left=args.C_left,
        C_right=args.C_right,
        C_top=args.C_top,
        C_bottom=args.C_bottom
    )
    
    if args.heterogeneous:
        params.generate_heterogeneous_fields(seed=args.seed)
    
    if not params.validate():
        logger.error("参数验证失败")
        return 1
    
    output_dir = args.output_dir
    setup_logging(output_dir)
    
    logger.info("开始地下水溶质运移模拟")
    logger.info(f"模型维度: {params.model_dim}D")
    
    solver = FiniteDifferenceSolver(params)
    
    if params.model_dim == 1:
        results = solver.solve_1d()
    else:
        results = solver.solve_2d()
    
    visualizer = ResultVisualizer(results, output_dir=output_dir)
    output_files = visualizer.generate_all_plots()
    
    logger.info(f"模拟完成，输出文件: {len(output_files)} 个")
    return 0


def run_sensitivity(args):
    logger = logging.getLogger(__name__)
    
    params = SimulationParams(
        model_dim=args.dim,
        nx=args.nx,
        ny=args.ny,
        Lx=args.Lx,
        Ly=args.Ly,
        t_total=args.t_total,
        dt=args.dt,
        output_freq=args.output_freq,
        D=args.D,
        vx=args.vx,
        vy=args.vy,
        porosity=args.porosity,
        retardation=args.retardation,
        decay=args.decay,
        source_strength=args.source_strength,
        source_x=args.source_x,
        source_y=args.source_y,
        source_width=args.source_width
    )
    
    if args.heterogeneous:
        params.generate_heterogeneous_fields(seed=args.seed)
    
    if not params.validate():
        logger.error("参数验证失败")
        return 1
    
    output_dir = args.output_dir
    setup_logging(output_dir)
    
    if args.values:
        values = [float(v) for v in args.values.split(',')]
    else:
        if args.param == 'D':
            values = [0.5, 1.0, 2.0, 5.0]
        elif args.param in ['vx', 'vy']:
            values = [0.1, 0.5, 1.0, 2.0]
        else:
            values = [0.1, 0.5, 1.0]
    
    metric_point = None
    if args.metric_point:
        parts = [float(p) for p in args.metric_point.split(',')]
        if len(parts) >= 2:
            metric_point = (parts[0], parts[1])
    
    analyzer = SensitivityAnalyzer(params, output_dir=output_dir)
    results = analyzer.run_analysis(args.param, values, metric_point=metric_point)
    
    logger.info(f"敏感性分析完成: {args.param}")
    return 0


def run_batch(args):
    logger = logging.getLogger(__name__)
    
    output_dir = args.output_dir
    setup_logging(output_dir)
    
    runner = BatchRunner(output_dir=output_dir)
    results = runner.run_from_file(args.config_file)
    
    success_count = sum(1 for r in results if r['status'] == 'success')
    logger.info(f"批量模拟完成: 成功 {success_count}/{len(results)}")
    return 0


def create_example_config(args):
    config = [
        {
            "model_dim": 1,
            "nx": 100,
            "Lx": 100.0,
            "t_total": 50.0,
            "dt": 0.1,
            "D": 1.0,
            "vx": 0.5,
            "source_strength": 10.0,
            "source_x": 10.0,
            "source_width": 5.0
        },
        {
            "model_dim": 1,
            "nx": 100,
            "Lx": 100.0,
            "t_total": 50.0,
            "dt": 0.1,
            "D": 2.0,
            "vx": 0.5,
            "source_strength": 10.0,
            "source_x": 10.0,
            "source_width": 5.0
        },
        {
            "model_dim": 2,
            "nx": 50,
            "ny": 30,
            "Lx": 100.0,
            "Ly": 50.0,
            "t_total": 50.0,
            "dt": 0.1,
            "D": 1.0,
            "vx": 0.5,
            "vy": 0.0,
            "source_strength": 10.0,
            "source_x": 10.0,
            "source_y": 25.0,
            "source_width": 5.0
        }
    ]
    
    output_path = args.output
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    
    print(f"示例配置文件已创建: {output_path}")
    return 0


def main():
    parser = argparse.ArgumentParser(
        description='地下水溶质运移数值模拟工具',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
示例用法:
  # 运行1D模拟
  python main.py simulate --dim 1 --nx 100 --D 1.0 --vx 0.5
  
  # 运行2D模拟
  python main.py simulate --dim 2 --nx 100 --ny 50 --D 1.0 --vx 0.5
  
  # 参数敏感性分析
  python main.py sensitivity --param D --values 0.5,1.0,2.0
  
  # 批量模拟
  python main.py batch --config config.json
  
  # 创建示例配置文件
  python main.py example-config
        '''
    )
    
    subparsers = parser.add_subparsers(dest='command', help='可用命令')
    
    sim_parser = subparsers.add_parser('simulate', help='运行单次模拟')
    sim_parser.add_argument('--dim', type=int, default=1, choices=[1, 2], help='模型维度 (1或2)')
    sim_parser.add_argument('--nx', type=int, default=100, help='x方向网格数')
    sim_parser.add_argument('--ny', type=int, default=50, help='y方向网格数 (仅2D)')
    sim_parser.add_argument('--Lx', type=float, default=100.0, help='x方向长度 (m)')
    sim_parser.add_argument('--Ly', type=float, default=50.0, help='y方向长度 (m, 仅2D)')
    sim_parser.add_argument('--t-total', type=float, default=50.0, help='总时间')
    sim_parser.add_argument('--dt', type=float, default=0.1, help='时间步长')
    sim_parser.add_argument('--output-freq', type=int, default=10, help='输出频率')
    sim_parser.add_argument('--D', type=float, default=1.0, help='弥散系数')
    sim_parser.add_argument('--vx', type=float, default=0.5, help='x方向流速')
    sim_parser.add_argument('--vy', type=float, default=0.0, help='y方向流速')
    sim_parser.add_argument('--porosity', type=float, default=0.3, help='孔隙度')
    sim_parser.add_argument('--retardation', type=float, default=1.0, help='阻滞系数')
    sim_parser.add_argument('--decay', type=float, default=0.0, help='衰减系数')
    sim_parser.add_argument('--source-strength', type=float, default=10.0, help='源强')
    sim_parser.add_argument('--source-x', type=float, default=10.0, help='源x位置')
    sim_parser.add_argument('--source-y', type=float, default=25.0, help='源y位置 (仅2D)')
    sim_parser.add_argument('--source-width', type=float, default=5.0, help='源宽度')
    sim_parser.add_argument('--C-left', type=float, default=0.0, help='左边界浓度')
    sim_parser.add_argument('--C-right', type=float, default=0.0, help='右边界浓度')
    sim_parser.add_argument('--C-top', type=float, default=0.0, help='上边界浓度 (仅2D)')
    sim_parser.add_argument('--C-bottom', type=float, default=0.0, help='下边界浓度 (仅2D)')
    sim_parser.add_argument('--heterogeneous', action='store_true', help='使用非均质介质')
    sim_parser.add_argument('--seed', type=int, default=42, help='随机种子')
    sim_parser.add_argument('--output-dir', type=str, default='output', help='输出目录')
    sim_parser.set_defaults(func=run_simulation)
    
    sens_parser = subparsers.add_parser('sensitivity', help='参数敏感性分析')
    sens_parser.add_argument('--param', type=str, default='D',
                           choices=['D', 'vx', 'vy', 'porosity', 'retardation', 'decay', 'dt', 'source_strength'],
                           help='要分析的参数')
    sens_parser.add_argument('--values', type=str, help='参数值列表，逗号分隔')
    sens_parser.add_argument('--metric-point', type=str, help='观测点坐标，逗号分隔')
    sens_parser.add_argument('--dim', type=int, default=1, choices=[1, 2], help='模型维度')
    sens_parser.add_argument('--nx', type=int, default=100, help='x方向网格数')
    sens_parser.add_argument('--ny', type=int, default=50, help='y方向网格数')
    sens_parser.add_argument('--Lx', type=float, default=100.0, help='x方向长度')
    sens_parser.add_argument('--Ly', type=float, default=50.0, help='y方向长度')
    sens_parser.add_argument('--t-total', type=float, default=50.0, help='总时间')
    sens_parser.add_argument('--dt', type=float, default=0.1, help='时间步长')
    sens_parser.add_argument('--output-freq', type=int, default=10, help='输出频率')
    sens_parser.add_argument('--D', type=float, default=1.0, help='基础弥散系数')
    sens_parser.add_argument('--vx', type=float, default=0.5, help='基础x方向流速')
    sens_parser.add_argument('--vy', type=float, default=0.0, help='基础y方向流速')
    sens_parser.add_argument('--porosity', type=float, default=0.3, help='基础孔隙度')
    sens_parser.add_argument('--retardation', type=float, default=1.0, help='基础阻滞系数')
    sens_parser.add_argument('--decay', type=float, default=0.0, help='基础衰减系数')
    sens_parser.add_argument('--source-strength', type=float, default=10.0, help='源强')
    sens_parser.add_argument('--source-x', type=float, default=10.0, help='源x位置')
    sens_parser.add_argument('--source-y', type=float, default=25.0, help='源y位置')
    sens_parser.add_argument('--source-width', type=float, default=5.0, help='源宽度')
    sens_parser.add_argument('--heterogeneous', action='store_true', help='使用非均质介质')
    sens_parser.add_argument('--seed', type=int, default=42, help='随机种子')
    sens_parser.add_argument('--output-dir', type=str, default='sensitivity_output', help='输出目录')
    sens_parser.set_defaults(func=run_sensitivity)
    
    batch_parser = subparsers.add_parser('batch', help='批量模拟')
    batch_parser.add_argument('--config-file', type=str, required=True, help='配置文件路径 (JSON或CSV)')
    batch_parser.add_argument('--output-dir', type=str, default='batch_output', help='输出目录')
    batch_parser.set_defaults(func=run_batch)
    
    example_parser = subparsers.add_parser('example-config', help='创建示例配置文件')
    example_parser.add_argument('--output', type=str, default='config.json', help='输出文件路径')
    example_parser.set_defaults(func=create_example_config)
    
    args = parser.parse_args()
    
    if args.command is None:
        parser.print_help()
        return 1
    
    return args.func(args)


if __name__ == '__main__':
    import sys
    sys.exit(main())
