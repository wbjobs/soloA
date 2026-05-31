from fastapi import APIRouter, HTTPException, Response
from bson import ObjectId
from pathlib import Path
from typing import Optional, List
import json
import numpy as np
import gzip

from database import get_db
from config import settings
from services.data_parser import data_parser
from services.mesh_optimizer import mesh_optimizer

router = APIRouter(prefix="/api/data-opt", tags=["optimized-data"])

MAX_CELLS_PER_CHUNK = 200000
MAX_POINTS_PER_RESPONSE = 500000


class NumpyEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, np.integer):
            return int(obj)
        if isinstance(obj, np.floating):
            return float(obj)
        return super().default(obj)


def compress_response(data: dict, use_gzip: bool = True) -> Response:
    json_str = json.dumps(data, cls=NumpyEncoder)
    
    if use_gzip:
        compressed = gzip.compress(json_str.encode('utf-8'))
        return Response(
            content=compressed,
            media_type="application/octet-stream",
            headers={
                "Content-Encoding": "gzip",
                "X-Original-Size": str(len(json_str)),
                "X-Compressed-Size": str(len(compressed))
            }
        )
    
    return Response(
        content=json_str,
        media_type="application/json"
    )


@router.get("/{case_id}/geometry-metadata")
async def get_geometry_metadata(case_id: str, time: str = "constant"):
    db = get_db()
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    case_dir = Path(settings.CASES_DIR) / case_id
    
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail="Case directory not found")
    
    try:
        geometry = data_parser.parse_geometry(case_dir, time)
        
        n_points = len(geometry["points"])
        n_faces = len(geometry["faces"])
        n_cells = geometry["n_cells"]
        
        needs_optimization = n_faces > 500000
        recommended_lod = "low" if n_faces > 2000000 else "medium" if n_faces > 500000 else "high"
        
        chunks_needed = max(1, (n_faces + MAX_CELLS_PER_CHUNK - 1) // MAX_CELLS_PER_CHUNK)
        
        return {
            "case_id": case_id,
            "time": time,
            "n_points": n_points,
            "n_faces": n_faces,
            "n_cells": n_cells,
            "boundary": geometry["boundary"],
            "needs_optimization": needs_optimization,
            "recommended_lod": recommended_lod,
            "chunks_needed": chunks_needed,
            "estimated_memory_mb": {
                "points": n_points * 3 * 4 / (1024 * 1024),
                "faces": n_faces * 5 * 4 / (1024 * 1024),
                "total": (n_points * 3 + n_faces * 5) * 4 / (1024 * 1024)
            },
            "lod_levels": {
                "high": {"factor": 1.0, "description": "Full resolution"},
                "medium": {"factor": 0.5, "description": "50% reduction"},
                "low": {"factor": 0.25, "description": "75% reduction"},
                "preview": {"factor": 0.1, "description": "90% reduction"}
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get("/{case_id}/geometry-preview")
async def get_geometry_preview(case_id: str, time: str = "constant"):
    db = get_db()
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    case_dir = Path(settings.CASES_DIR) / case_id
    
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail="Case directory not found")
    
    try:
        geometry = data_parser.parse_geometry(case_dir, time)
        points = geometry["points"]
        faces = geometry["faces"]
        
        preview_points, preview_faces, stats = mesh_optimizer.decimate_mesh(
            points, faces, factor=0.1
        )
        
        response_data = {
            "time": time,
            "lod_level": "preview",
            "geometry": {
                "n_points": len(preview_points),
                "n_faces": len(preview_faces),
                "points": preview_points,
                "faces": preview_faces,
                "boundary": geometry["boundary"]
            },
            "stats": stats
        }
        
        return compress_response(response_data, use_gzip=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get("/{case_id}/geometry-lod")
async def get_geometry_lod(
    case_id: str,
    time: str = "constant",
    lod: str = "medium",
    boundary_only: bool = False
):
    db = get_db()
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    case_dir = Path(settings.CASES_DIR) / case_id
    
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail="Case directory not found")
    
    lod_factors = {
        "high": 1.0,
        "medium": 0.5,
        "low": 0.25,
        "preview": 0.1
    }
    
    factor = lod_factors.get(lod, 0.5)
    
    try:
        geometry = data_parser.parse_geometry(case_dir, time)
        points = geometry["points"]
        faces = geometry["faces"]
        boundaries = geometry["boundary"]
        
        if boundary_only:
            boundary_meshes = mesh_optimizer.extract_boundary_mesh(points, faces, boundaries)
            
            optimized_boundaries = {}
            for name, data in boundary_meshes.items():
                opt_points, opt_faces, stats = mesh_optimizer.decimate_mesh(
                    data["points"], data["faces"], factor
                )
                optimized_boundaries[name] = {
                    **data,
                    "points": opt_points,
                    "faces": opt_faces,
                    "optimization_stats": stats
                }
            
            response_data = {
                "time": time,
                "lod_level": lod,
                "factor": factor,
                "boundary_only": True,
                "boundary_meshes": optimized_boundaries
            }
        else:
            optimized_points, optimized_faces, stats = mesh_optimizer.decimate_mesh(
                points, faces, factor
            )
            
            response_data = {
                "time": time,
                "lod_level": lod,
                "factor": factor,
                "geometry": {
                    "n_points": len(optimized_points),
                    "n_faces": len(optimized_faces),
                    "points": optimized_points,
                    "faces": optimized_faces,
                    "boundary": boundaries
                },
                "stats": stats
            }
        
        return compress_response(response_data, use_gzip=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get("/{case_id}/geometry-chunked")
async def get_geometry_chunked(
    case_id: str,
    time: str = "constant",
    chunk_id: int = 0,
    total_chunks: int = 4,
    lod: str = "high"
):
    db = get_db()
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    case_dir = Path(settings.CASES_DIR) / case_id
    
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail="Case directory not found")
    
    if chunk_id >= total_chunks:
        raise HTTPException(status_code=400, detail="Invalid chunk_id")
    
    lod_factors = {
        "high": 1.0,
        "medium": 0.5,
        "low": 0.25,
        "preview": 0.1
    }
    
    factor = lod_factors.get(lod, 1.0)
    
    try:
        geometry = data_parser.parse_geometry(case_dir, time)
        points = geometry["points"]
        faces = geometry["faces"]
        
        if factor < 1.0:
            points, faces, _ = mesh_optimizer.decimate_mesh(points, faces, factor)
        
        chunk = mesh_optimizer.generate_chunk(points, faces, chunk_id, total_chunks)
        
        response_data = {
            "time": time,
            "chunk": chunk,
            "total_chunks": total_chunks,
            "lod_level": lod,
            "is_last": chunk_id == total_chunks - 1
        }
        
        return compress_response(response_data, use_gzip=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get("/{case_id}/field-chunked")
async def get_field_chunked(
    case_id: str,
    field_name: str,
    time: Optional[str] = None,
    chunk_id: int = 0,
    total_chunks: int = 4
):
    db = get_db()
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    case_dir = Path(settings.CASES_DIR) / case_id
    
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail="Case directory not found")
    
    try:
        if not time:
            times = data_parser.get_available_times(case_dir)
            time = times[-1] if times else None
        
        if not time:
            raise HTTPException(status_code=404, detail="No time directories found")
        
        field_data = data_parser.parse_field(case_dir, time, field_name)
        
        if 'error' in field_data:
            raise HTTPException(status_code=404, detail=field_data['error'])
        
        values = field_data.get('values', [])
        if hasattr(values, 'tolist'):
            values = values.tolist()
        
        total_values = len(values)
        chunk_size = total_values // total_chunks
        start = chunk_id * chunk_size
        end = start + chunk_size if chunk_id < total_chunks - 1 else total_values
        
        chunk_values = values[start:end]
        
        stats = {}
        if chunk_id == 0:
            if hasattr(field_data.get('values', []), 'shape'):
                vals = field_data['values']
                if len(vals.shape) > 1:
                    for i, dim in enumerate(['x', 'y', 'z']):
                        if i < vals.shape[1]:
                            stats[f"{field_name}_{dim}"] = {
                                "min": float(vals[:, i].min()),
                                "max": float(vals[:, i].max()),
                                "mean": float(vals[:, i].mean())
                            }
                else:
                    stats[field_name] = {
                        "min": float(vals.min()),
                        "max": float(vals.max()),
                        "mean": float(vals.mean())
                    }
        
        response_data = {
            "field": field_name,
            "time": time,
            "chunk_id": chunk_id,
            "total_chunks": total_chunks,
            "start_index": start,
            "end_index": end,
            "n_values": len(chunk_values),
            "total_values": total_values,
            "data": chunk_values,
            "statistics": stats if chunk_id == 0 else None,
            "is_last": chunk_id == total_chunks - 1
        }
        
        return compress_response(response_data, use_gzip=True)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@router.get("/{case_id}/boundary-mesh")
async def get_boundary_mesh(
    case_id: str,
    time: str = "constant",
    boundary_name: Optional[str] = None
):
    db = get_db()
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    case_dir = Path(settings.CASES_DIR) / case_id
    
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail="Case directory not found")
    
    try:
        geometry = data_parser.parse_geometry(case_dir, time)
        points = geometry["points"]
        faces = geometry["faces"]
        boundaries = geometry["boundary"]
        
        boundary_meshes = mesh_optimizer.extract_boundary_mesh(points, faces, boundaries)
        
        if boundary_name:
            if boundary_name in boundary_meshes:
                response_data = {
                    "boundary_name": boundary_name,
                    "mesh": boundary_meshes[boundary_name]
                }
            else:
                raise HTTPException(status_code=404, detail=f"Boundary {boundary_name} not found")
        else:
            response_data = {
                "boundaries": list(boundary_meshes.keys()),
                "meshes": boundary_meshes
            }
        
        return compress_response(response_data, use_gzip=True)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")
