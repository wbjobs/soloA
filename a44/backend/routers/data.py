from fastapi import APIRouter, HTTPException
from bson import ObjectId
from pathlib import Path
from typing import Optional

from database import get_db
from config import settings
from services.data_parser import data_parser

router = APIRouter(prefix="/api/data", tags=["data"])


@router.get("/{case_id}/geometry")
async def get_geometry(case_id: str, time: str = "constant"):
    db = get_db()
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    case_dir = Path(settings.CASES_DIR) / case_id
    
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail="Case directory not found")
    
    try:
        geometry = data_parser.parse_geometry(case_dir, time)
        return {
            "time": time,
            "geometry": {
                "n_points": len(geometry["points"]),
                "n_faces": len(geometry["faces"]),
                "n_cells": geometry["n_cells"],
                "boundary": geometry["boundary"],
                "points": geometry["points"].tolist() if hasattr(geometry["points"], 'tolist') else geometry["points"],
                "faces": geometry["faces"]
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing geometry: {str(e)}")


@router.get("/{case_id}/vtk")
async def get_vtk_data(case_id: str, time: Optional[str] = None):
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
            time = times[-1] if times else "constant"
        
        geometry = data_parser.parse_geometry(case_dir, time)
        
        fields = {}
        times = data_parser.get_available_times(case_dir)
        
        if times:
            latest_time = times[-1]
            available_fields = data_parser.get_available_fields(case_dir, latest_time)
            
            for field_name in available_fields[:5]:
                field_data = data_parser.parse_field(case_dir, latest_time, field_name)
                if 'values' in field_data and len(field_data['values']) > 0:
                    fields[field_name] = field_data
        
        vtk_data = data_parser.convert_to_vtk_data(geometry, fields)
        
        return {
            "time": time,
            "vtk_data": vtk_data
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating VTK data: {str(e)}")


@router.get("/{case_id}/fields")
async def get_available_fields(case_id: str):
    db = get_db()
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    case_dir = Path(settings.CASES_DIR) / case_id
    
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail="Case directory not found")
    
    times = data_parser.get_available_times(case_dir)
    
    fields_info = []
    for time in times:
        fields = data_parser.get_available_fields(case_dir, time)
        fields_info.append({
            "time": time,
            "fields": fields
        })
    
    return {
        "times": times,
        "fields_by_time": fields_info
    }


@router.get("/{case_id}/field/{field_name}")
async def get_field_data(case_id: str, field_name: str, time: Optional[str] = None):
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
        
        stats = {}
        if 'values' in field_data and len(field_data['values']) > 0:
            values = field_data['values']
            if hasattr(values, 'shape') and len(values.shape) > 1:
                for i, dim in enumerate(['x', 'y', 'z']):
                    if i < values.shape[1]:
                        stats[f"{field_name}_{dim}"] = data_parser.calculate_statistics(values[:, i])
            else:
                stats[field_name] = data_parser.calculate_statistics(values)
        
        return {
            "field": field_name,
            "time": time,
            "type": field_data.get("type"),
            "n_values": len(field_data.get("values", [])),
            "statistics": stats,
            "data": field_data.get("values", []).tolist() if hasattr(field_data.get("values", []), 'tolist') else field_data.get("values", [])
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing field: {str(e)}")


@router.get("/{case_id}/times")
async def get_times(case_id: str):
    db = get_db()
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    case_dir = Path(settings.CASES_DIR) / case_id
    
    if not case_dir.exists():
        return {"times": []}
    
    times = data_parser.get_available_times(case_dir)
    return {"times": times}


@router.get("/{case_id}/slices")
async def get_slice_data(
    case_id: str,
    time: Optional[str] = None,
    axis: str = "z",
    position: float = 0.5
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
            time = times[-1] if times else "constant"
        
        geometry = data_parser.parse_geometry(case_dir, time)
        
        points = geometry["points"]
        faces = geometry["faces"]
        
        axis_idx = {"x": 0, "y": 1, "z": 2}[axis]
        
        if len(points) == 0:
            raise HTTPException(status_code=404, detail="No geometry data available")
        
        min_val = float(points[:, axis_idx].min())
        max_val = float(points[:, axis_idx].max())
        slice_pos = min_val + position * (max_val - min_val)
        
        fields = {}
        times = data_parser.get_available_times(case_dir)
        if times:
            latest_time = times[-1]
            available_fields = data_parser.get_available_fields(case_dir, latest_time)
            for field_name in available_fields[:3]:
                field_data = data_parser.parse_field(case_dir, latest_time, field_name)
                if 'values' in field_data:
                    fields[field_name] = field_data
        
        return {
            "slice": {
                "axis": axis,
                "position": slice_pos,
                "min": min_val,
                "max": max_val,
                "time": time
            },
            "geometry": {
                "points": points.tolist() if hasattr(points, 'tolist') else points,
                "faces": faces
            },
            "fields": {k: v.get('values', []).tolist() if hasattr(v.get('values', []), 'tolist') else v.get('values', []) 
                      for k, v in fields.items()}
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating slice: {str(e)}")
