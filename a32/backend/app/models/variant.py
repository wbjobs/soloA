from datetime import datetime
from enum import Enum as PyEnum
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, ForeignKey, Enum, Float
from sqlalchemy.orm import relationship

from ..database import Base


class VariantType(str, PyEnum):
    SNP = "SNP"
    INS = "INS"
    DEL = "DEL"
    MNP = "MNP"
    SV = "SV"


class Variant(Base):
    __tablename__ = "variants"

    id = Column(Integer, primary_key=True, index=True)
    variant_id = Column(String, unique=True, index=True, nullable=False)

    task_id = Column(String, ForeignKey("analysis_tasks.task_id"), nullable=False, index=True)

    chromosome = Column(String, nullable=False, index=True)
    position = Column(Integer, nullable=False, index=True)
    ref_allele = Column(String, nullable=False)
    alt_allele = Column(String, nullable=False)
    variant_type = Column(Enum(VariantType), nullable=False, index=True)

    quality = Column(Float, nullable=True)
    filter_status = Column(String, nullable=True)

    read_depth = Column(Integer, nullable=True)
    alt_depth = Column(Integer, nullable=True)
    allele_frequency = Column(Float, nullable=True)

    genotype = Column(String, nullable=True)

    vcf_info = Column(JSON, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow)

    annotations = relationship("Annotation", back_populates="variant")
    task = relationship("AnalysisTask", back_populates="variants")

    def __repr__(self):
        return f"<Variant {self.chromosome}:{self.position} {self.ref_allele}>{self.alt_allele}>"
