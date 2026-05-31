import uuid
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from influxdb_client import InfluxDBClient, Point, WritePrecision
from influxdb_client.client.write_api import SYNCHRONOUS
from influxdb_client.client.query_api import QueryApi

from ..config import settings
from ..models.schemas import SensorDataPoint, Alert, AssociationRule

class InfluxDBService:
    def __init__(self):
        self.client = InfluxDBClient(
            url=settings.INFLUXDB_URL,
            token=settings.INFLUXDB_TOKEN,
            org=settings.INFLUXDB_ORG
        )
        self.write_api = self.client.write_api(write_options=SYNCHRONOUS)
        self.query_api = self.client.query_api()
        self.bucket = settings.INFLUXDB_BUCKET
        self.org = settings.INFLUXDB_ORG

    def write_sensor_data(self, data_points: List[SensorDataPoint]):
        points = []
        for dp in data_points:
            point = Point("sensor_data") \
                .tag("device_id", dp.device_id) \
                .tag("sensor_type", dp.sensor_type) \
                .field("value", dp.value) \
                .time(dp.timestamp, WritePrecision.NS)
            
            if dp.tags:
                for key, value in dp.tags.items():
                    point = point.tag(key, value)
            
            points.append(point)
        
        self.write_api.write(bucket=self.bucket, org=self.org, record=points)

    def query_sensor_data(
        self,
        start_time: datetime,
        end_time: datetime,
        device_ids: Optional[List[str]] = None,
        sensor_types: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        filter_conditions = []
        
        if device_ids:
            device_filter = " or ".join([f'r.device_id == "{d}"' for d in device_ids])
            filter_conditions.append(f"({device_filter})")
        
        if sensor_types:
            sensor_filter = " or ".join([f'r.sensor_type == "{s}"' for s in sensor_types])
            filter_conditions.append(f"({sensor_filter})")
        
        filter_str = " and ".join(filter_conditions) if filter_conditions else "true"
        
        query = f'''
            from(bucket: "{self.bucket}")
            |> range(start: {start_time.isoformat()}, stop: {end_time.isoformat()})
            |> filter(fn: (r) => r._measurement == "sensor_data" and {filter_str})
            |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
            |> keep(columns: ["_time", "device_id", "sensor_type", "value"])
            |> sort(columns: ["_time"])
        '''
        
        tables = self.query_api.query(query, org=self.org)
        
        results = []
        for table in tables:
            for record in table.records:
                results.append({
                    "timestamp": record.get_time(),
                    "device_id": record.values.get("device_id"),
                    "sensor_type": record.values.get("sensor_type"),
                    "value": record.values.get("value")
                })
        
        return results

    def write_anomaly(self, anomaly: Dict[str, Any]):
        point = Point("anomalies") \
            .tag("device_id", anomaly["device_id"]) \
            .tag("sensor_type", anomaly["sensor_type"]) \
            .tag("method", anomaly["method"]) \
            .field("value", anomaly["value"]) \
            .field("score", anomaly.get("score", 0.0)) \
            .time(anomaly["timestamp"], WritePrecision.NS)
        
        self.write_api.write(bucket=self.bucket, org=self.org, record=point)

    def query_anomalies(
        self,
        start_time: datetime,
        end_time: datetime,
        device_ids: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        filter_conditions = []
        
        if device_ids:
            device_filter = " or ".join([f'r.device_id == "{d}"' for d in device_ids])
            filter_conditions.append(f"({device_filter})")
        
        filter_str = " and ".join(filter_conditions) if filter_conditions else "true"
        
        query = f'''
            from(bucket: "{self.bucket}")
            |> range(start: {start_time.isoformat()}, stop: {end_time.isoformat()})
            |> filter(fn: (r) => r._measurement == "anomalies" and {filter_str})
            |> sort(columns: ["_time"])
        '''
        
        tables = self.query_api.query(query, org=self.org)
        
        results = []
        for table in tables:
            for record in table.records:
                results.append({
                    "timestamp": record.get_time(),
                    "device_id": record.values.get("device_id"),
                    "sensor_type": record.values.get("sensor_type"),
                    "value": record.values.get("value"),
                    "method": record.values.get("method"),
                    "score": record.values.get("score")
                })
        
        return results

    def write_alert(self, alert: Alert):
        point = Point("alerts") \
            .tag("alert_id", alert.id) \
            .tag("device_id", alert.device_id) \
            .tag("sensor_type", alert.sensor_type) \
            .tag("severity", alert.severity) \
            .tag("status", alert.status) \
            .field("anomaly_value", alert.anomaly_value) \
            .time(alert.timestamp, WritePrecision.NS)
        
        if alert.rule_id:
            point = point.tag("rule_id", alert.rule_id)
        
        self.write_api.write(bucket=self.bucket, org=self.org, record=point)

    def query_alerts(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        status: Optional[str] = None,
        device_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        start = start_time.isoformat() if start_time else "-30d"
        end = end_time.isoformat() if end_time else "now()"
        
        filter_conditions = ['r._measurement == "alerts"']
        
        if status:
            filter_conditions.append(f'r.status == "{status}"')
        
        if device_id:
            filter_conditions.append(f'r.device_id == "{device_id}"')
        
        filter_str = " and ".join(filter_conditions)
        
        query = f'''
            from(bucket: "{self.bucket}")
            |> range(start: {start}, stop: {end})
            |> filter(fn: (r) => {filter_str})
            |> sort(columns: ["_time"], desc: true)
        '''
        
        tables = self.query_api.query(query, org=self.org)
        
        results = []
        for table in tables:
            for record in table.records:
                results.append({
                    "id": record.values.get("alert_id"),
                    "timestamp": record.get_time(),
                    "device_id": record.values.get("device_id"),
                    "sensor_type": record.values.get("sensor_type"),
                    "anomaly_value": record.values.get("anomaly_value"),
                    "severity": record.values.get("severity"),
                    "status": record.values.get("status"),
                    "rule_id": record.values.get("rule_id")
                })
        
        return results

    def update_alert_status(self, alert_id: str, status: str, resolved_at: Optional[datetime] = None):
        query = f'''
            from(bucket: "{self.bucket}")
            |> range(start: -30d)
            |> filter(fn: (r) => r._measurement == "alerts" and r.alert_id == "{alert_id}")
            |> limit(n: 1)
        '''
        
        tables = self.query_api.query(query, org=self.org)
        
        if tables and len(tables) > 0:
            record = tables[0].records[0]
            point = Point("alerts") \
                .tag("alert_id", alert_id) \
                .tag("device_id", record.values.get("device_id")) \
                .tag("sensor_type", record.values.get("sensor_type")) \
                .tag("severity", record.values.get("severity")) \
                .tag("status", status) \
                .field("anomaly_value", record.values.get("anomaly_value")) \
                .time(record.get_time(), WritePrecision.NS)
            
            if resolved_at:
                point = point.field("resolved_at", resolved_at.isoformat())
            
            self.write_api.write(bucket=self.bucket, org=self.org, record=point)

    def get_devices(self) -> List[str]:
        query = f'''
            import "influxdata/influxdb/schema"
            schema.tagValues(bucket: "{self.bucket}", tag: "device_id")
        '''
        tables = self.query_api.query(query, org=self.org)
        
        devices = []
        for table in tables:
            for record in table.records:
                devices.append(record.values.get("_value"))
        
        return list(set(devices))

    def get_sensor_types(self, device_id: Optional[str] = None) -> List[str]:
        filter_str = f'r.device_id == "{device_id}"' if device_id else "true"
        
        query = f'''
            from(bucket: "{self.bucket}")
            |> range(start: -30d)
            |> filter(fn: (r) => r._measurement == "sensor_data" and {filter_str})
            |> keep(columns: ["sensor_type"])
            |> distinct(column: "sensor_type")
        '''
        
        tables = self.query_api.query(query, org=self.org)
        
        sensor_types = []
        for table in tables:
            for record in table.records:
                sensor_types.append(record.values.get("_value"))
        
        return list(set(sensor_types))

    def close(self):
        self.client.close()
