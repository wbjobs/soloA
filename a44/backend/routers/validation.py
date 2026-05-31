from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from bson import ObjectId
from pathlib import Path
from typing import List, Optional
import numpy as np
import json
import tempfile
from datetime import datetime

from database import get_db
from config import settings
from services.data_parser import data_parser
from services.validation_service import validation_service

router = APIRouter(prefix="/api/validation", tags=["validation"])


@router.post("/{case_id}/compare")
async def compare_with_reference(
    case_id: str,
    reference_data: dict,
    options: dict = None
):
    db = get_db()
    
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    case_dir = Path(settings.CASES_DIR) / case_id
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail="Case directory not found")
    
    times = data_parser.get_available_times(case_dir)
    if not times:
        raise HTTPException(status_code=404, detail="No solution data available")
    
    latest_time = times[-1]
    available_fields = data_parser.get_available_fields(case_dir, latest_time)
    
    computed_fields = {}
    for field_name in reference_data.keys():
        if field_name in available_fields:
            try:
                field_data = data_parser.parse_field(case_dir, latest_time, field_name)
                if 'values' in field_data:
                    computed_fields[field_name] = np.array(field_data['values'])
            except Exception as e:
                continue
    
    reference_fields = validation_service.load_reference_solution(reference_data)
    
    options = options or {}
    tolerances = options.get("tolerances", {
        'U': 0.05,
        'p': 0.05,
        'k': 0.1,
        'epsilon': 0.1
    })
    
    validation_results = validation_service.validate_case(
        computed_fields, reference_fields, tolerances
    )
    
    summary = validation_service.create_validation_summary(validation_results)
    
    result_id = str(ObjectId())
    await db["validation_results"].insert_one({
        "_id": ObjectId(result_id),
        "case_id": ObjectId(case_id),
        "results": validation_results,
        "summary": summary,
        "created_at": datetime.utcnow()
    })
    
    return {
        "result_id": result_id,
        "summary": summary,
        "full_results": validation_results
    }


@router.post("/{case_id}/compare-file")
async def compare_with_reference_file(
    case_id: str,
    file: UploadFile = File(...),
    options: dict = None
):
    content = await file.read()
    
    try:
        reference_data = json.loads(content.decode('utf-8'))
    except:
        raise HTTPException(status_code=400, detail="Invalid JSON file")
    
    return await compare_with_reference(case_id, reference_data, options)


@router.get("/{result_id}")
async def get_validation_result(result_id: str):
    db = get_db()
    
    result = await db["validation_results"].find_one({"_id": ObjectId(result_id)})
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")
    
    result["_id"] = str(result["_id"])
    if result.get("case_id"):
        result["case_id"] = str(result["case_id"])
    
    return result


@router.get("/case/{case_id}/history")
async def get_case_validation_history(case_id: str):
    db = get_db()
    
    cursor = db["validation_results"].find(
        {"case_id": ObjectId(case_id)}
    ).sort("created_at", -1)
    
    results = await cursor.to_list(length=50)
    
    for r in results:
        r["_id"] = str(r["_id"])
        r["case_id"] = str(r["case_id"])
    
    return {"results": results}


@router.post("/{result_id}/report")
async def generate_validation_report(result_id: str):
    db = get_db()
    
    result = await db["validation_results"].find_one({"_id": ObjectId(result_id)})
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")
    
    case = await db["cases"].find_one({"_id": result["case_id"]})
    case_name = case.get("name", "Unknown") if case else "Unknown"
    
    metadata = {}
    if case:
        mesh_quality = case.get("mesh_quality", {})
        solver_config = case.get("solver_config", {})
        metadata = {
            "Case Name": case_name,
            "Solver": solver_config.get("solver", "Unknown"),
            "Turbulence Model": solver_config.get("turbulence_model", "Unknown"),
            "Cells": mesh_quality.get("n_cells", "Unknown"),
            "Faces": mesh_quality.get("n_faces", "Unknown")
        }
    
    report_path = validation_service.generate_validation_report(
        case_id=str(result["case_id"]),
        case_name=case_name,
        validation_results=result.get("results", {}),
        metadata=metadata
    )
    
    if not report_path:
        raise HTTPException(
            status_code=503,
            detail="Report generation requires reportlab. Install with: pip install reportlab"
        )
    
    return FileResponse(
        report_path,
        media_type="application/pdf",
        filename=f"validation_report_{result_id}.pdf"
    )


