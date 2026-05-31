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
    Index,
)
from sqlalchemy.orm import relationship
from app.core.database import Base


class DockingResult(Base):
    __tablename__ = "docking_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text)

    protein_name = Column(String(255), nullable=False)
    protein_pdb_id = Column(String(20))

    ligand_id = Column(Integer, ForeignKey("molecules.id"), nullable=True)
    ligand_smiles = Column(String(1000))
    ligand_name = Column(String(255))

    binding_affinity = Column(Float)
    rmsd = Column(Float)
    score = Column(Float)

    protein_coords = Column(JSON, nullable=False)
    ligand_coords = Column(JSON, nullable=False)
    pocket_center = Column(JSON)
    pocket_size = Column(JSON)

    hydrogen_bonds = Column(JSON, default=list)
    hydrophobic_interactions = Column(JSON, default=list)
    pi_interactions = Column(JSON, default=list)
    salt_bridges = Column(JSON, default=list)

    experiment_id = Column(Integer, ForeignKey("experiments.id"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    ligand = relationship("Molecule")
    experiment = relationship("Experiment")

    __table_args__ = (
        Index("ix_docking_results_protein", "protein_name"),
        Index("ix_docking_results_score", "score"),
    )

    def __repr__(self):
        return f"<DockingResult(id={self.id}, name={self.name})>"
