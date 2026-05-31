from datetime import datetime
from typing import List, Dict, Any, Optional
from .models import Alert, AlertRule, Device, SensorData

DEFAULT_RULES = [
    {"parameter": "temperature", "min_value": 15, "max_value": 35, "operator": "range", "description": "温度正常范围15-35°C"},
    {"parameter": "temperature", "max_value": 40, "operator": ">", "description": "高温告警阈值40°C"},
    {"parameter": "temperature", "min_value": 10, "operator": "<", "description": "低温告警阈值10°C"},
    {"parameter": "humidity", "min_value": 30, "max_value": 70, "operator": "range", "description": "湿度正常范围30-70%"},
    {"parameter": "humidity", "max_value": 85, "operator": ">", "description": "高湿告警阈值85%"},
    {"parameter": "humidity", "min_value": 20, "operator": "<", "description": "低湿告警阈值20%"},
    {"parameter": "power", "max_value": 5000, "operator": ">", "description": "功率告警阈值5000W"},
]

class AlertEngine:
    def __init__(self):
        self.latest_sensor_data: List[Dict] = []
        self.alert_callbacks = []

    def register_callback(self, callback):
        self.alert_callbacks.append(callback)

    def get_latest_data(self):
        return self.latest_sensor_data

    def check_and_alert(self, db_session, device: Device, sensor_data: SensorData) -> List[Alert]:
        alerts = []
        
        rules = db_session.query(AlertRule).filter(AlertRule.enabled == True).all()
        if not rules:
            rules = self._get_default_rules()
        
        for rule in rules:
            if rule.device_type and device.device_type != rule.device_type:
                continue
            
            value = None
            if rule.parameter == "temperature":
                value = sensor_data.temperature
            elif rule.parameter == "humidity":
                value = sensor_data.humidity
            elif rule.parameter == "pressure":
                value = sensor_data.pressure
            elif rule.parameter == "power":
                value = sensor_data.power
            
            if value is None:
                continue
            
            if self._check_rule(rule, value):
                alert = self._create_alert(device.device_id, rule, value)
                db_session.add(alert)
                alerts.append(alert)
                
                if device.status != "error":
                    device.status = "error"
                
                for callback in self.alert_callbacks:
                    try:
                        callback({
                            "device_id": device.device_id,
                            "device_name": device.name,
                            "alert_type": alert.alert_type,
                            "message": alert.message,
                            "value": alert.value,
                            "threshold": alert.threshold,
                            "timestamp": alert.timestamp.isoformat()
                        })
                    except Exception as e:
                        print(f"[AlertEngine] Callback error: {e}")
        
        db_session.commit()
        return alerts

    def _get_default_rules(self):
        return [
            AlertRule(**rule) for rule in DEFAULT_RULES
        ]

    def _check_rule(self, rule: AlertRule, value: float) -> bool:
        if rule.operator == ">" and rule.max_value is not None:
            return value > rule.max_value
        elif rule.operator == "<" and rule.min_value is not None:
            return value < rule.min_value
        elif rule.operator == "range":
            if rule.min_value is not None and rule.max_value is not None:
                return value < rule.min_value or value > rule.max_value
            elif rule.min_value is not None:
                return value < rule.min_value
            elif rule.max_value is not None:
                return value > rule.max_value
        elif rule.operator == ">=":
            return value >= rule.max_value
        elif rule.operator == "<=":
            return value <= rule.min_value
        return False

    def _create_alert(self, device_id: str, rule: AlertRule, value: float) -> Alert:
        threshold = rule.max_value if rule.max_value is not None else rule.min_value
        return Alert(
            device_id=device_id,
            alert_type=f"{rule.parameter}_alert",
            message=f"{rule.description} - 当前值: {value}",
            value=value,
            threshold=threshold,
            timestamp=datetime.utcnow(),
            acknowledged=False
        )

    def get_active_alerts(self, db_session, device_id: Optional[str] = None):
        query = db_session.query(Alert).filter(Alert.acknowledged == False)
        if device_id:
            query = query.filter(Alert.device_id == device_id)
        return query.order_by(Alert.timestamp.desc()).all()

alert_engine = AlertEngine()
