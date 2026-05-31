import numpy as np
from scipy.interpolate import griddata, NearestNDInterpolator
from scipy.ndimage import gaussian_filter

class ContourCalculator:
    def __init__(self):
        pass

    def create_height_grid(self, points, grid_resolution=100):
        points = np.array(points)
        
        x = points[:, 0]
        y = points[:, 1]
        z = points[:, 2]
        
        x_min, x_max = np.min(x), np.max(x)
        y_min, y_max = np.min(y), np.max(y)
        
        margin = 0.02
        x_range = x_max - x_min
        y_range = y_max - y_min
        x_min -= x_range * margin
        x_max += x_range * margin
        y_min -= y_range * margin
        y_max += y_range * margin
        
        grid_x = np.linspace(x_min, x_max, grid_resolution)
        grid_y = np.linspace(y_min, y_max, grid_resolution)
        grid_x, grid_y = np.meshgrid(grid_x, grid_y)
        
        grid_z = griddata((x, y), z, (grid_x, grid_y), method='linear')
        
        nan_mask = np.isnan(grid_z)
        if np.any(nan_mask):
            nearest_interp = NearestNDInterpolator((x, y), z)
            grid_z[nan_mask] = nearest_interp(grid_x[nan_mask], grid_y[nan_mask])
        
        return {
            'grid_x': grid_x.tolist(),
            'grid_y': grid_y.tolist(),
            'grid_z': grid_z.tolist(),
            'bounds': {
                'x_min': x_min,
                'x_max': x_max,
                'y_min': y_min,
                'y_max': y_max,
                'z_min': np.min(z),
                'z_max': np.max(z)
            }
        }

    def calculate_contours(self, height_grid, num_levels=10):
        grid_x = np.array(height_grid['grid_x'])
        grid_y = np.array(height_grid['grid_y'])
        grid_z = np.array(height_grid['grid_z'])
        
        grid_z = self._fill_nan_holes(grid_z)
        
        bounds = height_grid['bounds']
        z_min = bounds['z_min']
        z_max = bounds['z_max']
        
        margin = (z_max - z_min) * 0.05
        z_min -= margin
        z_max += margin
        
        levels = np.linspace(z_min, z_max, num_levels + 1)
        
        contours = []
        
        try:
            import matplotlib
            matplotlib.use('Agg')
            import matplotlib.pyplot as plt
            
            cs = plt.contour(grid_x, grid_y, grid_z, levels=levels, extend='both')
            
            for i, collection in enumerate(cs.collections):
                level = levels[i]
                for path in collection.get_paths():
                    vertices = path.vertices.tolist()
                    if len(vertices) >= 2:
                        closed = np.allclose(vertices[0], vertices[-1])
                        contours.append({
                            'level': float(level),
                            'vertices': vertices,
                            'level_index': i,
                            'closed': closed
                        })
            
            plt.close('all')
        except Exception as e:
            print(f"Error calculating contours: {e}")
        
        return contours

    def _fill_nan_holes(self, grid_z):
        grid_z = np.array(grid_z)
        nan_mask = np.isnan(grid_z)
        
        if not np.any(nan_mask):
            return grid_z
        
        rows, cols = grid_z.shape
        
        for i in range(rows):
            for j in range(cols):
                if nan_mask[i, j]:
                    neighbors = []
                    for di in [-1, 0, 1]:
                        for dj in [-1, 0, 1]:
                            ni, nj = i + di, j + dj
                            if 0 <= ni < rows and 0 <= nj < cols and not nan_mask[ni, nj]:
                                neighbors.append(grid_z[ni, nj])
                    
                    if neighbors:
                        grid_z[i, j] = np.mean(neighbors)
                        nan_mask[i, j] = False
        
        if np.any(nan_mask):
            valid_z = grid_z[~nan_mask]
            if len(valid_z) > 0:
                mean_val = np.mean(valid_z)
                grid_z[nan_mask] = mean_val
        
        return grid_z

    def smooth_grid(self, height_grid, sigma=1.0):
        grid_z = np.array(height_grid['grid_z'])
        
        nan_mask = np.isnan(grid_z)
        if np.sum(nan_mask) == grid_z.size:
            return height_grid
        
        grid_z = self._fill_nan_holes(grid_z)
        
        smoothed_z = gaussian_filter(grid_z, sigma=sigma, mode='nearest')
        
        height_grid['grid_z'] = smoothed_z.tolist()
        return height_grid

    def generate_contour_colors(self, contours, colormap='viridis'):
        if not contours:
            return []
        
        levels = [c['level'] for c in contours]
        min_level = min(levels)
        max_level = max(levels)
        
        try:
            import matplotlib.pyplot as plt
            cmap = plt.get_cmap(colormap)
            
            for contour in contours:
                normalized = (contour['level'] - min_level) / (max_level - min_level) if max_level > min_level else 0.5
                color = cmap(normalized)
                contour['color'] = [color[0], color[1], color[2]]
        except:
            for contour in contours:
                contour['color'] = [1, 0, 0]
        
        return contours

    def get_contour_statistics(self, contours, bounds):
        if not contours:
            return None
        
        levels = [c['level'] for c in contours]
        
        return {
            'num_contours': len(contours),
            'min_level': min(levels),
            'max_level': max(levels),
            'level_range': max(levels) - min(levels),
            'bounds': bounds
        }
