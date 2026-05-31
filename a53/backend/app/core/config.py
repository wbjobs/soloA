import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
STATIC_DIR = BASE_DIR / "static"
UPLOAD_DIR = STATIC_DIR / "uploads"
LIGHTMAP_DIR = STATIC_DIR / "lightmaps"

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(LIGHTMAP_DIR, exist_ok=True)

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")
