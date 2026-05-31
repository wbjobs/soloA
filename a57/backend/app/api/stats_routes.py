from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional
from datetime import datetime, timedelta

from ..services.service_manager import ServiceManager

router = APIRouter(prefix="/api/stats", tags=["Statistics"])

def get_service_manager():
    return ServiceManager()

@router.get("")
async def get_overall_stats(service_manager: ServiceManager = Depends(get_service_manager)):
    try:
        stats = service_manager.get_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/realtime")
async def get_realtime_data(
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
            start_time = end_time - timedelta(minutes=5)
        
        device_list = [d.strip() for d in device_ids.split(',')] if device_ids else None
        sensor_list = [s.strip() for s in sensor_types.split(',')] if sensor_types else None
        
        data = service_manager.get_realtime_data(
            start_time=start_time,
            end_time=end_time,
            device_ids=device_list,
            sensor_types=sensor_list
        )
        
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/devices/{device_id}")
async def get_device_stats(
    device_id: str,
    days: int = Query(7, ge=1, le=30),
    service_manager: ServiceManager = Depends(get_service_manager)
):
    try:
        end_time = datetime.now()
        start_time = end_time - timedelta(days=days)
        
        sensor_data = service_manager.influxdb_service.query_sensor_data(
            start_time=start_time,
            end_time=end_time,
            device_ids=[device_id]
        )
        
        anomalies = service_manager.influxdb_service.query_anomalies(
            start_time=start_time,
            end_time=end_time,
            device_ids=[device_id]
        )
        
        alerts = service_manager.alert_service.get_alerts(
            start_time=start_time,
            end_time=end_time,
            device_id=device_id
        )
        
        sensor_types = service_manager.influxdb_service.get_sensor_types(device_id)
        
        return {
            "device_id": device_id,
            "time_range": {
                "start": start_time.isoformat(),
                "end": end_time.isoformat()
            },
            "total_data_points": len(sensor_data),
            "anomalies_count": len(anomalies),
            "alerts_count": len(alerts),
            "sensor_types": sensor_types,
            "anomaly_rate": len(anomalies) / len(sensor_data) if sensor_data else 0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def health_check(service_manager: ServiceManager = Depends(get_service_manager)):
    try:
        devices = service_manager.influxdb_service.get_devices()
        
        return {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "influxdb_connection": "ok",
            "registered_devices": len(devices),
            "services": {
                "anomaly_detection": "available",
                "association_rules": "available",
                "alert_service": "available"
            }
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "timestamp": datetime.now().isoformat(),
            "error": str(e)
        }
