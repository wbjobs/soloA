from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timedelta

from ..database import get_db
from ..models import SensorData, Device
from ..schemas import SensorDataCreate, SensorDataBatch
from ..alert_engine import alert_engine

router = APIRouter(prefix="/api/sensor-data", tags=["sensor_data"])

@router.post("/batch")
def batch_insert_sensor_data(batch: SensorDataBatch, db: Session = Depends(get_db)):
    if not batch.data:
        raise HTTPException(status_code=400, detail="No data provided")
    
    db_data = []
    for item in batch.data:
        data_dict = item.model_dump()
        if "timestamp" not in data_dict or data_dict["timestamp"] is None:
            data_dict["timestamp"] = datetime.utcnow()
        db_data.append(SensorData(**data_dict))
    
    db.bulk_save_objects(db_data)
    db.commit()
    
    return {
        "message": "Batch insert successful",
        "count": len(db_data)
    }

@router.post("/")
def insert_sensor_data(data: SensorDataCreate, db: Session = Depends(get_db)):
    device = db.query(Device).filter(Device.device_id == data.device_id).first()
    if not device:
        device = Device(
            device_id=data.device_id,
            name=f"Device {data.device_id}",
            device_type=data.device_id.split("_")[0] if "_" in data.device_id else "unknown"
        )
        db.add(device)
        db.commit()
        db.refresh(device)
    
    db_data = SensorData(**data.model_dump())
    if not db_data.timestamp:
        db_data.timestamp = datetime.utcnow()
    
    db.add(db_data)
    db.commit()
    db.refresh(db_data)
    
    return {
        "message": "Data inserted successfully",
        "id": db_data.id
    }

@router.get("/range")
def get_sensor_data_range(
    device_id: str,
    start_time: datetime = None,
    end_time: datetime = None,
    hours: int = 24,
    db: Session = Depends(get_db)
):
    device = db.query(Device).filter(Device.device_id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    
    if end_time is None:
        end_time = datetime.utcnow()
    if start_time is None:
        start_time = end_time - timedelta(hours=hours)
    
    data = db.query(SensorData).filter(
        SensorData.device_id == device_id,
        SensorData.timestamp >= start_time,
        SensorData.timestamp <= end_time
    ).order_by(SensorData.timestamp.asc()).all()
    
    return {
        "device_id": device_id,
        "start_time": start_time,
        "end_time": end_time,
        "count": len(data),
        "data": data
    }
