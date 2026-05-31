from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..models import OCRResult
from ..schemas import OCRResultResponse, OCRUpdate

router = APIRouter(prefix="/api/ocr", tags=["ocr"])


@router.get("/document/{document_id}", response_model=List[OCRResultResponse])
async def get_document_ocr(
    document_id: int,
    db: Session = Depends(get_db),
):
    ocr_results = db.query(OCRResult).filter(OCRResult.document_id == document_id).all()
    return ocr_results


@router.get("/{ocr_id}", response_model=OCRResultResponse)
async def get_ocr(
    ocr_id: int,
    db: Session = Depends(get_db),
):
    ocr = db.query(OCRResult).filter(OCRResult.id == ocr_id).first()
    if not ocr:
        raise HTTPException(status_code=404, detail="OCR result not found")
    return ocr


@router.put("/{ocr_id}", response_model=OCRResultResponse)
async def update_ocr(
    ocr_id: int,
    update: OCRUpdate,
    db: Session = Depends(get_db),
):
    ocr = db.query(OCRResult).filter(OCRResult.id == ocr_id).first()
    if not ocr:
        raise HTTPException(status_code=404, detail="OCR result not found")

    if update.corrected_text is not None:
        ocr.corrected_text = update.corrected_text
        ocr.is_corrected = True
    if update.is_corrected is not None:
        ocr.is_corrected = update.is_corrected

    db.commit()
    db.refresh(ocr)
    return ocr


@router.post("/{ocr_id}/approve", response_model=OCRResultResponse)
async def approve_ocr(
    ocr_id: int,
    db: Session = Depends(get_db),
):
    ocr = db.query(OCRResult).filter(OCRResult.id == ocr_id).first()
    if not ocr:
        raise HTTPException(status_code=404, detail="OCR result not found")

    ocr.is_corrected = True
    ocr.corrected_text = ocr.text
    db.commit()
    db.refresh(ocr)
    return ocr


@router.post("/{ocr_id}/reject", response_model=OCRResultResponse)
async def reject_ocr(
    ocr_id: int,
    db: Session = Depends(get_db),
):
    ocr = db.query(OCRResult).filter(OCRResult.id == ocr_id).first()
    if not ocr:
        raise HTTPException(status_code=404, detail="OCR result not found")

    ocr.is_corrected = False
    ocr.corrected_text = None
    db.commit()
    db.refresh(ocr)
    return ocr
