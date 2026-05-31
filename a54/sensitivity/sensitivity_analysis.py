import numpy as np
import logging
import os
import copy
import json
import csv
from typing import Dict, Any, List, Optional, Tuple
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from solver.parameters import SimulationParams
from solver.finite_difference import FiniteDifferenceSolver
from visualization.visualizer import ResultVisualizer

logger = logging.getLogger(__name__)


class SensitivityAnalyzer:
    SUPPORTED_PARAMETERS = [
        'D', 'vx', 'vy', 'porosity', 'retardation', 
        'decay', 'dt', 'source_strength', 'source_x',
        'Lx', 'Ly', 't_total'
    ]
    
    METRIC_DESCRIPTIONS = {
        'final_max': 'Final Maximum Concentration',
        'final_min': 'Final Minimum Concentration',
        'final_mean': 'Final Mean Concentration',
        'total_mass': 'Total Mass at Final Time',
        'point_max': 'Max Concentration at Observation Point',
        'point_final': 'Final Concentration at Observation Point',
        'arrival_time': 'Arrival Time (Concentration > 5% of Max)',
        'peak_time': 'Time of Peak Concentration',
        'spread_width': 'Concentration Spread Width',
        'retention_ratio': 'Retention Ratio (Mass Remaining)'
    }
    
    def __init__(self, base_params: SimulationParams, output_dir: str = 'sensitivity_output'):
        self.base_params = base_params
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        
        self.results: Dict[str, Any] = {
            'parameter': None,
            'values': [],
            'simulations': [],
            'sensitivity_indices': {}
        }
        
    def _create_param_variation(self, param_name: str, values: List[float]) -> List[SimulationParams]:
        if param_name not in self.SUPPORTED_PARAMETERS:
            raise ValueError(f"不支持的参数: {param_name}. 支持的参数: {self.SUPPORTED_PARAMETERS}")
            
        params_list = []
        
        for val in values:
            params = copy.deepcopy(self.base_params)
            
            if param_name == 'D':
                params.D = val
                if params.D_map is not None:
                    params.D_map = params.D_map / np.mean(params.D_map) * val
            elif param_name == 'vx':
                params.vx = val
                if params.vx_map is not None:
                    params.vx_map = params.vx_map / np.mean(params.vx_map) * val
            elif param_name == 'vy':
                params.vy = val
                if params.vy_map is not None:
                    params.vy_map = params.vy_map / np.mean(params.vy_map) * val
            elif param_name == 'porosity':
                params.porosity = val
                if params.porosity_map is not None:
                    params.porosity_map = params.porosity_map / np.mean(params.porosity_map) * val
            elif param_name == 'retardation':
                params.retardation = val
                if params.retardation_map is not None:
                    params.retardation_map = params.retardation_map / np.mean(params.retardation_map) * val
            elif param_name == 'decay':
                params.decay = val
            elif param_name == 'dt':
                params.dt = val
            elif param_name == 'source_strength':
                params.source_strength = val
            elif param_name == 'source_x':
                params.source_x = val
            elif param_name == 'Lx':
                params.Lx = val
                params.nx = int(val / (self.base_params.Lx / self.base_params.nx))
            elif param_name == 'Ly':
                params.Ly = val
                params.ny = int(val / (self.base_params.Ly / self.base_params.ny))
            elif param_name == 't_total':
                params.t_total = val
            
            params_list.append(params)
            
        return params_list
        
    def run_analysis(self, param_name: str, values: List[float], 
                     metric_point: Optional[Tuple[float, float]] = None,
                     output_individual_results: bool = False) -> Dict[str, Any]:
        
        logger.info("=" * 60)
        logger.info(f"开始参数敏感性分析")
        logger.info("=" * 60)
        logger.info(f"分析参数: {param_name}")
        logger.info(f"参数取值: {values}")
        logger.info(f"模型维度: {self.base_params.model_dim}D")
        
        if metric_point:
            logger.info(f"观测点: {metric_point}")
        
        params_list = self._create_param_variation(param_name, values)
        
        simulations = []
        for idx, (val, params) in enumerate(zip(values, params_list)):
            logger.info(f"\n{'='*50}")
            logger.info(f"模拟 {idx+1}/{len(values)}: {param_name} = {val}")
            logger.info(f"{'='*50}")
            
            if not params.validate():
                logger.warning(f"参数验证警告: {param_name} = {val}")
            
            solver = FiniteDifferenceSolver(params)
            if params.model_dim == 1:
                results = solver.solve_1d()
            else:
                results = solver.solve_2d()
            
            if output_individual_results:
                sub_dir = os.path.join(self.output_dir, f'{param_name}_{val}')
                visualizer = ResultVisualizer(results, output_dir=sub_dir)
                visualizer.generate_all_plots()
                logger.info(f"单独结果已保存到: {sub_dir}")
                
            simulations.append({
                'parameter_value': val,
                'results': results,
                'parameters': params.to_dict()
            })
        
        self.results = {
            'parameter': param_name,
            'values': values,
            'simulations': simulations,
            'metric_point': metric_point
        }
        
        self._calculate_sensitivity_indices()
        self._generate_sensitivity_plots(metric_point)
        self._export_results()
        
        logger.info("\n" + "=" * 60)
        logger.info("参数敏感性分析完成!")
        logger.info("=" * 60)
        
        return self.results
        
    def _calculate_metrics(self, results: Dict[str, Any], 
                          metric_point: Optional[Tuple[float, float]] = None) -> Dict[str, float]:
        
        concentrations = results.get('concentrations', [])
        params = results.get('parameters', {})
        nx = params.get('nx', 100)
        ny = params.get('ny', 50)
        Lx = params.get('Lx', 100.0)
        Ly = params.get('Ly', 50.0)
        model_dim = params.get('model_dim', 1)
        times = results.get('times', [])
        
        metrics = {}
        
        if concentrations:
            final_C = concentrations[-1]
            metrics['final_max'] = np.max(final_C)
            metrics['final_min'] = np.min(final_C)
            metrics['final_mean'] = np.mean(final_C)
            
            if model_dim == 1:
                dx = Lx / (nx - 1)
                metrics['total_mass'] = np.sum(final_C) * dx
                initial_mass = np.sum(concentrations[0]) * dx if len(concentrations) > 0 else 1.0
            else:
                dx = Lx / (nx - 1)
                dy = Ly / (ny - 1)
                metrics['total_mass'] = np.sum(final_C) * dx * dy
                initial_mass = np.sum(concentrations[0]) * dx * dy if len(concentrations) > 0 else 1.0
            
            if initial_mass > 0:
                metrics['retention_ratio'] = metrics['total_mass'] / initial_mass
            else:
                metrics['retention_ratio'] = 0.0
            
            if model_dim == 1:
                C_max = np.max(concentrations[-1])
                threshold = C_max * 0.05
                above_threshold = np.where(concentrations[-1] > threshold)[0]
                if len(above_threshold) > 1:
                    metrics['spread_width'] = (above_threshold[-1] - above_threshold[0]) * dx
                else:
                    metrics['spread_width'] = 0.0
            else:
                metrics['spread_width'] = 0.0
            
            if metric_point is not None:
                px, py = metric_point
                i = int(np.clip(np.round(px / (Lx / (nx - 1))), 0, nx - 1))
                
                if model_dim == 1:
                    point_values = [C[i] for C in concentrations]
                else:
                    j = int(np.clip(np.round(py / (Ly / (ny - 1))), 0, ny - 1))
                    point_values = [C[i, j] for C in concentrations]
                
                metrics['point_max'] = max(point_values)
                metrics['point_final'] = point_values[-1]
                
                peak_idx = np.argmax(point_values)
                if peak_idx < len(times):
                    metrics['peak_time'] = times[peak_idx]
                else:
                    metrics['peak_time'] = 0.0
                
                threshold = max(point_values) * 0.05 if max(point_values) > 0 else 0.01
                arrival_indices = np.where(np.array(point_values) > threshold)[0]
                if len(arrival_indices) > 0:
                    metrics['arrival_time'] = times[arrival_indices[0]]
                else:
                    metrics['arrival_time'] = float('inf')
        
        return metrics
        
    def _calculate_sensitivity_indices(self):
        if len(self.results['simulations']) < 2:
            logger.warning("至少需要2个参数值才能计算敏感性指数")
            return {}
        
        param_values = np.array(self.results['values'])
        all_metrics = []
        
        for sim in self.results['simulations']:
            metrics = self._calculate_metrics(sim['results'], self.results.get('metric_point'))
            all_metrics.append(metrics)
        
        sensitivity_indices = {}
        metric_names = list(all_metrics[0].keys())
        
        for metric_name in metric_names:
            metric_values = np.array([m.get(metric_name, 0) for m in all_metrics])
            
            valid_mask = np.isfinite(metric_values)
            if np.sum(valid_mask) >= 2:
                valid_params = param_values[valid_mask]
                valid_metrics = metric_values[valid_mask]
                
                if len(valid_params) >= 2:
                    sensitivity_indices[metric_name] = {
                        'correlation': np.corrcoef(valid_params, valid_metrics)[0, 1] if np.std(valid_params) > 0 and np.std(valid_metrics) > 0 else 0,
                        'trend_slope': (valid_metrics[-1] - valid_metrics[0]) / (valid_params[-1] - valid_params[0]) if valid_params[-1] != valid_params[0] else 0,
                        'relative_change': (valid_metrics[-1] - valid_metrics[0]) / valid_metrics[0] if valid_metrics[0] != 0 else float('inf'),
                        'values': metric_values.tolist()
                    }
        
        self.results['sensitivity_indices'] = sensitivity_indices
        return sensitivity_indices
        
    def _generate_sensitivity_plots(self, metric_point: Optional[Tuple[float, float]] = None):
        
        param_name = self.results['parameter']
        values = self.results['values']
        simulations = self.results['simulations']
        
        all_metrics = []
        for sim in simulations:
            metrics = self._calculate_metrics(sim['results'], metric_point)
            all_metrics.append(metrics)
        
        if not all_metrics:
            logger.warning("没有可用的度量数据用于绘图")
            return
        
        available_metrics = list(all_metrics[0].keys())
        
        for metric_name in available_metrics:
            metric_values = [m.get(metric_name, 0) for m in all_metrics]
            
            if any(np.isinf(v) or np.isnan(v) for v in metric_values):
                continue
            
            fig, ax = plt.subplots(figsize=(12, 7))
            
            ax.plot(values, metric_values, 'b-o', markersize=8, linewidth=2.5, alpha=0.8)
            
            try:
                z = np.polyfit(values, metric_values, 1)
                p = np.poly1d(z)
                x_fit = np.linspace(min(values), max(values), 100)
                ax.plot(x_fit, p(x_fit), 'r--', alpha=0.7, label=f'趋势线 (slope={z[0]:.4f})')
            except Exception as e:
                logger.debug(f"拟合失败: {e}")
            
            ax.set_xlabel(f'Parameter Value: {param_name}', fontsize=12)
            ax.set_ylabel(self.METRIC_DESCRIPTIONS.get(metric_name, metric_name), fontsize=12)
            ax.set_title(f'Sensitivity Analysis: {param_name} vs {self.METRIC_DESCRIPTIONS.get(metric_name, metric_name)}', 
                        fontsize=14, fontweight='bold')
            ax.grid(True, alpha=0.3, linestyle='--')
            ax.legend()
            
            for i, (val, mv) in enumerate(zip(values, metric_values)):
                ax.annotate(f'{mv:.4f}', (val, mv), 
                           textcoords="offset points", xytext=(0, 12), 
                           ha='center', fontsize=10,
                           bbox=dict(boxstyle='round,pad=0.3', fc='white', alpha=0.8))
            
            ax.fill_between(values, metric_values, alpha=0.2, color='blue')
            
            output_path = os.path.join(self.output_dir, f'sensitivity_{param_name}_{metric_name}.png')
            plt.savefig(output_path, dpi=300, bbox_inches='tight')
            plt.close()
            logger.info(f"已保存敏感性图: {output_path}")
            
        self._plot_sensitivity_radar()
        self._plot_comparison_curves()
        self._create_sensitivity_report()
        
    def _plot_sensitivity_radar(self):
        sensitivity = self.results.get('sensitivity_indices', {})
        if not sensitivity:
            return
            
        param_name = self.results['parameter']
        metric_names = []
        correlations = []
        
        for metric_name, indices in sensitivity.items():
            corr = indices.get('correlation', 0)
            if not np.isnan(corr) and not np.isinf(corr):
                metric_names.append(self.METRIC_DESCRIPTIONS.get(metric_name, metric_name)[:15])
                correlations.append(abs(corr))
        
        if len(metric_names) < 3:
            return
        
        fig, ax = plt.subplots(figsize=(10, 10), subplot_kw=dict(projection='polar'))
        
        angles = np.linspace(0, 2 * np.pi, len(metric_names), endpoint=False).tolist()
        correlations += correlations[:1]
        angles += angles[:1]
        
        ax.fill(angles, correlations, 'b', alpha=0.3)
        ax.plot(angles, correlations, 'b-o', linewidth=2)
        
        ax.set_xticks(angles[:-1])
        ax.set_xticklabels(metric_names, fontsize=10)
        ax.set_ylim(0, 1)
        ax.set_title(f'Sensitivity Radar - {param_name}', fontsize=14, fontweight='bold', pad=20)
        
        output_path = os.path.join(self.output_dir, f'sensitivity_{param_name}_radar.png')
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        plt.close()
        logger.info(f"已保存敏感性雷达图: {output_path}")
        
    def _plot_comparison_curves(self):
        if not self.results['simulations']:
            return
            
        model_dim = self.results['simulations'][0]['results']['parameters']['model_dim']
        
        if model_dim == 1:
            self._plot_1d_comparison()
        else:
            self._plot_2d_comparison()
            
    def _plot_1d_comparison(self):
        param_name = self.results['parameter']
        values = self.results['values']
        simulations = self.results['simulations']
        
        params = simulations[0]['results']['parameters']
        nx = params['nx']
        Lx = params['Lx']
        x = np.linspace(0, Lx, nx)
        
        fig, axes = plt.subplots(2, 1, figsize=(14, 10))
        
        cmap = plt.get_cmap('viridis')
        colors = [cmap(i / len(values)) for i in range(len(values))]
        
        ax1 = axes[0]
        for val, sim, color in zip(values, simulations, colors):
            concentrations = sim['results']['concentrations']
            times = sim['results']['times']
            
            if concentrations:
                final_C = concentrations[-1]
                ax1.plot(x, final_C, label=f'{param_name}={val}', linewidth=2.5, color=color, alpha=0.9)
        
        ax1.set_xlabel('Distance x (m)', fontsize=12)
        ax1.set_ylabel('Concentration C', fontsize=12)
        ax1.set_title(f'Final Concentration Profiles - {param_name} Sensitivity', fontsize=14, fontweight='bold')
        ax1.legend(fontsize=10)
        ax1.grid(True, alpha=0.3)
        ax1.set_ylim(bottom=0)
        
        ax2 = axes[1]
        first_sim = simulations[0]
        params_first = first_sim['results']['parameters']
        nx_first = params_first['nx']
        Lx_first = params_first['Lx']
        mid_idx = nx_first // 2
        
        for val, sim, color in zip(values, simulations, colors):
            concentrations = sim['results']['concentrations']
            times = sim['results']['times']
            
            if concentrations and len(concentrations[0]) > mid_idx:
                mid_values = [C[mid_idx] for C in concentrations]
                ax2.plot(times, mid_values, label=f'{param_name}={val}', linewidth=2, color=color, alpha=0.9)
        
        ax2.set_xlabel('Time t', fontsize=12)
        ax2.set_ylabel('Concentration at midpoint', fontsize=12)
        ax2.set_title(f'Time Series at Midpoint - {param_name} Sensitivity', fontsize=14, fontweight='bold')
        ax2.legend(fontsize=10)
        ax2.grid(True, alpha=0.3)
        ax2.set_ylim(bottom=0)
        
        plt.tight_layout()
        output_path = os.path.join(self.output_dir, f'comparison_{param_name}_final.png')
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        plt.close()
        logger.info(f"已保存对比图: {output_path}")
        
    def _plot_2d_comparison(self):
        param_name = self.results['parameter']
        if not self.results['simulations']:
            return
            
        params = self.results['simulations'][0]['results']['parameters']
        nx = params['nx']
        ny = params['ny']
        Lx = params['Lx']
        Ly = params['Ly']
        
        x = np.linspace(0, Lx, nx)
        y = np.linspace(0, Ly, ny)
        
        n_sim = len(self.results['simulations'])
        n_cols = min(3, n_sim)
        n_rows = (n_sim + n_cols - 1) // n_cols
        
        fig_width = 5 * n_cols + 3
        aspect_ratio = Ly / Lx
        fig_height = 4 * n_rows * aspect_ratio + 2
        
        fig, axes = plt.subplots(n_rows, n_cols, figsize=(fig_width, max(fig_height, 6)))
        if n_sim == 1:
            axes = [axes]
        elif n_rows == 1:
            axes = list(axes)
        else:
            axes = [ax for row in axes for ax in row]
        
        max_C = max(np.max(sim['results']['concentrations'][-1]) 
                   for sim in self.results['simulations'])
        
        for idx, (val, sim, ax) in enumerate(zip(self.results['values'], 
                                                 self.results['simulations'], 
                                                 axes[:n_sim])):
            final_C = sim['results']['concentrations'][-1]
            
            im = ax.pcolormesh(x, y, final_C.T, cmap='viridis', 
                              shading='auto', vmin=0, vmax=max_C)
            
            ax.set_aspect('equal', adjustable='box')
            ax.set_title(f'{param_name} = {val}', fontsize=12, fontweight='bold')
            ax.set_xlabel('x (m)', fontsize=10)
            ax.set_ylabel('y (m)', fontsize=10)
            ax.tick_params(axis='both', labelsize=8)
            
        for ax in axes[n_sim:]:
            ax.axis('off')
        
        fig.suptitle(f'{param_name} Sensitivity Analysis - Final Concentration Fields', 
                    fontsize=14, fontweight='bold')
        
        cbar_ax = fig.add_axes([0.92, 0.15, 0.02, 0.7])
        fig.colorbar(im, cax=cbar_ax, label='Concentration C')
        plt.tight_layout(rect=[0, 0, 0.9, 0.95])
        
        output_path = os.path.join(self.output_dir, f'comparison_{param_name}_2d.png')
        plt.savefig(output_path, dpi=200, bbox_inches='tight')
        plt.close()
        logger.info(f"已保存2D对比图: {output_path}")
        
    def _create_sensitivity_report(self):
        param_name = self.results['parameter']
        values = self.results['values']
        sensitivity = self.results.get('sensitivity_indices', {})
        
        output_path = os.path.join(self.output_dir, f'sensitivity_report_{param_name}.txt')
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write('=' * 80 + '\n')
            f.write('PARAMETRIC SENSITIVITY ANALYSIS REPORT\n')
            f.write('=' * 80 + '\n\n')
            
            f.write(f'Analysis Date: {np.datetime64("now")}\n')
            f.write(f'Analyzed Parameter: {param_name}\n')
            f.write(f'Parameter Values: {values}\n')
            f.write(f'Number of Simulations: {len(values)}\n')
            f.write(f'Model Dimension: {self.base_params.model_dim}D\n\n')
            
            f.write('【Base Parameters】\n')
            f.write('-' * 60 + '\n')
            for key, value in self.base_params.to_dict().items():
                f.write(f'{key:20s}: {value}\n')
            f.write('\n')
            
            f.write('【Sensitivity Indices】\n')
            f.write('-' * 60 + '\n')
            f.write(f"{'Metric':<25s} {'Correlation':>15s} {'Trend Slope':>15s} {'Rel Change':>15s}\n")
            f.write('-' * 70 + '\n')
            
            for metric_name, indices in sensitivity.items():
                corr = indices.get('correlation', 0)
                slope = indices.get('trend_slope', 0)
                rel_change = indices.get('relative_change', 0)
                
                if np.isnan(corr):
                    corr_str = 'N/A'
                else:
                    corr_str = f'{corr:.4f}'
                
                if np.isinf(rel_change):
                    rel_str = 'N/A'
                else:
                    rel_str = f'{rel_change:.4f}'
                
                f.write(f"{metric_name:<25s} {corr_str:>15s} {slope:>15.4f} {rel_str:>15s}\n")
            
            f.write('\n')
            f.write('【Simulation Results Summary】\n')
            f.write('-' * 60 + '\n')
            
            for idx, sim in enumerate(self.results['simulations']):
                val = sim['parameter_value']
                results = sim['results']
                metrics = self._calculate_metrics(results, self.results.get('metric_point'))
                
                f.write(f'\n--- Simulation {idx+1}: {param_name} = {val} ---\n')
                for metric_name, metric_value in metrics.items():
                    if np.isfinite(metric_value):
                        f.write(f'  {metric_name}: {metric_value:.6f}\n')
                    else:
                        f.write(f'  {metric_name}: {metric_value}\n')
            
            f.write('\n')
            f.write('【Output Files】\n')
            f.write('-' * 60 + '\n')
            f.write(f'- sensitivity_{param_name}_*.png: Sensitivity curves\n')
            f.write(f'- sensitivity_{param_name}_radar.png: Radar chart\n')
            f.write(f'- comparison_{param_name}_*.png: Comparison plots\n')
            f.write(f'- sensitivity_{param_name}_summary.json: JSON summary\n')
            f.write(f'- sensitivity_report_{param_name}.txt: This report\n')
            
            f.write('\n')
            f.write('=' * 80 + '\n')
        
        logger.info(f"已生成敏感性分析报告: {output_path}")
        
    def _export_results(self):
        json_path = os.path.join(self.output_dir, f'sensitivity_{self.results["parameter"]}_summary.json')
        
        export_data = {
            'parameter': self.results['parameter'],
            'values': self.results['values'],
            'metric_point': self.results.get('metric_point'),
            'base_parameters': self.base_params.to_dict(),
            'sensitivity_indices': self.results.get('sensitivity_indices', {}),
            'simulations': []
        }
        
        for sim in self.results['simulations']:
            metrics = self._calculate_metrics(sim['results'], self.results.get('metric_point'))
            export_data['simulations'].append({
                'parameter_value': sim['parameter_value'],
                'metrics': {k: (v if np.isfinite(v) else str(v)) for k, v in metrics.items()}
            })
        
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(export_data, f, indent=2, ensure_ascii=False)
        
        logger.info(f"已导出JSON汇总: {json_path}")
        
        csv_path = os.path.join(self.output_dir, f'sensitivity_{self.results["parameter"]}_summary.csv')
        
        if self.results['simulations']:
            first_metrics = self._calculate_metrics(
                self.results['simulations'][0]['results'],
                self.results.get('metric_point')
            )
            metric_names = list(first_metrics.keys())
            
            with open(csv_path, 'w', encoding='utf-8', newline='') as f:
                writer = csv.writer(f)
                header = [self.results['parameter']] + metric_names
                writer.writerow(header)
                
                for sim in self.results['simulations']:
                    metrics = self._calculate_metrics(sim['results'], self.results.get('metric_point'))
                    row = [sim['parameter_value']]
                    for m in metric_names:
                        val = metrics.get(m, '')
                        row.append(val if np.isfinite(val) else '')
                    writer.writerow(row)
        
        logger.info(f"已导出CSV汇总: {csv_path}")


