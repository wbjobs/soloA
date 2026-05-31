from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional, List
from datetime import datetime, timedelta

from ..services.service_manager import ServiceManager
from ..services.root_cause_analysis import RootCauseAnalyzer
from ..services.notification_service import NotificationManager
from ..services.topology_manager import DeviceTopologyManager

router = APIRouter(prefix="/api/analysis", tags=["Advanced Analysis"])

def get_service_manager():
    return ServiceManager()

def get_root_cause_analyzer():
    return RootCauseAnalyzer()

def get_notification_manager():
    return NotificationManager()

def get_topology_manager():
    return DeviceTopologyManager()


@router.post("/root-cause/{alert_id}")
async def analyze_root_cause(
    alert_id: str,
    time_window_minutes: int = Query(30, ge=5, le=120),
    service_manager: ServiceManager = Depends(get_service_manager),
    analyzer: RootCauseAnalyzer = Depends(get_root_cause_analyzer)
):
    try:
        alerts = service_manager.alert_service.get_alerts()
        alert = next((a for a in alerts if a.get("id") == alert_id), None)
        
        if not alert:
            raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
        
        alert_time = alert["timestamp"]
        if isinstance(alert_time, str):
            alert_time = datetime.fromisoformat(alert_time)
        
        start_time = alert_time - timedelta(minutes=time_window_minutes)
        end_time = alert_time + timedelta(minutes=time_window_minutes)
        
        anomalies = service_manager.influxdb_service.query_anomalies(
            start_time=start_time,
            end_time=end_time
        )
        
        rules = service_manager.rule_miner.get_rules()
        
        analysis_result = analyzer.analyze_alert_root_cause(
            alert=alert,
            anomalies=anomalies,
            rules=rules,
            time_window_minutes=time_window_minutes
        )
        
        summary = analyzer.get_root_cause_summary(analysis_result)
        report_url = analyzer.generate_report_url(alert_id)
        
        return {
            "alert_id": alert_id,
            "analysis_result": analysis_result,
            "summary": summary,
            "report_url": report_url,
            "analysis_timestamp": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/root-cause/{alert_id}")
async def get_root_cause_analysis(
    alert_id: str,
    time_window_minutes: int = Query(30, ge=5, le=120),
    service_manager: ServiceManager = Depends(get_service_manager),
    analyzer: RootCauseAnalyzer = Depends(get_root_cause_analyzer)
):
    try:
        alerts = service_manager.alert_service.get_alerts()
        alert = next((a for a in alerts if a.get("id") == alert_id), None)
        
        if not alert:
            raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
        
        alert_time = alert["timestamp"]
        if isinstance(alert_time, str):
            alert_time = datetime.fromisoformat(alert_time)
        
        start_time = alert_time - timedelta(minutes=time_window_minutes)
        end_time = alert_time + timedelta(minutes=time_window_minutes)
        
        anomalies = service_manager.influxdb_service.query_anomalies(
            start_time=start_time,
            end_time=end_time
        )
        
        rules = service_manager.rule_miner.get_rules()
        
        analysis_result = analyzer.analyze_alert_root_cause(
            alert=alert,
            anomalies=anomalies,
            rules=rules,
            time_window_minutes=time_window_minutes
        )
        
        summary = analyzer.get_root_cause_summary(analysis_result)
        
        return {
            "alert_id": alert_id,
            "analysis": analysis_result,
            "summary": summary,
            "timestamp": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/notifications/send/{alert_id}")
async def send_alert_notification(
    alert_id: str,
    channels: Optional[str] = Query(None, description="Comma-separated: email,wechat"),
    include_root_cause: bool = Query(True),
    time_window_minutes: int = Query(30, ge=5, le=120),
    service_manager: ServiceManager = Depends(get_service_manager),
    analyzer: RootCauseAnalyzer = Depends(get_root_cause_analyzer),
    notification_manager: NotificationManager = Depends(get_notification_manager)
):
    try:
        alerts = service_manager.alert_service.get_alerts()
        alert = next((a for a in alerts if a.get("id") == alert_id), None)
        
        if not alert:
            raise HTTPException(status_code=404, detail=f"Alert {alert_id} not found")
        
        root_cause = None
        if include_root_cause:
            alert_time = alert["timestamp"]
            if isinstance(alert_time, str):
                alert_time = datetime.fromisoformat(alert_time)
            
            start_time = alert_time - timedelta(minutes=time_window_minutes)
            end_time = alert_time + timedelta(minutes=time_window_minutes)
            
            anomalies = service_manager.influxdb_service.query_anomalies(
                start_time=start_time,
                end_time=end_time
            )
            
            rules = service_manager.rule_miner.get_rules()
            
            analysis_result = analyzer.analyze_alert_root_cause(
                alert=alert,
                anomalies=anomalies,
                rules=rules,
                time_window_minutes=time_window_minutes
            )
            
            root_cause = analyzer.get_root_cause_summary(analysis_result)
        
        report_url = analyzer.generate_report_url(alert_id)
        
        channel_list = None
        if channels:
            channel_list = [c.strip().lower() for c in channels.split(",")]
        
        result = notification_manager.send_notification(
            alert=alert,
            root_cause=root_cause,
            report_url=report_url,
            channels=channel_list
        )
        
        return {
            "alert_id": alert_id,
            "notification_result": result,
            "root_cause_included": include_root_cause,
            "root_cause": root_cause,
            "report_url": report_url,
            "timestamp": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/notifications/batch")
async def send_batch_notifications(
    status: Optional[str] = Query("active", description="Filter alerts by status"),
    channels: Optional[str] = Query(None),
    include_root_cause: bool = Query(True),
    max_alerts: int = Query(10, ge=1, le=50),
    service_manager: ServiceManager = Depends(get_service_manager),
    analyzer: RootCauseAnalyzer = Depends(get_root_cause_analyzer),
    notification_manager: NotificationManager = Depends(get_notification_manager)
):
    try:
        alerts = service_manager.alert_service.get_alerts(status=status)
        
        if not alerts:
            return {
                "message": "No alerts to notify",
                "count": 0,
                "results": []
            }
        
        alerts_to_notify = alerts[:max_alerts]
        results = []
        
        for alert in alerts_to_notify:
            root_cause = None
            if include_root_cause:
                try:
                    alert_time = alert["timestamp"]
                    if isinstance(alert_time, str):
                        alert_time = datetime.fromisoformat(alert_time)
                    
                    start_time = alert_time - timedelta(minutes=30)
                    end_time = alert_time + timedelta(minutes=30)
                    
                    anomalies = service_manager.influxdb_service.query_anomalies(
                        start_time=start_time,
                        end_time=end_time
                    )
                    
                    rules = service_manager.rule_miner.get_rules()
                    
                    analysis_result = analyzer.analyze_alert_root_cause(
                        alert=alert,
                        anomalies=anomalies,
                        rules=rules,
                        time_window_minutes=30
                    )
                    
                    root_cause = analyzer.get_root_cause_summary(analysis_result)
                except Exception as e:
                    print(f"Error analyzing root cause for alert {alert.get('id')}: {e}")
            
            report_url = analyzer.generate_report_url(alert.get("id", ""))
            
            channel_list = None
            if channels:
                channel_list = [c.strip().lower() for c in channels.split(",")]
            
            result = notification_manager.send_notification(
                alert=alert,
                root_cause=root_cause,
                report_url=report_url,
                channels=channel_list
            )
            results.append(result)
        
        return {
            "message": f"Sent notifications for {len(results)} alerts",
            "count": len(results),
            "results": results,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/notifications/status")
async def get_notification_status(
    notification_manager: NotificationManager = Depends(get_notification_manager)
):
    try:
        status = notification_manager.get_service_status()
        return {
            "status": status,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/topology")
async def get_topology_summary(
    topology_manager: DeviceTopologyManager = Depends(get_topology_manager)
):
    try:
        summary = topology_manager.get_topology_summary()
        return {
            "topology": summary,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/topology/relationship")
async def add_topology_relationship(
    from_device: str,
    from_sensor: str,
    to_device: str,
    to_sensor: str,
    relationship: str = Query("connected"),
    weight: float = Query(1.0, ge=0.1, le=10.0),
    description: str = Query(""),
    bidirectional: bool = Query(False),
    topology_manager: DeviceTopologyManager = Depends(get_topology_manager)
):
    try:
        topology_manager.add_relationship(
            from_device=from_device,
            from_sensor=from_sensor,
            to_device=to_device,
            to_sensor=to_sensor,
            relationship=relationship,
            weight=weight,
            description=description,
            bidirectional=bidirectional
        )
        
        return {
            "message": "Relationship added successfully",
            "from": f"{from_device}_{from_sensor}",
            "to": f"{to_device}_{to_sensor}",
            "relationship": relationship,
            "weight": weight,
            "bidirectional": bidirectional,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/topology/neighbors")
async def get_topology_neighbors(
    device_id: str,
    sensor_type: str,
    direction: str = Query("both", description="in, out, or both"),
    topology_manager: DeviceTopologyManager = Depends(get_topology_manager)
):
    try:
        neighbors = topology_manager.get_neighbors(
            device_id=device_id,
            sensor_type=sensor_type,
            direction=direction
        )
        
        formatted_neighbors = [
            {
                "device_id": n[0],
                "sensor_type": n[1],
                "weight": n[2],
                "relationship": n[3]
            }
            for n in neighbors
        ]
        
        return {
            "node": f"{device_id}_{sensor_type}",
            "direction": direction,
            "neighbors": formatted_neighbors,
            "count": len(formatted_neighbors),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/topology/related")
async def get_related_nodes(
    device_id: str,
    sensor_type: str,
    max_depth: int = Query(3, ge=1, le=5),
    min_weight: float = Query(1.0, ge=0.1),
    topology_manager: DeviceTopologyManager = Depends(get_topology_manager)
):
    try:
        related = topology_manager.find_all_related_nodes(
            device_id=device_id,
            sensor_type=sensor_type,
            max_depth=max_depth,
            min_weight=min_weight
        )
        
        return {
            "node": f"{device_id}_{sensor_type}",
            "max_depth": max_depth,
            "min_weight": min_weight,
            "upstream": related.get("upstream", []),
            "downstream": related.get("downstream", []),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
