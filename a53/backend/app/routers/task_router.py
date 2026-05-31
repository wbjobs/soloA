from fastapi import APIRouter

from app.modules.tasks import get_task_status

router = APIRouter(tags=["tasks"])
task_router = router


@router.get("/{task_id}")
async def get_status(task_id: str):
    status = get_task_status(task_id)
    return status


@router.get("/{task_id}/progress")
async def get_progress(task_id: str):
    status = get_task_status(task_id)
    return {
        "task_id": task_id,
        "progress": status["progress"],
        "status": status["status"]
    }
