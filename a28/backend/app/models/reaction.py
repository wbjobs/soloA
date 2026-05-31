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


class Reaction(Base):
    __tablename__ = "reactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    reaction_type = Column(String(100), nullable=False)

    reactant_id = Column(Integer, ForeignKey("molecules.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("molecules.id"), nullable=False)

    reaction_smarts = Column(String(1000))
    reaction_equation = Column(Text)

    activation_energy = Column(Float)
    enthalpy = Column(Float)

    reactant_coords = Column(JSON, nullable=False)
    transition_coords = Column(JSON, nullable=False)
    product_coords = Column(JSON, nullable=False)
    transition_bonds = Column(JSON, nullable=False)

    description = Column(Text)
    conditions = Column(JSON)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    reactant = relationship(
        "Molecule",
        foreign_keys=[reactant_id],
        back_populates="reactions_as_reactant",
    )
    product = relationship(
        "Molecule",
        foreign_keys=[product_id],
        back_populates="reactions_as_product",
    )
    experiments = relationship("Experiment", back_populates="reaction")

    __table_args__ = (
        Index("ix_reactions_reaction_type", "reaction_type"),
    )

    def __repr__(self):
        return f"<Reaction(id={self.id}, name={self.name}, type={self.reaction_type})>"
