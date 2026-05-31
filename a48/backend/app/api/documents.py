from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid
from datetime import datetime

from ..database import get_db
from ..models import Document
from ..schemas import DocumentCreate, DocumentUpdate, DocumentResponse
from ..services.storage_service import get_storage_service, StorageService

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/", response_model=DocumentResponse)
async def create_document(
    title: str = Form(...),
    author: Optional[str] = Form(None),
    dynasty: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
):
    doc = Document(
        title=title,
        author=author,
        dynasty=dynasty,
        description=description,
        status="uploaded",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    file_ext = file.filename.split('.')[-1].lower() if '.' in file.filename else 'png'
    file_path = f"documents/{doc.id}/original.{file_ext}"

    content = await file.read()
    storage.upload_file(file_path, content, content_type=file.content_type or "image/png")

    doc.original_image_path = file_path
    db.commit()
    db.refresh(doc)

    return doc


@router.get("/", response_model=List[DocumentResponse])
async def list_documents(
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    dynasty: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(Document)
    
    if status:
        query = query.filter(Document.status == status)
    if dynasty:
        query = query.filter(Document.dynasty == dynasty)
    
    documents = query.offset(skip).limit(limit).all()
    return documents


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: int,
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.put("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: int,
    update: DocumentUpdate,
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    for key, value in update.model_dump(exclude_unset=True).items():
        setattr(doc, key, value)

    db.commit()
    db.refresh(doc)
    return doc


@router.delete("/{document_id}")
async def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.original_image_path:
        try:
            storage.delete_file(doc.original_image_path)
        except Exception:
            pass
    if doc.processed_image_path:
        try:
            storage.delete_file(doc.processed_image_path)
        except Exception:
            pass
    if doc.inpainted_image_path:
        try:
            storage.delete_file(doc.inpainted_image_path)
        except Exception:
            pass

    db.delete(doc)
    db.commit()
    return {"message": "Document deleted successfully"}


@router.get("/{document_id}/images")
async def get_document_images(
    document_id: int,
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    images = {}
    if doc.original_image_path:
        url = storage.get_presigned_url(doc.original_image_path)
        if url:
            images["original"] = url

    if doc.processed_image_path:
        url = storage.get_presigned_url(doc.processed_image_path)
        if url:
            images["processed"] = url

    if doc.inpainted_image_path:
        url = storage.get_presigned_url(doc.inpainted_image_path)
        if url:
            images["inpainted"] = url

    return {"document_id": document_id, "images": images}
