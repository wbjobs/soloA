from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class DeviceBase(BaseModel):
    device_id: str
    name: str
    model: Optional[str] = None
    device_type: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None

class DeviceCreate(DeviceBase):
    pass

class Device(DeviceBase):
    id: int
    status: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class SensorDataBase(BaseModel):
    device_id: str
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    pressure: Optional[float] = None
    power: Optional[float] = None
    timestamp: Optional[datetime] = None

class SensorDataCreate(SensorDataBase):
    pass

class SensorData(SensorDataBase):
    id: int
    timestamp: datetime
    
    class Config:
        from_attributes = True

class SensorDataBatch(BaseModel):
    data: List[SensorDataCreate]

class ReservationBase(BaseModel):
    device_id: str
    user_name: str
    experiment_name: Optional[str] = None
    start_time: datetime
    end_time: datetime
    notes: Optional[str] = None

class ReservationCreate(ReservationBase):
    pass

class Reservation(ReservationBase):
    id: int
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class ConflictCheckResult(BaseModel):
    has_conflict: bool
    conflicting_reservations: List[Reservation] = []
    message: str

class AlertBase(BaseModel):
    device_id: str
    alert_type: str
    message: str
    value: Optional[float] = None
    threshold: Optional[float] = None

class AlertCreate(AlertBase):
    pass

class Alert(AlertBase):
    id: int
    timestamp: datetime
    acknowledged: bool
    
    class Config:
        from_attributes = True

class DeviceWithRealtimeData(Device):
    latest_data: Optional[SensorData] = None
    active_alerts: List[Alert] = []

class ConsumableItem(BaseModel):
    consumable_id: str
    quantity: float

class ConsumableCabinetBase(BaseModel):
    cabinet_id: str
    name: str
    location: Optional[str] = None
    description: Optional[str] = None

class ConsumableCabinetCreate(ConsumableCabinetBase):
    pass

class ConsumableCabinet(ConsumableCabinetBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class ConsumableBase(BaseModel):
    consumable_id: str
    name: str
    category: Optional[str] = None
    unit: str = "个"
    safety_threshold: float = 10.0
    min_order_quantity: float = 10.0
    lead_time_days: int = 7
    description: Optional[str] = None

class ConsumableCreate(ConsumableBase):
    pass

class Consumable(ConsumableBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class ConsumableStockBase(BaseModel):
    consumable_id: str
    cabinet_id: str
    quantity: float = 0.0
    reserved_quantity: float = 0.0
    lot_number: Optional[str] = None
    expiry_date: Optional[datetime] = None

class ConsumableStockCreate(ConsumableStockBase):
    pass

class ConsumableStock(ConsumableStockBase):
    id: int
    updated_at: datetime
    
    class Config:
        from_attributes = True

class ConsumableStockWithInfo(ConsumableStock):
    consumable: Optional[Consumable] = None

class CabinetStockInfo(BaseModel):
    cabinet_id: str
    cabinet_name: str
    total_items: int
    total_quantity: float
    below_threshold_count: int
    stock_level_percentage: float

class ConsumableUsageBase(BaseModel):
    consumable_id: str
    quantity: float
    usage_type: str = "experiment"
    reservation_id: Optional[int] = None
    device_id: Optional[str] = None
    user_name: Optional[str] = None
    notes: Optional[str] = None

class ConsumableUsageCreate(ConsumableUsageBase):
    pass

class ConsumableUsage(ConsumableUsageBase):
    id: int
    timestamp: datetime
    
    class Config:
        from_attributes = True

class ConsumableLockBase(BaseModel):
    reservation_id: int
    consumable_id: str
    quantity: float

class ConsumableLock(ConsumableLockBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class ReservationCreateWithConsumables(ReservationBase):
    consumables: List[ConsumableItem] = []

class PurchaseSuggestionBase(BaseModel):
    consumable_id: str
    current_stock: float
    reserved_stock: float = 0.0
    safety_threshold: float
    daily_usage_rate: float = 0.0
    estimated_days_to_empty: Optional[float] = None
    suggested_quantity: float
    urgency_level: str = "normal"
    reason: Optional[str] = None
    status: str = "pending"

class PurchaseSuggestion(PurchaseSuggestionBase):
    id: int
    generated_at: datetime
    consumable: Optional[Consumable] = None
    
    class Config:
        from_attributes = True

class StockCheckResult(BaseModel):
    available: bool
    message: str
    shortages: List[dict] = []
    available_stocks: List[dict] = []
