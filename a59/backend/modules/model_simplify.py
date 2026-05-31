import numpy as np
from sklearn.cluster import KMeans
from scipy.spatial import cKDTree

class ModelSimplifier:
    def __init__(self):
        pass

    def voxel_grid_downsample(self, points, colors, voxel_size):
        if len(points) == 0:
            return np.array([]), np.array([])
        
        voxel_indices = np.floor(points / voxel_size).astype(np.int64)
        unique_voxels, inverse_indices = np.unique(voxel_indices, axis=0, return_inverse=True)
        
        simplified_points = []
        simplified_colors = []
        
        for i in range(len(unique_voxels)):
            mask = inverse_indices == i
            if np.any(mask):
                simplified_points.append(np.mean(points[mask], axis=0))
                simplified_colors.append(np.mean(colors[mask], axis=0))
        
        return np.array(simplified_points), np.array(simplified_colors)

    def random_sample(self, points, colors, sample_ratio=0.1):
        if len(points) == 0:
            return np.array([]), np.array([])
        
        num_samples = max(1, int(len(points) * sample_ratio))
        indices = np.random.choice(len(points), num_samples, replace=False)
        
        return points[indices], colors[indices]

    def kmeans_simplify(self, points, colors, num_clusters=5000):
        if len(points) <= num_clusters:
            return points, colors
        
        kmeans = KMeans(n_clusters=num_clusters, n_init=10, random_state=42)
        labels = kmeans.fit_predict(points)
        
        simplified_points = []
        simplified_colors = []
        
        for i in range(num_clusters):
            mask = labels == i
            if np.any(mask):
                simplified_points.append(kmeans.cluster_centers_[i])
                simplified_colors.append(np.mean(colors[mask], axis=0))
        
        return np.array(simplified_points), np.array(simplified_colors)

    def uniform_downsample(self, points, colors, step=10):
        if len(points) == 0:
            return np.array([]), np.array([])
        
        indices = np.arange(0, len(points), step)
        return points[indices], colors[indices]

    def simplify(self, points, colors, method='voxel', **kwargs):
        points = np.array(points)
        colors = np.array(colors)
        
        if method == 'voxel':
            voxel_size = kwargs.get('voxel_size', 1.0)
            return self.voxel_grid_downsample(points, colors, voxel_size)
        elif method == 'random':
            sample_ratio = kwargs.get('sample_ratio', 0.1)
            return self.random_sample(points, colors, sample_ratio)
        elif method == 'kmeans':
            num_clusters = kwargs.get('num_clusters', 5000)
            return self.kmeans_simplify(points, colors, num_clusters)
        elif method == 'uniform':
            step = kwargs.get('step', 10)
            return self.uniform_downsample(points, colors, step)
        else:
            return points, colors

    def get_simplify_stats(self, original_points, simplified_points):
        return {
            'original_count': len(original_points),
            'simplified_count': len(simplified_points),
            'reduction_ratio': 1 - (len(simplified_points) / len(original_points)) if len(original_points) > 0 else 0
        }
