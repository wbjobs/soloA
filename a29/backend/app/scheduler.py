import asyncio
import uuid
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional, Callable
import threading
import logging

from sqlalchemy.orm import Session

from .database import SessionLocal
from .models import SimulationTask, TaskStatus
from .config import settings
from .simulation.solver import run_simulation

logger = logging.getLogger(__name__)


class SimulationJob:
    """Represents a running simulation job."""

    def __init__(self, task_id: int, params: Dict[str, Any]):
        self.task_id = task_id
        self.params = params
        self.progress = 0.0
        self.status = TaskStatus.PENDING
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None

    def update_progress(self, progress: float):
        """Update progress and save to database."""
        self.progress = progress
        try:
            db = SessionLocal()
            task = db.query(SimulationTask).filter(SimulationTask.id == self.task_id).first()
            if task:
                task.progress = float(progress)
                db.commit()
            db.close()
        except Exception as e:
            logger.error(f"Error updating progress: {e}")

    def run(self):
        """Execute the simulation job."""
        self.status = TaskStatus.RUNNING

        try:
            db = SessionLocal()
            task = db.query(SimulationTask).filter(SimulationTask.id == self.task_id).first()
            if task:
                task.status = TaskStatus.RUNNING
                task.started_at = datetime.utcnow()
                task.progress = 0.0
                db.commit()
            db.close()

            output_path = settings.hdf5_path / f"simulation_{self.task_id}.h5"

            solver_params = self.params.get('solver_params', {})
            use_mpi = solver_params.get('use_mpi', False)
            n_procs = solver_params.get('n_procs', 1)

            results = run_simulation(
                params=self.params,
                output_path=output_path,
                progress_callback=lambda p: self.update_progress(p),
                use_mpi=use_mpi,
                n_procs=n_procs
            )

            self.result = results

            if results.get('completed', True):
                self.progress = 1.0
                self.status = TaskStatus.COMPLETED

                db = SessionLocal()
                task = db.query(SimulationTask).filter(SimulationTask.id == self.task_id).first()
                if task:
                    task.status = TaskStatus.COMPLETED
                    task.progress = 1.0
                    task.completed_at = datetime.utcnow()
                    task.hdf5_file_path = str(output_path)
                    db.commit()
                db.close()
            else:
                failure_step = results.get('failure_step', -1)
                error_msg = f"Numerical instability detected at step {failure_step}. " \
                           f"This may be caused by: near-incompressible material (high Poisson's ratio), " \
                           f"insufficient numerical damping, or unstable time step."
                self.error = error_msg
                self.status = TaskStatus.FAILED

                db = SessionLocal()
                task = db.query(SimulationTask).filter(SimulationTask.id == self.task_id).first()
                if task:
                    task.status = TaskStatus.FAILED
                    task.error_message = error_msg
                    task.completed_at = datetime.utcnow()
                    db.commit()
                db.close()

        except Exception as e:
            logger.exception(f"Simulation failed: {e}")
            self.error = str(e)
            self.status = TaskStatus.FAILED

            try:
                db = SessionLocal()
                task = db.query(SimulationTask).filter(SimulationTask.id == self.task_id).first()
                if task:
                    task.status = TaskStatus.FAILED
                    task.error_message = str(e)
                    task.completed_at = datetime.utcnow()
                    db.commit()
                db.close()
            except Exception as db_e:
                logger.error(f"Error updating database on failure: {db_e}")

    def start(self):
        """Start the job in a separate thread."""
        self._thread = threading.Thread(target=self.run, daemon=True)
        self._thread.start()

    def is_running(self) -> bool:
        """Check if job is still running."""
        return self._thread is not None and self._thread.is_alive()


class TaskScheduler:
    """Manages simulation task queue and execution."""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._jobs: Dict[int, SimulationJob] = {}
                cls._instance._max_workers = settings.MAX_WORKERS
                cls._instance._semaphore = threading.Semaphore(settings.MAX_WORKERS)
            return cls._instance

    def submit_task(self, task_id: int, params: Dict[str, Any]) -> SimulationJob:
        """Submit a new simulation task."""
        job = SimulationJob(task_id, params)
        self._jobs[task_id] = job

        def run_with_semaphore():
            with self._semaphore:
                job.run()

        thread = threading.Thread(target=run_with_semaphore, daemon=True)
        thread.start()

        return job

    def get_job_status(self, task_id: int) -> Optional[Dict[str, Any]]:
        """Get the status of a job."""
        job = self._jobs.get(task_id)
        if job:
            return {
                'task_id': task_id,
                'status': job.status.value,
                'progress': job.progress,
                'is_running': job.is_running(),
                'error': job.error,
                'result': job.result
            }
        return None

    def get_all_jobs(self) -> Dict[int, Dict[str, Any]]:
        """Get status of all jobs."""
        return {tid: self.get_job_status(tid) for tid in self._jobs}

    def cleanup_completed_jobs(self, age_seconds: int = 3600):
        """Remove old completed jobs from memory."""
        current_time = datetime.utcnow()
        to_remove = []

        for task_id, job in self._jobs.items():
            if job.status in [TaskStatus.COMPLETED, TaskStatus.FAILED]:
                if not job.is_running():
                    to_remove.append(task_id)

        for task_id in to_remove:
            del self._jobs[task_id]


scheduler = TaskScheduler()


def get_scheduler() -> TaskScheduler:
    """Get the global scheduler instance."""
    return scheduler
