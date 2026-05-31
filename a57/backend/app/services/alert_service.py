import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional

from ..models.schemas import Alert

class AlertService:
    def __init__(self, influxdb_service):
        self.influxdb_service = influxdb_service
        self.alert_cooldown: Dict[str, datetime] = {}
        self.cooldown_minutes = 5

    def _calculate_severity(self, anomaly: Dict[str, Any]) -> str:
        method = anomaly.get("method", "")
        score = anomaly.get("score", 0)
        
        if method == "3sigma":
            if score >= 5.0:
                return "critical"
            elif score >= 4.0:
                return "high"
            elif score >= 3.0:
                return "medium"
            else:
                return "low"
        else:
            if score >= 0.8:
                return "critical"
            elif score >= 0.6:
                return "high"
            elif score >= 0.4:
                return "medium"
            else:
                return "low"

    def _is_in_cooldown(self, device_id: str, sensor_type: str, method: str) -> bool:
        key = f"{device_id}_{sensor_type}_{method}"
        if key not in self.alert_cooldown:
            return False
        
        cooldown_end = self.alert_cooldown[key]
        if datetime.now() < cooldown_end:
            return True
        
        del self.alert_cooldown[key]
        return False

    def _set_cooldown(self, device_id: str, sensor_type: str, method: str):
        from datetime import timedelta
        key = f"{device_id}_{sensor_type}_{method}"
        self.alert_cooldown[key] = datetime.now() + timedelta(minutes=self.cooldown_minutes)

    def generate_alert(
        self,
        anomaly: Dict[str, Any],
        rule_id: Optional[str] = None
    ) -> Optional[Alert]:
        device_id = anomaly["device_id"]
        sensor_type = anomaly["sensor_type"]
        method = anomaly["method"]
        
        if self._is_in_cooldown(device_id, sensor_type, method):
            return None
        
        severity = self._calculate_severity(anomaly)
        
        alert = Alert(
            id=str(uuid.uuid4()),
            timestamp=anomaly["timestamp"],
            device_id=device_id,
            sensor_type=sensor_type,
            anomaly_value=anomaly["value"],
            severity=severity,
            status="active",
            rule_id=rule_id,
            details=anomaly.get("details", {})
        )
        
        self.influxdb_service.write_alert(alert)
        self._set_cooldown(device_id, sensor_type, method)
        
        return alert

    def generate_alerts_batch(
        self,
        anomalies: List[Dict[str, Any]],
        rules: Optional[List[Dict[str, Any]]] = None
    ) -> List[Alert]:
        alerts = []
        
        for anomaly in anomalies:
            matching_rule = None
            if rules:
                for rule in rules:
                    antecedents = rule["antecedents"]
                    anomaly_key = f"{anomaly['device_id']}_{anomaly['sensor_type']}_{anomaly['method']}"
                    
                    if anomaly_key in antecedents:
                        matching_rule = rule
                        break
            
            alert = self.generate_alert(
                anomaly,
                rule_id=matching_rule["id"] if matching_rule else None
            )
            
            if alert:
                alerts.append(alert)
        
        return alerts

    def get_alerts(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        status: Optional[str] = None,
        device_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        return self.influxdb_service.query_alerts(
            start_time=start_time,
            end_time=end_time,
            status=status,
            device_id=device_id
        )

    def resolve_alert(self, alert_id: str) -> bool:
        self.influxdb_service.update_alert_status(
            alert_id=alert_id,
            status="resolved",
            resolved_at=datetime.now()
        )
        return True

    def get_alert_stats(self) -> Dict[str, Any]:
        from datetime import timedelta
        
        now = datetime.now()
        last_24h = now - timedelta(hours=24)
        last_7d = now - timedelta(days=7)
        
        all_alerts = self.get_alerts()
        last_24h_alerts = self.get_alerts(start_time=last_24h)
        last_7d_alerts = self.get_alerts(start_time=last_7d)
        
        active_alerts = [a for a in all_alerts if a.get("status") == "active"]
        
        severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        for alert in all_alerts:
            severity = alert.get("severity", "low")
            if severity in severity_counts:
                severity_counts[severity] += 1
        
        return {
            "total_alerts": len(all_alerts),
            "active_alerts": len(active_alerts),
            "alerts_last_24h": len(last_24h_alerts),
            "alerts_last_7d": len(last_7d_alerts),
            "severity_distribution": severity_counts
        }
