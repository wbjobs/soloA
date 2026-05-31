from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    JSON,
    ForeignKey,
    Float,
    Date,
    Index,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class Experiment(Base):
    __tablename__ = "experiments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=False, index=True)
    researcher = Column(String(255), nullable=False)

    reaction_id = Column(Integer, ForeignKey("reactions.id"), nullable=True)

    experiment_date = Column(Date, nullable=False, default=datetime.utcnow)
    status = Column(String(50), default="planned")

    temperature = Column(Float)
    pressure = Column(Float)
    solvent = Column(String(255))
    catalyst = Column(String(255))
    reaction_time = Column(Float)

    yield_percent = Column(Float)
    notes = Column(Text)

    reaction_conditions = Column(JSON)
    results = Column(JSON)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    reaction = relationship("Reaction", back_populates="experiments")
    files = relationship(
        "ExperimentFile",
        back_populates="experiment",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_experiments_researcher_date", "researcher", "experiment_date"),
    )

    def __repr__(self):
        return f"<Experiment(id={self.id}, title={self.title})>"


class ExperimentFile(Base):
    __tablename__ = "experiment_files"

    id = Column(Integer, primary_key=True, autoincrement=True)
    experiment_id = Column(
        Integer, ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False
    )

    filename = Column(String(500), nullable=False)
    minio_object_name = Column(String(500), nullable=False)
    file_type = Column(String(100))
    file_size = Column(Integer)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    experiment = relationship("Experiment", back_populates="files")

    def __repr__(self):
        return f"<ExperimentFile(id={self.id}, filename={self.filename})>"
