from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional
from datetime import datetime, timedelta

from ..services.service_manager import ServiceManager

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])

def get_service_manager():
    return ServiceManager()

@router.get("")
async def get_alerts(
    status: Optional[str] = Query(None, description="Filter by status: active, resolved"),
    device_id: Optional[str] = Query(None),
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    service_manager: ServiceManager = Depends(get_service_manager)
):
    try:
        alerts = service_manager.alert_service.get_alerts(
            start_time=start_time,
            end_time=end_time,
            status=status,
            device_id=device_id
        )
        
        return {
            "count": len(alerts),
            "alerts": alerts,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/stats")
async def get_alert_stats(service_manager: ServiceManager = Depends(get_service_manager)):
    try:
        stats = service_manager.alert_service.get_alert_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{alert_id}")
async def get_alert_by_id(
    alert_id: str,
    service_manager: ServiceManager = Depends(get_service_manager)
):
    try:
        alerts = service_manager.alert_service.get_alerts()
        alert = next((a for a in alerts if a.get("id") == alert_id), None)
        
        if not alert:
            raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
        
        return alert
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{alert_id}/resolve")
async def resolve_alert(
    alert_id: str,
    service_manager: ServiceManager = Depends(get_service_manager)
):
    try:
        service_manager.alert_service.resolve_alert(alert_id)
        
        return {
            "message": f"Alert {alert_id} resolved successfully",
            "alert_id": alert_id,
            "resolved_at": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{alert_id}/trace")
async def get_alert_traceability(
    alert_id: str,
    cross_device: bool = Query(True, description="Include anomalies from other devices in the same time window"),
    time_window_minutes: int = Query(30, ge=5, le=120, description="Time window in minutes"),
    service_manager: ServiceManager = Depends(get_service_manager)
):
    try:
        alerts = service_manager.alert_service.get_alerts()
        alert = next((a for a in alerts if a.get("id") == alert_id), None)
        
        if not alert:
            raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
        
        alert_time = alert["timestamp"]
        alert_device = alert["device_id"]
        alert_sensor = alert["sensor_type"]
        
        from datetime import timedelta
        start_time = alert_time - timedelta(minutes=time_window_minutes)
        end_time = alert_time + timedelta(minutes=time_window_minutes)
        
        primary_historical = service_manager.influxdb_service.query_sensor_data(
            start_time=start_time,
            end_time=end_time,
            device_ids=[alert_device],
            sensor_types=[alert_sensor]
        )
        
        primary_anomalies = service_manager.influxdb_service.query_anomalies(
            start_time=start_time,
            end_time=end_time,
            device_ids=[alert_device]
        )
        
        cross_device_anomalies = []
        cross_device_alerts = []
        cross_device_data = []
        
        if cross_device:
            cross_device_anomalies = service_manager.influxdb_service.query_anomalies(
                start_time=start_time,
                end_time=end_time
            )
            
            cross_device_anomalies = [
                a for a in cross_device_anomalies 
                if a.get("device_id") != alert_device
            ]
            
            all_alerts_in_window = service_manager.alert_service.get_alerts(
                start_time=start_time,
                end_time=end_time
            )
            
            cross_device_alerts = [
                a for a in all_alerts_in_window 
                if a.get("device_id") != alert_device and a.get("id") != alert_id
            ]
            
            other_devices = set(
                a.get("device_id") for a in cross_device_anomalies + cross_device_alerts
                if a.get("device_id")
            )
            
            if other_devices:
                cross_device_data = service_manager.influxdb_service.query_sensor_data(
                    start_time=start_time,
                    end_time=end_time,
                    device_ids=list(other_devices)
                )
        
        return {
            "alert": alert,
            "time_window": {
                "start": start_time.isoformat(),
                "end": end_time.isoformat(),
                "window_minutes": time_window_minutes,
                "cross_device_enabled": cross_device
            },
            "primary_device_data": {
                "device_id": alert_device,
                "historical_data": primary_historical,
                "anomalies": primary_anomalies,
                "data_points_count": len(primary_historical),
                "anomalies_count": len(primary_anomalies)
            },
            "cross_device_data": {
                "anomalies": cross_device_anomalies,
                "anomalies_count": len(cross_device_anomalies),
                "alerts": cross_device_alerts,
                "alerts_count": len(cross_device_alerts),
                "sensor_data": cross_device_data,
                "affected_devices": list(set(
                    a.get("device_id") for a in cross_device_anomalies + cross_device_alerts
                    if a.get("device_id")
                ))
            },
            "historical_data": primary_historical,
            "related_anomalies": primary_anomalies + cross_device_anomalies,
            "total_data_points": len(primary_historical) + len(cross_device_data),
            "related_anomalies_count": len(primary_anomalies) + len(cross_device_anomalies)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
