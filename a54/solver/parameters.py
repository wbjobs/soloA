import numpy as np
import logging
from dataclasses import dataclass, field
from typing import Union, Optional, Dict, Any


logger = logging.getLogger(__name__)


@dataclass
class SimulationParams:
    model_dim: int = 1
    nx: int = 100
    ny: int = 50
    Lx: float = 100.0
    Ly: float = 50.0
    t_total: float = 100.0
    dt: float = 0.1
    output_freq: int = 10
    C0: float = 1.0
    C_left: float = 0.0
    C_right: float = 0.0
    C_top: float = 0.0
    C_bottom: float = 0.0
    source_strength: float = 0.0
    source_x: float = 0.0
    source_y: float = 0.0
    source_width: float = 5.0
    D: float = 1.0
    vx: float = 0.5
    vy: float = 0.0
    porosity: float = 0.3
    retardation: float = 1.0
    decay: float = 0.0
    D_map: Optional[np.ndarray] = None
    vx_map: Optional[np.ndarray] = None
    vy_map: Optional[np.ndarray] = None
    porosity_map: Optional[np.ndarray] = None
    retardation_map: Optional[np.ndarray] = None
    decay_map: Optional[np.ndarray] = None
    is_heterogeneous: bool = False
    
    def validate(self) -> bool:
        errors = []
        
        if self.model_dim not in [1, 2]:
            errors.append(f"模型维度必须为1或2，当前值: {self.model_dim}")
        
        if self.nx <= 2:
            errors.append(f"x方向网格数必须大于2，当前值: {self.nx}")
        
        if self.model_dim == 2 and self.ny <= 2:
            errors.append(f"y方向网格数必须大于2，当前值: {self.ny}")
        
        if self.Lx <= 0:
            errors.append(f"x方向长度必须大于0，当前值: {self.Lx}")
        
        if self.model_dim == 2 and self.Ly <= 0:
            errors.append(f"y方向长度必须大于0，当前值: {self.Ly}")
        
        if self.t_total <= 0:
            errors.append(f"总时间必须大于0，当前值: {self.t_total}")
        
        if self.dt <= 0:
            errors.append(f"时间步长必须大于0，当前值: {self.dt}")
        
        if self.output_freq <= 0:
            errors.append(f"输出频率必须大于0，当前值: {self.output_freq}")
        
        dx = self.Lx / (self.nx - 1)
        if self.D > 0:
            courant = np.abs(self.vx) * self.dt / dx
            diffusion = self.D * self.dt / (dx ** 2)
            if courant > 0.9:
                logger.warning(f"Courant数过高: {courant:.3f}，可能导致数值振荡")
            if diffusion > 0.45:
                logger.warning(f"扩散数过高: {diffusion:.3f}，可能导致数值不稳定")
        
        if self.model_dim == 2:
            dy = self.Ly / (self.ny - 1)
            if self.D > 0:
                courant_y = np.abs(self.vy) * self.dt / dy
                diffusion_y = self.D * self.dt / (dy ** 2)
                if courant_y > 0.9:
                    logger.warning(f"y方向Courant数过高: {courant_y:.3f}")
                if diffusion_y > 0.45:
                    logger.warning(f"y方向扩散数过高: {diffusion_y:.3f}")
        
        if self.is_heterogeneous:
            shape = (self.nx, self.ny) if self.model_dim == 2 else (self.nx,)
            if self.D_map is not None and self.D_map.shape != shape:
                errors.append(f"D_map形状 {self.D_map.shape} 与网格形状 {shape} 不匹配")
            if self.vx_map is not None and self.vx_map.shape != shape:
                errors.append(f"vx_map形状 {self.vx_map.shape} 与网格形状 {shape} 不匹配")
            if self.model_dim == 2 and self.vy_map is not None and self.vy_map.shape != shape:
                errors.append(f"vy_map形状 {self.vy_map.shape} 与网格形状 {shape} 不匹配")
            if self.porosity_map is not None and self.porosity_map.shape != shape:
                errors.append(f"porosity_map形状 {self.porosity_map.shape} 与网格形状 {shape} 不匹配")
            if self.retardation_map is not None and self.retardation_map.shape != shape:
                errors.append(f"retardation_map形状 {self.retardation_map.shape} 与网格形状 {shape} 不匹配")
            if self.decay_map is not None and self.decay_map.shape != shape:
                errors.append(f"decay_map形状 {self.decay_map.shape} 与网格形状 {shape} 不匹配")
        
        if errors:
            for err in errors:
                logger.error(err)
            return False
        return True
    
    def get_D(self, i: int, j: int = 0) -> float:
        if self.D_map is not None:
            if self.model_dim == 2:
                return self.D_map[i, j]
            return self.D_map[i]
        return self.D
    
    def get_vx(self, i: int, j: int = 0) -> float:
        if self.vx_map is not None:
            if self.model_dim == 2:
                return self.vx_map[i, j]
            return self.vx_map[i]
        return self.vx
    
    def get_vy(self, i: int, j: int = 0) -> float:
        if self.vy_map is not None:
            return self.vy_map[i, j]
        return self.vy
    
    def get_porosity(self, i: int, j: int = 0) -> float:
        if self.porosity_map is not None:
            if self.model_dim == 2:
                return self.porosity_map[i, j]
            return self.porosity_map[i]
        return self.porosity
    
    def get_retardation(self, i: int, j: int = 0) -> float:
        if self.retardation_map is not None:
            if self.model_dim == 2:
                return self.retardation_map[i, j]
            return self.retardation_map[i]
        return self.retardation
    
    def get_decay(self, i: int, j: int = 0) -> float:
        if self.decay_map is not None:
            if self.model_dim == 2:
                return self.decay_map[i, j]
            return self.decay_map[i]
        return self.decay
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'model_dim': self.model_dim,
            'nx': self.nx,
            'ny': self.ny,
            'Lx': self.Lx,
            'Ly': self.Ly,
            't_total': self.t_total,
            'dt': self.dt,
            'output_freq': self.output_freq,
            'C0': self.C0,
            'C_left': self.C_left,
            'C_right': self.C_right,
            'C_top': self.C_top,
            'C_bottom': self.C_bottom,
            'source_strength': self.source_strength,
            'source_x': self.source_x,
            'source_y': self.source_y,
            'source_width': self.source_width,
            'D': self.D,
            'vx': self.vx,
            'vy': self.vy,
            'porosity': self.porosity,
            'retardation': self.retardation,
            'decay': self.decay,
            'is_heterogeneous': self.is_heterogeneous
        }
    
    def generate_heterogeneous_fields(self, seed: Optional[int] = None):
        if seed is not None:
            np.random.seed(seed)
        
        shape = (self.nx, self.ny) if self.model_dim == 2 else (self.nx,)
        
        self.D_map = np.full(shape, self.D) * (0.5 + np.random.rand(*shape))
        self.vx_map = np.full(shape, self.vx) * (0.8 + 0.4 * np.random.rand(*shape))
        if self.model_dim == 2:
            self.vy_map = np.full(shape, self.vy) * (0.8 + 0.4 * np.random.rand(*shape))
        self.porosity_map = np.full(shape, self.porosity) * (0.9 + 0.2 * np.random.rand(*shape))
        self.retardation_map = np.full(shape, self.retardation) * (0.9 + 0.2 * np.random.rand(*shape))
        self.decay_map = np.full(shape, self.decay)
        
        self.is_heterogeneous = True
        logger.info("已生成非均质介质参数场")
