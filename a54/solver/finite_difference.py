import numpy as np
import logging
from typing import List, Dict, Any
from solver.parameters import SimulationParams

logger = logging.getLogger(__name__)


class FiniteDifferenceSolver:
    def __init__(self, params: SimulationParams):
        self.params = params
        self.dx = params.Lx / (params.nx - 1)
        self.dy = params.Ly / (params.ny - 1) if params.model_dim == 2 else None
        self.nx = params.nx
        self.ny = params.ny
        self.dt = params.dt
        self.t_total = params.t_total
        self.output_freq = params.output_freq
        
        if params.model_dim == 1:
            self.C = np.zeros(self.nx)
        else:
            self.C = np.zeros((self.nx, self.ny))
        
        self.results: Dict[str, Any] = {
            'times': [],
            'concentrations': [],
            'parameters': params.to_dict(),
            'mass_history': [],
            'negative_count_history': []
        }
        
        self._compute_stability_limits()
        
    def _compute_stability_limits(self):
        if self.params.D > 0:
            self.diffusion_limit_x = 0.45 * self.dx ** 2 / self.params.D
            if self.params.model_dim == 2:
                self.diffusion_limit_y = 0.45 * self.dy ** 2 / self.params.D
            else:
                self.diffusion_limit_y = float('inf')
        else:
            self.diffusion_limit_x = float('inf')
            self.diffusion_limit_y = float('inf')
        
        if abs(self.params.vx) > 0:
            self.courant_limit_x = 0.9 * self.dx / abs(self.params.vx)
        else:
            self.courant_limit_x = float('inf')
        
        if self.params.model_dim == 2 and abs(self.params.vy) > 0:
            self.courant_limit_y = 0.9 * self.dy / abs(self.params.vy)
        else:
            self.courant_limit_y = float('inf')
        
        self.max_safe_dt = min(
            self.diffusion_limit_x,
            self.diffusion_limit_y,
            self.courant_limit_x,
            self.courant_limit_y
        )
        
        if self.dt > self.max_safe_dt:
            logger.warning(f"时间步长 {self.dt} 超过稳定性限制 {self.max_safe_dt:.4f}")
            logger.warning("可能出现数值振荡，建议减小时间步长")
        
    def initialize(self):
        self.C.fill(0)
        
        if self.params.model_dim == 1:
            x = np.linspace(0, self.params.Lx, self.nx)
            source_region = np.abs(x - self.params.source_x) < self.params.source_width / 2
            self.C[source_region] = self.params.source_strength
        else:
            x = np.linspace(0, self.params.Lx, self.nx)
            y = np.linspace(0, self.params.Ly, self.ny)
            X, Y = np.meshgrid(x, y, indexing='ij')
            source_region = (np.abs(X - self.params.source_x) < self.params.source_width / 2) & \
                           (np.abs(Y - self.params.source_y) < self.params.source_width / 2)
            self.C[source_region] = self.params.source_strength
        
        self.C = np.clip(self.C, 0, self.params.source_strength)
        
        self._save_output(0.0)
        logger.info("浓度场初始化完成")
        
    def _apply_boundary_conditions(self):
        if self.params.model_dim == 1:
            self.C[0] = self.params.C_left
            self.C[-1] = self.params.C_right
        else:
            self.C[0, :] = self.params.C_left
            self.C[-1, :] = self.params.C_right
            self.C[:, 0] = self.params.C_bottom
            self.C[:, -1] = self.params.C_top
            
    def _save_output(self, t: float):
        self.results['times'].append(t)
        self.results['concentrations'].append(self.C.copy())
        
        if self.params.model_dim == 1:
            dx = self.params.Lx / (self.params.nx - 1)
            mass = np.sum(self.C) * dx
        else:
            dx = self.params.Lx / (self.params.nx - 1)
            dy = self.params.Ly / (self.params.ny - 1)
            mass = np.sum(self.C) * dx * dy
        self.results['mass_history'].append(mass)
        
    def _check_numerical_stability(self, t: float) -> bool:
        if np.any(np.isnan(self.C)):
            logger.error(f"数值解在 t={t} 出现 NaN")
            return False
        if np.any(np.isinf(self.C)):
            logger.error(f"数值解在 t={t} 出现无穷大")
            return False
        
        max_C = np.max(self.C)
        if self.params.source_strength > 0:
            threshold = max(10 * self.params.source_strength, 1e6)
            if max_C > threshold:
                logger.error(f"浓度在 t={t} 异常升高: max={max_C:.2e}，超过阈值 {threshold:.2e}")
                return False
            elif max_C > 3 * self.params.source_strength:
                logger.warning(f"浓度在 t={t} 升高: max={max_C:.2f}")
        
        negative_mask = self.C < 0
        n_neg = np.sum(negative_mask)
        if n_neg > 0:
            min_neg = np.min(self.C)
            total_neg_mass = np.sum(-self.C[negative_mask])
            
            logger.warning(f"t={t}: 检测到 {n_neg} 个负浓度值，最小值: {min_neg:.6e}，总负质量: {total_neg_mass:.6e}")
            
            self.C = np.maximum(self.C, 0)
            self.results['negative_count_history'].append(n_neg)
            
            if n_neg > 0.1 * self.C.size:
                logger.warning(f"负浓度比例过高 ({n_neg}/{self.C.size})，可能存在数值不稳定")
        else:
            self.results['negative_count_history'].append(0)
        
        return True
    
    def _calculate_mass(self):
        if self.params.model_dim == 1:
            dx = self.params.Lx / (self.params.nx - 1)
            return np.sum(self.C) * dx
        else:
            dx = self.params.Lx / (self.params.nx - 1)
            dy = self.params.Ly / (self.params.ny - 1)
            return np.sum(self.C) * dx * dy
    
    def _apply_mass_correction(self, target_mass: float):
        current_mass = self._calculate_mass()
        
        if current_mass > 0 and target_mass > 0:
            ratio = target_mass / current_mass
            
            if 0.9 < ratio < 1.1:
                self.C = self.C * ratio
                logger.debug(f"质量校正: 比例={ratio:.4f}")
            else:
                logger.warning(f"质量校正比例超出安全范围: {ratio:.4f}，跳过校正")
    
    def solve_1d(self):
        logger.info("开始一维对流-扩散方程求解")
        self.initialize()
        
        n_steps = int(self.t_total / self.dt)
        C_new = self.C.copy()
        dx = self.dx
        
        initial_mass = self._calculate_mass()
        logger.info(f"初始总质量: {initial_mass:.4f}")
        
        for step in range(1, n_steps + 1):
            t = step * self.dt
            
            for i in range(1, self.nx - 1):
                D = self.params.get_D(i)
                vx = self.params.get_vx(i)
                R = self.params.get_retardation(i)
                lam = self.params.get_decay(i)
                phi = self.params.get_porosity(i)
                
                if R <= 0:
                    R = 1.0
                if phi <= 0:
                    phi = 0.3
                
                C_curr = self.C[i]
                C_xp = self.C[i + 1]
                C_xm = self.C[i - 1]
                
                D_avg_xp = 0.5 * (D + self.params.get_D(i + 1))
                D_avg_xm = 0.5 * (D + self.params.get_D(i - 1))
                
                diffusion = (D_avg_xp * (C_xp - C_curr) / dx - 
                           D_avg_xm * (C_curr - C_xm) / dx) / dx
                
                Pe = abs(vx) * dx / D if D > 0 else float('inf')
                if Pe > 2:
                    if vx >= 0:
                        advection = -vx * (C_curr - C_xm) / dx
                    else:
                        advection = -vx * (C_xp - C_curr) / dx
                    
                    beta = 0.5 * (np.cosh(Pe / 2) / np.sinh(Pe / 2) - 2 / Pe) if Pe > 0 else 0
                    if beta > 0:
                        diffusion += beta * abs(vx) * dx * (C_xp - 2 * C_curr + C_xm) / (dx ** 2)
                else:
                    advection = -vx * (C_xp - C_xm) / (2 * dx)
                
                decay_term = -lam * C_curr
                
                effective_dt = self.dt / (R * phi)
                
                C_new[i] = C_curr + effective_dt * (diffusion + advection + decay_term)
                
                if C_new[i] < 0:
                    C_new[i] = max(0, C_curr + effective_dt * diffusion)
                elif C_new[i] > 2 * self.params.source_strength:
                    C_new[i] = min(C_new[i], 2 * self.params.source_strength)
            
            self.C[:] = C_new[:]
            self._apply_boundary_conditions()
            
            if not self._check_numerical_stability(t):
                logger.error("数值求解不稳定，终止计算")
                self._save_output(t)
                break
            
            if step % self.output_freq == 0:
                self._save_output(t)
                current_mass = self._calculate_mass()
                mass_ratio = current_mass / initial_mass if initial_mass > 0 else 1.0
                logger.info(f"已完成 {step}/{n_steps} 步，t={t:.2f}，质量比={mass_ratio:.4f}")
        
        final_mass = self._calculate_mass()
        final_ratio = final_mass / initial_mass if initial_mass > 0 else 1.0
        logger.info(f"一维求解完成，最终质量比: {final_ratio:.4f}")
        
        return self.results
        
    def solve_2d(self):
        logger.info("开始二维对流-扩散方程求解")
        self.initialize()
        
        n_steps = int(self.t_total / self.dt)
        C_new = self.C.copy()
        dx = self.dx
        dy = self.dy
        
        initial_mass = self._calculate_mass()
        logger.info(f"初始总质量: {initial_mass:.4f}")
        
        for step in range(1, n_steps + 1):
            t = step * self.dt
            
            for i in range(1, self.nx - 1):
                for j in range(1, self.ny - 1):
                    D = self.params.get_D(i, j)
                    vx = self.params.get_vx(i, j)
                    vy = self.params.get_vy(i, j)
                    R = self.params.get_retardation(i, j)
                    lam = self.params.get_decay(i, j)
                    phi = self.params.get_porosity(i, j)
                    
                    if R <= 0:
                        R = 1.0
                    if phi <= 0:
                        phi = 0.3
                    
                    C_curr = self.C[i, j]
                    C_xp = self.C[i + 1, j]
                    C_xm = self.C[i - 1, j]
                    C_yp = self.C[i, j + 1]
                    C_ym = self.C[i, j - 1]
                    
                    D_avg_xp = 0.5 * (D + self.params.get_D(i + 1, j))
                    D_avg_xm = 0.5 * (D + self.params.get_D(i - 1, j))
                    D_avg_yp = 0.5 * (D + self.params.get_D(i, j + 1))
                    D_avg_ym = 0.5 * (D + self.params.get_D(i, j - 1))
                    
                    diffusion_x = (D_avg_xp * (C_xp - C_curr) / dx - 
                                 D_avg_xm * (C_curr - C_xm) / dx) / dx
                    diffusion_y = (D_avg_yp * (C_yp - C_curr) / dy - 
                                 D_avg_ym * (C_curr - C_ym) / dy) / dy
                    diffusion = diffusion_x + diffusion_y
                    
                    Pe_x = abs(vx) * dx / D if D > 0 else float('inf')
                    Pe_y = abs(vy) * dy / D if D > 0 else float('inf')
                    
                    if Pe_x > 2:
                        if vx >= 0:
                            advection_x = -vx * (C_curr - C_xm) / dx
                        else:
                            advection_x = -vx * (C_xp - C_curr) / dx
                        
                        beta_x = 0.5 * (np.cosh(Pe_x / 2) / np.sinh(Pe_x / 2) - 2 / Pe_x) if Pe_x > 0 else 0
                        if beta_x > 0:
                            diffusion += beta_x * abs(vx) * dx * (C_xp - 2 * C_curr + C_xm) / (dx ** 2)
                    else:
                        advection_x = -vx * (C_xp - C_xm) / (2 * dx)
                    
                    if Pe_y > 2:
                        if vy >= 0:
                            advection_y = -vy * (C_curr - C_ym) / dy
                        else:
                            advection_y = -vy * (C_yp - C_curr) / dy
                        
                        beta_y = 0.5 * (np.cosh(Pe_y / 2) / np.sinh(Pe_y / 2) - 2 / Pe_y) if Pe_y > 0 else 0
                        if beta_y > 0:
                            diffusion += beta_y * abs(vy) * dy * (C_yp - 2 * C_curr + C_ym) / (dy ** 2)
                    else:
                        advection_y = -vy * (C_yp - C_ym) / (2 * dy)
                    
                    advection = advection_x + advection_y
                    
                    decay_term = -lam * C_curr
                    
                    effective_dt = self.dt / (R * phi)
                    
                    C_new[i, j] = C_curr + effective_dt * (diffusion + advection + decay_term)
                    
                    if C_new[i, j] < 0:
                        C_new[i, j] = max(0, C_curr + effective_dt * (diffusion_x + diffusion_y))
                    elif C_new[i, j] > 2 * self.params.source_strength:
                        C_new[i, j] = min(C_new[i, j], 2 * self.params.source_strength)
            
            self.C[:, :] = C_new[:, :]
            self._apply_boundary_conditions()
            
            if not self._check_numerical_stability(t):
                logger.error("数值求解不稳定，终止计算")
                self._save_output(t)
                break
            
            if step % self.output_freq == 0:
                self._save_output(t)
                current_mass = self._calculate_mass()
                mass_ratio = current_mass / initial_mass if initial_mass > 0 else 1.0
                logger.info(f"已完成 {step}/{n_steps} 步，t={t:.2f}，质量比={mass_ratio:.4f}")
        
        final_mass = self._calculate_mass()
        final_ratio = final_mass / initial_mass if initial_mass > 0 else 1.0
        logger.info(f"二维求解完成，最终质量比: {final_ratio:.4f}")
        
        return self.results
