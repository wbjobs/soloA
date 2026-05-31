from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import io

from ..database import get_db
from ..models import Document, Annotation, LayoutAnalysis, OCRResult
from ..schemas import (
    AnnotationCreate,
    AnnotationUpdate,
    AnnotationResponse,
    AnnotationDetectionRequest,
    AnnotationLinkResult,
    AnnotationAnalysisResult,
)
from ..services.annotation_service import get_annotation_service, AnnotationService
from ..services.storage_service import get_storage_service, StorageService

router = APIRouter(prefix="/api/annotations", tags=["annotations"])


@router.post("/", response_model=AnnotationResponse)
async def create_annotation(
    annotation: AnnotationCreate,
    document_id: int,
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    db_annotation = Annotation(
        document_id=document_id,
        **annotation.model_dump(exclude_unset=True)
    )
    db.add(db_annotation)
    db.commit()
    db.refresh(db_annotation)
    return db_annotation


@router.get("/document/{document_id}", response_model=List[AnnotationResponse])
async def get_document_annotations(
    document_id: int,
    annotation_type: Optional[str] = None,
    only_linked: bool = False,
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    query = db.query(Annotation).filter(Annotation.document_id == document_id)

    if annotation_type:
        query = query.filter(Annotation.annotation_type == annotation_type)

    if only_linked:
        query = query.filter(Annotation.linked_text_region_id.isnot(None))

    return query.order_by(Annotation.y, Annotation.x).all()


@router.get("/{annotation_id}", response_model=AnnotationResponse)
async def get_annotation(
    annotation_id: int,
    db: Session = Depends(get_db),
):
    annotation = db.query(Annotation).filter(Annotation.id == annotation_id).first()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")
    return annotation


@router.put("/{annotation_id}", response_model=AnnotationResponse)
async def update_annotation(
    annotation_id: int,
    update: AnnotationUpdate,
    db: Session = Depends(get_db),
):
    annotation = db.query(Annotation).filter(Annotation.id == annotation_id).first()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    for key, value in update.model_dump(exclude_unset=True).items():
        setattr(annotation, key, value)

    db.commit()
    db.refresh(annotation)
    return annotation


@router.delete("/{annotation_id}")
async def delete_annotation(
    annotation_id: int,
    db: Session = Depends(get_db),
):
    annotation = db.query(Annotation).filter(Annotation.id == annotation_id).first()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    db.delete(annotation)
    db.commit()
    return {"message": "Annotation deleted successfully"}


@router.post("/document/{document_id}/detect")
async def detect_annotations(
    document_id: int,
    auto_link: bool = True,
    db: Session = Depends(get_db),
    storage: StorageService = Depends(get_storage_service),
    annotation_service: AnnotationService = Depends(get_annotation_service),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    image_path = doc.inpainted_image_path or doc.processed_image_path or doc.original_image_path
    if not image_path:
        raise HTTPException(status_code=400, detail="No image available for annotation detection")

    image_bytes = storage.download_file(image_path)
    import cv2
    import numpy as np
    image_array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)

    text_regions = []
    for ocr in doc.ocr_results:
        if ocr.layout_region_id:
            layout = db.query(LayoutAnalysis).filter(
                LayoutAnalysis.id == ocr.layout_region_id
            ).first()
            if layout:
                text_regions.append({
                    'id': ocr.id,
                    'text': ocr.corrected_text or ocr.text,
                    'x': layout.x,
                    'y': layout.y,
                    'width': layout.width,
                    'height': layout.height,
                    'is_vertical': layout.is_vertical,
                })

    detected = annotation_service.detect_annotation_regions(image, text_regions)

    for ann in detected:
        db_ann = Annotation(
            document_id=document_id,
            annotation_type=ann['annotation_type'],
            text='',
            x=ann['x'],
            y=ann['y'],
            width=ann['width'],
            height=ann['height'],
            confidence=ann.get('confidence', 0.5),
            metadata={'location': ann.get('location')}
        )
        db.add(db_ann)

    db.commit()

    if auto_link and text_regions:
        db_annotations = db.query(Annotation).filter(
            Annotation.document_id == document_id,
            Annotation.text == ''
        ).all()

        annotations_with_text = [{**ann.__dict__, 'text': ''} for ann in db_annotations]
        empty_texts = [''] * len(db_annotations)

        linked = annotation_service.link_annotations_to_text(
            annotations_with_text,
            empty_texts,
            text_regions
        )

        for i, link_info in enumerate(linked):
            if link_info.get('linked_text_region_id'):
                db_annotations[i].linked_text_region_id = link_info['linked_text_region_id']
                db_annotations[i].confidence = link_info['confidence']
                if link_info.get('score_details'):
                    db_annotations[i].proximity_score = link_info['score_details'].get('proximity')
                    db_annotations[i].semantic_score = link_info['score_details'].get('semantic')

        db.commit()

    final_annotations = db.query(Annotation).filter(
        Annotation.document_id == document_id
    ).all()

    return {
        'document_id': document_id,
        'detected_count': len(detected),
        'annotations': [
            AnnotationResponse.model_validate(ann).model_dump()
            for ann in final_annotations
        ]
    }


@router.post("/document/{document_id}/link")
async def link_annotations_to_text(
    document_id: int,
    db: Session = Depends(get_db),
    annotation_service: AnnotationService = Depends(get_annotation_service),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    text_regions = []
    for ocr in doc.ocr_results:
        if ocr.layout_region_id:
            layout = db.query(LayoutAnalysis).filter(
                LayoutAnalysis.id == ocr.layout_region_id
            ).first()
            if layout:
                text_regions.append({
                    'id': ocr.id,
                    'text': ocr.corrected_text or ocr.text,
                    'x': layout.x,
                    'y': layout.y,
                    'width': layout.width,
                    'height': layout.height,
                    'is_vertical': layout.is_vertical,
                })

    if not text_regions:
        raise HTTPException(status_code=400, detail="No text regions available for linking")

    annotations = db.query(Annotation).filter(Annotation.document_id == document_id).all()
    if not annotations:
        raise HTTPException(status_code=400, detail="No annotations to link")

    annotations_list = [{
        'id': ann.id,
        'annotation_type': ann.annotation_type,
        'text': ann.text,
        'x': ann.x,
        'y': ann.y,
        'width': ann.width,
        'height': ann.height,
    } for ann in annotations]

    annotation_texts = [ann.text for ann in annotations]

    linked = annotation_service.link_annotations_to_text(
        annotations_list,
        annotation_texts,
        text_regions
    )

    results = []
    for i, link_info in enumerate(linked):
        annotation = annotations[i]
        annotation.linked_text_region_id = link_info.get('linked_text_region_id')
        annotation.confidence = link_info['confidence']
        if link_info.get('score_details'):
            annotation.proximity_score = link_info['score_details'].get('proximity')
            annotation.semantic_score = link_info['score_details'].get('semantic')

        results.append(AnnotationLinkResult(
            annotation_id=annotation.id,
            linked_text_region_id=annotation.linked_text_region_id,
            confidence=annotation.confidence,
            proximity_score=annotation.proximity_score,
            semantic_score=annotation.semantic_score,
        ))

    db.commit()

    return {
        'document_id': document_id,
        'link_results': [r.model_dump() for r in results]
    }


@router.post("/{annotation_id}/verify")
async def verify_annotation(
    annotation_id: int,
    verified: bool = True,
    db: Session = Depends(get_db),
):
    annotation = db.query(Annotation).filter(Annotation.id == annotation_id).first()
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found")

    annotation.is_verified = verified
    db.commit()
    db.refresh(annotation)
    return AnnotationResponse.model_validate(annotation)


@router.get("/document/{document_id}/analysis", response_model=AnnotationAnalysisResult)
async def analyze_annotations(
    document_id: int,
    db: Session = Depends(get_db),
    annotation_service: AnnotationService = Depends(get_annotation_service),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    annotations = db.query(Annotation).filter(Annotation.document_id == document_id).all()

    annotations_list = [{
        'annotation_type': ann.annotation_type,
        'linked_text_region_id': ann.linked_text_region_id,
        'confidence': ann.confidence or 0.0,
    } for ann in annotations]

    analysis = annotation_service.analyze_annotation_relationships(annotations_list)

    return AnnotationAnalysisResult(**analysis)


@router.get("/document/{document_id}/grouped-by-text")
async def get_annotations_grouped_by_text(
    document_id: int,
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(Document.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    annotations = db.query(Annotation).filter(Annotation.document_id == document_id).all()

    groups = {}
    unlinked = []

    for ann in annotations:
        if ann.linked_text_region_id:
            ocr = db.query(OCRResult).filter(OCRResult.id == ann.linked_text_region_id).first()
            key = ann.linked_text_region_id
            if key not in groups:
                groups[key] = {
                    'ocr_result_id': key,
                    'text': ocr.corrected_text or ocr.text if ocr else '',
                    'annotations': []
                }
            groups[key]['annotations'].append(AnnotationResponse.model_validate(ann).model_dump())
        else:
            unlinked.append(AnnotationResponse.model_validate(ann).model_dump())

    return {
        'document_id': document_id,
        'linked_groups': list(groups.values()),
        'unlinked_annotations': unlinked
    }
