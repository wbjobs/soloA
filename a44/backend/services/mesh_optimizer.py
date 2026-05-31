import numpy as np
from typing import Dict, List, Tuple, Optional
from scipy.spatial import cKDTree


class MeshOptimizer:
    def __init__(self):
        self.cache = {}

    def decimate_mesh(
        self,
        points: np.ndarray,
        faces: List[List[int]],
        factor: float = 0.5
    ) -> Tuple[np.ndarray, List[List[int]], Dict]:
        if len(points) == 0 or len(faces) == 0:
            return points, faces, {"removed_points": 0, "removed_faces": 0}

        n_points = len(points)
        n_points_target = max(int(n_points * factor), 1000)
        
        if n_points <= n_points_target:
            return points, faces, {
                "removed_points": 0,
                "removed_faces": 0,
                "final_points": n_points,
                "final_faces": len(faces)
            }

        tree = cKDTree(points)
        kept_indices = set()
        step = int(np.ceil(n_points / n_points_target))
        
        for i in range(0, n_points, step):
            kept_indices.add(i)

        old_to_new = {old_idx: new_idx for new_idx, old_idx in enumerate(sorted(kept_indices))}
        
        new_faces = []
        for face in faces:
            new_face = []
            all_kept = True
            for idx in face:
                if idx in old_to_new:
                    new_face.append(old_to_new[idx])
                else:
                    all_kept = False
                    break
            if all_kept and len(new_face) >= 3:
                new_faces.append(new_face)

        new_points = np.array([points[i] for i in sorted(kept_indices)])
        
        stats = {
            "original_points": n_points,
            "original_faces": len(faces),
            "final_points": len(new_points),
            "final_faces": len(new_faces),
            "removed_points": n_points - len(new_points),
            "removed_faces": len(faces) - len(new_faces),
            "reduction": f"{(1 - len(new_faces)/len(faces))*100:.1f}%"
        }

        return new_points, new_faces, stats

    def create_lod_levels(
        self,
        points: np.ndarray,
        faces: List[List[int]],
        levels: int = 3
    ) -> List[Dict]:
        lod_levels = []
        current_points = points.copy() if isinstance(points, np.ndarray) else np.array(points)
        current_faces = [f.copy() for f in faces]

        base_factors = [1.0, 0.5, 0.25, 0.1]
        
        for i, factor in enumerate(base_factors[:levels]):
            decimated_points, decimated_faces, stats = self.decimate_mesh(
                current_points, current_faces, factor
            )
            
            lod_levels.append({
                "level": i,
                "factor": factor,
                "points": decimated_points,
                "faces": decimated_faces,
                "stats": stats
            })

        return lod_levels

    def cluster_faces(
        self,
        points: np.ndarray,
        faces: List[List[int]],
        n_clusters: int = 8
    ) -> List[Dict]:
        if len(points) == 0:
            return []

        face_centers = []
        for face in faces:
            face_points = points[face]
            center = np.mean(face_points, axis=0)
            face_centers.append(center)
        
        face_centers = np.array(face_centers)

        from sklearn.cluster import KMeans
        n_clusters = min(n_clusters, len(faces))
        
        if n_clusters <= 1:
            return [{"faces": faces, "points": points, "cluster_id": 0}]

        kmeans = KMeans(n_clusters=n_clusters, n_init=10, random_state=42)
        labels = kmeans.fit_predict(face_centers)

        clusters = []
        for cluster_id in range(n_clusters):
            cluster_faces = [faces[i] for i, label in enumerate(labels) if label == cluster_id]
            
            all_indices = set()
            for face in cluster_faces:
                all_indices.update(face)
            
            old_to_new = {old: new for new, old in enumerate(sorted(all_indices))}
            
            remapped_faces = []
            for face in cluster_faces:
                remapped = [old_to_new[idx] for idx in face]
                remapped_faces.append(remapped)
            
            cluster_points = points[sorted(all_indices)]
            
            clusters.append({
                "cluster_id": cluster_id,
                "faces": remapped_faces,
                "points": cluster_points,
                "n_faces": len(cluster_faces),
                "n_points": len(cluster_points),
                "center": kmeans.cluster_centers_[cluster_id].tolist()
            })

        return clusters

    def extract_boundary_mesh(
        self,
        points: np.ndarray,
        faces: List[List[int]],
        boundaries: List[Dict]
    ) -> Dict:
        result = {}
        
        face_id = 0
        for boundary in boundaries:
            boundary_faces = []
            start_face = boundary.get("start_face", 0)
            n_faces = boundary.get("n_faces", 0)
            
            for i in range(start_face, start_face + n_faces):
                if i < len(faces):
                    boundary_faces.append(faces[i])
            
            all_indices = set()
            for face in boundary_faces:
                all_indices.update(face)
            
            old_to_new = {old: new for new, old in enumerate(sorted(all_indices))}
            
            remapped_faces = []
            for face in boundary_faces:
                remapped = [old_to_new[idx] for idx in face]
                remapped_faces.append(remapped)
            
            boundary_points = points[sorted(all_indices)]
            
            result[boundary["name"]] = {
                "type": boundary["type"],
                "points": boundary_points,
                "faces": remapped_faces,
                "n_faces": len(boundary_faces),
                "n_points": len(boundary_points)
            }
            
            face_id += n_faces

        return result

    def compute_frustum_culling(
        self,
        points: np.ndarray,
        camera_position: List[float],
        camera_direction: List[float],
        fov_degrees: float = 60
    ) -> np.ndarray:
        if len(points) == 0:
            return np.array([], dtype=bool)

        cam_pos = np.array(camera_position)
        cam_dir = np.array(camera_direction)
        cam_dir = cam_dir / (np.linalg.norm(cam_dir) + 1e-8)

        vectors = points - cam_pos
        distances = np.linalg.norm(vectors, axis=1)
        
        normalized_vectors = vectors / (distances[:, np.newaxis] + 1e-8)
        dot_products = np.dot(normalized_vectors, cam_dir)
        
        fov_radians = np.radians(fov_degrees / 2)
        cos_fov = np.cos(fov_radians)
        
        in_frustum = dot_products > cos_fov
        
        return in_frustum

    def generate_chunk(
        self,
        points: np.ndarray,
        faces: List[List[int]],
        chunk_id: int,
        total_chunks: int
    ) -> Dict:
        total_faces = len(faces)
        chunk_size = total_faces // total_chunks
        start = chunk_id * chunk_size
        end = start + chunk_size if chunk_id < total_chunks - 1 else total_faces
        
        chunk_faces = faces[start:end]
        
        all_indices = set()
        for face in chunk_faces:
            all_indices.update(face)
        
        old_to_new = {old: new for new, old in enumerate(sorted(all_indices))}
        
        remapped_faces = []
        for face in chunk_faces:
            remapped = [old_to_new[idx] for idx in face]
            remapped_faces.append(remapped)
        
        chunk_points = points[sorted(all_indices)]
        
        return {
            "chunk_id": chunk_id,
            "total_chunks": total_chunks,
            "points": chunk_points,
            "faces": remapped_faces,
            "n_points": len(chunk_points),
            "n_faces": len(chunk_faces)
        }


mesh_optimizer = MeshOptimizer()