def run_multi_parameter_sensitivity(
    base_params: SimulationParams,
    parameter_configs: List[Dict[str, Any]],
    output_dir: str = 'multi_sensitivity_output',
    metric_point: Optional[Tuple[float, float]] = None
) -> Dict[str, Any]:
    """
    运行多参数敏感性分析
    
    参数配置格式:
    [
        {'name': 'D', 'values': [0.5, 1.0, 2.0]},
        {'name': 'vx', 'values': [0.25, 0.5, 1.0]}
    ]
    """
    logger.info("=" * 80)
    logger.info("MULTI-PARAMETER SENSITIVITY ANALYSIS")
    logger.info("=" * 80)
    
    all_results = {}
    
    for config in parameter_configs:
        param_name = config['name']
        values = config['values']
        
        sub_dir = os.path.join(output_dir, param_name)
        
        analyzer = SensitivityAnalyzer(base_params, output_dir=sub_dir)
        results = analyzer.run_analysis(param_name, values, metric_point=metric_point)
        
        all_results[param_name] = results
    
    _generate_comparative_summary(all_results, output_dir)
    
    return all_results


def _generate_comparative_summary(all_results: Dict[str, Any], output_dir: str):
    """生成多参数敏感性比较汇总"""
    if not all_results:
        return
    
    summary_data = []
    for param_name, results in all_results.items():
        sensitivity = results.get('sensitivity_indices', {})
        for metric_name, indices in sensitivity.items():
            corr = indices.get('correlation', 0)
            if np.isfinite(corr):
                summary_data.append({
                    'parameter': param_name,
                    'metric': metric_name,
                    'correlation': abs(corr)
                })
    
    if not summary_data:
        return
    
    metric_names = sorted(set(d['metric'] for d in summary_data))
    param_names = sorted(all_results.keys())
    
    corr_matrix = {}
    for param_name in param_names:
        corr_matrix[param_name] = {}
        for metric_name in metric_names:
            data = [d['correlation'] for d in summary_data 
                   if d['parameter'] == param_name and d['metric'] == metric_name]
            corr_matrix[param_name][metric_name] = data[0] if data else 0
    
    fig, ax = plt.subplots(figsize=(12, 8))
    
    corr_values = np.array([[corr_matrix[p][m] for m in metric_names] for p in param_names])
    im = ax.imshow(corr_values, cmap='YlOrRd', aspect='auto', vmin=0, vmax=1)
    
    ax.set_xticks(np.arange(len(metric_names)))
    ax.set_yticks(np.arange(len(param_names)))
    ax.set_xticklabels([SensitivityAnalyzer.METRIC_DESCRIPTIONS.get(m, m)[:20] for m in metric_names], 
                      rotation=45, ha='right')
    ax.set_yticklabels(param_names)
    
    plt.colorbar(im, label='|Correlation|')
    ax.set_title('Multi-Parameter Sensitivity Comparison', fontsize=14, fontweight='bold')
    
    for i in range(len(param_names)):
        for j in range(len(metric_names)):
            ax.text(j, i, f'{corr_values[i, j]:.2f}', 
                   ha='center', va='center', 
                   color='white' if corr_values[i, j] > 0.5 else 'black',
                   fontsize=10)
    
    plt.tight_layout()
    output_path = os.path.join(output_dir, 'multi_parameter_sensitivity_heatmap.png')
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    
    logger.info(f"已生成多参数敏感性热力图: {output_path}")
