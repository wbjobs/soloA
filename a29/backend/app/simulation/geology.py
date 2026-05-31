import numpy as np
from typing import Dict, Any, List, Tuple, Optional
from dataclasses import dataclass, field
from enum import Enum
import math

from .material import MaterialModel


class FaultType(str, Enum):
    NORMAL = "normal"
    REVERSE = "reverse"
    STRIKESLIP = "strike-slip"
    THRUST = "thrust"


@dataclass
class MaterialLayer:
    """A single material layer in the geological model."""
    vp: float
    vs: float
    density: float
    y_min: float
    y_max: float
    x_min: float = 0.0
    x_max: float = float('inf')
    gradient: Optional[Dict[str, Tuple[float, float]]] = None
    name: str = ""

    def get_material_at(self, x: float, y: float) -> MaterialModel:
        """Get material properties at a point, with optional gradient."""
        if self.gradient:
            total_y_range = self.y_max - self.y_min
            if total_y_range > 0:
                t = (y - self.y_min) / total_y_range
                t = max(0.0, min(1.0, t))

                vp = self.vp
                vs = self.vs
                density = self.density

                if 'vp' in self.gradient:
                    vp0, vp1 = self.gradient['vp']
                    vp = vp0 + t * (vp1 - vp0)
                if 'vs' in self.gradient:
                    vs0, vs1 = self.gradient['vs']
                    vs = vs0 + t * (vs1 - vs0)
                if 'density' in self.gradient:
                    d0, d1 = self.gradient['density']
                    density = d0 + t * (d1 - d0)

                return MaterialModel(vp, vs, density)

        return MaterialModel(self.vp, self.vs, self.density)


@dataclass
class FaultZone:
    """Represents a fault in the geological model."""
    start_point: Tuple[float, float]
    end_point: Tuple[float, float]
    strike: float
    dip: float
    width: float
    material: MaterialModel
    fault_type: FaultType = FaultType.NORMAL
    displacement: float = 0.0
    name: str = ""

    def contains_point(self, x: float, y: float) -> bool:
        """Check if a point is within the fault zone."""
        x1, y1 = self.start_point
        x2, y2 = self.end_point

        A = x - x1
        B = y - y1
        C = x2 - x1
        D = y2 - y1

        dot = A * C + B * D
        len_sq = C * C + D * D
        param = -1.0

        if len_sq != 0:
            param = dot / len_sq

        if param < 0:
            xx, yy = x1, y1
        elif param > 1:
            xx, yy = x2, y2
        else:
            xx = x1 + param * C
            yy = y1 + param * D

        dx = x - xx
        dy = y - yy
        distance = math.sqrt(dx * dx + dy * dy)

        return distance <= self.width / 2.0


