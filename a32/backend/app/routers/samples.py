import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.sample import Sample
from ..schemas.sample import SampleCreate, SampleResponse, SampleListResponse, SampleUpdate
from ..services.storage_service import get_storage_service

router = APIRouter(prefix="/api/samples", tags=["samples"])


@router.get("", response_model=SampleListResponse)
def list_samples(
    page: int = 1,
    page_size: int = 20,
    db: Session = Depends(get_db),
):
    query = db.query(Sample)
    total = query.count()

    samples = query.order_by(Sample.created_at.desc()).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    return SampleListResponse(
        items=[SampleResponse.model_validate(s) for s in samples],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=SampleResponse)
def create_sample(
    sample_data: SampleCreate,
    db: Session = Depends(get_db),
):
    existing = db.query(Sample).filter(Sample.sample_id == sample_data.sample_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Sample ID already exists")

    sample = Sample(**sample_data.model_dump())
    db.add(sample)
    db.commit()
    db.refresh(sample)

    return sample


@router.get("/{sample_id}", response_model=SampleResponse)
def get_sample(sample_id: str, db: Session = Depends(get_db)):
    sample = db.query(Sample).filter(Sample.sample_id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")
    return sample


@router.put("/{sample_id}", response_model=SampleResponse)
def update_sample(
    sample_id: str,
    sample_data: SampleUpdate,
    db: Session = Depends(get_db),
):
    sample = db.query(Sample).filter(Sample.sample_id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    update_data = sample_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(sample, key, value)

    db.commit()
    db.refresh(sample)
    return sample


@router.post("/{sample_id}/upload-bam", response_model=SampleResponse)
async def upload_bam(
    sample_id: str,
    bam_file: UploadFile = File(...),
    bai_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
):
    sample = db.query(Sample).filter(Sample.sample_id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    storage = get_storage_service()

    bam_object_name = f"samples/{sample_id}/{uuid.uuid4()}_{bam_file.filename}"

    try:
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix=".bam") as temp_bam:
            content = await bam_file.read()
            temp_bam.write(content)
            temp_bam_path = temp_bam.name

        file_size = os.path.getsize(temp_bam_path)
        storage.upload_file(bam_object_name, temp_bam_path)
        os.unlink(temp_bam_path)

        sample.bam_object_name = bam_object_name
        sample.bam_file_size = file_size

        if bai_file:
            bai_object_name = f"samples/{sample_id}/{uuid.uuid4()}_{bai_file.filename}"
            with tempfile.NamedTemporaryFile(delete=False, suffix=".bai") as temp_bai:
                content = await bai_file.read()
                temp_bai.write(content)
                temp_bai_path = temp_bai.name

            storage.upload_file(bai_object_name, temp_bai_path)
            os.unlink(temp_bai_path)
            sample.bai_object_name = bai_object_name

        db.commit()
        db.refresh(sample)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

    return sample


@router.delete("/{sample_id}")
def delete_sample(sample_id: str, db: Session = Depends(get_db)):
    sample = db.query(Sample).filter(Sample.sample_id == sample_id).first()
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    db.delete(sample)
    db.commit()

    return {"message": "Sample deleted successfully"}
