from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base

class ConsumableCabinet(Base):
    __tablename__ = "consumable_cabinets"
    
    id = Column(Integer, primary_key=True, index=True)
    cabinet_id = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    location = Column(String(100))
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    stocks = relationship("ConsumableStock", back_populates="cabinet", cascade="all, delete-orphan")

class Consumable(Base):
    __tablename__ = "consumables"
    
    id = Column(Integer, primary_key=True, index=True)
    consumable_id = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    category = Column(String(50))
    unit = Column(String(20), default="个")
    safety_threshold = Column(Float, default=10.0)
    min_order_quantity = Column(Float, default=10.0)
    lead_time_days = Column(Integer, default=7)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    stocks = relationship("ConsumableStock", back_populates="consumable", cascade="all, delete-orphan")
    usage_records = relationship("ConsumableUsage", back_populates="consumable", cascade="all, delete-orphan")
    locks = relationship("ConsumableLock", back_populates="consumable", cascade="all, delete-orphan")
    suggestions = relationship("PurchaseSuggestion", back_populates="consumable", cascade="all, delete-orphan")

class ConsumableStock(Base):
    __tablename__ = "consumable_stocks"
    
    id = Column(Integer, primary_key=True, index=True)
    consumable_id = Column(String(50), ForeignKey("consumables.consumable_id"), nullable=False, index=True)
    cabinet_id = Column(String(50), ForeignKey("consumable_cabinets.cabinet_id"), nullable=False, index=True)
    quantity = Column(Float, default=0.0)
    reserved_quantity = Column(Float, default=0.0)
    lot_number = Column(String(100))
    expiry_date = Column(DateTime)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    consumable = relationship("Consumable", back_populates="stocks")
    cabinet = relationship("ConsumableCabinet", back_populates="stocks")

class ConsumableUsage(Base):
    __tablename__ = "consumable_usage"
    
    id = Column(Integer, primary_key=True, index=True)
    consumable_id = Column(String(50), ForeignKey("consumables.consumable_id"), nullable=False, index=True)
    quantity = Column(Float, nullable=False)
    usage_type = Column(String(20), default="experiment")
    reservation_id = Column(Integer, ForeignKey("reservations.id"), nullable=True)
    device_id = Column(String(50), nullable=True)
    user_name = Column(String(100))
    notes = Column(Text)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    
    consumable = relationship("Consumable", back_populates="usage_records")
    reservation = relationship("Reservation")

class ConsumableLock(Base):
    __tablename__ = "consumable_locks"
    
    id = Column(Integer, primary_key=True, index=True)
    reservation_id = Column(Integer, ForeignKey("reservations.id"), nullable=False, index=True)
    consumable_id = Column(String(50), ForeignKey("consumables.consumable_id"), nullable=False, index=True)
    quantity = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    consumable = relationship("Consumable", back_populates="locks")
    reservation = relationship("Reservation")

class PurchaseSuggestion(Base):
    __tablename__ = "purchase_suggestions"
    
    id = Column(Integer, primary_key=True, index=True)
    consumable_id = Column(String(50), ForeignKey("consumables.consumable_id"), nullable=False, index=True)
    current_stock = Column(Float, nullable=False)
    reserved_stock = Column(Float, default=0.0)
    safety_threshold = Column(Float, nullable=False)
    daily_usage_rate = Column(Float, default=0.0)
    estimated_days_to_empty = Column(Float)
    suggested_quantity = Column(Float, nullable=False)
    urgency_level = Column(String(20), default="normal")
    reason = Column(Text)
    generated_at = Column(DateTime, default=datetime.utcnow, index=True)
    status = Column(String(20), default="pending")
    
    consumable = relationship("Consumable", back_populates="suggestions")

class Device(Base):
    __tablename__ = "devices"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(50), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    model = Column(String(100))
    device_type = Column(String(50))
    location = Column(String(100))
    status = Column(String(20), default="standby")
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    sensor_data = relationship("SensorData", back_populates="device", cascade="all, delete-orphan")
    reservations = relationship("Reservation", back_populates="device", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="device", cascade="all, delete-orphan")

class SensorData(Base):
    __tablename__ = "sensor_data"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(50), ForeignKey("devices.device_id"), nullable=False, index=True)
    temperature = Column(Float)
    humidity = Column(Float)
    pressure = Column(Float)
    power = Column(Float)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    
    device = relationship("Device", back_populates="sensor_data")

class Reservation(Base):
    __tablename__ = "reservations"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(50), ForeignKey("devices.device_id"), nullable=False, index=True)
    user_name = Column(String(100), nullable=False)
    experiment_name = Column(String(200))
    start_time = Column(DateTime, nullable=False, index=True)
    end_time = Column(DateTime, nullable=False, index=True)
    status = Column(String(20), default="pending")
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    device = relationship("Device", back_populates="reservations")
    consumable_locks = relationship("ConsumableLock", back_populates="reservation", cascade="all, delete-orphan")
    usage_records = relationship("ConsumableUsage", back_populates="reservation")

class Alert(Base):
    __tablename__ = "alerts"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(String(50), ForeignKey("devices.device_id"), nullable=False, index=True)
    alert_type = Column(String(50), nullable=False)
    message = Column(String(500), nullable=False)
    value = Column(Float)
    threshold = Column(Float)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    acknowledged = Column(Boolean, default=False)
    
    device = relationship("Device", back_populates="alerts")

class AlertRule(Base):
    __tablename__ = "alert_rules"
    
    id = Column(Integer, primary_key=True, index=True)
    device_type = Column(String(50))
    parameter = Column(String(50), nullable=False)
    min_value = Column(Float)
    max_value = Column(Float)
    operator = Column(String(10), default=">")
    enabled = Column(Boolean, default=True)
    description = Column(Text)
