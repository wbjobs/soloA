from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from typing import List, Optional
from datetime import datetime

from ..database import get_db
from ..models import Reservation, Device, Consumable, ConsumableStock, ConsumableLock, ConsumableUsage
from ..schemas import (
    Reservation as ReservationSchema, 
    ReservationCreate, 
    ConflictCheckResult,
    ReservationCreateWithConsumables,
    ConsumableItem
)

router = APIRouter(prefix="/api/reservations", tags=["reservations"])

def check_conflict(db: Session, device_id: str, start_time: datetime, end_time: datetime, exclude_id: int = None):
    query = db.query(Reservation).filter(
        Reservation.device_id == device_id,
        Reservation.status != "cancelled"
    )
    
    if exclude_id:
        query = query.filter(Reservation.id != exclude_id)
    
    conflicts = query.filter(
        or_(
            and_(Reservation.start_time < end_time, Reservation.end_time > start_time),
            and_(start_time < Reservation.end_time, end_time > Reservation.start_time)
        )
    ).all()
    
    return conflicts

@router.get("/", response_model=List[ReservationSchema])
def get_reservations(db: Session = Depends(get_db)):
    return db.query(Reservation).order_by(Reservation.start_time.desc()).all()

@router.get("/device/{device_id}", response_model=List[ReservationSchema])
def get_device_reservations(device_id: str, db: Session = Depends(get_db)):
    return db.query(Reservation).filter(
        Reservation.device_id == device_id
    ).order_by(Reservation.start_time.desc()).all()

@router.get("/check-conflict", response_model=ConflictCheckResult)
def check_reservation_conflict(
    device_id: str,
    start_time: datetime,
    end_time: datetime,
    db: Session = Depends(get_db)
):
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    if end_time <= start_time:
        raise HTTPException(status_code=400, detail="End time must be after start time")
    
    conflicts = check_conflict(db, device_id, start_time, end_time)
    
    return ConflictCheckResult(
        has_conflict=len(conflicts) > 0,
        conflicting_reservations=conflicts,
        message=f"Found {len(conflicts)} conflicting reservations" if conflicts else "No conflicts found"
    )

@router.post("/", response_model=ReservationSchema)
def create_reservation(reservation: ReservationCreate, db: Session = Depends(get_db)):
    device = db.query(Device).filter(Device.device_id == reservation.device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    if reservation.end_time <= reservation.start_time:
        raise HTTPException(status_code=400, detail="End time must be after start time")
    
    if reservation.start_time < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Cannot create reservation for past time")
    
    conflicts = check_conflict(
        db, 
        reservation.device_id, 
        reservation.start_time, 
        reservation.end_time
    )
    
    if conflicts:
        conflict_times = [f"{r.start_time} to {r.end_time} by {r.user_name}" for r in conflicts]
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Reservation conflict detected",
                "conflicts": conflict_times
            }
        )
    
    db_reservation = Reservation(**reservation.model_dump())
    db.add(db_reservation)
    db.commit()
    db.refresh(db_reservation)
    return db_reservation

@router.post("/with-consumables")
def create_reservation_with_consumables(
    reservation: ReservationCreateWithConsumables,
    db: Session = Depends(get_db)
):
    device = db.query(Device).filter(Device.device_id == reservation.device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    if reservation.end_time <= reservation.start_time:
        raise HTTPException(status_code=400, detail="End time must be after start time")
    
    if reservation.start_time < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Cannot create reservation for past time")
    
    conflicts = check_conflict(
        db, 
        reservation.device_id, 
        reservation.start_time, 
        reservation.end_time
    )
    
    if conflicts:
        conflict_times = [f"{r.start_time} to {r.end_time} by {r.user_name}" for r in conflicts]
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Reservation conflict detected",
                "conflicts": conflict_times
            }
        )
    
    if reservation.consumables:
        for item in reservation.consumables:
            consumable = db.query(Consumable).filter(
                Consumable.consumable_id == item.consumable_id
            ).first()
            if not consumable:
                raise HTTPException(
                    status_code=404,
                    detail=f"Consumable {item.consumable_id} not found"
                )
            
            total_available = 0
            total_reserved = 0
            stocks = db.query(ConsumableStock).filter(
                ConsumableStock.consumable_id == item.consumable_id
            ).all()
            
            for stock in stocks:
                total_available += stock.quantity
                total_reserved += stock.reserved_quantity
            
            net_available = total_available - total_reserved
            if net_available < item.quantity:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "message": "Insufficient stock for consumable",
                        "consumable_id": item.consumable_id,
                        "consumable_name": consumable.name,
                        "available": net_available,
                        "requested": item.quantity
                    }
                )
    
    db_reservation = Reservation(
        device_id=reservation.device_id,
        user_name=reservation.user_name,
        experiment_name=reservation.experiment_name,
        start_time=reservation.start_time,
        end_time=reservation.end_time,
        notes=reservation.notes,
        status="confirmed"
    )
    db.add(db_reservation)
    db.flush()
    
    if reservation.consumables:
        for item in reservation.consumables:
            stocks = db.query(ConsumableStock).filter(
                ConsumableStock.consumable_id == item.consumable_id
            ).order_by(ConsumableStock.expiry_date.asc().nullslast()).all()
            
            remaining_to_lock = item.quantity
            for stock in stocks:
                if remaining_to_lock <= 0:
                    break
                
                available = stock.quantity - stock.reserved_quantity
                if available <= 0:
                    continue
                
                lock_amount = min(remaining_to_lock, available)
                stock.reserved_quantity += lock_amount
                remaining_to_lock -= lock_amount
                
                lock = ConsumableLock(
                    reservation_id=db_reservation.id,
                    consumable_id=item.consumable_id,
                    quantity=lock_amount
                )
                db.add(lock)
    
    db.commit()
    db.refresh(db_reservation)
    
    return {
        "message": "Reservation created with consumables locked successfully",
        "reservation": db_reservation,
        "consumables_locked": [
            {
                "consumable_id": item.consumable_id,
                "quantity": item.quantity
            }
            for item in reservation.consumables
        ] if reservation.consumables else []
    }

