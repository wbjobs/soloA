import numpy as np
from typing import Tuple, Dict, Any
import gmsh


class MeshGenerator:
    """2D mesh generator using Gmsh API."""

    def __init__(self, width: float = 1000.0, height: float = 1000.0,
                 element_size: float = 20.0):
        self.width = width
        self.height = height
        self.element_size = element_size

    def generate_rectangular_mesh(self) -> Dict[str, Any]:
        """
        Generate a simple rectangular 2D mesh.
        Returns mesh information including nodes and elements.
        """
        nx = int(np.ceil(self.width / self.element_size))
        ny = int(np.ceil(self.height / self.element_size))

        x = np.linspace(0, self.width, nx + 1)
        y = np.linspace(0, self.height, ny + 1)

        xx, yy = np.meshgrid(x, y)
        nodes = np.column_stack([xx.ravel(), yy.ravel()])

        elements = []
        for j in range(ny):
            for i in range(nx):
                idx = j * (nx + 1) + i
                elements.append([idx, idx + 1, idx + (nx + 1) + 1, idx + (nx + 1)])

        elements = np.array(elements, dtype=np.int32)

        return {
            'nodes': nodes,
            'elements': elements,
            'element_type': 'quad',
            'nx': nx,
            'ny': ny,
            'width': self.width,
            'height': self.height,
            'element_size': self.element_size
        }

    def generate_with_gmsh(self) -> Dict[str, Any]:
        """Generate mesh using Gmsh API for more complex geometries."""
        gmsh.initialize()
        gmsh.option.setNumber("General.Terminal", 0)

        gmsh.model.add("seismic_domain")

        lc = self.element_size
        p1 = gmsh.model.geo.addPoint(0, 0, 0, lc)
        p2 = gmsh.model.geo.addPoint(self.width, 0, 0, lc)
        p3 = gmsh.model.geo.addPoint(self.width, self.height, 0, lc)
        p4 = gmsh.model.geo.addPoint(0, self.height, 0, lc)

        l1 = gmsh.model.geo.addLine(p1, p2)
        l2 = gmsh.model.geo.addLine(p2, p3)
        l3 = gmsh.model.geo.addLine(p3, p4)
        l4 = gmsh.model.geo.addLine(p4, p1)

        cl = gmsh.model.geo.addCurveLoop([l1, l2, l3, l4])
        gmsh.model.geo.addPlaneSurface([cl])

        gmsh.model.geo.synchronize()
        gmsh.model.mesh.generate(2)

        node_tags, node_coords, _ = gmsh.model.mesh.getNodes()
        node_coords = np.array(node_coords).reshape(-1, 3)[:, :2]

        element_types, element_tags, node_tags_per_element = gmsh.model.mesh.getElements(2)

        elements = []
        if len(element_types) > 0:
            elements = np.array(node_tags_per_element[0], dtype=np.int32).reshape(-1, 4) - 1

        gmsh.finalize()

        return {
            'nodes': node_coords,
            'elements': elements,
            'element_type': 'quad',
            'width': self.width,
            'height': self.height,
            'element_size': self.element_size
        }


def create_mesh(grid_params: Dict[str, Any]) -> Dict[str, Any]:
    """Create mesh from grid parameters."""
    generator = MeshGenerator(
        width=grid_params.get('width', 1000.0),
        height=grid_params.get('height', 1000.0),
        element_size=grid_params.get('element_size', 20.0)
    )
    return generator.generate_rectangular_mesh()
