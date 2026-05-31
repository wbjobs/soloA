from fastapi import APIRouter, HTTPException, UploadFile, File
from bson import ObjectId
from pathlib import Path
from typing import List, Optional
import numpy as np
import json
from datetime import datetime

from database import get_db
from config import settings
from services.data_parser import data_parser
from services.error_estimator import error_estimator
from services.amr_service import amr_service

router = APIRouter(prefix="/api/amr", tags=["amr"])


@router.post("/{case_id}/regions")
async def add_amr_region(case_id: str, region_data: dict):
    db = get_db()
    
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    existing_regions = case.get("amr_regions", [])
    
    region_id = len(existing_regions)
    region_data["id"] = region_id
    region_data["case_id"] = case_id
    region_data["created_at"] = datetime.utcnow().isoformat()
    region_data["is_active"] = True
    
    region = amr_service.create_region(region_data, case_id)
    existing_regions.append(region)
    
    await db["cases"].update_one(
        {"_id": ObjectId(case_id)},
        {"$set": {"amr_regions": existing_regions}}
    )
    
    return {
        "region": region,
        "total_regions": len(existing_regions)
    }


@router.get("/{case_id}/regions")
async def get_amr_regions(case_id: str):
    db = get_db()
    
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    regions = case.get("amr_regions", [])
    
    return {
        "regions": regions,
        "count": len(regions)
    }


@router.put("/{case_id}/regions/{region_id}")
async def update_amr_region(case_id: str, region_id: int, region_data: dict):
    db = get_db()
    
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    regions = case.get("amr_regions", [])
    idx = next((i for i, r in enumerate(regions) if r.get("id") == region_id), -1)
    
    if idx == -1:
        raise HTTPException(status_code=404, detail="Region not found")
    
    regions[idx].update(region_data)
    regions[idx]["updated_at"] = datetime.utcnow().isoformat()
    
    await db["cases"].update_one(
        {"_id": ObjectId(case_id)},
        {"$set": {"amr_regions": regions}}
    )
    
    return regions[idx]


@router.delete("/{case_id}/regions/{region_id}")
async def delete_amr_region(case_id: str, region_id: int):
    db = get_db()
    
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    regions = case.get("amr_regions", [])
    regions = [r for r in regions if r.get("id") != region_id]
    
    await db["cases"].update_one(
        {"_id": ObjectId(case_id)},
        {"$set": {"amr_regions": regions}}
    )
    
    return {"deleted": True, "remaining_regions": len(regions)}


@router.post("/{case_id}/regions/clear")
async def clear_amr_regions(case_id: str):
    db = get_db()
    
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    await db["cases"].update_one(
        {"_id": ObjectId(case_id)},
        {"$set": {"amr_regions": []}}
    )
    
    return {"cleared": True}


@router.post("/{case_id}/analyze")
async def analyze_error_and_suggest_regions(case_id: str, options: dict = None):
    db = get_db()
    
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    case_dir = Path(settings.CASES_DIR) / case_id
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail="Case directory not found")
    
    options = options or {}
    n_regions = options.get("n_regions", 5)
    
    geometry = data_parser.parse_geometry(case_dir, "constant")
    points = np.array(geometry["points"])
    
    fields = {}
    times = data_parser.get_available_times(case_dir)
    
    if times:
        latest_time = times[-1]
        available_fields = data_parser.get_available_fields(case_dir, latest_time)
        
        for field_name in available_fields[:5]:
            try:
                field_data = data_parser.parse_field(case_dir, latest_time, field_name)
                if 'values' in field_data:
                    fields[field_name] = np.array(field_data['values'])
            except Exception as e:
                continue
    
    quality_analysis = error_estimator.analyze_solution_quality(fields, points)
    
    suggested_regions = error_estimator.suggest_refinement_regions(
        fields, points, n_regions
    )
    
    for i, region in enumerate(suggested_regions):
        region["id"] = i + 1000
        region["type"] = "auto"
        region["is_active"] = True
        region["name"] = f"Suggested_Region_{i+1}"
    
    return {
        "quality_analysis": quality_analysis,
        "suggested_regions": suggested_regions,
        "n_points_analyzed": len(points),
        "fields_analyzed": list(fields.keys())
    }


@router.post("/{case_id}/apply-suggested")
async def apply_suggested_regions(case_id: str):
    db = get_db()
    
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    analysis = await analyze_error_and_suggest_regions(case_id)
    suggested = analysis.get("suggested_regions", [])
    
    existing_regions = case.get("amr_regions", [])
    max_id = max([r.get("id", 0) for r in existing_regions] + [0])
    
    for region in suggested:
        region["id"] = max_id + 1
        region["is_active"] = True
        region["created_at"] = datetime.utcnow().isoformat()
        existing_regions.append(region)
        max_id += 1
    
    await db["cases"].update_one(
        {"_id": ObjectId(case_id)},
        {"$set": {"amr_regions": existing_regions}}
    )
    
    return {
        "applied": len(suggested),
        "total_regions": len(existing_regions)
    }


@router.get("/{case_id}/estimate")
async def estimate_cell_count(case_id: str):
    db = get_db()
    
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    mesh_quality = case.get("mesh_quality", {})
    base_cells = mesh_quality.get("n_cells", 0)
    
    regions = case.get("amr_regions", [])
    active_regions = [r for r in regions if r.get("is_active", True)]
    
    estimate = amr_service.estimate_cells_after_refinement(
        base_cells, active_regions
    )
    
    return estimate


@router.post("/{case_id}/generate-dict")
async def generate_amr_dict(case_id: str, options: dict = None):
    db = get_db()
    
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    regions = case.get("amr_regions", [])
    active_regions = [r for r in regions if r.get("is_active", True)]
    
    options = options or {}
    base_refinement = options.get("base_refinement", 2)
    
    snappy_dict = amr_service.generate_snappy_hex_mesh_dict(
        active_regions, base_refinement
    )
    
    mesh_config = case.get("mesh_config", {})
    base_size = mesh_config.get("base_mesh_size", [10, 10, 10])
    
    blockmesh_dict = amr_service.create_blockmesh_dict(
        active_regions, base_size
    )
    
    return {
        "snappyHexMesh_refinement": snappy_dict,
        "blockMesh_zones": blockmesh_dict,
        "active_regions": len(active_regions)
    }


@router.post("/{case_id}/validate")
async def validate_regions(case_id: str):
    db = get_db()
    
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    case_dir = Path(settings.CASES_DIR) / case_id
    regions = case.get("amr_regions", [])
    
    geometry_bounds = None
    if case_dir.exists():
        try:
            geometry = data_parser.parse_geometry(case_dir, "constant")
            points = geometry["points"]
            if len(points) > 0:
                points = np.array(points)
                geometry_bounds = [
                    float(points[:, 0].min()), float(points[:, 0].max()),
                    float(points[:, 1].min()), float(points[:, 1].max()),
                    float(points[:, 2].min()), float(points[:, 2].max())
                ]
        except:
            pass
    
    validation = amr_service.validate_regions(regions, geometry_bounds)
    
    return validation
