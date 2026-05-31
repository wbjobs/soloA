from celery import Celery
from .config import settings

celery = Celery(
    "pacs_tasks",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)


from .tasks import ai_detection, dicom_processing
