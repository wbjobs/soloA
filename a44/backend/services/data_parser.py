import numpy as np
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import re


class FoamDataParser:
    def __init__(self):
        self.cache = {}

    def _read_header(self, file_path: Path) -> Dict:
        with open(file_path, 'r') as f:
            content = f.read()
        
        header = {}
        header_match = re.search(r'FoamFile\s*\{([^}]+)\}', content, re.DOTALL)
        if header_match:
            header_content = header_match.group(1)
            for line in header_content.split('\n'):
                if '=' in line:
                    key, value = line.split('=', 1)
                    header[key.strip()] = value.strip().rstrip(';').strip('"')
        
        return header

    def _parse_scalar_field(self, file_path: Path) -> Dict:
        with open(file_path, 'r') as f:
            lines = f.readlines()
        
        data_start = 0
        for i, line in enumerate(lines):
            if 'internalField' in line and 'nonuniform' in line:
                data_start = i + 2
                break
        
        if data_start == 0:
            return {'type': 'uniform', 'values': np.array([])}
        
        n_values = int(lines[data_start - 1].strip('();\n '))
        values = []
        
        for i in range(data_start, data_start + n_values):
            line = lines[i].strip()
            if line and line != '(':
                try:
                    values.append(float(line.rstrip(';')))
                except ValueError:
                    pass
        
        return {
            'type': 'nonuniform',
            'values': np.array(values)
        }

    def _parse_vector_field(self, file_path: Path) -> Dict:
        with open(file_path, 'r') as f:
            lines = f.readlines()
        
        data_start = 0
        for i, line in enumerate(lines):
            if 'internalField' in line and 'nonuniform' in line:
                data_start = i + 2
                break
        
        if data_start == 0:
            return {'type': 'uniform', 'values': np.array([]).reshape(-1, 3)}
        
        n_values = int(lines[data_start - 1].strip('();\n '))
        values = []
        
        vec_pattern = re.compile(r'\(([\d.e+\-\s]+)\)')
        
        for i in range(data_start, data_start + n_values * 2):
            line = lines[i].strip()
            match = vec_pattern.search(line)
            if match:
                parts = match.group(1).split()
                values.append([float(p) for p in parts[:3]])
                if len(values) >= n_values:
                    break
        
        return {
            'type': 'nonuniform',
            'values': np.array(values)
        }

    def parse_geometry(self, case_dir: Path, time: str = "constant") -> Dict:
        polyMesh_dir = case_dir / "polyMesh" if time == "constant" else case_dir / time / "polyMesh"
        
        points_file = polyMesh_dir / "points"
        faces_file = polyMesh_dir / "faces"
        cells_file = polyMesh_dir / "cells"
        owner_file = polyMesh_dir / "owner"
        neighbour_file = polyMesh_dir / "neighbour"
        boundary_file = polyMesh_dir / "boundary"
        
        points = self._parse_points(points_file)
        faces = self._parse_faces(faces_file)
        owner = self._parse_owner_neighbour(owner_file)
        neighbour = self._parse_owner_neighbour(neighbour_file)
        boundary = self._parse_boundary(boundary_file)
        
        return {
            "points": points,
            "faces": faces,
            "owner": owner,
            "neighbour": neighbour,
            "boundary": boundary,
            "n_cells": len(np.unique(np.concatenate([owner, neighbour]))) if len(owner) > 0 else 0
        }

    def _parse_points(self, file_path: Path) -> np.ndarray:
        if not file_path.exists():
            return np.array([])
        
        with open(file_path, 'r') as f:
            lines = f.readlines()
        
        data_start = 0
        for i, line in enumerate(lines):
            if i > 0 and '(' in line and 'FoamFile' not in ''.join(lines[:i+1]):
                data_start = i + 1
                n_points = int(lines[i].strip('();\n '))
                break
        
        if data_start == 0:
            return np.array([])
        
        points = []
        vec_pattern = re.compile(r'\(([\d.e+\-\s]+)\)')
        
        for i in range(data_start, data_start + n_points):
            if i >= len(lines):
                break
            line = lines[i].strip()
            match = vec_pattern.search(line)
            if match:
                parts = match.group(1).split()
                points.append([float(p) for p in parts[:3]])
        
        return np.array(points)

    def _parse_faces(self, file_path: Path) -> List[List[int]]:
        if not file_path.exists():
            return []
        
        with open(file_path, 'r') as f:
            lines = f.readlines()
        
        data_start = 0
        n_faces = 0
        
        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped.isdigit() and i > 10:
                n_faces = int(stripped)
                data_start = i + 1
                break
        
        faces = []
        for i in range(data_start, data_start + n_faces * 3):
            if i >= len(lines):
                break
            line = lines[i].strip()
            if '(' in line and not line.startswith('//'):
                face_match = re.search(r'\d+\(([0-9\s]+)\)', line)
                if face_match:
                    indices = [int(x) for x in face_match.group(1).split()]
                    faces.append(indices)
                    if len(faces) >= n_faces:
                        break
        
        return faces

    def _parse_owner_neighbour(self, file_path: Path) -> np.ndarray:
        if not file_path.exists():
            return np.array([])
        
        with open(file_path, 'r') as f:
            lines = f.readlines()
        
        values = []
        record = False
        
        for line in lines:
            stripped = line.strip()
            if stripped == '(':
                record = True
                continue
            if stripped == ')':
                record = False
                continue
            if record and stripped and not stripped.startswith('//'):
                try:
                    val = int(stripped.rstrip(';'))
                    values.append(val)
                except ValueError:
                    pass
        
        return np.array(values)

    def _parse_boundary(self, file_path: Path) -> List[Dict]:
        if not file_path.exists():
            return []
        
        with open(file_path, 'r') as f:
            content = f.read()
        
        boundaries = []
        patch_pattern = re.compile(r'(\w+)\s*\{([^}]+)\}', re.DOTALL)
        
        for match in patch_pattern.finditer(content):
            name = match.group(1)
            patch_content = match.group(2)
            
            type_match = re.search(r'type\s+(\w+)', patch_content)
            nfaces_match = re.search(r'nFaces\s+(\d+)', patch_content)
            start_match = re.search(r'startFace\s+(\d+)', patch_content)
            
            boundaries.append({
                "name": name,
                "type": type_match.group(1) if type_match else "patch",
                "n_faces": int(nfaces_match.group(1)) if nfaces_match else 0,
                "start_face": int(start_match.group(1)) if start_match else 0
            })
        
        return boundaries

    def parse_field(self, case_dir: Path, time: str, field_name: str) -> Dict:
        field_file = case_dir / time / field_name
        
        if not field_file.exists():
            return {"error": f"Field {field_name} not found at time {time}"}
        
        header = self._read_header(field_file)
        
        if header.get("class") == "volVectorField":
            return self._parse_vector_field(field_file)
        elif header.get("class") == "volScalarField":
            return self._parse_scalar_field(field_file)
        
        return {"error": "Unknown field type"}

    def get_available_times(self, case_dir: Path) -> List[str]:
        times = []
        for item in case_dir.iterdir():
            if item.is_dir():
                try:
                    float(item.name)
                    times.append(item.name)
                except ValueError:
                    pass
        
        return sorted(times, key=lambda x: float(x))

    def get_available_fields(self, case_dir: Path, time: str) -> List[str]:
        time_dir = case_dir / time
        if not time_dir.exists():
            return []
        
        fields = []
        for item in time_dir.iterdir():
            if item.is_file() and item.name not in ['uniform']:
                fields.append(item.name)
        
        return fields

    def convert_to_vtk_data(self, geometry: Dict, fields: Dict[str, Dict] = None) -> Dict:
        points = geometry["points"]
        faces = geometry["faces"]
        
        polygons = []
        for face in faces:
            polygons.append(len(face))
            polygons.extend(face)
        
        cells = []
        cell_types = []
        owner = geometry["owner"]
        neighbour = geometry["neighbour"]
        
        for i, (o, n) in enumerate(zip(owner, neighbour)):
            if n >= 0:
                pass
        
        cell_data = {}
        point_data = {}
        
        if fields:
            for field_name, field_data in fields.items():
                if 'values' in field_data and len(field_data['values']) > 0:
                    cell_data[field_name] = field_data['values'].tolist()
        
        return {
            "points": points.tolist() if isinstance(points, np.ndarray) else points,
            "polygons": polygons,
            "faces": faces,
            "cell_data": cell_data,
            "point_data": point_data,
            "boundary": geometry["boundary"]
        }

    def calculate_statistics(self, field_data: np.ndarray) -> Dict:
        if len(field_data) == 0:
            return {}
        
        return {
            "min": float(np.min(field_data)),
            "max": float(np.max(field_data)),
            "mean": float(np.mean(field_data)),
            "std": float(np.std(field_data)),
            "median": float(np.median(field_data))
        }


data_parser = FoamDataParser()