@dataclass
class GeologicalModel:
    """
    Complex geological model supporting:
    - Layered media (horizontal layers)
    - Fault zones
    - Gradient layers (property variation with depth)
    - Irregular shapes (via polygon regions)
    """
    domain_width: float
    domain_height: float
    base_material: MaterialModel
    layers: List[MaterialLayer] = field(default_factory=list)
    faults: List[FaultZone] = field(default_factory=list)
    regions: List[Dict[str, Any]] = field(default_factory=list)

    def add_layer(self, y_min: float, y_max: float, vp: float, vs: float,
                  density: float, gradient: Optional[Dict[str, Any]] = None,
                  name: str = "") -> MaterialLayer:
        """Add a horizontal layer to the model."""
        layer = MaterialLayer(
            vp=vp, vs=vs, density=density,
            y_min=y_min, y_max=y_max,
            x_min=0.0, x_max=self.domain_width,
            gradient=gradient,
            name=name
        )
        self.layers.append(layer)
        self._sort_layers()
        return layer

    def add_fault(self, start: Tuple[float, float], end: Tuple[float, float],
                  width: float, fault_material: MaterialModel,
                  fault_type: FaultType = FaultType.NORMAL,
                  displacement: float = 0.0, name: str = "") -> FaultZone:
        """Add a fault zone to the model."""
        dx = end[0] - start[0]
        dy = end[1] - start[1]
        strike = math.degrees(math.atan2(dy, dx)) % 360

        fault = FaultZone(
            start_point=start,
            end_point=end,
            strike=strike,
            dip=90.0,
            width=width,
            material=fault_material,
            fault_type=fault_type,
            displacement=displacement,
            name=name
        )
        self.faults.append(fault)
        return fault

    def _sort_layers(self):
        """Sort layers by y_min (depth)."""
        self.layers.sort(key=lambda l: l.y_min)

    def get_material_at(self, x: float, y: float) -> MaterialModel:
        """Get material properties at a specific (x, y) point."""
        for fault in self.faults:
            if fault.contains_point(x, y):
                return fault.material

        for layer in reversed(self.layers):
            if layer.y_min <= y <= layer.y_max:
                if layer.x_min <= x <= layer.x_max:
                    return layer.get_material_at(x, y)

        return self.base_material

    def get_material_for_elements(self, nodes: np.ndarray,
                                   elements: np.ndarray) -> List[MaterialModel]:
        """
        Get material for each element based on element center.
        Returns list of MaterialModel for each element.
        """
        materials = []
        for elem_nodes in elements:
            elem_coords = nodes[elem_nodes]
            center = np.mean(elem_coords, axis=0)
            mat = self.get_material_at(center[0], center[1])
            materials.append(mat)
        return materials

    def get_material_map(self, nodes: np.ndarray) -> np.ndarray:
        """
        Create a material property map for all nodes.
        Returns array of shape (n_nodes, 3) with [vp, vs, density].
        """
        props = np.zeros((len(nodes), 3))
        for i, node in enumerate(nodes):
            mat = self.get_material_at(node[0], node[1])
            props[i] = [mat.vp, mat.vs, mat.density]
        return props

    def to_dict(self) -> Dict[str, Any]:
        """Serialize model to dictionary for storage."""
        return {
            'domain_width': self.domain_width,
            'domain_height': self.domain_height,
            'base_material': {
                'vp': self.base_material.vp,
                'vs': self.base_material.vs,
                'density': self.base_material.density
            },
            'layers': [{
                'vp': l.vp, 'vs': l.vs, 'density': l.density,
                'y_min': l.y_min, 'y_max': l.y_max,
                'x_min': l.x_min, 'x_max': l.x_max,
                'gradient': l.gradient,
                'name': l.name
            } for l in self.layers],
            'faults': [{
                'start': f.start_point,
                'end': f.end_point,
                'width': f.width,
                'material': {'vp': f.material.vp, 'vs': f.material.vs, 'density': f.material.density},
                'fault_type': f.fault_type.value,
                'displacement': f.displacement,
                'name': f.name
            } for f in self.faults]
        }

    def visualize(self, nx: int = 100, ny: int = 100) -> Dict[str, Any]:
        """Generate visualization data for the geological model."""
        x = np.linspace(0, self.domain_width, nx)
        y = np.linspace(0, self.domain_height, ny)
        xx, yy = np.meshgrid(x, y)

        vp_map = np.zeros((ny, nx))
        vs_map = np.zeros((ny, nx))
        density_map = np.zeros((ny, nx))

        for j in range(ny):
            for i in range(nx):
                mat = self.get_material_at(xx[j, i], yy[j, i])
                vp_map[j, i] = mat.vp
                vs_map[j, i] = mat.vs
                density_map[j, i] = mat.density

        return {
            'x': x.tolist(),
            'y': y.tolist(),
            'vp': vp_map.tolist(),
            'vs': vs_map.tolist(),
            'density': density_map.tolist(),
            'layers': [l.name for l in self.layers],
            'faults': [f.name for f in self.faults]
        }


def create_geological_model(params: Dict[str, Any]) -> GeologicalModel:
    """
    Create a geological model from parameters.
    
    Example params:
    {
        'domain_width': 1000,
        'domain_height': 1000,
        'base_material': {'vp': 3000, 'vs': 1732, 'density': 2700},
        'layers': [
            {'y_min': 800, 'y_max': 1000, 'vp': 4000, 'vs': 2309, 'density': 3000, 'name': 'Layer 1'},
            {'y_min': 600, 'y_max': 800, 'vp': 3500, 'vs': 2020, 'density': 2800, 'name': 'Layer 2'}
        ],
        'faults': [
            {'start': [200, 0], 'end': [400, 1000], 'width': 20, 'material': {...}}
        ]
    }
    """
    base_mat = params.get('base_material', {'vp': 3000, 'vs': 1732, 'density': 2700})
    base = MaterialModel(base_mat['vp'], base_mat['vs'], base_mat['density'])

    model = GeologicalModel(
        domain_width=params.get('domain_width', 1000.0),
        domain_height=params.get('domain_height', 1000.0),
        base_material=base
    )

    for layer_params in params.get('layers', []):
        model.add_layer(
            y_min=layer_params['y_min'],
            y_max=layer_params['y_max'],
            vp=layer_params['vp'],
            vs=layer_params['vs'],
            density=layer_params['density'],
            gradient=layer_params.get('gradient'),
            name=layer_params.get('name', '')
        )

    for fault_params in params.get('faults', []):
        fault_mat = fault_params.get('material', {'vp': 2500, 'vs': 1443, 'density': 2400})
        model.add_fault(
            start=tuple(fault_params['start']),
            end=tuple(fault_params['end']),
            width=fault_params['width'],
            fault_material=MaterialModel(fault_mat['vp'], fault_mat['vs'], fault_mat['density']),
            fault_type=FaultType(fault_params.get('fault_type', 'normal')),
            displacement=fault_params.get('displacement', 0.0),
            name=fault_params.get('name', '')
        )

    return model