@router.post("/{reservation_id}/complete")
def complete_reservation(reservation_id: int, db: Session = Depends(get_db)):
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    
    locks = db.query(ConsumableLock).filter(
        ConsumableLock.reservation_id == reservation_id
    ).all()
    
    for lock in locks:
        stocks = db.query(ConsumableStock).filter(
            ConsumableStock.consumable_id == lock.consumable_id
        ).order_by(ConsumableStock.expiry_date.asc().nullslast()).all()
        
        remaining = lock.quantity
        for stock in stocks:
            if remaining <= 0:
                break
            
            available = stock.quantity - stock.reserved_quantity
            if available <= 0:
                continue
            
            deduct = min(remaining, stock.quantity)
            stock.quantity -= deduct
            stock.reserved_quantity -= min(stock.reserved_quantity, deduct)
            remaining -= deduct
        
        usage = ConsumableUsage(
            consumable_id=lock.consumable_id,
            quantity=lock.quantity,
            usage_type="experiment",
            reservation_id=reservation.id,
            device_id=reservation.device_id,
            user_name=reservation.user_name
        )
        db.add(usage)
    
    for lock in locks:
        db.delete(lock)
    
    reservation.status = "completed"
    db.commit()
    
    return {
        "message": "Reservation completed, consumables consumed",
        "id": reservation_id
    }

@router.delete("/{reservation_id}")
def cancel_reservation(reservation_id: int, db: Session = Depends(get_db)):
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    
    locks = db.query(ConsumableLock).filter(
        ConsumableLock.reservation_id == reservation_id
    ).all()
    
    for lock in locks:
        stocks = db.query(ConsumableStock).filter(
            ConsumableStock.consumable_id == lock.consumable_id
        ).all()
        
        remaining_to_unlock = lock.quantity
        for stock in stocks:
            if remaining_to_unlock <= 0:
                break
            
            unlock_amount = min(remaining_to_unlock, stock.reserved_quantity)
            stock.reserved_quantity -= unlock_amount
            remaining_to_unlock -= unlock_amount
        
        db.delete(lock)
    
    reservation.status = "cancelled"
    db.commit()
    return {"message": "Reservation cancelled successfully, locks released", "id": reservation_id}

@router.get("/{reservation_id}", response_model=ReservationSchema)
def get_reservation(reservation_id: int, db: Session = Depends(get_db)):
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    return reservation

@router.get("/{reservation_id}/consumables")
def get_reservation_consumables(reservation_id: int, db: Session = Depends(get_db)):
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    
    locks = db.query(ConsumableLock).filter(
        ConsumableLock.reservation_id == reservation_id
    ).all()
    
    result = []
    for lock in locks:
        consumable = db.query(Consumable).filter(
            Consumable.consumable_id == lock.consumable_id
        ).first()
        result.append({
            "consumable_id": lock.consumable_id,
            "name": consumable.name if consumable else "Unknown",
            "quantity": lock.quantity,
            "unit": consumable.unit if consumable else ""
        })
    
    return {
        "reservation_id": reservation_id,
        "consumables": result
    }
