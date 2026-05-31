from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import json
from app.database import get_db
from app.models import Simulation, Body, SimulationState as DBState
from app.schemas import (
    SimulationCreate, SimulationResponse, BodyResponse,
    SimulationStepRequest, SimulationConfig
)
from app.simulation.engine import simulation_manager
from app.simulation.presets import PRESETS

router = APIRouter()


@router.post("/", response_model=SimulationResponse)
def create_simulation(sim_create: SimulationCreate, db: Session = Depends(get_db)):
    db_sim = Simulation(
        name=sim_create.name,
        description=sim_create.description,
        config=sim_create.config.model_dump()
    )
    db.add(db_sim)
    db.commit()
    db.refresh(db_sim)

    for body in sim_create.bodies:
        db_body = Body(
            simulation_id=db_sim.id,
            name=body.name,
            mass=body.mass,
            radius=body.radius,
            pos_x=body.pos_x,
            pos_y=body.pos_y,
            pos_z=body.pos_z,
            vel_x=body.vel_x,
            vel_y=body.vel_y,
            vel_z=body.vel_z,
            color=body.color
        )
        db.add(db_body)

    db.commit()
    db.refresh(db_sim)

    simulation_manager.create_simulation(
        db_sim.id,
        sim_create.config,
        sim_create.bodies
    )

    return db_sim


@router.post("/preset/{preset_name}", response_model=SimulationResponse)
def create_from_preset(preset_name: str, db: Session = Depends(get_db)):
    if preset_name not in PRESETS:
        raise HTTPException(status_code=404, detail=f"Preset '{preset_name}' not found")

    preset = PRESETS[preset_name]
    config = preset["config"]()
    bodies = preset["bodies"]()

    db_sim = Simulation(
        name=f"{preset_name.title()} Simulation",
        description=preset["description"],
        config=config.model_dump()
    )
    db.add(db_sim)
    db.commit()
    db.refresh(db_sim)

    for body in bodies:
        db_body = Body(
            simulation_id=db_sim.id,
            name=body.name,
            mass=body.mass,
            radius=body.radius,
            pos_x=body.pos_x,
            pos_y=body.pos_y,
            pos_z=body.pos_z,
            vel_x=body.vel_x,
            vel_y=body.vel_y,
            vel_z=body.vel_z,
            color=body.color
        )
        db.add(db_body)

    db.commit()
    db.refresh(db_sim)

    simulation_manager.create_simulation(db_sim.id, config, bodies)

    return db_sim


@router.get("/presets")
def list_presets():
    return [
        {
            "name": name,
            "description": preset["description"]
        }
        for name, preset in PRESETS.items()
    ]


@router.get("/", response_model=List[SimulationResponse])
def list_simulations(db: Session = Depends(get_db), skip: int = 0, limit: int = 100):
    return db.query(Simulation).offset(skip).limit(limit).all()


@router.get("/{sim_id}", response_model=SimulationResponse)
def get_simulation(sim_id: int, db: Session = Depends(get_db)):
    sim = db.query(Simulation).filter(Simulation.id == sim_id).first()
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")
    return sim


@router.delete("/{sim_id}")
def delete_simulation(sim_id: int, db: Session = Depends(get_db)):
    sim = db.query(Simulation).filter(Simulation.id == sim_id).first()
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    db.delete(sim)
    db.commit()
    simulation_manager.remove_simulation(sim_id)

    return {"message": "Simulation deleted successfully"}


@router.post("/{sim_id}/step")
def step_simulation(sim_id: int, request: SimulationStepRequest):
    if not simulation_manager.has_simulation(sim_id):
        raise HTTPException(status_code=404, detail="Simulation not loaded in memory")

    sim = simulation_manager.get_simulation(sim_id)
    state = sim.step(request.steps)

    return state.to_dict()


@router.get("/{sim_id}/state")
def get_current_state(sim_id: int):
    if not simulation_manager.has_simulation(sim_id):
        raise HTTPException(status_code=404, detail="Simulation not loaded in memory")

    sim = simulation_manager.get_simulation(sim_id)
    return sim.get_state().to_dict()


@router.post("/{sim_id}/load")
def load_simulation(sim_id: int, db: Session = Depends(get_db)):
    db_sim = db.query(Simulation).filter(Simulation.id == sim_id).first()
    if not db_sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    config = SimulationConfig(**db_sim.config)
    bodies = [
        BodyResponse(
            id=b.id,
            simulation_id=b.simulation_id,
            name=b.name,
            mass=b.mass,
            radius=b.radius,
            pos_x=b.pos_x,
            pos_y=b.pos_y,
            pos_z=b.pos_z,
            vel_x=b.vel_x,
            vel_y=b.vel_y,
            vel_z=b.vel_z,
            color=b.color
        )
        for b in db_sim.bodies
    ]

    simulation_manager.create_simulation(sim_id, config, bodies)
    sim = simulation_manager.get_simulation(sim_id)

    return {"message": "Simulation loaded", "state": sim.get_state().to_dict()}


@router.post("/{sim_id}/save")
def save_simulation_state(sim_id: int, db: Session = Depends(get_db)):
    if not simulation_manager.has_simulation(sim_id):
        raise HTTPException(status_code=404, detail="Simulation not loaded in memory")

    sim = simulation_manager.get_simulation(sim_id)
    state = sim.get_state()

    db_state = DBState(
        simulation_id=sim_id,
        step=state.step,
        time=state.time,
        data=state.to_dict()
    )
    db.add(db_state)
    db.commit()

    return {"message": "State saved", "step": state.step, "time": state.time}


@router.get("/{sim_id}/states")
def list_saved_states(sim_id: int, db: Session = Depends(get_db)):
    states = db.query(DBState).filter(DBState.simulation_id == sim_id).order_by(DBState.step).all()
    return [
        {
            "id": s.id,
            "step": s.step,
            "time": s.time
        }
        for s in states
    ]


@router.post("/{sim_id}/pause")
def pause_simulation(sim_id: int):
    if not simulation_manager.has_simulation(sim_id):
        raise HTTPException(status_code=404, detail="Simulation not loaded in memory")

    sim = simulation_manager.get_simulation(sim_id)
    sim.pause()
    return {"message": "Simulation paused"}


@router.post("/{sim_id}/resume")
def resume_simulation(sim_id: int):
    if not simulation_manager.has_simulation(sim_id):
        raise HTTPException(status_code=404, detail="Simulation not loaded in memory")

    sim = simulation_manager.get_simulation(sim_id)
    sim.resume()
    return {"message": "Simulation resumed"}


@router.post("/{sim_id}/time-scale")
def set_time_scale(sim_id: int, scale: float):
    if not simulation_manager.has_simulation(sim_id):
        raise HTTPException(status_code=404, detail="Simulation not loaded in memory")

    sim = simulation_manager.get_simulation(sim_id)
    sim.set_time_scale(scale)
    return {"message": f"Time scale set to {scale}", "current_dt": sim.config.dt}
