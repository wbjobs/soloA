import numpy as np
from typing import Dict, List, Optional
from pathlib import Path
import json
from datetime import datetime


class AMRService:
    def __init__(self):
        self.regions_cache = {}

    def create_region(
        self,
        region_data: Dict,
        case_id: str
    ) -> Dict:
        region = {
            "id": region_data.get("id"),
            "case_id": case_id,
            "name": region_data.get("name", f"Region_{region_data.get('id', 'default')}"),
            "type": region_data.get("type", "manual"),
            "bounds": region_data.get("bounds", []),
            "center": region_data.get("center"),
            "min": region_data.get("min"),
            "max": region_data.get("max"),
            "refinement_level": region_data.get("refinement_level", 2),
            "priority": region_data.get("priority", "medium"),
            "description": region_data.get("description", ""),
            "is_active": region_data.get("is_active", True),
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }

        return region

    def is_point_in_region(
        self,
        point: List[float],
        region: Dict
    ) -> bool:
        if 'bounds' in region and len(region['bounds']) == 6:
            xmin, xmax, ymin, ymax, zmin, zmax = region['bounds']
            return (
                xmin <= point[0] <= xmax and
                ymin <= point[1] <= ymax and
                zmin <= point[2] <= zmax
            )

        if 'center' in region and 'radius' in region:
            center = np.array(region['center'])
            p = np.array(point)
            return np.linalg.norm(p - center) <= region['radius']

        return False

    def find_points_in_region(
        self,
        points: np.ndarray,
        region: Dict
    ) -> np.ndarray:
        mask = np.zeros(len(points), dtype=bool)

        if 'bounds' in region and len(region['bounds']) == 6:
            xmin, xmax, ymin, ymax, zmin, zmax = region['bounds']
            mask = (
                (points[:, 0] >= xmin) &
                (points[:, 0] <= xmax) &
                (points[:, 1] >= ymin) &
                (points[:, 1] <= ymax) &
                (points[:, 2] >= zmin) &
                (points[:, 2] <= zmax)
            )

        return np.where(mask)[0]

    def generate_snappy_hex_mesh_dict(
        self,
        regions: List[Dict],
        base_refinement: int = 2
    ) -> Dict:
        refinement_regions = {}
        
        for i, region in enumerate(regions):
            level = region.get('refinement_level', base_refinement)
            region_name = region.get('name', f'refinement_region_{i}')
            
            if 'bounds' in region and len(region['bounds']) == 6:
                refinement_regions[region_name] = {
                    "mode": "inside",
                    "levels": [
                        (f"({level} {level})", None)
                    ],
                    "cellZone": region_name,
                    "cellZoneInside": True
                }

        return {
            "refinement_regions": refinement_regions,
            "total_regions": len(regions)
        }

    def estimate_cells_after_refinement(
        self,
        base_n_cells: int,
        regions: List[Dict]
    ) -> Dict:
        total_factor = 1.0
        for region in regions:
            level = region.get('refinement_level', 2)
            factor = 8 ** level
            total_factor += factor * 0.1

        estimated_cells = int(base_n_cells * total_factor)

        return {
            "base_cells": base_n_cells,
            "estimated_cells": estimated_cells,
            "increase_factor": float(estimated_cells / max(1, base_n_cells)),
            "regions_count": len(regions)
        }

    def merge_regions(
        self,
        regions: List[Dict]
    ) -> List[Dict]:
        if len(regions) < 2:
            return regions

        merged = []
        used = set()

        for i, r1 in enumerate(regions):
            if i in used:
                continue

            current = r1.copy()
            used.add(i)

            for j, r2 in enumerate(regions[i+1:], i+1):
                if j in used:
                    continue

                if self.regions_overlap(r1, r2):
                    current = self.merge_two_regions(current, r2)
                    used.add(j)

            merged.append(current)

        return merged

    def regions_overlap(
        self,
        r1: Dict,
        r2: Dict
    ) -> bool:
        if 'bounds' not in r1 or 'bounds' not in r2:
            return False

        b1 = r1['bounds']
        b2 = r2['bounds']

        if len(b1) < 6 or len(b2) < 6:
            return False

        return not (
            b1[1] < b2[0] or b2[1] < b1[0] or
            b1[3] < b2[2] or b2[3] < b1[2] or
            b1[5] < b2[4] or b2[5] < b1[4]
        )

    def merge_two_regions(
        self,
        r1: Dict,
        r2: Dict
    ) -> Dict:
        b1 = r1.get('bounds', [])
        b2 = r2.get('bounds', [])

        if len(b1) < 6:
            return r2
        if len(b2) < 6:
            return r1

        merged = {
            **r1,
            "name": f"Merged_{r1.get('name', 'r1')}_{r2.get('name', 'r2')}",
            "bounds": [
                min(b1[0], b2[0]),
                max(b1[1], b2[1]),
                min(b1[2], b2[2]),
                max(b1[3], b2[3]),
                min(b1[4], b2[4]),
                max(b1[5], b2[5]),
            ],
            "center": [
                (min(b1[0], b2[0]) + max(b1[1], b2[1])) / 2,
                (min(b1[2], b2[2]) + max(b1[3], b2[3])) / 2,
                (min(b1[4], b2[4]) + max(b1[5], b2[5])) / 2,
            ],
            "min": [
                min(b1[0], b2[0]),
                min(b1[2], b2[2]),
                min(b1[4], b2[4]),
            ],
            "max": [
                max(b1[1], b2[1]),
                max(b1[3], b2[3]),
                max(b1[5], b2[5]),
            ],
            "refinement_level": max(
                r1.get('refinement_level', 2),
                r2.get('refinement_level', 2)
            ),
            "priority": max(
                r1.get('priority', 'medium'),
                r2.get('priority', 'medium'),
                key=lambda x: ["low", "medium", "high"].index(x)
            ),
            "merged": True,
            "merged_regions": [r1.get('id'), r2.get('id')]
        }

        return merged

    def create_blockmesh_dict(
        self,
        regions: List[Dict],
        base_size: List[float] = [10, 10, 10]
    ) -> Dict:
        refinement_zones = []

        for region in regions:
            if 'bounds' in region and len(region['bounds']) == 6:
                b = region['bounds']
                zone = {
                    "name": region.get('name', f"zone_{region.get('id', 0)}"),
                    "type": "box",
                    "min": [b[0], b[2], b[4]],
                    "max": [b[1], b[3], b[5]],
                    "cellSize": base_size,
                    "refinement": region.get('refinement_level', 2)
                }
                refinement_zones.append(zone)

        return {
            "refinement_zones": refinement_zones,
            "base_size": base_size
        }

    def validate_regions(
        self,
        regions: List[Dict],
        geometry_bounds: Optional[List[float]] = None
    ) -> Dict:
        issues = []

        for i, region in enumerate(regions):
            if 'bounds' not in region or len(region['bounds']) < 6:
                issues.append(f"Region {i}: Missing or invalid bounds")
                continue

            b = region['bounds']

            if b[0] >= b[1]:
                issues.append(f"Region {i}: Invalid X bounds (min >= max)")
            if b[2] >= b[3]:
                issues.append(f"Region {i}: Invalid Y bounds (min >= max)")
            if b[4] >= b[5]:
                issues.append(f"Region {i}: Invalid Z bounds (min >= max)")

            if geometry_bounds and len(geometry_bounds) >= 6:
                gb = geometry_bounds
                if (b[0] < gb[0] or b[1] > gb[1] or
                    b[2] < gb[2] or b[3] > gb[3] or
                    b[4] < gb[4] or b[5] > gb[5]):
                    issues.append(f"Region {i}: Bounds extend outside geometry")

            level = region.get('refinement_level', 2)
            if level < 0 or level > 6:
                issues.append(f"Region {i}: Refinement level {level} out of range (0-6)")

        return {
            "valid": len(issues) == 0,
            "issues": issues,
            "n_regions": len(regions)
        }


amr_service = AMRService()
