from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship

from ..database import Base


class Sample(Base):
    __tablename__ = "samples"

    id = Column(Integer, primary_key=True, index=True)
    sample_id = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    bam_object_name = Column(String, nullable=True)
    bai_object_name = Column(String, nullable=True)
    bam_file_size = Column(Integer, nullable=True)

    reference_genome = Column(String, default="hg38")

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    metadata = Column(JSON, default=dict)

    tasks = relationship("AnalysisTask", back_populates="sample")

    def __repr__(self):
        return f"<Sample {self.sample_id}>"
