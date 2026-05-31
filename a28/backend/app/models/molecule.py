from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Index
from sqlalchemy.orm import relationship
from app.core.database import Base


class Molecule(Base):
    __tablename__ = "molecules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False, index=True)
    smiles = Column(String(1000), nullable=False, index=True)
    molecular_formula = Column(String(255))
    molecular_weight = Column(Integer)
    description = Column(Text)

    atom_coords = Column(JSON, nullable=False)
    bonds = Column(JSON, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    reactions_as_reactant = relationship(
        "Reaction",
        foreign_keys="Reaction.reactant_id",
        back_populates="reactant",
    )
    reactions_as_product = relationship(
        "Reaction",
        foreign_keys="Reaction.product_id",
        back_populates="product",
    )

    __table_args__ = (
        Index("ix_molecules_smiles_name", "smiles", "name"),
    )

    def __repr__(self):
        return f"<Molecule(id={self.id}, name={self.name}, smiles={self.smiles[:20]}...)>"
