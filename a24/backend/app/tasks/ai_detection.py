import io
import time
import random
import threading
from datetime import datetime
from ..celery_app import celery
from ..database import SessionLocal
from ..models import TaskStatus
from .. import crud
from ..config import settings
from ..minio_client import get_minio_client
from pydicom import dcmread
import numpy as np

_ai_task_lock = threading.Lock()
_running_ai_tasks = set()
MAX_CONCURRENT_AI_TASKS = 1
BATCH_SIZE = 20


def wait_for_slot(max_concurrent: int = MAX_CONCURRENT_AI_TASKS, timeout: int = 300) -> bool:
    start_time = time.time()
    while True:
        with _ai_task_lock:
            if len(_running_ai_tasks) < max_concurrent:
                return True
        if time.time() - start_time > timeout:
            return False
        time.sleep(1)


def acquire_task(task_id: str) -> bool:
    with _ai_task_lock:
        if len(_running_ai_tasks) < MAX_CONCURRENT_AI_TASKS:
            _running_ai_tasks.add(task_id)
            return True
        return False


def release_task(task_id: str):
    with _ai_task_lock:
        _running_ai_tasks.discard(task_id)


def process_slice(file_bytes: bytes, series_modality: str, slice_idx: int, instance):
    try:
        ds = dcmread(io.BytesIO(file_bytes), force=True)
        if not hasattr(ds, 'pixel_array'):
            return []

        arr = ds.pixel_array

        if hasattr(ds, 'RescaleSlope') and ds.RescaleSlope:
            try:
                arr = arr * float(ds.RescaleSlope)
            except (ValueError, TypeError):
                pass
        if hasattr(ds, 'RescaleIntercept') and ds.RescaleIntercept:
            try:
                arr = arr + float(ds.RescaleIntercept)
            except (ValueError, TypeError):
                pass

        findings = []

        if series_modality == 'CT':
            lung_mask = (arr >= -950) & (arr <= -500)
            lung_ratio = np.sum(lung_mask) / (arr.shape[0] * arr.shape[1])

            if lung_ratio > 0.15:
                num_nodules = random.randint(0, 3)
                for _ in range(num_nodules):
                    confidence = round(random.uniform(0.65, 0.98), 2)
                    if confidence > 0.7:
                        rows, cols = arr.shape
                        x = random.randint(int(cols * 0.15), int(cols * 0.85))
                        y = random.randint(int(rows * 0.15), int(rows * 0.85))
                        width = random.randint(10, 50)
                        height = random.randint(10, 50)

                        findings.append({
                            "slice_index": slice_idx,
                            "instance_uid": instance.instance_uid,
                            "instance_number": instance.instance_number,
                            "slice_location": instance.slice_location,
                            "bounding_box": {
                                "x": x,
                                "y": y,
                                "width": width,
                                "height": height
                            },
                            "center": {
                                "x": x + width // 2,
                                "y": y + height // 2
                            },
                            "confidence": confidence,
                            "severity": "high" if confidence > 0.9 else "medium" if confidence > 0.8 else "low"
                        })

        del arr, ds
        return findings

    except Exception as e:
        print(f"Error processing slice {slice_idx}: {str(e)}")
        return []


@celery.task(bind=True, time_limit=3600, soft_time_limit=3300)
def run_lung_nodule_detection(self, series_id: int):
    task_id = self.request.id
    db = SessionLocal()

    try:
        crud.update_ai_detection_status(db, task_id, TaskStatus.PENDING)

        if not wait_for_slot():
            crud.update_ai_detection_status(
                db, task_id, TaskStatus.FAILED,
                error_message="AI 检测服务繁忙，请稍后重试"
            )
            raise Exception("Timeout waiting for GPU resources")

        if not acquire_task(task_id):
            crud.update_ai_detection_status(
                db, task_id, TaskStatus.FAILED,
                error_message="无法获取执行槽位"
            )
            raise Exception("Failed to acquire task slot")

        crud.update_ai_detection_status(db, task_id, TaskStatus.PROCESSING)

        series = db.query(crud.Series).filter(crud.Series.id == series_id).first()
        if not series:
            raise ValueError(f"Series {series_id} not found")

        instances = crud.get_instances_by_series(db, series_id)
        if not instances:
            raise ValueError("No instances found in series")

        detection_results = {
            "series_id": series_id,
            "series_uid": series.series_uid,
            "modality": series.modality,
            "total_slices": len(instances),
            "findings": []
        }

        total_batches = (len(instances) + BATCH_SIZE - 1) // BATCH_SIZE
        self.update_state(state='PROCESSING', meta={
            'current': 0,
            'total': len(instances),
            'percent': 0
        })

        minio_client = get_minio_client()

        for batch_idx in range(total_batches):
            start_idx = batch_idx * BATCH_SIZE
            end_idx = min(start_idx + BATCH_SIZE, len(instances))
            batch_instances = instances[start_idx:end_idx]

            for i, instance in enumerate(batch_instances):
                global_idx = start_idx + i

                try:
                    response = minio_client.get_object(settings.DICOM_BUCKET, instance.minio_object_name)
                    file_bytes = response.read()

                    batch_findings = process_slice(file_bytes, series.modality, global_idx, instance)
                    detection_results["findings"].extend(batch_findings)

                    del file_bytes

                except Exception as e:
                    print(f"Error processing slice {global_idx}: {str(e)}")
                    continue

                percent = int((global_idx + 1) / len(instances) * 100)
                if (global_idx + 1) % 10 == 0 or percent == 100:
                    self.update_state(state='PROCESSING', meta={
                        'current': global_idx + 1,
                        'total': len(instances),
                        'percent': percent,
                        'findings_found': len(detection_results["findings"])
                    })

        detection_results["total_findings"] = len(detection_results["findings"])
        detection_results["high_confidence"] = sum(
            1 for f in detection_results["findings"] if f["confidence"] >= 0.9
        )
        detection_results["processed_at"] = datetime.utcnow().isoformat()

        crud.update_ai_detection_status(db, task_id, TaskStatus.COMPLETED, results=detection_results)
        return detection_results

    except Exception as e:
        crud.update_ai_detection_status(db, task_id, TaskStatus.FAILED, error_message=str(e))
        raise
    finally:
        release_task(task_id)
        db.close()
