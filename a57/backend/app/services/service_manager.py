from typing import Dict, Optional
from datetime import datetime, timedelta

from .influxdb_service import InfluxDBService
from .anomaly_detection import CombinedAnomalyDetector
from .association_rules import AssociationRuleMiner
from .alert_service import AlertService

class ServiceManager:
    _instance: Optional['ServiceManager'] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        
        self.influxdb_service = InfluxDBService()
        self.anomaly_detectors: Dict[str, CombinedAnomalyDetector] = {}
        self.rule_miner = AssociationRuleMiner()
        self.alert_service = AlertService(self.influxdb_service)
        self._initialized = True

    def get_or_create_detector(self, device_id: str, sensor_type: str) -> CombinedAnomalyDetector:
        key = f"{device_id}_{sensor_type}"
        
        if key not in self.anomaly_detectors:
            self.anomaly_detectors[key] = CombinedAnomalyDetector()
        
        return self.anomaly_detectors[key]

    def process_sensor_data(self, data_points):
        for dp in data_points:
            detector = self.get_or_create_detector(dp.device_id, dp.sensor_type)
            
            try:
                if not detector.fitted:
                    from datetime import timedelta
                    
                    end_time = dp.timestamp
                    start_time = end_time - timedelta(hours=24)
                    
                    historical_data = self.influxdb_service.query_sensor_data(
                        start_time=start_time,
                        end_time=end_time,
                        device_ids=[dp.device_id],
                        sensor_types=[dp.sensor_type]
                    )
                    
                    if len(historical_data) >= 10:
                        values = [d["value"] for d in historical_data]
                        detector.fit(values)
                
                if detector.fitted:
                    anomalies = detector.detect(
                        timestamp=dp.timestamp,
                        device_id=dp.device_id,
                        sensor_type=dp.sensor_type,
                        value=dp.value
                    )
                    
                    for anomaly in anomalies:
                        self.influxdb_service.write_anomaly(anomaly)
                        self.alert_service.generate_alert(anomaly)
            
            except Exception as e:
                print(f"Error processing sensor data: {e}")

    def run_batch_analysis(
        self,
        start_time: datetime,
        end_time: datetime,
        device_ids: Optional[list] = None
    ) -> Dict:
        sensor_data = self.influxdb_service.query_sensor_data(
            start_time=start_time,
            end_time=end_time,
            device_ids=device_ids
        )
        
        if not sensor_data:
            return {"message": "No data found for analysis", "anomalies": [], "alerts": [], "rules": []}
        
        anomalies = []
        grouped_data = {}
        
        for dp in sensor_data:
            key = f"{dp['device_id']}_{dp['sensor_type']}"
            if key not in grouped_data:
                grouped_data[key] = []
            grouped_data[key].append(dp)
        
        for key, data_points in grouped_data.items():
            detector = self.get_or_create_detector(
                data_points[0]["device_id"],
                data_points[0]["sensor_type"]
            )
            
            values = [d["value"] for d in data_points]
            detector.fit(values)
            
            batch_anomalies = detector.detect_batch(data_points)
            anomalies.extend(batch_anomalies)
            
            for anomaly in batch_anomalies:
                self.influxdb_service.write_anomaly(anomaly)
        
        rules = []
        if len(anomalies) >= 5:
            rules = self.rule_miner.mine_rules(anomalies)
        
        alerts = self.alert_service.generate_alerts_batch(anomalies, rules)
        
        return {
            "total_data_points": len(sensor_data),
            "anomalies_found": len(anomalies),
            "alerts_generated": len(alerts),
            "rules_mined": len(rules),
            "anomalies": anomalies,
            "alerts": [alert.dict() for alert in alerts],
            "rules": rules
        }

    def get_realtime_data(
        self,
        start_time: datetime,
        end_time: datetime,
        device_ids: Optional[list] = None,
        sensor_types: Optional[list] = None
    ) -> Dict:
        sensor_data = self.influxdb_service.query_sensor_data(
            start_time=start_time,
            end_time=end_time,
            device_ids=device_ids,
            sensor_types=sensor_types
        )
        
        anomalies = self.influxdb_service.query_anomalies(
            start_time=start_time,
            end_time=end_time,
            device_ids=device_ids
        )
        
        return {
            "sensor_data": sensor_data,
            "anomalies": anomalies,
            "timestamp": datetime.now().isoformat()
        }

    def get_stats(self) -> Dict:
        from datetime import timedelta
        
        end_time = datetime.now()
        start_time = end_time - timedelta(days=30)
        
        sensor_data = self.influxdb_service.query_sensor_data(
            start_time=start_time,
            end_time=end_time
        )
        
        anomalies = self.influxdb_service.query_anomalies(
            start_time=start_time,
            end_time=end_time
        )
        
        devices = self.influxdb_service.get_devices()
        sensor_types = self.influxdb_service.get_sensor_types()
        
        alert_stats = self.alert_service.get_alert_stats()
        
        return {
            "total_points": len(sensor_data),
            "anomaly_count": len(anomalies),
            **alert_stats,
            "devices": devices,
            "sensor_types": sensor_types,
            "time_range": {
                "start": start_time.isoformat(),
                "end": end_time.isoformat()
            }
        }

    def close(self):
        self.influxdb_service.close()
