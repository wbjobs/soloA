from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey, Float, Boolean
from sqlalchemy.orm import relationship

from ..database import Base


class SamplePair(Base):
    __tablename__ = "sample_pairs"

    id = Column(Integer, primary_key=True, index=True)
    pair_id = Column(String, nullable=False, index=True, unique=True)

    tumor_sample_id = Column(String, ForeignKey("samples.sample_id"), nullable=False)
    normal_sample_id = Column(String, ForeignKey("samples.sample_id"), nullable=False)

    name = Column(String, nullable=True)
    description = Column(String, nullable=True)

    tumor_task_id = Column(String, nullable=True)
    normal_task_id = Column(String, nullable=True)
    paired_task_id = Column(String, nullable=True)

    is_somatic = Column(Boolean, default=True)
    analysis_status = Column(String, default="pending")

    metadata = Column(JSON, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<SamplePair {self.pair_id}: {self.tumor_sample_id} vs {self.normal_sample_id}>"


class SomaticVariant(Base):
    __tablename__ = "somatic_variants"

    id = Column(Integer, primary_key=True, index=True)
    somatic_id = Column(String, nullable=False, index=True)
    pair_id = Column(String, ForeignKey("sample_pairs.pair_id"), nullable=False, index=True)

    chromosome = Column(String, nullable=False, index=True)
    position = Column(Integer, nullable=False)
    ref_allele = Column(String, nullable=False)
    alt_allele = Column(String, nullable=False)

    variant_type = Column(String, nullable=True)

    tumor_af = Column(Float, nullable=True)
    normal_af = Column(Float, nullable=True)
    tumor_depth = Column(Integer, nullable=True)
    normal_depth = Column(Integer, nullable=True)
    tumor_alt_depth = Column(Integer, nullable=True)
    normal_alt_depth = Column(Integer, nullable=True)

    quality = Column(Float, nullable=True)
    filter_status = Column(String, nullable=True)

    somatic_status = Column(String, default="somatic")
    vaf_difference = Column(Float, nullable=True)

    vcf_info = Column(JSON, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<SomaticVariant {self.somatic_id}>"
