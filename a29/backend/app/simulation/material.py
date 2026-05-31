import numpy as np
from typing import Dict, Any, Optional


class MaterialModel:
    """Elastic material properties for 2D seismic simulation."""

    def __init__(self, vp: float, vs: float, density: float):
        self.vp = vp
        self.vs = vs
        self.density = density

    @property
    def lame_lambda(self) -> float:
        """Lame's first parameter."""
        return self.density * (self.vp ** 2 - 2 * self.vs ** 2)

    @property
    def lame_mu(self) -> float:
        """Lame's second parameter (shear modulus)."""
        return self.density * self.vs ** 2

    def get_stiffness_tensor_2d(self) -> np.ndarray:
        """
        Get 2D plane stress/strain stiffness tensor.
        Returns 3x3 matrix for Voigt notation.
        """
        lambda_ = self.lame_lambda
        mu = self.lame_mu

        C = np.array([
            [lambda_ + 2 * mu, lambda_, 0],
            [lambda_, lambda_ + 2 * mu, 0],
            [0, 0, mu]
        ])
        return C

    def to_dict(self) -> Dict[str, Any]:
        return {
            'vp': self.vp,
            'vs': self.vs,
            'density': self.density,
            'lambda': self.lame_lambda,
            'mu': self.lame_mu
        }


class HeterogeneousMaterial:
    """Heterogeneous material model with property variations."""

    def __init__(self, base_material: MaterialModel):
        self.base = base_material
        self.layers = []

    def add_layer(self, x_min: float, x_max: float, y_min: float, y_max: float,
                  material: MaterialModel):
        """Add a material layer/region."""
        self.layers.append({
            'x_min': x_min, 'x_max': x_max,
            'y_min': y_min, 'y_max': y_max,
            'material': material
        })

    def get_material_at(self, x: float, y: float) -> MaterialModel:
        """Get material properties at a specific point."""
        for layer in self.layers:
            if (layer['x_min'] <= x <= layer['x_max'] and
                    layer['y_min'] <= y <= layer['y_max']):
                return layer['material']
        return self.base


def create_material(material_params: Dict[str, Any]) -> MaterialModel:
    """Create material model from parameters."""
    return MaterialModel(
        vp=material_params.get('vp', 3000.0),
        vs=material_params.get('vs', 1732.0),
        density=material_params.get('density', 2700.0)
    )
