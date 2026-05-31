from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, ForeignKey, Float, Enum
from sqlalchemy.orm import relationship

from ..database import Base


class SVType(str, Enum):
    DELETION = "DEL"
    DUPLICATION = "DUP"
    INVERSION = "INV"
    TRANSLOCATION = "BND"
    INSERTION = "INS"
    COPY_NUMBER_VARIATION = "CNV"


class StructuralVariant(Base):
    __tablename__ = "structural_variants"

    id = Column(Integer, primary_key=True, index=True)
    sv_id = Column(String, nullable=False, index=True)
    task_id = Column(String, nullable=False, index=True)

    chromosome_1 = Column(String, nullable=False, index=True)
    position_1 = Column(Integer, nullable=False)
    chromosome_2 = Column(String, nullable=True)
    position_2 = Column(Integer, nullable=True)

    sv_type = Column(Enum(SVType), nullable=False)
    sv_length = Column(Integer, nullable=True)

    quality = Column(Float, nullable=True)
    filter_status = Column(String, nullable=True)
    read_depth = Column(Integer, nullable=True)
    allele_frequency = Column(Float, nullable=True)
    genotype = Column(String, nullable=True)

    supporting_reads = Column(Integer, nullable=True)
    split_reads = Column(Integer, nullable=True)
    discordant_pairs = Column(Integer, nullable=True)

    gene_1 = Column(String, nullable=True)
    gene_2 = Column(String, nullable=True)
    consequence = Column(String, nullable=True)

    vcf_info = Column(JSON, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<StructuralVariant {self.sv_id}: {self.sv_type}>"
