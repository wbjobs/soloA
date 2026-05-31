from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import Body, Simulation
from app.schemas import BodyCreate, BodyResponse

router = APIRouter()


@router.get("/", response_model=List[BodyResponse])
def list_bodies(simulation_id: int, db: Session = Depends(get_db)):
    sim = db.query(Simulation).filter(Simulation.id == simulation_id).first()
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")
    return db.query(Body).filter(Body.simulation_id == simulation_id).all()


@router.get("/{body_id}", response_model=BodyResponse)
def get_body(body_id: int, db: Session = Depends(get_db)):
    body = db.query(Body).filter(Body.id == body_id).first()
    if not body:
        raise HTTPException(status_code=404, detail="Body not found")
    return body


@router.post("/", response_model=BodyResponse)
def create_body(body: BodyCreate, simulation_id: int, db: Session = Depends(get_db)):
    sim = db.query(Simulation).filter(Simulation.id == simulation_id).first()
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")

    db_body = Body(
        simulation_id=simulation_id,
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
    db.refresh(db_body)

    return db_body


@router.put("/{body_id}", response_model=BodyResponse)
def update_body(body_id: int, body_update: BodyCreate, db: Session = Depends(get_db)):
    db_body = db.query(Body).filter(Body.id == body_id).first()
    if not db_body:
        raise HTTPException(status_code=404, detail="Body not found")

    for key, value in body_update.model_dump().items():
        setattr(db_body, key, value)

    db.commit()
    db.refresh(db_body)
    return db_body


@router.delete("/{body_id}")
def delete_body(body_id: int, db: Session = Depends(get_db)):
    db_body = db.query(Body).filter(Body.id == body_id).first()
    if not db_body:
        raise HTTPException(status_code=404, detail="Body not found")

    db.delete(db_body)
    db.commit()
    return {"message": "Body deleted successfully"}
