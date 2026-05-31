from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Depends
from typing import List, Optional
from datetime import datetime, timedelta
import pandas as pd
import io

from ..models.schemas import (
    SensorDataPoint,
    SensorDataBatch,
    QueryParams,
    HistoricalDataUpload
)
from ..services.service_manager import ServiceManager

router = APIRouter(prefix="/api/data", tags=["Data Ingestion & Query"])

def get_service_manager():
    return ServiceManager()

@router.post("/ingest", status_code=201)
async def ingest_sensor_data(
    batch: SensorDataBatch,
    service_manager: ServiceManager = Depends(get_service_manager)
):
    try:
        service_manager.influxdb_service.write_sensor_data(batch.data)
        
        service_manager.process_sensor_data(batch.data)
        
        return {
            "message": "Data ingested successfully",
            "count": len(batch.data),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/ingest/single", status_code=201)
async def ingest_single_data_point(
    data_point: SensorDataPoint,
    service_manager: ServiceManager = Depends(get_service_manager)
):
    try:
        service_manager.influxdb_service.write_sensor_data([data_point])
        
        batch = SensorDataBatch(data=[data_point])
        service_manager.process_sensor_data(batch.data)
        
        return {
            "message": "Data point ingested successfully",
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload/csv")
async def upload_csv_file(
    file: UploadFile = File(...),
    device_id: Optional[str] = Query(None, description="Device ID for all data points"),
    sensor_type: Optional[str] = Query(None, description="Sensor type for all data points"),
    service_manager: ServiceManager = Depends(get_service_manager)
):
    try:
        if not file.filename.endswith('.csv'):
            raise HTTPException(status_code=400, detail="Only CSV files are allowed")
        
        content = await file.read()
        df = pd.read_csv(io.StringIO(content.decode('utf-8')))
        
        required_cols = ['timestamp', 'value']
        for col in required_cols:
            if col not in df.columns:
                raise HTTPException(status_code=400, detail=f"Missing required column: {col}")
        
        if 'device_id' not in df.columns and not device_id:
            raise HTTPException(
                status_code=400,
                detail="device_id must be in CSV or provided as parameter"
            )
        
        if 'sensor_type' not in df.columns and not sensor_type:
            raise HTTPException(
                status_code=400,
                detail="sensor_type must be in CSV or provided as parameter"
            )
        
        data_points = []
        for _, row in df.iterrows():
            ts = pd.to_datetime(row['timestamp']).to_pydatetime()
            
            point = SensorDataPoint(
                timestamp=ts,
                device_id=row.get('device_id', device_id),
                sensor_type=row.get('sensor_type', sensor_type),
                value=float(row['value'])
            )
            data_points.append(point)
        
        batch = SensorDataBatch(data=data_points)
        service_manager.influxdb_service.write_sensor_data(batch.data)
        
        return {
            "message": "CSV file uploaded successfully",
            "count": len(data_points),
            "filename": file.filename,
            "timestamp": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/query")
async def query_sensor_data(
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    device_ids: Optional[str] = Query(None, description="Comma-separated list of device IDs"),
    sensor_types: Optional[str] = Query(None, description="Comma-separated list of sensor types"),
    service_manager: ServiceManager = Depends(get_service_manager)
):
    try:
        if not end_time:
            end_time = datetime.now()
        
        if not start_time:
            start_time = end_time - timedelta(hours=1)
        
        device_list = [d.strip() for d in device_ids.split(',')] if device_ids else None
        sensor_list = [s.strip() for s in sensor_types.split(',')] if sensor_types else None
        
        data = service_manager.influxdb_service.query_sensor_data(
            start_time=start_time,
            end_time=end_time,
            device_ids=device_list,
            sensor_types=sensor_list
        )
        
        return {
            "count": len(data),
            "data": data,
            "query_params": {
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "device_ids": device_list,
                "sensor_types": sensor_list
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/devices")
async def get_devices(service_manager: ServiceManager = Depends(get_service_manager)):
    try:
        devices = service_manager.influxdb_service.get_devices()
        return {
            "devices": devices,
            "count": len(devices)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/devices/{device_id}/sensors")
async def get_sensor_types_for_device(
    device_id: str,
    service_manager: ServiceManager = Depends(get_service_manager)
):
    try:
        sensors = service_manager.influxdb_service.get_sensor_types(device_id)
        return {
            "device_id": device_id,
            "sensor_types": sensors,
            "count": len(sensors)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sensors")
async def get_all_sensor_types(service_manager: ServiceManager = Depends(get_service_manager)):
    try:
        sensors = service_manager.influxdb_service.get_sensor_types()
        return {
            "sensor_types": sensors,
            "count": len(sensors)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/batch/analyze")
async def run_batch_analysis(
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    device_ids: Optional[str] = Query(None, description="Comma-separated list of device IDs"),
    service_manager: ServiceManager = Depends(get_service_manager)
):
    try:
        if not end_time:
            end_time = datetime.now()
        
        if not start_time:
            start_time = end_time - timedelta(days=7)
        
        device_list = [d.strip() for d in device_ids.split(',')] if device_ids else None
        
        results = service_manager.run_batch_analysis(
            start_time=start_time,
            end_time=end_time,
            device_ids=device_list
        )
        
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
