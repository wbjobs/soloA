import numpy as np
from scipy.spatial import cKDTree
from scipy.interpolate import griddata

class CuttingEngine:
    def __init__(self):
        pass

    def plane_cut(self, points, colors, plane_point, plane_normal, tolerance=0.1):
        points = np.array(points)
        colors = np.array(colors)
        
        plane_normal = np.array(plane_normal) / np.linalg.norm(plane_normal)
        plane_point = np.array(plane_point)
        
        distances = np.dot(points - plane_point, plane_normal)
        
        above_mask = distances > tolerance
        below_mask = distances < -tolerance
        near_mask = np.abs(distances) <= tolerance
        
        result = {
            'above': {
                'points': points[above_mask].tolist(),
                'colors': colors[above_mask].tolist()
            },
            'below': {
                'points': points[below_mask].tolist(),
                'colors': colors[below_mask].tolist()
            },
            'intersection': {
                'points': points[near_mask].tolist(),
                'colors': colors[near_mask].tolist()
            }
        }
        
        return result

    def surface_cut(self, points, colors, surface_function, tolerance=0.1):
        points = np.array(points)
        colors = np.array(colors)
        
        surface_values = surface_function(points[:, 0], points[:, 1])
        
        distances = points[:, 2] - surface_values
        
        above_mask = distances > tolerance
        below_mask = distances < -tolerance
        near_mask = np.abs(distances) <= tolerance
        
        result = {
            'above': {
                'points': points[above_mask].tolist(),
                'colors': colors[above_mask].tolist()
            },
            'below': {
                'points': points[below_mask].tolist(),
                'colors': colors[below_mask].tolist()
            },
            'intersection': {
                'points': points[near_mask].tolist(),
                'colors': colors[near_mask].tolist()
            }
        }
        
        return result

    def generate_cross_section(self, points, colors, plane_point, plane_normal, grid_size=100):
        points = np.array(points)
        colors = np.array(colors)
        
        plane_normal = np.array(plane_normal) / np.linalg.norm(plane_normal)
        plane_point = np.array(plane_point)
        
        u = self._get_orthogonal_vector(plane_normal)
        u = u / np.linalg.norm(u)
        v = np.cross(plane_normal, u)
        
        projected = np.dot(points - plane_point, np.column_stack([u, v]))
        
        distances = np.abs(np.dot(points - plane_point, plane_normal))
        
        near_plane = distances < 0.5
        
        if not np.any(near_plane):
            return None
        
        projected_near = projected[near_plane]
        z_values = points[near_plane, 2]
        
        min_u, max_u = np.min(projected_near[:, 0]), np.max(projected_near[:, 0])
        min_v, max_v = np.min(projected_near[:, 1]), np.max(projected_near[:, 1])
        
        grid_u = np.linspace(min_u, max_u, grid_size)
        grid_v = np.linspace(min_v, max_v, grid_size)
        grid_u, grid_v = np.meshgrid(grid_u, grid_v)
        
        grid_z = griddata(projected_near, z_values, (grid_u, grid_v), method='linear')
        
        cross_section = {
            'grid_u': grid_u.tolist(),
            'grid_v': grid_v.tolist(),
            'grid_z': grid_z.tolist(),
            'bounds': {
                'u_min': min_u,
                'u_max': max_u,
                'v_min': min_v,
                'v_max': max_v
            }
        }
        
        return cross_section

    def _get_orthogonal_vector(self, normal):
        normal = np.array(normal)
        if abs(normal[0]) < 0.9:
            return np.array([1, 0, 0])
        else:
            return np.array([0, 1, 0])

    def create_section_polygons(self, cross_section, levels):
        if cross_section is None:
            return []
        
        grid_z = np.array(cross_section['grid_z'])
        grid_u = np.array(cross_section['grid_u'])
        grid_v = np.array(cross_section['grid_v'])
        
        contours = []
        
        for level in levels:
            mask = np.isfinite(grid_z)
            if not np.any(mask):
                continue
            
            try:
                import matplotlib.pyplot as plt
                cs = plt.contour(grid_u, grid_v, grid_z, levels=[level])
                
                for collection in cs.collections:
                    for path in collection.get_paths():
                        vertices = path.vertices.tolist()
                        if len(vertices) > 2:
                            contours.append({
                                'level': level,
                                'vertices': vertices
                            })
            except:
                pass
        
        return contours
