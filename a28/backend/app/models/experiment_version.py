from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    DateTime,
    JSON,
    ForeignKey,
    Index,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class ExperimentBranch(Base):
    __tablename__ = "experiment_branches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    experiment_id = Column(Integer, ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False)
    parent_branch_id = Column(Integer, ForeignKey("experiment_branches.id"), nullable=True)
    base_version_id = Column(Integer, nullable=True)

    created_by = Column(String(255), nullable=False)
    description = Column(Text)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    experiment = relationship("Experiment", backref="branches")
    parent_branch = relationship("ExperimentBranch", remote_side=[id])
    versions = relationship(
        "ExperimentVersion",
        back_populates="branch",
        order_by="ExperimentVersion.version_number",
    )

    __table_args__ = (
        Index("ix_experiment_branches_name", "name", "experiment_id"),
    )

    def __repr__(self):
        return f"<ExperimentBranch(id={self.id}, name={self.name})>"


class ExperimentVersion(Base):
    __tablename__ = "experiment_versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    branch_id = Column(Integer, ForeignKey("experiment_branches.id", ondelete="CASCADE"), nullable=False)
    version_number = Column(Integer, nullable=False)

    commit_message = Column(Text)
    created_by = Column(String(255), nullable=False)

    title = Column(String(255), nullable=False)
    researcher = Column(String(255), nullable=False)
    experiment_date = Column(DateTime, nullable=False)
    status = Column(String(50), default="planned")

    temperature = Column(Integer)
    pressure = Column(Integer)
    solvent = Column(String(255))
    catalyst = Column(String(255))
    reaction_time = Column(Integer)
    yield_percent = Column(Integer)
    notes = Column(Text)

    reaction_conditions = Column(JSON)
    results = Column(JSON)

    parent_version_id = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    branch = relationship("ExperimentBranch", back_populates="versions")

    __table_args__ = (
        Index("ix_experiment_versions_branch", "branch_id", "version_number", unique=True),
    )

    def __repr__(self):
        return f"<ExperimentVersion(id={self.id}, v{self.version_number})>"


class ExperimentMerge(Base):
    __tablename__ = "experiment_merges"

    id = Column(Integer, primary_key=True, autoincrement=True)
    source_branch_id = Column(Integer, ForeignKey("experiment_branches.id"), nullable=False)
    target_branch_id = Column(Integer, ForeignKey("experiment_branches.id"), nullable=False)

    source_version_id = Column(Integer, nullable=False)
    target_version_id = Column(Integer, nullable=False)

    merge_status = Column(String(20), default="pending")
    conflicts = Column(JSON, default=list)
    resolved_conflicts = Column(JSON, default=list)

    created_by = Column(String(255), nullable=False)
    resolved_by = Column(String(255), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    resolved_at = Column(DateTime, nullable=True)

    def __repr__(self):
        return f"<ExperimentMerge(id={self.id}, status={self.merge_status})>"
