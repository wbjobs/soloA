import numpy as np
import logging
import os
import copy
import json
import csv
import time
from datetime import datetime
from typing import Dict, Any, List, Optional
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from solver.parameters import SimulationParams
from solver.finite_difference import FiniteDifferenceSolver
from visualization.visualizer import ResultVisualizer

logger = logging.getLogger(__name__)


class BatchRunner:
    CONFIG_FIELDS = [
        'model_dim', 'nx', 'ny', 'Lx', 'Ly', 't_total', 'dt', 'output_freq',
        'C0', 'C_left', 'C_right', 'C_top', 'C_bottom',
        'source_strength', 'source_x', 'source_y', 'source_width',
        'D', 'vx', 'vy', 'porosity', 'retardation', 'decay',
        'is_heterogeneous', 'seed', 'name', 'description'
    ]
    
    def __init__(self, output_dir: str = 'batch_output', log_level: int = logging.INFO):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        
        self.batch_results: List[Dict[str, Any]] = []
        self.start_time = None
        self.end_time = None
        
    def load_config_file(self, config_path: str) -> List[SimulationParams]:
        if not os.path.exists(config_path):
            raise FileNotFoundError(f"配置文件不存在: {config_path}")
            
        ext = os.path.splitext(config_path)[1].lower()
        
        if ext == '.json':
            return self._load_json_config(config_path)
        elif ext == '.csv':
            return self._load_csv_config(config_path)
        else:
            raise ValueError(f"不支持的配置文件格式: {ext}. 支持的格式: .json, .csv")
            
    def _load_json_config(self, config_path: str) -> List[SimulationParams]:
        with open(config_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        if isinstance(data, dict):
            if 'simulations' in data:
                data = data['simulations']
            elif 'batch' in data:
                data = data['batch']
            else:
                data = [data]
        
        params_list = []
        for idx, item in enumerate(data):
            params = SimulationParams()
            
            for key, value in item.items():
                if hasattr(params, key):
                    setattr(params, key, value)
                else:
                    logger.debug(f"忽略未知参数: {key} = {value}")
            
            if item.get('is_heterogeneous', False) or item.get('heterogeneous', False):
                seed = item.get('seed', np.random.randint(0, 10000))
                params.generate_heterogeneous_fields(seed=seed)
            
            params_list.append(params)
            logger.info(f"加载配置 {idx+1}: {item.get('name', f'Sim_{idx+1}')}")
            
        logger.info(f"从JSON文件加载了 {len(params_list)} 组配置")
        return params_list
        
    def _load_csv_config(self, config_path: str) -> List[SimulationParams]:
        params_list = []
        
        with open(config_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row_idx, row in enumerate(reader):
                params = SimulationParams()
                
                for key, value in row.items():
                    key_lower = key.lower().strip()
                    value = value.strip()
                    
                    if not value:
                        continue
                    
                    if hasattr(params, key_lower):
                        try:
                            if value.lower() in ('true', 'yes', 'y', '1'):
                                setattr(params, key_lower, True)
                            elif value.lower() in ('false', 'no', 'n', '0'):
                                setattr(params, key_lower, False)
                            elif '.' in value or 'e' in value.lower():
                                setattr(params, key_lower, float(value))
                            else:
                                try:
                                    setattr(params, key_lower, int(value))
                                except ValueError:
                                    setattr(params, key_lower, value)
                        except ValueError:
                            setattr(params, key_lower, value)
                
                if row.get('is_heterogeneous', '').lower() in ('true', 'yes', 'y', '1') or \
                   row.get('heterogeneous', '').lower() in ('true', 'yes', 'y', '1'):
                    seed = int(row.get('seed', np.random.randint(0, 10000)))
                    params.generate_heterogeneous_fields(seed=seed)
                
                params_list.append(params)
                logger.info(f"加载配置 {row_idx+1}")
                
        logger.info(f"从CSV文件加载了 {len(params_list)} 组配置")
        return params_list
        
    def run_batch(self, configs: List[SimulationParams], 
                  config_names: Optional[List[str]] = None,
                  config_descriptions: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        
        self.start_time = time.time()
        start_datetime = datetime.now()
        
        logger.info("=" * 80)
        logger.info("BATCH SIMULATION STARTED")
        logger.info("=" * 80)
        logger.info(f"Start time: {start_datetime}")
        logger.info(f"Total simulations: {len(configs)}")
        logger.info(f"Output directory: {os.path.abspath(self.output_dir)}")
        
        self.batch_results = []
        
        for idx, params in enumerate(configs):
            sim_start_time = time.time()
            name = config_names[idx] if config_names and idx < len(config_names) else f'Simulation_{idx+1:03d}'
            desc = config_descriptions[idx] if config_descriptions and idx < len(config_descriptions) else ''
            
            logger.info(f"\n{'='*70}")
            logger.info(f"SIMULATION {idx+1}/{len(configs)}: {name}")
            logger.info(f"{'='*70}")
            
            if desc:
                logger.info(f"Description: {desc}")
            
            if not params.validate():
                logger.error(f"参数验证失败，跳过第 {idx+1} 组")
                self.batch_results.append({
                    'index': idx,
                    'name': name,
                    'description': desc,
                    'status': 'failed',
                    'error': '参数验证失败',
                    'parameters': params.to_dict(),
                    'duration': 0.0
                })
                continue
                
            try:
                solver = FiniteDifferenceSolver(params)
                
                if params.model_dim == 1:
                    results = solver.solve_1d()
                else:
                    results = solver.solve_2d()
                
                sub_dir = os.path.join(self.output_dir, f'simulation_{idx+1:03d}_{name}')
                visualizer = ResultVisualizer(results, output_dir=sub_dir)
                output_files = visualizer.generate_all_plots()
                
                sim_duration = time.time() - sim_start_time
                
                self.batch_results.append({
                    'index': idx,
                    'name': name,
                    'description': desc,
                    'status': 'success',
                    'parameters': params.to_dict(),
                    'results': results,
                    'output_dir': sub_dir,
                    'output_files': output_files,
                    'duration': sim_duration,
                    'metrics': self._extract_metrics(results, params.to_dict())
                })
                
                logger.info(f"模拟完成，耗时: {sim_duration:.2f}s")
                logger.info(f"输出目录: {sub_dir}")
                
            except Exception as e:
                sim_duration = time.time() - sim_start_time
                logger.error(f"模拟 {idx+1} 失败: {e}")
                self.batch_results.append({
                    'index': idx,
                    'name': name,
                    'description': desc,
                    'status': 'failed',
                    'error': str(e),
                    'parameters': params.to_dict(),
                    'duration': sim_duration
                })
                
        self.end_time = time.time()
        self._generate_batch_summary()
        
        logger.info("\n" + "=" * 80)
        logger.info("BATCH SIMULATION COMPLETED")
        logger.info("=" * 80)
        
        total_duration = self.end_time - self.start_time
        success_count = sum(1 for r in self.batch_results if r['status'] == 'success')
        logger.info(f"Total duration: {total_duration:.2f}s")
        logger.info(f"Successful: {success_count}/{len(self.batch_results)}")
        
        return self.batch_results
        
    def run_from_file(self, config_path: str) -> List[Dict[str, Any]]:
        configs = self.load_config_file(config_path)
        return self.run_batch(configs)
        
    def _extract_metrics(self, results: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, float]:
        concentrations = results.get('concentrations', [])
        if not concentrations:
            return {}
            
        final_C = concentrations[-1]
        model_dim = params.get('model_dim', 1)
        
        metrics = {
            'final_max': float(np.max(final_C)),
            'final_min': float(np.min(final_C)),
            'final_mean': float(np.mean(final_C)),
        }
        
        if model_dim == 1:
            dx = params['Lx'] / (params['nx'] - 1)
            metrics['final_mass'] = float(np.sum(final_C) * dx)
            if len(concentrations) > 0:
                initial_mass = float(np.sum(concentrations[0]) * dx)
                if initial_mass > 0:
                    metrics['retention_ratio'] = metrics['final_mass'] / initial_mass
        else:
            dx = params['Lx'] / (params['nx'] - 1)
            dy = params['Ly'] / (params['ny'] - 1)
            metrics['final_mass'] = float(np.sum(final_C) * dx * dy)
            if len(concentrations) > 0:
                initial_mass = float(np.sum(concentrations[0]) * dx * dy)
                if initial_mass > 0:
                    metrics['retention_ratio'] = metrics['final_mass'] / initial_mass
        
        mass_history = results.get('mass_history', [])
        if mass_history:
            metrics['final_mass'] = mass_history[-1]
        
        return metrics
        
    def _generate_batch_summary(self):
        if not self.batch_results:
            return
            
        success_count = sum(1 for r in self.batch_results if r['status'] == 'success')
        failed_count = len(self.batch_results) - success_count
        total_duration = self.end_time - self.start_time if self.end_time else 0
        
        output_path = os.path.join(self.output_dir, 'batch_summary.txt')
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write('=' * 80 + '\n')
            f.write('BATCH SIMULATION SUMMARY REPORT\n')
            f.write('=' * 80 + '\n\n')
            
            f.write(f"Generated: {datetime.now()}\n")
            if self.start_time:
                f.write(f"Start Time: {datetime.fromtimestamp(self.start_time)}\n")
            if self.end_time:
                f.write(f"End Time: {datetime.fromtimestamp(self.end_time)}\n")
            f.write(f"Total Duration: {total_duration:.2f} seconds\n")
            f.write(f"Total Simulations: {len(self.batch_results)}\n")
            f.write(f"Successful: {success_count}\n")
            f.write(f"Failed: {failed_count}\n\n")
            
            f.write('[' + '=' * 50 + ']\n')
            f.write('DETAILED RESULTS\n')
            f.write('[' + '=' * 50 + ']\n')
            
            for result in self.batch_results:
                idx = result['index'] + 1
                status = result['status']
                name = result.get('name', f'Sim_{idx}')
                params = result['parameters']
                
                f.write(f"\n--- [{idx:03d}] {name} ({status.upper()}) ---\n")
                
                if result.get('description'):
                    f.write(f"  Description: {result['description']}\n")
                
                f.write(f"  Model: {params['model_dim']}D\n")
                f.write(f"  Grid: {params['nx']} x {params['ny']}\n")
                f.write(f"  Domain: {params['Lx']}m x {params.get('Ly', 'N/A')}m\n")
                f.write(f"  D: {params['D']}, vx: {params['vx']}, vy: {params.get('vy', 0)}\n")
                f.write(f"  Duration: {result.get('duration', 0):.2f}s\n")
                
                if status == 'failed' and 'error' in result:
                    f.write(f"  ERROR: {result['error']}\n")
                elif 'output_dir' in result:
                    f.write(f"  Output: {result['output_dir']}\n")
                    if 'metrics' in result:
                        for mkey, mval in result['metrics'].items():
                            f.write(f"  {mkey}: {mval:.6f}\n")
            
            f.write('\n' + '[' + '=' * 50 + ']\n')
            f.write('CONFIGURATION EXAMPLES\n')
            f.write('[' + '=' * 50 + ']\n\n')
            
            f.write("JSON Format Example:\n")
            f.write(json.dumps([
                {
                    "name": "Baseline Case",
                    "description": "Standard parameter set",
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
                },
                {
                    "name": "High Dispersion",
                    "description": "Increased dispersion coefficient",
                    "model_dim": 2,
                    "nx": 50,
                    "ny": 30,
                    "Lx": 100.0,
                    "Ly": 50.0,
                    "t_total": 50.0,
                    "dt": 0.1,
                    "D": 5.0,
                    "vx": 0.5,
                    "source_strength": 10.0,
                    "source_x": 10.0,
                    "source_y": 25.0,
                    "source_width": 5.0
                }
            ], indent=2))
            f.write('\n\n')
            
            f.write("CSV Format Example (first row is header):\n")
            f.write("name,description,model_dim,nx,ny,Lx,Ly,t_total,dt,D,vx,source_strength\n")
            f.write("Case1,Standard,2,50,30,100,50,50,0.1,1.0,0.5,10.0\n")
            f.write("Case2,High D,2,50,30,100,50,50,0.1,5.0,0.5,10.0\n")
            
            f.write('\n')
            f.write('=' * 80 + '\n')
        
        self._generate_summary_csv()
        self._generate_summary_json()
        self._generate_comparison_plots()
        
        logger.info(f"已生成批量模拟汇总报告: {output_path}")
        
    def _generate_summary_csv(self):
        if not self.batch_results:
            return
            
        output_path = os.path.join(self.output_dir, 'batch_summary.csv')
        
        all_param_keys = set()
        all_metric_keys = set()
        
        for result in self.batch_results:
            all_param_keys.update(result['parameters'].keys())
            if 'metrics' in result:
                all_metric_keys.update(result['metrics'].keys())
        
        param_keys = sorted(list(all_param_keys))
        metric_keys = sorted(list(all_metric_keys))
        
        with open(output_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            
            header = ['index', 'name', 'status', 'duration'] + param_keys + metric_keys
            writer.writerow(header)
            
            for result in self.batch_results:
                row = [
                    result['index'] + 1,
                    result.get('name', ''),
                    result['status'],
                    f"{result.get('duration', 0):.4f}"
                ]
                
                for key in param_keys:
                    row.append(result['parameters'].get(key, ''))
                
                metrics = result.get('metrics', {})
                for key in metric_keys:
                    val = metrics.get(key, '')
                    row.append(f"{val:.6f}" if isinstance(val, (int, float)) else val)
                
                writer.writerow(row)
        
        logger.info(f"已生成批量模拟汇总CSV: {output_path}")
        
    def _generate_summary_json(self):
        if not self.batch_results:
            return
            
        output_path = os.path.join(self.output_dir, 'batch_summary.json')
        
        summary = {
            'generated_at': datetime.now().isoformat(),
            'total_simulations': len(self.batch_results),
            'success_count': sum(1 for r in self.batch_results if r['status'] == 'success'),
            'failed_count': sum(1 for r in self.batch_results if r['status'] == 'failed'),
            'total_duration': self.end_time - self.start_time if self.end_time else None,
            'simulations': []
        }
        
        for result in self.batch_results:
            sim_summary = {
                'index': result['index'],
                'name': result.get('name', ''),
                'description': result.get('description', ''),
                'status': result['status'],
                'duration': result.get('duration', 0),
                'parameters': result['parameters'],
                'output_dir': result.get('output_dir', '')
            }
            
            if 'metrics' in result:
                sim_summary['metrics'] = result['metrics']
            if 'error' in result:
                sim_summary['error'] = result['error']
            
            summary['simulations'].append(sim_summary)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(summary, f, indent=2, ensure_ascii=False)
        
        logger.info(f"已生成批量模拟汇总JSON: {output_path}")
        
    def _generate_comparison_plots(self):
        if not self.batch_results:
            return
            
        success_results = [r for r in self.batch_results if r['status'] == 'success']
        if not success_results:
            logger.warning("没有成功的模拟结果，跳过比较图")
            return
            
        logger.info("生成批量模拟比较图...")
        
        self._plot_final_concentration_comparison(success_results)
        self._plot_mass_comparison(success_results)
        self._plot_metrics_comparison(success_results)
        
    def _plot_final_concentration_comparison(self, success_results):
        if len(success_results) < 2:
            return
            
        first_result = success_results[0]
        model_dim = first_result['parameters']['model_dim']
        
        cmap = plt.get_cmap('tab10')
        
        if model_dim == 1:
            nx = first_result['parameters']['nx']
            Lx = first_result['parameters']['Lx']
            x = np.linspace(0, Lx, nx)
            
            fig, ax = plt.subplots(figsize=(14, 7))
            
            for idx, result in enumerate(success_results):
                final_C = result['results']['concentrations'][-1]
                sim_name = result.get('name', f'Sim{result["index"]+1}')
                label = sim_name
                color = cmap(idx % 10)
                ax.plot(x, final_C, label=label, linewidth=2.5, color=color, alpha=0.9)
            
            ax.set_xlabel('Distance x (m)', fontsize=12)
            ax.set_ylabel('Concentration C', fontsize=12)
            ax.set_title('Final Concentration Profiles Comparison', fontsize=14, fontweight='bold')
            ax.legend(fontsize=10, loc='best')
            ax.grid(True, alpha=0.3)
            ax.set_ylim(bottom=0)
            
            output_path = os.path.join(self.output_dir, 'batch_concentration_comparison.png')
            plt.savefig(output_path, dpi=300, bbox_inches='tight')
            plt.close()
            logger.info(f"已生成浓度对比图: {output_path}")
            
        else:
            nx = first_result['parameters']['nx']
            ny = first_result['parameters']['ny']
            Lx = first_result['parameters']['Lx']
            Ly = first_result['parameters']['Ly']
            
            x = np.linspace(0, Lx, nx)
            y = np.linspace(0, Ly, ny)
            
            n_sim = len(success_results)
            n_cols = min(4, n_sim)
            n_rows = (n_sim + n_cols - 1) // n_cols
            
            aspect_ratio = Ly / Lx
            fig_width = 4.5 * n_cols + 2
            fig_height = 4 * n_rows * aspect_ratio + 2
            
            fig, axes = plt.subplots(n_rows, n_cols, figsize=(fig_width, max(fig_height, 6)))
            if n_sim == 1:
                axes = [axes]
            elif n_rows == 1:
                axes = list(axes)
            else:
                axes = [ax for row in axes for ax in row]
            
            max_C = max(np.max(r['results']['concentrations'][-1]) for r in success_results)
            
            for idx, (result, ax) in enumerate(zip(success_results, axes[:n_sim])):
                final_C = result['results']['concentrations'][-1]
                im = ax.pcolormesh(x, y, final_C.T, cmap='viridis', 
                                  shading='auto', vmin=0, vmax=max_C)
                
                ax.set_aspect('equal', adjustable='box')
                sim_title = result.get('name', f'Sim {result["index"]+1}')
                ax.set_title(sim_title, fontsize=11, fontweight='bold')
                ax.set_xlabel('x (m)', fontsize=9)
                ax.set_ylabel('y (m)', fontsize=9)
                ax.tick_params(axis='both', labelsize=8)
            
            for ax in axes[n_sim:]:
                ax.axis('off')
            
            fig.suptitle('Batch Simulation - Final Concentration Fields Comparison', 
                        fontsize=14, fontweight='bold')
            
            cbar_ax = fig.add_axes([0.92, 0.15, 0.02, 0.7])
            fig.colorbar(im, cax=cbar_ax, label='Concentration C')
            plt.tight_layout(rect=[0, 0, 0.9, 0.95])
            
            output_path = os.path.join(self.output_dir, 'batch_2d_comparison.png')
            plt.savefig(output_path, dpi=200, bbox_inches='tight')
            plt.close()
            logger.info(f"已生成2D热力图对比: {output_path}")
        
    def _plot_mass_comparison(self, success_results):
        if len(success_results) < 2:
            return
            
        fig, ax = plt.subplots(figsize=(14, 7))
        cmap = plt.get_cmap('tab10')
        
        for idx, result in enumerate(success_results):
            params = result['parameters']
            concentrations = result['results']['concentrations']
            times = result['results']['times']
            model_dim = params['model_dim']
            
            masses = result['results'].get('mass_history', [])
            
            if not masses:
                masses = []
                for C in concentrations:
                    if model_dim == 1:
                        dx = params['Lx'] / (params['nx'] - 1)
                        mass = np.sum(C) * dx
                    else:
                        dx = params['Lx'] / (params['nx'] - 1)
                        dy = params['Ly'] / (params['ny'] - 1)
                        mass = np.sum(C) * dx * dy
                    masses.append(mass)
            
            sim_label = result.get('name', f'Sim {result["index"]+1}')
            color = cmap(idx % 10)
            ax.plot(times, masses, label=sim_label, linewidth=2.5, color=color, alpha=0.9)
        
        ax.set_xlabel('Time t', fontsize=12)
        ax.set_ylabel('Total Mass M', fontsize=12)
        ax.set_title('Mass Evolution Comparison', fontsize=14, fontweight='bold')
        ax.legend(fontsize=10, loc='best')
        ax.grid(True, alpha=0.3)
        ax.set_ylim(bottom=0)
        
        output_path = os.path.join(self.output_dir, 'batch_mass_comparison.png')
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        plt.close()
        logger.info(f"已生成质量对比图: {output_path}")
        
    def _plot_metrics_comparison(self, success_results):
        if len(success_results) < 2:
            return
            
        all_metric_keys = set()
        for result in success_results:
            if 'metrics' in result:
                all_metric_keys.update(result['metrics'].keys())
        
        if not all_metric_keys:
            return
            
        metric_keys = sorted(list(all_metric_keys))
        n_metrics = len(metric_keys)
        
        n_cols = min(3, n_metrics)
        n_rows = (n_metrics + n_cols - 1) // n_cols
        
        fig, axes = plt.subplots(n_rows, n_cols, figsize=(5 * n_cols, 4 * n_rows))
        if n_metrics == 1:
            axes = [axes]
        elif n_rows == 1:
            axes = list(axes)
        else:
            axes = [ax for row in axes for ax in row]
        
        cmap = plt.get_cmap('tab10')
        names = [r.get('name', f'Sim{r["index"]+1}') for r in success_results]
        
        for idx, (metric_key, ax) in enumerate(zip(metric_keys, axes[:n_metrics])):
            values = [r['metrics'].get(metric_key, 0) for r in success_results]
            colors = [cmap(i % 10) for i in range(len(success_results))]
            
            bars = ax.bar(range(len(success_results)), values, color=colors, alpha=0.8)
            
            ax.set_xlabel('Simulation', fontsize=10)
            ax.set_ylabel(metric_key, fontsize=10)
            ax.set_title(f'{metric_key} Comparison', fontsize=12, fontweight='bold')
            ax.set_xticks(range(len(success_results)))
            ax.set_xticklabels(names, rotation=45, ha='right', fontsize=8)
            
            for bar, val in zip(bars, values):
                ax.text(bar.get_x() + bar.get_width()/2, bar.get_height(),
                       f'{val:.3f}', ha='center', va='bottom', fontsize=9)
            
            ax.grid(True, alpha=0.3, axis='y')
        
        for ax in axes[n_metrics:]:
            ax.axis('off')
        
        plt.tight_layout()
        output_path = os.path.join(self.output_dir, 'batch_metrics_comparison.png')
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        plt.close()
        logger.info(f"已生成度量对比图: {output_path}")


def create_example_config(output_path: str = 'batch_config_example.json'):
    """创建示例批量配置文件"""
    
    config = {
        "batch_name": "Sensitivity Test Suite",
        "description": "Example batch configuration for testing",
        "simulations": [
            {
                "name": "Baseline",
                "description": "Standard parameters",
                "model_dim": 2,
                "nx": 40,
                "ny": 25,
                "Lx": 100.0,
                "Ly": 50.0,
                "t_total": 40.0,
                "dt": 0.1,
                "output_freq": 20,
                "D": 1.0,
                "vx": 0.5,
                "vy": 0.0,
                "porosity": 0.3,
                "retardation": 1.0,
                "decay": 0.0,
                "source_strength": 10.0,
                "source_x": 10.0,
                "source_y": 25.0,
                "source_width": 5.0
            },
            {
                "name": "High_Dispersion",
                "description": "D = 5.0 (5x baseline)",
                "model_dim": 2,
                "nx": 40,
                "ny": 25,
                "Lx": 100.0,
                "Ly": 50.0,
                "t_total": 40.0,
                "dt": 0.1,
                "output_freq": 20,
                "D": 5.0,
                "vx": 0.5,
                "vy": 0.0,
                "source_strength": 10.0,
                "source_x": 10.0,
                "source_y": 25.0,
                "source_width": 5.0
            },
            {
                "name": "High_Velocity",
                "description": "vx = 2.0 (4x baseline)",
                "model_dim": 2,
                "nx": 40,
                "ny": 25,
                "Lx": 100.0,
                "Ly": 50.0,
                "t_total": 40.0,
                "dt": 0.05,
                "output_freq": 40,
                "D": 1.0,
                "vx": 2.0,
                "vy": 0.0,
                "source_strength": 10.0,
                "source_x": 10.0,
                "source_y": 25.0,
                "source_width": 5.0
            }
        ]
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2, ensure_ascii=False)
    
    logger.info(f"已创建示例配置文件: {output_path}")
    return output_path
