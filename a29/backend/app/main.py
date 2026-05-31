from fastapi import FastAPI, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid
from pathlib import Path
import threading
import logging

from .database import SessionLocal, engine, Base, get_db
from .models import SimulationTask, TaskStatus
from .schemas import (
    SimulationCreate,
    SimulationResponse,
    TaskStatusResponse,
    GeologyPreviewRequest,
    GeologyPreviewResponse,
    InversionRequest,
    InversionResultResponse,
    InversionProgressResponse,
    InversionStatus,
    AnimationRequest,
    AnimationResponse,
    AnimationProgressResponse,
    AnimationStatus,
    SourceParameters
)
from .config import settings
from .scheduler import get_scheduler
from .simulation.postprocessing import WavefieldPostprocessor
from .simulation.geology import create_geological_model, FaultType
from .simulation.material import MaterialModel
from .simulation.inversion import run_source_inversion
from .simulation.animation import export_animation

logger = logging.getLogger(__name__)

_inversion_tasks: Dict[str, Dict[str, Any]] = {}
_animation_tasks: Dict[str, Dict[str, Any]] = {}
_tasks_lock = threading.Lock()

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Seismic Wave Simulation API",
    description="2D Elastic Wave Propagation Simulation System",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "name": "Seismic Wave Simulation API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.post("/api/simulations", response_model=SimulationResponse, status_code=status.HTTP_201_CREATED)
async def create_simulation(
    simulation: SimulationCreate,
    db: Session = Depends(get_db)
):
    """Create and queue a new simulation."""
    task = SimulationTask(
        name=simulation.name,
        status=TaskStatus.PENDING,
        progress=0.0,
        grid_params=simulation.grid_params.model_dump(),
        material_params=simulation.material_params.model_dump(),
        source_params=simulation.source_params.model_dump(),
        solver_params=simulation.solver_params.model_dump()
    )

    db.add(task)
    db.commit()
    db.refresh(task)

    params = {
        'grid_params': task.grid_params,
        'material_params': task.material_params,
        'source_params': task.source_params,
        'solver_params': task.solver_params
    }

    scheduler = get_scheduler()
    scheduler.submit_task(task.id, params)

    return task


