import numpy as np
from typing import Dict, List, Tuple, Optional
from scipy.spatial import KDTree
from scipy.ndimage import gaussian_gradient_magnitude


class PosterioriErrorEstimator:
    def __init__(self):
        self.cache = {}

    def calculate_gradient(
        self,
        field_values: np.ndarray,
        points: np.ndarray,
        cells: Optional[List[List[int]]] = None
    ) -> np.ndarray:
        n_points = len(points)
        gradients = np.zeros((n_points, 3))

        if cells is None or len(cells) == 0:
            if n_points > 10:
                try:
                    tree = KDTree(points)
                    k = min(20, n_points)
                    
                    for i in range(n_points):
                        distances, indices = tree.query(points[i], k=k)
                        weights = 1.0 / (distances + 1e-10)
                        weights /= weights.sum()
                        
                        neighbors = points[indices]
                        centered = neighbors - points[i]
                        values = field_values[indices] - field_values[i]
                        
                        try:
                            gradient = np.linalg.lstsq(centered, values, rcond=None)[0]
                            gradients[i] = gradient
                        except:
                            pass
                except:
                    pass
        else:
            cell_gradients = np.zeros((n_points, 3))
            cell_count = np.zeros(n_points)

            for cell in cells:
                if len(cell) >= 3:
                    cell_points = points[cell]
                    cell_values = field_values[cell]
                    
                    if len(cell) == 3:
                        v1 = cell_points[1] - cell_points[0]
                        v2 = cell_points[2] - cell_points[0]
                        normal = np.cross(v1, v2)
                        area = np.linalg.norm(normal)
                        
                        if area > 1e-10:
                            for idx, vertex in enumerate(cell):
                                cell_gradients[vertex] += cell_values.mean()
                                cell_count[vertex] += 1
            
            mask = cell_count > 0
            gradients[mask] = cell_gradients[mask] / cell_count[mask, np.newaxis]

        return gradients

    def calculate_gradient_magnitude(self, field_data: np.ndarray) -> np.ndarray:
        if len(field_data.shape) == 1:
            return np.abs(field_data)
        
        if field_data.shape[1] == 3:
            return np.linalg.norm(field_data, axis=1)
        
        return field_data

    def detect_discontinuities(
        self,
        field_values: np.ndarray,
        points: np.ndarray,
        threshold_percentile: float = 95.0
    ) -> Tuple[np.ndarray, float]:
        if len(points) < 10:
            return np.array([]), 0.0

        tree = KDTree(points)
        discontinuity_scores = np.zeros(len(points))
        
        k = min(10, len(points))
        for i in range(len(points)):
            distances, indices = tree.query(points[i], k=k)
            local_values = field_values[indices]
            local_std = np.std(local_values)
            discontinuity_scores[i] = local_std

        threshold = np.percentile(discontinuity_scores, threshold_percentile)
        discontinuity_mask = discontinuity_scores > threshold

        return discontinuity_mask, threshold

    def detect_boundary_layer(
        self,
        velocity_field: np.ndarray,
        points: np.ndarray,
        wall_indices: Optional[List[int]] = None,
        threshold: float = 0.01
    ) -> Tuple[np.ndarray, float]:
        if len(points) < 10 or wall_indices is None or len(wall_indices) == 0:
            return np.array([]), 0.0

        wall_points = points[wall_indices]
        all_points = points

        tree = KDTree(wall_points)
        distances, _ = tree.query(all_points, k=1)

        velocity_magnitude = np.linalg.norm(velocity_field, axis=1) if velocity_field.ndim == 2 else velocity_field

        boundary_layer_mask = (distances < threshold) & (velocity_magnitude < 0.1 * velocity_magnitude.max())

        return boundary_layer_mask, threshold

    def detect_shock_waves(
        self,
        pressure_field: np.ndarray,
        velocity_field: np.ndarray,
        points: np.ndarray,
        threshold_percentile: float = 98.0
    ) -> Tuple[np.ndarray, float]:
        pressure_gradient = self.calculate_gradient(pressure_field, points)
        pressure_gradient_mag = self.calculate_gradient_magnitude(pressure_gradient)

        velocity_gradient = self.calculate_gradient(
            velocity_field[:, 0] if velocity_field.ndim == 2 else velocity_field,
            points
        )
        velocity_gradient_mag = self.calculate_gradient_magnitude(velocity_gradient)

        combined_score = pressure_gradient_mag * (1 + velocity_gradient_mag)
        threshold = np.percentile(combined_score, threshold_percentile)
        
        shock_mask = combined_score > threshold

        return shock_mask, threshold

    def detect_vortices(
        self,
        velocity_field: np.ndarray,
        points: np.ndarray,
        threshold_percentile: float = 90.0
    ) -> Tuple[np.ndarray, float]:
        if velocity_field.ndim != 2 or velocity_field.shape[1] != 3:
            return np.array([]), 0.0

        vorticity = self.calculate_vorticity(velocity_field, points)
        vorticity_magnitude = np.linalg.norm(vorticity, axis=1)

        threshold = np.percentile(vorticity_magnitude, threshold_percentile)
        vortex_mask = vorticity_magnitude > threshold

        return vortex_mask, threshold

    def calculate_vorticity(
        self,
        velocity_field: np.ndarray,
        points: np.ndarray
    ) -> np.ndarray:
        n_points = len(points)
        vorticity = np.zeros((n_points, 3))

        if n_points < 10:
            return vorticity

        u, v, w = velocity_field[:, 0], velocity_field[:, 1], velocity_field[:, 2]

        grad_u = self.calculate_gradient(u, points)
        grad_v = self.calculate_gradient(v, points)
        grad_w = self.calculate_gradient(w, points)

        vorticity[:, 0] = grad_w[:, 1] - grad_v[:, 2]
        vorticity[:, 1] = grad_u[:, 2] - grad_w[:, 0]
        vorticity[:, 2] = grad_v[:, 0] - grad_u[:, 1]

        return vorticity

    def estimate_error(
        self,
        field_data: np.ndarray,
        points: np.ndarray,
        method: str = 'gradient'
    ) -> Dict:
        n_points = len(points)

        if method == 'gradient':
            gradients = self.calculate_gradient(field_data, points)
            gradient_magnitude = self.calculate_gradient_magnitude(gradients)
            
            error_estimate = gradient_magnitude
            threshold = np.percentile(gradient_magnitude, 90)
            
            high_error_mask = error_estimate > threshold
            
            return {
                "method": "gradient_based",
                "error_per_point": error_estimate.tolist(),
                "threshold": float(threshold),
                "high_error_points": int(np.sum(high_error_mask)),
                "high_error_percentage": float(np.sum(high_error_mask) / n_points * 100),
                "max_error": float(np.max(error_estimate)),
                "mean_error": float(np.mean(error_estimate)),
                "recommended_refinement": {
                    "points_need_refinement": int(np.sum(high_error_mask)),
                    "refinement_ratio": float(np.sum(high_error_mask) / n_points)
                }
            }

        elif method == 'discontinuity':
            if field_data.ndim == 1:
                values = field_data
            else:
                values = np.linalg.norm(field_data, axis=1)
            
            discontinuity_mask, threshold = self.detect_discontinuities(values, points)
            
            return {
                "method": "discontinuity_based",
                "discontinuity_points": int(np.sum(discontinuity_mask)),
                "threshold": float(threshold),
                "percentage": float(np.sum(discontinuity_mask) / n_points * 100),
                "discontinuity_mask": discontinuity_mask.tolist()
            }

        elif method == 'residual':
            return {
                "method": "residual_based",
                "note": "Residual-based estimation requires additional solver data"
            }

        return {"error": "Unknown method"}

    def analyze_solution_quality(
        self,
        fields: Dict[str, np.ndarray],
        points: np.ndarray
    ) -> Dict:
        analysis = {}

        if 'p' in fields:
            pressure = fields['p']
            pressure_analysis = self.estimate_error(pressure, points, 'gradient')
            analysis['pressure'] = pressure_analysis

        if 'U' in fields:
            velocity = fields['U']
            velocity_analysis = self.estimate_error(velocity, points, 'gradient')
            analysis['velocity'] = velocity_analysis

            if velocity.ndim == 2:
                vortex_mask, vortex_threshold = self.detect_vortices(velocity, points)
                analysis['vortices'] = {
                    "vortex_points": int(np.sum(vortex_mask)),
                    "threshold": float(vortex_threshold),
                    "percentage": float(np.sum(vortex_mask) / len(points) * 100)
                }

        overall_score = 100.0
        if 'pressure' in analysis and analysis['pressure']['high_error_percentage'] > 20:
            overall_score -= 20
        if 'velocity' in analysis and analysis['velocity']['high_error_percentage'] > 20:
            overall_score -= 20

        analysis['overall'] = {
            "quality_score": max(0, overall_score),
            "needs_refinement": any(
                a.get('high_error_percentage', 0) > 15 
                for a in analysis.values() 
                if isinstance(a, dict)
            )
        }

        return analysis

    def suggest_refinement_regions(
        self,
        fields: Dict[str, np.ndarray],
        points: np.ndarray,
        n_regions: int = 5
    ) -> List[Dict]:
        high_error_points = set()

        if 'p' in fields:
            pressure_error = self.estimate_error(fields['p'], points, 'gradient')
            p_high_error = np.where(np.array(pressure_error['error_per_point']) > pressure_error['threshold'])[0]
            high_error_points.update(p_high_error)

        if 'U' in fields:
            velocity = fields['U']
            velocity_mag = np.linalg.norm(velocity, axis=1) if velocity.ndim == 2 else velocity
            velocity_error = self.estimate_error(velocity_mag, points, 'gradient')
            v_high_error = np.where(np.array(velocity_error['error_per_point']) > velocity_error['threshold'])[0]
            high_error_points.update(v_high_error)

        if not high_error_points:
            return []

        high_error_array = np.array(list(high_error_points))
        error_points = points[high_error_array]

        if len(error_points) < n_regions:
            n_regions = len(error_points)

        if n_regions == 0:
            return []

        try:
            from sklearn.cluster import KMeans
            kmeans = KMeans(n_clusters=n_regions, n_init=10, random_state=42)
            labels = kmeans.fit_predict(error_points)

            regions = []
            for i in range(n_regions):
                cluster_points = error_points[labels == i]
                if len(cluster_points) == 0:
                    continue

                center = np.mean(cluster_points, axis=0)
                min_bound = np.min(cluster_points, axis=0)
                max_bound = np.max(cluster_points, axis=0)

                padding = (max_bound - min_bound) * 0.1
                
                regions.append({
                    "id": i,
                    "type": "high_error",
                    "center": center.tolist(),
                    "bounds": np.concatenate([min_bound - padding, max_bound + padding]).tolist(),
                    "min": (min_bound - padding).tolist(),
                    "max": (max_bound + padding).tolist(),
                    "n_points": int(len(cluster_points)),
                    "refinement_level": 2,
                    "priority": "high"
                })

            return sorted(regions, key=lambda x: x['n_points'], reverse=True)

        except ImportError:
            center = np.mean(error_points, axis=0)
            min_bound = np.min(error_points, axis=0)
            max_bound = np.max(error_points, axis=0)
            padding = (max_bound - min_bound) * 0.1

            return [{
                "id": 0,
                "type": "high_error",
                "center": center.tolist(),
                "bounds": np.concatenate([min_bound - padding, max_bound + padding]).tolist(),
                "min": (min_bound - padding).tolist(),
                "max": (max_bound + padding).tolist(),
                "n_points": len(error_points),
                "refinement_level": 2,
                "priority": "high"
            }]


error_estimator = PosterioriErrorEstimator()
