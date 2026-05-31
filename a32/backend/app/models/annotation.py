from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, ForeignKey, Float
from sqlalchemy.orm import relationship

from ..database import Base


class Annotation(Base):
    __tablename__ = "annotations"

    id = Column(Integer, primary_key=True, index=True)
    variant_id = Column(String, ForeignKey("variants.variant_id"), nullable=False, index=True)

    dbsnp_rs_id = Column(String, nullable=True, index=True)

    gene = Column(String, nullable=True)
    transcript = Column(String, nullable=True)
    consequence = Column(String, nullable=True)

    clinvar_variation_id = Column(String, nullable=True)
    clinvar_clinical_significance = Column(String, nullable=True)
    clinvar_conditions = Column(String, nullable=True)
    clinvar_review_status = Column(String, nullable=True)

    sift_prediction = Column(String, nullable=True)
    sift_score = Column(String, nullable=True)
    polyphen_prediction = Column(String, nullable=True)
    polyphen_score = Column(String, nullable=True)

    allele_frequency_1kg = Column(String, nullable=True)
    allele_frequency_gnomad = Column(String, nullable=True)
    allele_frequency_exac = Column(String, nullable=True)

    gnomad_af = Column(Float, nullable=True)
    gnomad_af_afr = Column(Float, nullable=True)
    gnomad_af_amr = Column(Float, nullable=True)
    gnomad_af_asj = Column(Float, nullable=True)
    gnomad_af_eas = Column(Float, nullable=True)
    gnomad_af_fin = Column(Float, nullable=True)
    gnomad_af_nfe = Column(Float, nullable=True)
    gnomad_af_oth = Column(Float, nullable=True)
    gnomad_af_sas = Column(Float, nullable=True)
    gnomad_hom_count = Column(Integer, nullable=True)
    gnomad_het_count = Column(Integer, nullable=True)

    exac_af = Column(Float, nullable=True)
    exac_af_afr = Column(Float, nullable=True)
    exac_af_amr = Column(Float, nullable=True)
    exac_af_eas = Column(Float, nullable=True)
    exac_af_fin = Column(Float, nullable=True)
    exac_af_nfe = Column(Float, nullable=True)
    exac_af_sas = Column(Float, nullable=True)

    thousandg_af = Column(Float, nullable=True)
    thousandg_af_afr = Column(Float, nullable=True)
    thousandg_af_amr = Column(Float, nullable=True)
    thousandg_af_eas = Column(Float, nullable=True)
    thousandg_af_eur = Column(Float, nullable=True)
    thousandg_af_sas = Column(Float, nullable=True)

    additional_annotations = Column(JSON, default=dict)

    annotated_at = Column(DateTime, default=datetime.utcnow)

    variant = relationship("Variant", back_populates="annotations")

    def __repr__(self):
        return f"<Annotation {self.variant_id}>"
