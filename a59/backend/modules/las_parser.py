import laspy
import numpy as np
import json
import os

class LASParser:
    def __init__(self):
        self.las_data = None
        self.points = None
        self.colors = None
        self.metadata = {}
        self.attributes = {}
        self.available_attributes = []

    def load_las(self, file_path):
        try:
            self.las_data = laspy.read(file_path)
            self._extract_points()
            self._extract_attributes()
            self._extract_metadata(file_path)
            return True
        except Exception as e:
            print(f"Error loading LAS file: {e}")
            return False

    def _extract_points(self):
        if self.las_data is None:
            return
        
        x = self.las_data.x
        y = self.las_data.y
        z = self.las_data.z
        
        self.points = np.column_stack([x, y, z])
        
        if hasattr(self.las_data, 'red') and hasattr(self.las_data, 'green') and hasattr(self.las_data, 'blue'):
            self.colors = np.column_stack([
                self.las_data.red / 65535.0,
                self.las_data.green / 65535.0,
                self.las_data.blue / 65535.0
            ])
        else:
            z_min = np.min(z)
            z_max = np.max(z)
            z_normalized = (z - z_min) / (z_max - z_min) if z_max > z_min else np.zeros_like(z)
            self.colors = self._height_to_color(z_normalized)

    def _extract_attributes(self):
        if self.las_data is None:
            return
        
        self.available_attributes = []
        self.attributes = {}
        
        point_format = self.las_data.header.point_format
        standard_attrs = ['intensity', 'return_number', 'number_of_returns', 
                          'scan_direction_flag', 'edge_of_flight_line', 
                          'classification', 'synthetic', 'key_point', 
                          'withheld', 'overlap', 'scanner_channel', 
                          'scan_angle_rank', 'user_data', 'point_source_id']
        
        for attr_name in standard_attrs:
            if hasattr(self.las_data, attr_name):
                try:
                    data = np.array(getattr(self.las_data, attr_name))
                    if len(data) == len(self.points):
                        self.attributes[attr_name] = data
                        self.available_attributes.append(attr_name)
                except:
                    pass
        
        extra_attrs = self.las_data.point_format.extra_dimensions
        for extra_attr in extra_attrs:
            attr_name = extra_attr.name
            try:
                data = np.array(getattr(self.las_data, attr_name))
                if len(data) == len(self.points):
                    self.attributes[attr_name] = data
                    self.available_attributes.append(attr_name)
            except:
                pass
        
        z_values = self.points[:, 2]
        self.attributes['elevation'] = z_values
        if 'elevation' not in self.available_attributes:
            self.available_attributes.insert(0, 'elevation')

    def _extract_metadata(self, file_path):
        if self.las_data is None:
            return
        
        header = self.las_data.header
        self.metadata = {
            'filename': os.path.basename(file_path),
            'point_count': header.point_count,
            'min': [header.x_min, header.y_min, header.z_min],
            'max': [header.x_max, header.y_max, header.z_max],
            'scale': [header.x_scale, header.y_scale, header.z_scale],
            'offset': [header.x_offset, header.y_offset, header.z_offset],
            'point_format': header.point_format.id,
            'attributes': self.available_attributes
        }

    def _height_to_color(self, z_normalized):
        colors = np.zeros((len(z_normalized), 3))
        for i, z in enumerate(z_normalized):
            if z < 0.33:
                t = z / 0.33
                colors[i] = [0, 0.5 + 0.5 * t, 1 - 0.5 * t]
            elif z < 0.66:
                t = (z - 0.33) / 0.33
                colors[i] = [0, 1 - 0.5 * t, 0.5 * t]
            else:
                t = (z - 0.66) / 0.34
                colors[i] = [t, 1 - t, 0]
        return colors

    def get_attribute_colors(self, attr_name, colormap='viridis', invert=False):
        if attr_name not in self.attributes:
            return None
        
        attr_values = self.attributes[attr_name]
        
        min_val = np.min(attr_values)
        max_val = np.max(attr_values)
        
        if max_val == min_val:
            normalized = np.zeros_like(attr_values)
        else:
            normalized = (attr_values - min_val) / (max_val - min_val)
            if invert:
                normalized = 1 - normalized
        
        colors = np.zeros((len(normalized), 3))
        
        for i, val in enumerate(normalized):
            colors[i] = self._value_to_color(val, colormap)
        
        return {
            'colors': colors.tolist(),
            'min': float(min_val),
            'max': float(max_val),
            'colormap': colormap
        }

    def _value_to_color(self, value, colormap):
        value = max(0, min(1, value))
        
        if colormap == 'viridis':
            return self._viridis(value)
        elif colormap == 'plasma':
            return self._plasma(value)
        elif colormap == 'jet':
            return self._jet(value)
        elif colormap == 'rainbow':
            return self._rainbow(value)
        elif colormap == 'reds':
            return self._reds(value)
        elif colormap == 'greens':
            return self._greens(value)
        elif colormap == 'blues':
            return self._blues(value)
        elif colormap == 'terrain':
            return self._terrain(value)
        else:
            return self._viridis(value)

    def _viridis(self, value):
        if value < 0.25:
            t = value / 0.25
            return [0.267, 0.004, 0.329 + 0.23 * t]
        elif value < 0.5:
            t = (value - 0.25) / 0.25
            return [0.282 - 0.03 * t, 0.140 + 0.56 * t, 0.458 - 0.06 * t]
        elif value < 0.75:
            t = (value - 0.5) / 0.25
            return [0.128 + 0.37 * t, 0.566 + 0.20 * t, 0.550 - 0.13 * t]
        else:
            t = (value - 0.75) / 0.25
            return [0.369 + 0.63 * t, 0.788 + 0.21 * t, 0.384 - 0.38 * t]

    def _plasma(self, value):
        if value < 0.25:
            t = value / 0.25
            return [0.050, 0.029, 0.528 + 0.30 * t]
        elif value < 0.5:
            t = (value - 0.25) / 0.25
            return [0.390 + 0.30 * t, 0.116 + 0.38 * t, 0.429 - 0.11 * t]
        elif value < 0.75:
            t = (value - 0.5) / 0.25
            return [0.792 - 0.15 * t, 0.270 + 0.40 * t, 0.464 - 0.12 * t]
        else:
            t = (value - 0.75) / 0.25
            return [0.940 - 0.07 * t, 0.975 - 0.05 * t, 0.131 + 0.07 * t]

    def _jet(self, value):
        if value < 0.125:
            t = value / 0.125
            return [0, 0, 0.5 + 0.5 * t]
        elif value < 0.375:
            t = (value - 0.125) / 0.25
            return [0, 0 + 0.5 * t, 1 - 0.5 * t]
        elif value < 0.625:
            t = (value - 0.375) / 0.25
            return [0 + t, 0.5 + 0.5 * t, 0.5 - 0.5 * t]
        elif value < 0.875:
            t = (value - 0.625) / 0.25
            return [1 - 0.5 * t, 1 - 0.5 * t, 0 + t]
        else:
            t = (value - 0.875) / 0.125
            return [0.5 - 0.5 * t, 0.5 - 0.5 * t, 1]

    def _rainbow(self, value):
        h = value * 6
        i = int(h)
        f = h - i
        
        if i == 0:
            return [1, f, 0]
        elif i == 1:
            return [1 - f, 1, 0]
        elif i == 2:
            return [0, 1, f]
        elif i == 3:
            return [0, 1 - f, 1]
        elif i == 4:
            return [f, 0, 1]
        else:
            return [1, 0, 1 - f]

    def _reds(self, value):
        return [1.0, 1 - value, 1 - value]

    def _greens(self, value):
        return [1 - value, 1.0, 1 - value]

    def _blues(self, value):
        return [1 - value, 1 - value, 1.0]

    def _terrain(self, value):
        if value < 0.25:
            t = value / 0.25
            return [0, 0, 0.5 + 0.5 * t]
        elif value < 0.5:
            t = (value - 0.25) / 0.25
            return [0, 0.5 * t, 1 - 0.5 * t]
        elif value < 0.75:
            t = (value - 0.5) / 0.25
            return [0.3 + 0.3 * t, 0.5 + 0.2 * t, 0.2 - 0.1 * t]
        else:
            t = (value - 0.75) / 0.25
            return [0.6 + 0.4 * t, 0.7 + 0.3 * t, 0.1]

    def get_points_data(self, max_points=100000):
        if self.points is None:
            return None
        
        total_points = len(self.points)
        if total_points > max_points:
            indices = np.random.choice(total_points, max_points, replace=False)
            sampled_points = self.points[indices]
            sampled_colors = self.colors[indices]
        else:
            sampled_points = self.points
            sampled_colors = self.colors
            indices = None
        
        return {
            'points': sampled_points.tolist(),
            'colors': sampled_colors.tolist(),
            'total_points': total_points,
            'sampled_points': len(sampled_points),
            'metadata': self.metadata,
            'sampled_indices': indices.tolist() if indices is not None else None
        }

    def get_attribute_stats(self, attr_name):
        if attr_name not in self.attributes:
            return None
        
        values = self.attributes[attr_name]
        
        return {
            'name': attr_name,
            'min': float(np.min(values)),
            'max': float(np.max(values)),
            'mean': float(np.mean(values)),
            'median': float(np.median(values)),
            'std': float(np.std(values)),
            'unique_count': len(np.unique(values))
        }

    def get_bounding_box(self):
        if self.points is None:
            return None
        
        return {
            'min': [np.min(self.points[:, 0]), np.min(self.points[:, 1]), np.min(self.points[:, 2])],
            'max': [np.max(self.points[:, 0]), np.max(self.points[:, 1]), np.max(self.points[:, 2])],
            'center': [np.mean(self.points[:, 0]), np.mean(self.points[:, 1]), np.mean(self.points[:, 2])]
        }
