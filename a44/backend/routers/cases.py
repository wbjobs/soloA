from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, BackgroundTasks
from fastapi.responses import FileResponse
from typing import List, Optional
from bson import ObjectId
from pathlib import Path
import shutil
from datetime import datetime

from database import get_db
from config import settings
from models import CaseCreate, CaseResponse
from services.task_scheduler import task_scheduler
from services.websocket_manager import ws_manager

router = APIRouter(prefix="/api/cases", tags=["cases"])


@router.post("", response_model=CaseResponse)
async def create_case(case_data: CaseCreate):
    db = get_db()
    case_dict = case_data.dict()
    case_dict["status"] = "draft"
    case_dict["created_at"] = datetime.utcnow()
    case_dict["updated_at"] = datetime.utcnow()
    
    result = await db["cases"].insert_one(case_dict)
    case_dict["_id"] = result.inserted_id
    
    return CaseResponse(
        id=str(case_dict["_id"]),
        **{k: v for k, v in case_dict.items() if k != "_id"}
    )


@router.get("", response_model=List[CaseResponse])
async def list_cases():
    db = get_db()
    cursor = db["cases"].find().sort("created_at", -1)
    cases = await cursor.to_list(length=100)
    
    return [
        CaseResponse(
            id=str(case["_id"]),
            name=case.get("name", ""),
            description=case.get("description"),
            version=case.get("version", 1),
            status=case.get("status", "draft"),
            mesh_quality=case.get("mesh_quality"),
            created_at=case.get("created_at", datetime.utcnow()),
            updated_at=case.get("updated_at", datetime.utcnow())
        )
        for case in cases
    ]


@router.get("/{case_id}", response_model=CaseResponse)
async def get_case(case_id: str):
    db = get_db()
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    return CaseResponse(
        id=str(case["_id"]),
        name=case.get("name", ""),
        description=case.get("description"),
        version=case.get("version", 1),
        status=case.get("status", "draft"),
        mesh_quality=case.get("mesh_quality"),
        created_at=case.get("created_at", datetime.utcnow()),
        updated_at=case.get("updated_at", datetime.utcnow())
    )


@router.get("/{case_id}/full")
async def get_case_full(case_id: str):
    db = get_db()
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    case["_id"] = str(case["_id"])
    if case.get("parent_id"):
        case["parent_id"] = str(case["parent_id"])
    
    return case


@router.put("/{case_id}")
async def update_case(case_id: str, case_data: dict):
    db = get_db()
    case_data["updated_at"] = datetime.utcnow()
    
    result = await db["cases"].update_one(
        {"_id": ObjectId(case_id)},
        {"$set": case_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Case not found")
    
    return {"message": "Case updated successfully"}


@router.post("/{case_id}/upload")
async def upload_stl(case_id: str, file: UploadFile = File(...)):
    if not file.filename.lower().endswith('.stl'):
        raise HTTPException(status_code=400, detail="Only STL files are allowed")
    
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = upload_dir / f"{case_id}_{file.filename}"
    
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    
    db = get_db()
    await db["cases"].update_one(
        {"_id": ObjectId(case_id)},
        {"$set": {
            "stl_file": str(file_path),
            "updated_at": datetime.utcnow()
        }}
    )
    
    return {
        "filename": file.filename,
        "size": file_path.stat().st_size,
        "path": str(file_path)
    }


@router.post("/{case_id}/generate-mesh")
async def generate_mesh(case_id: str):
    db = get_db()
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    mesh_config = case.get("mesh_config", {})
    stl_file = case.get("stl_file")
    
    stl_filename = Path(stl_file).name if stl_file else None
    
    task_id = await task_scheduler.run_mesh_generation(
        case_id=case_id,
        stl_filename=stl_filename,
        mesh_config=mesh_config
    )
    
    return {"task_id": task_id, "status": "started"}


@router.post("/{case_id}/run-solver")
async def run_solver(case_id: str):
    db = get_db()
    case = await db["cases"].find_one({"_id": ObjectId(case_id)})
    
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    
    solver_config = case.get("solver_config", {})
    boundary_conditions = case.get("boundary_conditions", [])
    
    patch_names = ["inlet", "outlet", "walls"]
    
    task_id = await task_scheduler.run_solver(
        case_id=case_id,
        solver_config=solver_config,
        boundary_conditions=boundary_conditions,
        patch_names=patch_names
    )
    
    return {"task_id": task_id, "status": "started"}


@router.get("/tasks/{task_id}/progress")
async def get_task_progress(task_id: str):
    progress = ws_manager.get_progress(task_id)
    
    if not progress:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return progress


@router.post("/{case_id}/duplicate")
async def duplicate_case(case_id: str, new_name: str = "Copy"):
    db = get_db()
    original = await db["cases"].find_one({"_id": ObjectId(case_id)})
    
    if not original:
        raise HTTPException(status_code=404, detail="Case not found")
    
    new_case = {k: v for k, v in original.items() if k != "_id"}
    new_case["name"] = new_name
    new_case["parent_id"] = ObjectId(case_id)
    new_case["version"] = original.get("version", 1) + 1
    new_case["status"] = "draft"
    new_case["created_at"] = datetime.utcnow()
    new_case["updated_at"] = datetime.utcnow()
    
    result = await db["cases"].insert_one(new_case)
    
    return {
        "id": str(result.inserted_id),
        "message": "Case duplicated successfully"
    }


@router.get("/{case_id}/compare/{other_case_id}")
async def compare_cases(case_id: str, other_case_id: str):
    db = get_db()
    
    case1 = await db["cases"].find_one({"_id": ObjectId(case_id)})
    case2 = await db["cases"].find_one({"_id": ObjectId(other_case_id)})
    
    if not case1 or not case2:
        raise HTTPException(status_code=404, detail="One or both cases not found")
    
    comparison = {
        "case1": {
            "id": str(case1["_id"]),
            "name": case1.get("name"),
            "mesh_quality": case1.get("mesh_quality"),
            "mesh_config": case1.get("mesh_config"),
            "solver_config": case1.get("solver_config")
        },
        "case2": {
            "id": str(case2["_id"]),
            "name": case2.get("name"),
            "mesh_quality": case2.get("mesh_quality"),
            "mesh_config": case2.get("mesh_config"),
            "solver_config": case2.get("solver_config")
        },
        "differences": []
    }
    
    mq1 = case1.get("mesh_quality", {})
    mq2 = case2.get("mesh_quality", {})
    
    for key in ["n_cells", "n_faces", "non_ortho_max", "skewness_max"]:
        if key in mq1 and key in mq2 and mq1[key] != mq2[key]:
            comparison["differences"].append({
                "parameter": key,
                "case1_value": mq1[key],
                "case2_value": mq2[key],
                "delta": mq2[key] - mq1[key]
            })
    
    return comparison


@router.get("/{case_id}/versions")
async def get_case_versions(case_id: str):
    db = get_db()
    
    versions = []
    current_id = case_id
    
    while current_id:
        case = await db["cases"].find_one({"_id": ObjectId(current_id)})
        if case:
            versions.append({
                "id": str(case["_id"]),
                "name": case.get("name"),
                "version": case.get("version", 1),
                "status": case.get("status"),
                "created_at": case.get("created_at")
            })
            current_id = str(case["parent_id"]) if case.get("parent_id") else None
        else:
            break
    
    return list(reversed(versions))


@router.delete("/{case_id}")
async def delete_case(case_id: str):
    db = get_db()
    
    result = await db["cases"].delete_one({"_id": ObjectId(case_id)})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Case not found")
    
    return {"message": "Case deleted successfully"}