@app.get("/api/simulations", response_model=List[TaskStatusResponse])
async def list_simulations(
    status_filter: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """List all simulation tasks with optional status filter."""
    query = db.query(SimulationTask)

    if status_filter:
        try:
            task_status = TaskStatus(status_filter)
            query = query.filter(SimulationTask.status == task_status)
        except ValueError:
            pass

    tasks = query.order_by(SimulationTask.created_at.desc()).offset(offset).limit(limit).all()
    return tasks


@app.get("/api/simulations/{task_id}", response_model=SimulationResponse)
async def get_simulation(task_id: int, db: Session = Depends(get_db)):
    """Get details of a specific simulation."""
    task = db.query(SimulationTask).filter(SimulationTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Simulation not found")

    scheduler = get_scheduler()
    job_status = scheduler.get_job_status(task_id)
    if job_status and job_status['is_running']:
        task.progress = job_status['progress']

    return task


@app.delete("/api/simulations/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_simulation(task_id: int, db: Session = Depends(get_db)):
    """Delete a simulation task."""
    task = db.query(SimulationTask).filter(SimulationTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Simulation not found")

    if task.hdf5_file_path:
        try:
            Path(task.hdf5_file_path).unlink(missing_ok=True)
        except Exception:
            pass

    db.delete(task)
    db.commit()


@app.get("/api/simulations/{task_id}/snapshots")
async def get_snapshots(task_id: int, db: Session = Depends(get_db)):
    """Get list of snapshots for a completed simulation."""
    task = db.query(SimulationTask).filter(SimulationTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Simulation not found")

    if task.status != TaskStatus.COMPLETED or not task.hdf5_file_path:
        raise HTTPException(status_code=400, detail="Simulation not completed or no results")

    try:
        postprocessor = WavefieldPostprocessor(Path(task.hdf5_file_path))
        n_snapshots = postprocessor.get_snapshot_count()
        times = postprocessor.get_times().tolist()
        params = postprocessor.get_parameters()
        mesh = postprocessor.get_mesh_info()

        return {
            'task_id': task_id,
            'n_snapshots': n_snapshots,
            'times': times,
            'parameters': params,
            'mesh': {
                'width': mesh['width'],
                'height': mesh['height'],
                'n_nodes': len(mesh['nodes']),
                'n_elements': len(mesh['elements'])
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading results: {str(e)}")


@app.get("/api/simulations/{task_id}/snapshots/{snapshot_index}")
async def get_snapshot(
    task_id: int,
    snapshot_index: int,
    nx: int = 64,
    ny: int = 64,
    db: Session = Depends(get_db)
):
    """Get a specific snapshot for visualization."""
    task = db.query(SimulationTask).filter(SimulationTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Simulation not found")

    if task.status != TaskStatus.COMPLETED or not task.hdf5_file_path:
        raise HTTPException(status_code=400, detail="Simulation not completed")

    try:
        postprocessor = WavefieldPostprocessor(Path(task.hdf5_file_path))
        n_snapshots = postprocessor.get_snapshot_count()

        if snapshot_index < 0 or snapshot_index >= n_snapshots:
            raise HTTPException(
                status_code=400,
                detail=f"Snapshot index out of range. Valid range: 0 to {n_snapshots - 1}"
            )

        snapshot = postprocessor.get_snapshot_for_web(snapshot_index, nx, ny)
        return snapshot
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading snapshot: {str(e)}")


@app.post("/api/simulations/{task_id}/seismograms")
async def get_seismograms(
    task_id: int,
    receivers: List[List[float]],
    db: Session = Depends(get_db)
):
    """Get seismograms at specified receiver points."""
    task = db.query(SimulationTask).filter(SimulationTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Simulation not found")

    if task.status != TaskStatus.COMPLETED or not task.hdf5_file_path:
        raise HTTPException(status_code=400, detail="Simulation not completed")

    try:
        postprocessor = WavefieldPostprocessor(Path(task.hdf5_file_path))

        receiver_tuples = [(r[0], r[1]) for r in receivers]
        seismograms = postprocessor.get_seismogram(receiver_tuples)

        return seismograms
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating seismograms: {str(e)}")


@app.get("/api/simulations/{task_id}/progress")
async def get_progress(task_id: int, db: Session = Depends(get_db)):
    """Get current progress of a simulation."""
    task = db.query(SimulationTask).filter(SimulationTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Simulation not found")

    scheduler = get_scheduler()
    job_status = scheduler.get_job_status(task_id)

    if job_status:
        return {
            'task_id': task_id,
            'status': job_status['status'],
            'progress': job_status['progress'],
            'is_running': job_status['is_running']
        }

    return {
        'task_id': task_id,
        'status': task.status.value if task.status else 'unknown',
        'progress': task.progress,
        'is_running': False
    }


# ============================================================================
# Geological Model API
# ============================================================================

@app.post("/api/geology/preview", response_model=GeologyPreviewResponse)
async def preview_geology_model(request: GeologyPreviewRequest):
    """Preview a geological model with layers and faults."""
    try:
        params = request.model_params.model_dump()
        model = create_geological_model(params)
        viz = model.visualize(nx=request.nx, ny=request.ny)

        return GeologyPreviewResponse(
            success=True,
            x=viz['x'],
            y=viz['y'],
            vp=viz['vp'],
            vs=viz['vs'],
            density=viz['density'],
            layers=viz['layers'],
            faults=viz['faults']
        )
    except Exception as e:
        logger.exception(f"Error previewing geology model: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Source Inversion API
# ============================================================================

def _run_inversion_task(task_id: str, params: Dict[str, Any]):
    """Run inversion in background thread."""
    with _tasks_lock:
        _inversion_tasks[task_id] = {
            'status': InversionStatus.RUNNING,
            'progress': 0.0,
            'current_iteration': 0,
            'current_misfit': None,
            'result': None,
            'error': None
        }

    def progress_callback(iteration: int, misfit: float):
        max_iter = params.get('inversion_params', {}).get('max_iterations', 50)
        progress = (iteration + 1) / max_iter
        with _tasks_lock:
            if task_id in _inversion_tasks:
                _inversion_tasks[task_id]['progress'] = progress
                _inversion_tasks[task_id]['current_iteration'] = iteration
                _inversion_tasks[task_id]['current_misfit'] = misfit

    try:
        result = run_source_inversion(params, progress_callback=progress_callback)

        with _tasks_lock:
            _inversion_tasks[task_id]['status'] = InversionStatus.COMPLETED
            _inversion_tasks[task_id]['progress'] = 1.0
            _inversion_tasks[task_id]['result'] = result

    except Exception as e:
        logger.exception(f"Inversion task {task_id} failed: {e}")
        with _tasks_lock:
            _inversion_tasks[task_id]['status'] = InversionStatus.FAILED
            _inversion_tasks[task_id]['error'] = str(e)


@app.post("/api/inversion/run", response_model=InversionResultResponse)
async def run_inversion(request: InversionRequest, background_tasks: BackgroundTasks):
    """Submit a source inversion task."""
    task_id = f"inv_{uuid.uuid4().hex[:12]}"

    if request.observed_data_path == "synthetic" and not request.synthetic_source:
        raise HTTPException(
            status_code=400,
            detail="synthetic_source is required when observed_data_path='synthetic'"
        )

    params = {
        'mesh_params': request.mesh_params.model_dump(),
        'material_params': request.material_params.model_dump(),
        'receivers': request.receivers,
        'observed_data_path': request.observed_data_path,
        'initial_source': request.initial_source.model_dump(),
        'inversion_params': request.inversion_params.model_dump(),
        'total_time': request.total_time
    }

    if request.synthetic_source:
        params['synthetic_source'] = request.synthetic_source.model_dump()

    with _tasks_lock:
        _inversion_tasks[task_id] = {
            'status': InversionStatus.PENDING,
            'progress': 0.0,
            'current_iteration': 0,
            'current_misfit': None,
            'result': None,
            'error': None
        }

    thread = threading.Thread(target=_run_inversion_task, args=(task_id, params), daemon=True)
    thread.start()

    return InversionResultResponse(
        success=True,
        task_id=task_id,
        status=InversionStatus.RUNNING,
        progress=0.0
    )


@app.get("/api/inversion/{task_id}/progress", response_model=InversionProgressResponse)
async def get_inversion_progress(task_id: str):
    """Get progress of an inversion task."""
    with _tasks_lock:
        task = _inversion_tasks.get(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Inversion task not found")

    return InversionProgressResponse(
        task_id=task_id,
        status=task['status'],
        progress=task['progress'],
        current_iteration=task['current_iteration'],
        current_misfit=task['current_misfit']
    )


@app.get("/api/inversion/{task_id}/result", response_model=InversionResultResponse)
async def get_inversion_result(task_id: str):
    """Get final result of an inversion task."""
    with _tasks_lock:
        task = _inversion_tasks.get(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Inversion task not found")

    result = task.get('result')

    response = InversionResultResponse(
        success=task['status'] == InversionStatus.COMPLETED,
        task_id=task_id,
        status=task['status'],
        progress=task['progress']
    )

    if task['error']:
        response.error_message = task['error']

    if result:
        response.iterations = result.get('iterations', 0)
        response.final_misfit = result.get('final_misfit')
        response.misfit_history = result.get('misfit_history', [])
        response.converged = result.get('converged', False)

        if result.get('initial_source'):
            response.initial_source = SourceParameters(**result['initial_source'])
        if result.get('best_source'):
            response.best_source = SourceParameters(**result['best_source'])

    return response


# ============================================================================
# Animation Export API
# ============================================================================

def _run_animation_task(task_id: str, hdf5_path: str, output_path: str, config: Dict[str, Any]):
    """Run animation export in background thread."""
    with _tasks_lock:
        _animation_tasks[task_id] = {
            'status': AnimationStatus.GENERATING,
            'progress': 0.0,
            'result': None,
            'error': None
        }

    def progress_callback(progress: float):
        with _tasks_lock:
            if task_id in _animation_tasks:
                _animation_tasks[task_id]['progress'] = progress
                if progress >= 0.99:
                    _animation_tasks[task_id]['status'] = AnimationStatus.RENDERING

    try:
        result = export_animation(hdf5_path, output_path, config, progress_callback)

        with _tasks_lock:
            if result.get('success'):
                _animation_tasks[task_id]['status'] = AnimationStatus.COMPLETED
                _animation_tasks[task_id]['progress'] = 1.0
                _animation_tasks[task_id]['result'] = result
            else:
                _animation_tasks[task_id]['status'] = AnimationStatus.FAILED
                _animation_tasks[task_id]['error'] = result.get('error', 'Unknown error')

    except Exception as e:
        logger.exception(f"Animation task {task_id} failed: {e}")
        with _tasks_lock:
            _animation_tasks[task_id]['status'] = AnimationStatus.FAILED
            _animation_tasks[task_id]['error'] = str(e)


@app.post("/api/simulations/{task_id}/export/animation", response_model=AnimationResponse)
async def export_simulation_animation(
    task_id: int,
    request: AnimationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Export simulation results as animation."""
    simulation_task = db.query(SimulationTask).filter(SimulationTask.id == task_id).first()
    if not simulation_task:
        raise HTTPException(status_code=404, detail="Simulation not found")

    if simulation_task.status != TaskStatus.COMPLETED or not simulation_task.hdf5_file_path:
        raise HTTPException(status_code=400, detail="Simulation not completed")

    hdf5_path = simulation_task.hdf5_file_path
    anim_task_id = f"anim_{uuid.uuid4().hex[:12]}"

    output_dir = settings.hdf5_path / "animations"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{anim_task_id}.{request.format.value}"

    config = request.model_dump()

    with _tasks_lock:
        _animation_tasks[anim_task_id] = {
            'status': AnimationStatus.PENDING,
            'progress': 0.0,
            'result': None,
            'error': None,
            'output_path': str(output_path)
        }

    thread = threading.Thread(
        target=_run_animation_task,
        args=(anim_task_id, hdf5_path, str(output_path), config),
        daemon=True
    )
    thread.start()

    return AnimationResponse(
        success=True,
        task_id=anim_task_id,
        status=AnimationStatus.GENERATING,
        progress=0.0
    )


@app.get("/api/animation/{task_id}/progress", response_model=AnimationProgressResponse)
async def get_animation_progress(task_id: str):
    """Get progress of animation export."""
    with _tasks_lock:
        task = _animation_tasks.get(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Animation task not found")

    return AnimationProgressResponse(
        task_id=task_id,
        status=task['status'],
        progress=task['progress'],
        message=task.get('error')
    )


@app.get("/api/animation/{task_id}/download")
async def download_animation(task_id: str):
    """Download exported animation file."""
    with _tasks_lock:
        task = _animation_tasks.get(task_id)

    if not task:
        raise HTTPException(status_code=404, detail="Animation task not found")

    if task['status'] != AnimationStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Animation not yet completed")

    result = task.get('result', {})
    output_path = result.get('output_path') or task.get('output_path')

    if not output_path:
        raise HTTPException(status_code=404, detail="Animation file not found")

    output_file = Path(output_path)
    if not output_file.exists():
        raise HTTPException(status_code=404, detail="Animation file not found")

    media_types = {
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'gif': 'image/gif'
    }
    media_type = media_types.get(output_file.suffix.lower(), 'application/octet-stream')

    return FileResponse(
        path=output_file,
        media_type=media_type,
        filename=output_file.name
    )


# ============================================================================
# Utility API
# ============================================================================

@app.get("/api/utils/ffmpeg-check")
async def check_ffmpeg():
    """Check if FFmpeg is available for animation export."""
    import shutil
    ffmpeg_available = shutil.which('ffmpeg') is not None
    return {
        'available': ffmpeg_available,
        'path': shutil.which('ffmpeg') if ffmpeg_available else None
    }


@app.get("/api/utils/example-models")
async def get_example_models():
    """Get example geological model configurations."""
    return {
        'layered_model': {
            'name': 'Layered Sedimentary Basin',
            'description': 'Three-layer sedimentary model with increasing velocity with depth',
            'domain_width': 1000,
            'domain_height': 1000,
            'base_material': {'vp': 5000, 'vs': 2887, 'density': 3300},
            'layers': [
                {'y_min': 700, 'y_max': 1000, 'vp': 4000, 'vs': 2309, 'density': 3000, 'name': 'Basement'},
                {'y_min': 400, 'y_max': 700, 'vp': 3500, 'vs': 2020, 'density': 2800, 'name': 'Sediment Layer 2'},
                {'y_min': 0, 'y_max': 400, 'vp': 3000, 'vs': 1732, 'density': 2600, 'name': 'Sediment Layer 1'}
            ],
            'faults': []
        },
        'fault_model': {
            'name': 'Normal Fault Model',
            'description': 'Model with a normal fault crossing multiple layers',
            'domain_width': 1000,
            'domain_height': 1000,
            'base_material': {'vp': 5000, 'vs': 2887, 'density': 3300},
            'layers': [
                {'y_min': 600, 'y_max': 1000, 'vp': 4000, 'vs': 2309, 'density': 3000, 'name': 'Lower Layer'},
                {'y_min': 0, 'y_max': 600, 'vp': 3000, 'vs': 1732, 'density': 2600, 'name': 'Upper Layer'}
            ],
            'faults': [
                {
                    'start': [300, 0],
                    'end': [500, 1000],
                    'width': 30,
                    'material': {'vp': 2500, 'vs': 1443, 'density': 2400},
                    'fault_type': 'normal',
                    'displacement': 50.0,
                    'name': 'Main Fault'
                }
            ]
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
