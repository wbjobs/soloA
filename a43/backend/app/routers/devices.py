from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta

from ..database import get_db
from ..models import Device, SensorData, Alert
from ..schemas import Device as DeviceSchema, DeviceCreate, SensorData as SensorDataSchema

router = APIRouter(prefix="/api/devices", tags=["devices"])

@router.get("/", response_model=List[DeviceSchema])
def get_devices(db: Session = Depends(get_db)):
    devices = db.query(Device).all()
    return devices

@router.get("/{device_id}", response_model=DeviceSchema)
def get_device(device_id: str, db: Session = Depends(get_db)):
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device

@router.post("/", response_model=DeviceSchema)
def create_device(device_data: DeviceCreate, db: Session = Depends(get_db)):
    existing = db.query(Device).filter(Device.device_id == device_data.device_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Device already exists")
    
    device = Device(**device_data.model_dump())
    db.add(device)
    db.commit()
    db.refresh(device)
    return device

@router.get("/{device_id}/realtime")
def get_device_realtime_data(device_id: str, db: Session = Depends(get_db)):
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    latest_data = db.query(SensorData).filter(
        SensorData.device_id == device_id
    ).order_by(SensorData.timestamp.desc()).first()
    
    active_alerts = db.query(Alert).filter(
        Alert.device_id == device_id,
        Alert.acknowledged == False
    ).all()
    
    return {
        "device": device,
        "latest_data": latest_data,
        "active_alerts": active_alerts
    }

@router.get("/{device_id}/history")
def get_device_history(
    device_id: str,
    hours: int = 1,
    db: Session = Depends(get_db)
):
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    since = datetime.utcnow() - timedelta(hours=hours)
    data = db.query(SensorData).filter(
        SensorData.device_id == device_id,
        SensorData.timestamp >= since
    ).order_by(SensorData.timestamp.asc()).all()
    
    return {
        "device_id": device_id,
        "time_range_hours": hours,
        "data_points": len(data),
        "data": data
    }
