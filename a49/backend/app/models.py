from sqlalchemy import Column, Integer, Float, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class Simulation(Base):
    __tablename__ = "simulations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    config = Column(JSON, nullable=False)

    bodies = relationship("Body", back_populates="simulation", cascade="all, delete-orphan")
    states = relationship("SimulationState", back_populates="simulation", cascade="all, delete-orphan")


class Body(Base):
    __tablename__ = "bodies"

    id = Column(Integer, primary_key=True, index=True)
    simulation_id = Column(Integer, ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    mass = Column(Float, nullable=False)
    radius = Column(Float, nullable=True)
    pos_x = Column(Float, nullable=False)
    pos_y = Column(Float, nullable=False)
    pos_z = Column(Float, nullable=False)
    vel_x = Column(Float, nullable=False)
    vel_y = Column(Float, nullable=False)
    vel_z = Column(Float, nullable=False)
    color = Column(String(20), nullable=True, default="#ffffff")

    simulation = relationship("Simulation", back_populates="bodies")


class SimulationState(Base):
    __tablename__ = "simulation_states"

    id = Column(Integer, primary_key=True, index=True)
    simulation_id = Column(Integer, ForeignKey("simulations.id", ondelete="CASCADE"), nullable=False)
    step = Column(Integer, nullable=False)
    time = Column(Float, nullable=False)
    data = Column(JSON, nullable=False)

    simulation = relationship("Simulation", back_populates="states")

    __table_args__ = (
        {"sqlite_autoincrement": True},
    )
