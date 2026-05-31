from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime

from .database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    trajectory_files = relationship(
        "TrajectoryFile", 
        back_populates="project", 
        cascade="all, delete-orphan"
    )
    analysis_results = relationship(
        "AnalysisResult", 
        back_populates="project", 
        cascade="all, delete-orphan"
    )


class TrajectoryFile(Base):
    __tablename__ = "trajectory_files"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    file_type = Column(String(50), nullable=False)
    file_path = Column(String(500), nullable=False)
    topology_path = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    metadata = Column(JSON, nullable=True)

    project = relationship("Project", back_populates="trajectory_files")


class AnalysisResult(Base):
    __tablename__ = "analysis_results"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    analysis_type = Column(String(100), nullable=False)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    config = Column(JSON, nullable=True)
    result_data = Column(JSON, nullable=True)

    project = relationship("Project", back_populates="analysis_results")