@router.post("/{case_id}/quick-report")
async def generate_quick_report(case_id: str):
    db = get_db()
    
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    case_dir = Path(settings.CASES_DIR) / case_id
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail="Case directory not found")
    
    geometry = data_parser.parse_geometry(case_dir, "constant")
    points = np.array(geometry["points"])
    
    fields = {}
    field_stats = {}
    times = data_parser.get_available_times(case_dir)
    
    if times:
        latest_time = times[-1]
        available_fields = data_parser.get_available_fields(case_dir, latest_time)
        
        for field_name in available_fields[:5]:
            try:
                field_data = data_parser.parse_field(case_dir, latest_time, field_name)
                if 'values' in field_data:
                    vals = np.array(field_data['values'])
                    fields[field_name] = vals
                    
                    if vals.ndim == 1:
                        field_stats[field_name] = {
                            "min": float(vals.min()),
                            "max": float(vals.max()),
                            "mean": float(vals.mean()),
                            "std": float(vals.std())
                        }
                    else:
                        field_stats[field_name] = {
                            "magnitude_min": float(np.linalg.norm(vals, axis=1).min()),
                            "magnitude_max": float(np.linalg.norm(vals, axis=1).max()),
                            "magnitude_mean": float(np.linalg.norm(vals, axis=1).mean())
                        }
            except:
                continue
    
    mesh_quality = case.get("mesh_quality", {})
    
    report = {
        "case_name": case.get("name", "Unknown"),
        "case_id": case_id,
        "generated_at": datetime.utcnow().isoformat(),
        "mesh_info": {
            "n_points": len(points),
            "n_cells": mesh_quality.get("n_cells", 0),
            "n_faces": mesh_quality.get("n_faces", 0),
            "max_non_ortho": mesh_quality.get("non_ortho_max", 0),
            "max_skewness": mesh_quality.get("skewness_max", 0)
        },
        "solution_info": {
            "time_steps": len(times),
            "final_time": float(times[-1]) if times else 0,
            "fields_available": available_fields if times else []
        },
        "field_statistics": field_stats,
        "amr_regions": {
            "count": len(case.get("amr_regions", [])),
            "regions": case.get("amr_regions", [])
        },
        "boundary_conditions": {
            "count": len(case.get("boundary_conditions", [])),
            "conditions": case.get("boundary_conditions", [])
        }
    }
    
    return report


@router.post("/field-analysis/{case_id}/{field_name}")
async def analyze_field(
    case_id: str,
    field_name: str,
    options: dict = None
):
    db = get_db()
    
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    case_dir = Path(settings.CASES_DIR) / case_id
    if not case_dir.exists():
        raise HTTPException(status_code=404, detail="Case directory not found")
    
    times = data_parser.get_available_times(case_dir)
    if not times:
        raise HTTPException(status_code=404, detail="No solution data")
    
    latest_time = times[-1]
    
    geometry = data_parser.parse_geometry(case_dir, "constant")
    points = np.array(geometry["points"])
    
    field_data = data_parser.parse_field(case_dir, latest_time, field_name)
    if 'error' in field_data:
        raise HTTPException(status_code=404, detail=field_data['error'])
    
    values = np.array(field_data['values'])
    
    options = options or {}
    method = options.get("method", "gradient")
    
    from services.error_estimator import error_estimator
    
    error_analysis = error_estimator.estimate_error(values, points, method)
    
    return {
        "field_name": field_name,
        "time": latest_time,
        "error_analysis": error_analysis,
        "statistics": field_data.get("statistics", {})
    }


@router.delete("/{result_id}")
async def delete_validation_result(result_id: str):
    db = get_db()
    
    result = await db["validation_results"].delete_one({"_id": ObjectId(result_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Result not found")
    
    return {"deleted": True}
