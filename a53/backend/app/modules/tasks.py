import uuid
import json
import time
from celery import Celery, states
from celery.result import AsyncResult

from app.core.config import CELERY_BROKER_URL, CELERY_RESULT_BACKEND
from app.modules.light_baker import bake_lightmap
from app.modules.storage import save_lightmap, embed_lightmap_into_json, save_map_json

celery_app = Celery(
    "map_editor",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Shanghai",
    enable_utc=True,
    task_track_started=True,
)


class ProgressTracker:
    def __init__(self, task_self):
        self.task = task_self
        self.last_progress = 0.0
    
    def update(self, progress: float):
        if progress - self.last_progress >= 0.01:
            self.task.update_state(
                state="PROGRESS",
                meta={"progress": progress}
            )
            self.last_progress = progress


class BatchProgressTracker:
    def __init__(self, task_self, total_maps: int):
        self.task = task_self
        self.total = total_maps
        self.completed = 0
        self.results = []
        self.errors = []
        self.current_index = 0
        self.current_name = ""
        self.current_progress = 0.0
    
    def update_current_progress(self, progress: float):
        self.current_progress = progress
        self._report()
    
    def start_map(self, index: int, name: str):
        self.current_index = index
        self.current_name = name
        self.current_progress = 0.0
        self._report()
    
    def complete_map(self, result: dict):
        self.results.append(result)
        self.completed += 1
        self._report()
    
    def fail_map(self, index: int, name: str, error: str):
        self.errors.append({"index": index, "name": name, "error": error})
        self.completed += 1
        self._report()
    
    def _report(self):
        overall_progress = self.completed / self.total if self.total > 0 else 0.0
        if self.current_index is not None:
            overall_progress += (self.current_progress / self.total)
        
        self.task.update_state(
            state="PROGRESS",
            meta={
                "progress": min(1.0, overall_progress),
                "batch": {
                    "total": self.total,
                    "completed": self.completed,
                    "currentIndex": self.current_index,
                    "currentName": self.current_name,
                    "currentProgress": self.current_progress,
                    "results": self.results,
                    "errors": self.errors
                }
            }
        )


@celery_app.task(bind=True)
def bake_lightmap_task(self, map_data_dict: dict, ambient: float = 0.2):
    map_id = str(uuid.uuid4())
    
    try:
        tracker = ProgressTracker(self)
        
        lightmap_image = bake_lightmap(
            map_data_dict,
            ambient=ambient,
            progress_callback=tracker.update
        )
        
        self.update_state(state="SAVING", meta={"progress": 0.95})
        
        lightmap_path = save_lightmap(lightmap_image, map_id)
        
        result_map = embed_lightmap_into_json(map_data_dict.copy(), lightmap_path)
        json_path = save_map_json(result_map, map_id)
        
        self.update_state(state="SUCCESS", meta={"progress": 1.0})
        
        return {
            "map_id": map_id,
            "lightmap_path": f"/static/lightmaps/{lightmap_path.split('/')[-1]}",
            "json_path": f"/static/lightmaps/{json_path.split('/')[-1]}",
            "map_data": result_map
        }
    
    except Exception as e:
        self.update_state(
            state="FAILURE",
            meta={"progress": 0.0, "error": str(e)}
        )
        raise


@celery_app.task(bind=True)
def batch_bake_task(self, maps_data: list, ambient: float = 0.2):
    tracker = BatchProgressTracker(self, len(maps_data))
    
    for i, item in enumerate(maps_data):
        name = item.get("name", f"map_{i}")
        map_data = item.get("mapData", {})
        
        tracker.start_map(i, name)
        
        try:
            map_id = str(uuid.uuid4())
            
            def update_progress(p):
                tracker.update_current_progress(p)
            
            lightmap_image = bake_lightmap(
                map_data,
                ambient=ambient,
                progress_callback=update_progress
            )
            
            tracker.update_current_progress(0.95)
            
            lightmap_path = save_lightmap(lightmap_image, map_id)
            
            result_map = embed_lightmap_into_json(map_data.copy(), lightmap_path)
            json_path = save_map_json(result_map, map_id)
            
            result = {
                "name": name,
                "map_id": map_id,
                "lightmap_path": f"/static/lightmaps/{lightmap_path.split('/')[-1]}",
                "json_path": f"/static/lightmaps/{json_path.split('/')[-1]}"
            }
            
            tracker.complete_map(result)
            
        except Exception as e:
            tracker.fail_map(i, name, str(e))
    
    return {
        "total": tracker.total,
        "completed": tracker.completed,
        "results": tracker.results,
        "errors": tracker.errors,
        "success_count": len(tracker.results),
        "error_count": len(tracker.errors)
    }


def get_task_status(task_id: str):
    result = AsyncResult(task_id, app=celery_app)
    
    state = result.state
    
    status_map = {
        "PENDING": "pending",
        "STARTED": "running",
        "PROGRESS": "running",
        "SAVING": "running",
        "SUCCESS": "completed",
        "FAILURE": "failed",
        "REVOKED": "revoked",
        "RETRY": "retrying"
    }
    
    response = {
        "task_id": task_id,
        "status": status_map.get(state, "unknown"),
        "progress": 0.0
    }
    
    try:
        if state == "SUCCESS":
            response["progress"] = 1.0
            response["result"] = result.result
            
            if result.result and "batch" in str(result.result):
                response["isBatch"] = True
        elif state == "FAILURE":
            try:
                response["error"] = str(result.result) if result.result else "Unknown error"
            except Exception:
                response["error"] = "Task failed"
            try:
                if result.info:
                    response["error"] = result.info.get("error", response["error"])
            except Exception:
                pass
        else:
            try:
                if result.info and isinstance(result.info, dict):
                    response["progress"] = result.info.get("progress", 0.0)
                    
                    if "batch" in result.info:
                        response["isBatch"] = True
                        response["batch"] = result.info["batch"]
            except Exception:
                if state == "STARTED":
                    response["progress"] = 0.01
    except Exception as e:
        response["progress"] = 0.0
    
    return response
