from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field

class SensorDataPoint(BaseModel):
    timestamp: datetime
    device_id: str
    sensor_type: str
    value: float
    tags: Optional[Dict[str, str]] = None

class SensorDataBatch(BaseModel):
    data: List[SensorDataPoint]

class AnomalyDetectionResult(BaseModel):
    timestamp: datetime
    device_id: str
    sensor_type: str
    value: float
    is_anomaly: bool
    method: str
    score: Optional[float] = None
    details: Optional[Dict[str, Any]] = None

class AssociationRule(BaseModel):
    id: str
    antecedents: List[str]
    consequents: List[str]
    support: float
    confidence: float
    lift: float
    leverage: float
    conviction: float
    created_at: datetime

class Alert(BaseModel):
    id: str
    timestamp: datetime
    device_id: str
    sensor_type: str
    anomaly_value: float
    severity: str
    status: str
    rule_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    resolved_at: Optional[datetime] = None

class QueryParams(BaseModel):
    device_ids: Optional[List[str]] = None
    sensor_types: Optional[List[str]] = None
    start_time: datetime
    end_time: datetime
    aggregation: Optional[str] = None

class HistoricalDataUpload(BaseModel):
    device_id: str
    sensor_type: str
    data: List[Dict[str, Any]]

class StatsSummary(BaseModel):
    total_points: int
    anomaly_count: int
    alert_count: int
    devices: List[str]
    sensor_types: List[str]
    time_range: Dict[str, datetime]
