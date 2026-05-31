import asyncio
import uuid
from typing import Dict, Callable, Optional
from pathlib import Path
from bson import ObjectId

from services.openfoam_service import openfoam_service
from services.websocket_manager import ws_manager
from database import get_db
from config import settings


class TaskScheduler:
    def __init__(self):
        self.tasks: Dict[str, asyncio.Task] = {}

    async def run_mesh_generation(
        self,
        case_id: str,
        stl_filename: Optional[str],
        mesh_config: dict
    ) -> str:
        task_id = str(uuid.uuid4())
        stl_path = Path(settings.UPLOAD_DIR) / stl_filename if stl_filename else None

        async def progress_callback(progress: float, message: str):
            status = "running" if progress < 1.0 else "completed" if progress == 1.0 else "failed"
            await ws_manager.broadcast_progress(task_id, case_id, progress, status, message)

        async def task_wrapper():
            db = get_db()
            try:
                await ws_manager.broadcast_progress(task_id, case_id, 0.0, "running", "Starting mesh generation...")
                
                await db["cases"].update_one(
                    {"_id": ObjectId(case_id)},
                    {"$set": {"status": "meshing"}}
                )

                result = await openfoam_service.generate_mesh(
                    case_id=case_id,
                    stl_path=stl_path,
                    mesh_config=mesh_config,
                    progress_callback=progress_callback
                )

                await db["cases"].update_one(
                    {"_id": ObjectId(case_id)},
                    {"$set": {
                        "status": "mesh_ready",
                        "mesh_quality": result["mesh_quality"]
                    }}
                )

                await ws_manager.broadcast_progress(task_id, case_id, 1.0, "completed", "Mesh generation completed successfully")
                
            except Exception as e:
                await db["cases"].update_one(
                    {"_id": ObjectId(case_id)},
                    {"$set": {"status": "failed"}}
                )
                await ws_manager.broadcast_progress(task_id, case_id, 1.0, "failed", str(e))
                raise

        self.tasks[task_id] = asyncio.create_task(task_wrapper())
        return task_id

    async def run_solver(
        self,
        case_id: str,
        solver_config: dict,
        boundary_conditions: list,
        patch_names: list
    ) -> str:
        task_id = str(uuid.uuid4())

        async def progress_callback(progress: float, message: str):
            status = "running" if progress < 1.0 else "completed" if progress == 1.0 else "failed"
            await ws_manager.broadcast_progress(task_id, case_id, progress, status, message)

        async def log_callback(log_entry: dict):
            await ws_manager.broadcast_log(case_id, log_entry)

        async def task_wrapper():
            db = get_db()
            try:
                await ws_manager.broadcast_progress(task_id, case_id, 0.0, "running", "Starting solver...")
                
                await db["cases"].update_one(
                    {"_id": ObjectId(case_id)},
                    {"$set": {"status": "solving"}}
                )

                result = await openfoam_service.run_solver(
                    case_id=case_id,
                    solver_config=solver_config,
                    boundary_conditions=boundary_conditions,
                    patch_names=patch_names,
                    progress_callback=progress_callback,
                    log_callback=log_callback
                )

                await db["cases"].update_one(
                    {"_id": ObjectId(case_id)},
                    {"$set": {"status": "completed"}}
                )

                await ws_manager.broadcast_progress(task_id, case_id, 1.0, "completed", "Solver completed successfully")
                
            except Exception as e:
                await db["cases"].update_one(
                    {"_id": ObjectId(case_id)},
                    {"$set": {"status": "failed"}}
                )
                await ws_manager.broadcast_progress(task_id, case_id, 1.0, "failed", str(e))
                raise

        self.tasks[task_id] = asyncio.create_task(task_wrapper())
        return task_id

    def get_task_status(self, task_id: str) -> Optional[dict]:
        return ws_manager.get_progress(task_id)


task_scheduler = TaskScheduler()
