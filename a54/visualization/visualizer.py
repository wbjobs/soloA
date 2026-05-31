import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.figure import Figure
from matplotlib.axes import Axes
import logging
from typing import Dict, Any, List, Optional, Tuple
import os

logger = logging.getLogger(__name__)


class ResultVisualizer:
    def __init__(self, results: Dict[str, Any], output_dir: str = 'output'):
        self.results = results
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        
        self.params = results.get('parameters', {})
        self.model_dim = self.params.get('model_dim', 1)
        self.nx = self.params.get('nx', 100)
        self.ny = self.params.get('ny', 50)
        self.Lx = self.params.get('Lx', 100.0)
        self.Ly = self.params.get('Ly', 50.0)
        self.times = results.get('times', [])
        self.concentrations = results.get('concentrations', [])
        
    def _setup_plot_style(self):
        plt.rcParams['font.family'] = 'sans-serif'
        plt.rcParams['font.size'] = 12
        plt.rcParams['axes.titlesize'] = 14
        plt.rcParams['axes.labelsize'] = 12
        plt.rcParams['xtick.labelsize'] = 10
        plt.rcParams['ytick.labelsize'] = 10
        
    def plot_1d_concentration(self, time_indices: Optional[List[int]] = None, 
                              filename: str = 'concentration_1d.png'):
        if self.model_dim != 1:
            logger.warning("尝试为2D模型绘制1D浓度图")
            return None
            
        self._setup_plot_style()
        fig, ax = plt.subplots(figsize=(10, 6))
        
        x = np.linspace(0, self.Lx, self.nx)
        
        if time_indices is None:
            step = max(1, len(self.concentrations) // 5)
            time_indices = list(range(0, len(self.concentrations), step))
        
        for idx in time_indices:
            if 0 <= idx < len(self.concentrations):
                C = self.concentrations[idx]
                t = self.times[idx]
                ax.plot(x, C, label=f't = {t:.1f}')
        
        ax.set_xlabel('Distance x (m)')
        ax.set_ylabel('Concentration C')
        ax.set_title('1D Solute Transport - Concentration Profile')
        ax.grid(True, alpha=0.3)
        ax.legend()
        ax.set_ylim(bottom=0)
        
        output_path = os.path.join(self.output_dir, filename)
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        plt.close()
        logger.info(f"已保存1D浓度图: {output_path}")
        return output_path
        
    def plot_2d_heatmap(self, time_idx: Optional[int] = None, 
                        filename: str = 'concentration_2d.png'):
        if self.model_dim != 2:
            logger.warning("尝试为1D模型绘制2D热力图")
            return None
            
        self._setup_plot_style()
        
        if time_idx is None:
            time_idx = -1
        
        C = self.concentrations[time_idx].T
        t = self.times[time_idx]
        
        x = np.linspace(0, self.Lx, self.nx)
        y = np.linspace(0, self.Ly, self.ny)
        
        aspect_ratio = self.Ly / self.Lx
        fig_width = 12
        fig_height = fig_width * aspect_ratio
        
        fig, ax = plt.subplots(figsize=(fig_width, max(fig_height, 4)))
        
        im = ax.pcolormesh(x, y, C, cmap='viridis', shading='auto')
        
        ax.set_aspect('equal', adjustable='box')
        
        ax.set_xlabel('x (m)')
        ax.set_ylabel('y (m)')
        ax.set_title(f'2D Solute Transport - Concentration (t = {t:.1f})')
        
        cbar = plt.colorbar(im, ax=ax)
        cbar.set_label('Concentration C')
        
        ax.set_xlim(0, self.Lx)
        ax.set_ylim(0, self.Ly)
        
        ax.tick_params(axis='both', which='major', labelsize=10)
        
        output_path = os.path.join(self.output_dir, filename)
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        plt.close()
        logger.info(f"已保存2D热力图: {output_path}")
        return output_path
        
    def plot_2d_heatmap_animation_frames(self, output_prefix: str = 'frame_'):
        if self.model_dim != 2:
            logger.warning("尝试为1D模型绘制2D热力图帧")
            return []
            
        self._setup_plot_style()
        saved_files = []
        
        x = np.linspace(0, self.Lx, self.nx)
        y = np.linspace(0, self.Ly, self.ny)
        max_C = max(np.max(C) for C in self.concentrations)
        
        aspect_ratio = self.Ly / self.Lx
        fig_width = 12
        fig_height = fig_width * aspect_ratio
        
        for idx, (t, C) in enumerate(zip(self.times, self.concentrations)):
            fig, ax = plt.subplots(figsize=(fig_width, max(fig_height, 4)))
            
            im = ax.pcolormesh(x, y, C.T, cmap='viridis', shading='auto', vmin=0, vmax=max_C)
            
            ax.set_aspect('equal', adjustable='box')
            
            ax.set_xlabel('x (m)')
            ax.set_ylabel('y (m)')
            ax.set_title(f'2D Solute Transport - Concentration (t = {t:.1f})')
            
            cbar = plt.colorbar(im, ax=ax)
            cbar.set_label('Concentration C')
            
            ax.set_xlim(0, self.Lx)
            ax.set_ylim(0, self.Ly)
            
            filename = f'{output_prefix}{idx:04d}.png'
            output_path = os.path.join(self.output_dir, filename)
            plt.savefig(output_path, dpi=150, bbox_inches='tight')
            plt.close()
            saved_files.append(output_path)
            logger.info(f"已保存帧 {idx+1}/{len(self.times)}: {output_path}")
            
        return saved_files
        
    def plot_time_series(self, positions: Optional[List[Tuple[float, float]]] = None,
                        filename: str = 'time_series.png'):
        self._setup_plot_style()
        fig, ax = plt.subplots(figsize=(10, 6))
        
        if positions is None:
            if self.model_dim == 1:
                positions = [(self.Lx * 0.25, 0), (self.Lx * 0.5, 0), (self.Lx * 0.75, 0)]
            else:
                positions = [(self.Lx * 0.5, self.Ly * 0.5),
                           (self.Lx * 0.25, self.Ly * 0.5),
                           (self.Lx * 0.75, self.Ly * 0.5)]
        
        x_arr = np.linspace(0, self.Lx, self.nx)
        if self.model_dim == 2:
            y_arr = np.linspace(0, self.Ly, self.ny)
        
        for pos in positions:
            px, py = pos
            i = int(np.clip(np.round(px / (self.Lx / (self.nx - 1))), 0, self.nx - 1))
            
            if self.model_dim == 1:
                concentrations = [C[i] for C in self.concentrations]
                label = f'x = {px:.1f} m'
            else:
                j = int(np.clip(np.round(py / (self.Ly / (self.ny - 1))), 0, self.ny - 1))
                concentrations = [C[i, j] for C in self.concentrations]
                label = f'({px:.1f}, {py:.1f}) m'
            
            ax.plot(self.times, concentrations, 'o-', label=label, markersize=3)
        
        ax.set_xlabel('Time t')
        ax.set_ylabel('Concentration C')
        ax.set_title('Time Series - Concentration at Monitoring Points')
        ax.grid(True, alpha=0.3)
        ax.legend()
        ax.set_ylim(bottom=0)
        
        output_path = os.path.join(self.output_dir, filename)
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        plt.close()
        logger.info(f"已保存时间序列图: {output_path}")
        return output_path
        
    def plot_mass_conservation(self, filename: str = 'mass_conservation.png'):
        self._setup_plot_style()
        fig, ax = plt.subplots(figsize=(10, 6))
        
        masses = []
        for C in self.concentrations:
            if self.model_dim == 1:
                dx = self.Lx / (self.nx - 1)
                mass = np.sum(C) * dx
            else:
                dx = self.Lx / (self.nx - 1)
                dy = self.Ly / (self.ny - 1)
                mass = np.sum(C) * dx * dy
            masses.append(mass)
        
        ax.plot(self.times, masses, 'b-o', markersize=4)
        
        if len(masses) > 0:
            initial_mass = masses[0]
            if initial_mass > 0:
                ax2 = ax.twinx()
                mass_ratio = [m / initial_mass for m in masses]
                ax2.plot(self.times, mass_ratio, 'r--', alpha=0.7, label='Mass Ratio')
                ax2.set_ylabel('Mass Ratio (Current / Initial)')
                ax2.set_ylim(0, max(1.1, max(mass_ratio) * 1.1))
        
        ax.set_xlabel('Time t')
        ax.set_ylabel('Total Mass M')
        ax.set_title('Mass Conservation Check')
        ax.grid(True, alpha=0.3)
        ax.set_ylim(bottom=0)
        
        output_path = os.path.join(self.output_dir, filename)
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        plt.close()
        logger.info(f"已保存质量守恒图: {output_path}")
        return output_path
        
    def plot_concentration_range(self, filename: str = 'concentration_range.png'):
        self._setup_plot_style()
        fig, ax = plt.subplots(figsize=(10, 6))
        
        max_vals = [np.max(C) for C in self.concentrations]
        min_vals = [np.min(C) for C in self.concentrations]
        mean_vals = [np.mean(C) for C in self.concentrations]
        
        ax.fill_between(self.times, min_vals, max_vals, alpha=0.3, label='Min-Max Range')
        ax.plot(self.times, mean_vals, 'r-', linewidth=2, label='Mean')
        ax.plot(self.times, max_vals, 'b--', alpha=0.7, label='Max')
        ax.plot(self.times, min_vals, 'g--', alpha=0.7, label='Min')
        
        ax.axhline(y=0, color='k', linestyle=':', alpha=0.5, label='Zero Line')
        
        ax.set_xlabel('Time t')
        ax.set_ylabel('Concentration')
        ax.set_title('Concentration Range Evolution')
        ax.grid(True, alpha=0.3)
        ax.legend()
        
        output_path = os.path.join(self.output_dir, filename)
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        plt.close()
        logger.info(f"已保存浓度范围图: {output_path}")
        return output_path
        
    def export_vtk(self, filename: str = 'results.vtk'):
        if self.model_dim != 2:
            logger.warning("VTK导出目前仅支持2D模型")
            return None
            
        output_path = os.path.join(self.output_dir, filename)
        
        x = np.linspace(0, self.Lx, self.nx)
        y = np.linspace(0, self.Ly, self.ny)
        
        try:
            with open(output_path, 'w') as f:
                f.write('# vtk DataFile Version 3.0\n')
                f.write('Solut Transport Simulation Results\n')
                f.write('ASCII\n')
                f.write('DATASET STRUCTURED_POINTS\n')
                f.write(f'DIMENSIONS {self.nx} {self.ny} 1\n')
                f.write(f'ORIGIN 0 0 0\n')
                f.write(f'SPACING {self.Lx/(self.nx-1)} {self.Ly/(self.ny-1)} 1.0\n')
                f.write(f'POINT_DATA {self.nx * self.ny}\n')
                
                for idx, (t, C) in enumerate(zip(self.times, self.concentrations)):
                    f.write(f'\nSCALARS concentration_t{idx} double 1\n')
                    f.write('LOOKUP_TABLE default\n')
                    for j in range(self.ny):
                        for i in range(self.nx):
                            f.write(f'{C[i, j]}\n')
            
            logger.info(f"已导出VTK文件: {output_path}")
            return output_path
        except Exception as e:
            logger.error(f"VTK导出失败: {e}")
            return None
            
    def create_summary_report(self, filename: str = 'report.txt'):
        output_path = os.path.join(self.output_dir, filename)
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write('=' * 70 + '\n')
            f.write('Groundwater Solute Transport Simulation Report\n')
            f.write('=' * 70 + '\n\n')
            
            f.write('【Model Parameters】\n')
            f.write('-' * 50 + '\n')
            for key, value in self.params.items():
                f.write(f'{key}: {value}\n')
            f.write('\n')
            
            f.write('【Simulation Statistics】\n')
            f.write('-' * 50 + '\n')
            f.write(f'Time steps: {len(self.times)}\n')
            f.write(f'Total time: {self.times[-1] if self.times else 0}\n')
            
            if self.concentrations:
                max_C = max(np.max(C) for C in self.concentrations)
                min_C = min(np.min(C) for C in self.concentrations)
                mean_C = np.mean(self.concentrations[-1])
                f.write(f'Final max concentration: {max_C:.6f}\n')
                f.write(f'Final min concentration: {min_C:.6f}\n')
                f.write(f'Final mean concentration: {mean_C:.6f}\n')
                
                if min_C < 0:
                    f.write(f'\nWARNING: Negative concentrations detected (min = {min_C:.6e})\n')
                
                mass_history = self.results.get('mass_history', [])
                if len(mass_history) >= 2:
                    initial_mass = mass_history[0]
                    final_mass = mass_history[-1]
                    mass_ratio = final_mass / initial_mass if initial_mass > 0 else 1.0
                    f.write(f'\nMass conservation:\n')
                    f.write(f'  Initial mass: {initial_mass:.6f}\n')
                    f.write(f'  Final mass: {final_mass:.6f}\n')
                    f.write(f'  Mass ratio: {mass_ratio:.4f}\n')
                
                neg_history = self.results.get('negative_count_history', [])
                if neg_history:
                    total_neg = sum(neg_history)
                    if total_neg > 0:
                        f.write(f'\nNegative concentration history:\n')
                        f.write(f'  Total negative count: {total_neg}\n')
                        f.write(f'  Steps with negatives: {sum(1 for n in neg_history if n > 0)}\n')
            
            f.write('\n')
            f.write('【Output Files】\n')
            f.write('-' * 50 + '\n')
            
            if self.model_dim == 1:
                f.write('- concentration_1d.png: 1D concentration profile\n')
            else:
                f.write('- concentration_2d.png: 2D heatmap\n')
                f.write('- frame_*.png: Animation frames\n')
                f.write('- results.vtk: VTK data file\n')
            
            f.write('- time_series.png: Time series curves\n')
            f.write('- mass_conservation.png: Mass conservation plot\n')
            f.write('- concentration_range.png: Concentration range evolution\n')
            f.write('- report.txt: This report\n')
            f.write('- simulation.log: Simulation log\n')
            
            f.write('\n')
            f.write('=' * 70 + '\n')
        
        logger.info(f"已生成报告: {output_path}")
        return output_path
        
    def generate_all_plots(self):
        output_files = []
        
        if self.model_dim == 1:
            output_files.append(self.plot_1d_concentration())
        else:
            output_files.append(self.plot_2d_heatmap())
            output_files.extend(self.plot_2d_heatmap_animation_frames())
            output_files.append(self.export_vtk())
        
        output_files.append(self.plot_time_series())
        output_files.append(self.plot_mass_conservation())
        output_files.append(self.plot_concentration_range())
        output_files.append(self.create_summary_report())
        
        return [f for f in output_files if f is not None]
