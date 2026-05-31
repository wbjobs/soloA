from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from .. import crud, schemas
from ..auth import get_current_user, require_roles, log_audit
from ..models import User, UserRole, AuditAction

router = APIRouter(prefix="/api/annotations", tags=["annotations"])


@router.post("/", response_model=schemas.AnnotationResponse)
async def create_annotation(
    request: Request,
    annotation_data: schemas.AnnotationCreate,
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    instance = db.query(crud.Instance).filter(crud.Instance.id == annotation_data.instance_id).first()
    if not instance:
        raise HTTPException(status_code=404, detail="实例不存在")

    annotation = crud.create_annotation(
        db=db,
        series_id=annotation_data.series_id,
        instance_id=annotation_data.instance_id,
        created_by=current_user.id,
        annotation_type=annotation_data.annotation_type.value,
        coordinates=annotation_data.coordinates,
        description=annotation_data.description,
        pathology=annotation_data.pathology,
        confidence=annotation_data.confidence,
        is_draft=annotation_data.is_draft,
        parent_id=annotation_data.parent_id
    )

    log_audit(db, current_user, AuditAction.CREATE_ANNOTATION, request,
              "annotation", str(annotation.id), {"type": annotation_data.annotation_type.value})

    return annotation


@router.get("/series/{series_id}", response_model=List[schemas.AnnotationResponse])
async def get_annotations_by_series(
    request: Request,
    series_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    series = db.query(crud.Series).filter(crud.Series.id == series_id).first()
    if not series:
        raise HTTPException(status_code=404, detail="序列不存在")

    annotations = crud.get_annotations_by_series(db, series_id)

    log_audit(db, current_user, AuditAction.VIEW, request, "annotations", str(series_id))

    return annotations


@router.get("/instance/{instance_id}", response_model=List[schemas.AnnotationResponse])
async def get_annotations_by_instance(
    request: Request,
    instance_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    instance = db.query(crud.Instance).filter(crud.Instance.id == instance_id).first()
    if not instance:
        raise HTTPException(status_code=404, detail="实例不存在")

    annotations = crud.get_annotations_by_instance(db, instance_id)

    log_audit(db, current_user, AuditAction.VIEW, request, "annotations", str(instance_id))

    return annotations


@router.get("/{annotation_id}", response_model=schemas.AnnotationResponse)
async def get_annotation(
    request: Request,
    annotation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    annotation = crud.get_annotation_by_id(db, annotation_id)
    if not annotation:
        raise HTTPException(status_code=404, detail="标注不存在")

    log_audit(db, current_user, AuditAction.VIEW, request, "annotation", str(annotation_id))

    return annotation


@router.put("/{annotation_id}", response_model=schemas.AnnotationResponse)
async def update_annotation(
    request: Request,
    annotation_id: int,
    update_data: schemas.AnnotationUpdate,
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    annotation = crud.get_annotation_by_id(db, annotation_id)
    if not annotation:
        raise HTTPException(status_code=404, detail="标注不存在")

    if annotation.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="无权修改此标注")

    updated = crud.update_annotation(
        db=db,
        annotation_id=annotation_id,
        created_by=current_user.id,
        coordinates=update_data.coordinates,
        description=update_data.description,
        pathology=update_data.pathology,
        confidence=update_data.confidence,
        is_draft=update_data.is_draft
    )

    log_audit(db, current_user, AuditAction.EDIT_ANNOTATION, request,
              "annotation", str(annotation_id))

    return updated


@router.delete("/{annotation_id}")
async def delete_annotation(
    request: Request,
    annotation_id: int,
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    annotation = crud.get_annotation_by_id(db, annotation_id)
    if not annotation:
        raise HTTPException(status_code=404, detail="标注不存在")

    if annotation.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="无权删除此标注")

    success = crud.delete_annotation(db, annotation_id)

    log_audit(db, current_user, AuditAction.DELETE_ANNOTATION, request,
              "annotation", str(annotation_id))

    return {"success": success}


@router.post("/reviews", response_model=schemas.AnnotationReviewResponse)
async def create_review(
    request: Request,
    review_data: schemas.AnnotationReviewCreate,
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    annotation = crud.get_annotation_by_id(db, review_data.annotation_id)
    if not annotation:
        raise HTTPException(status_code=404, detail="标注不存在")

    review = crud.create_annotation_review(
        db=db,
        annotation_id=review_data.annotation_id,
        reviewed_by=current_user.id,
        status=review_data.status.value,
        comment=review_data.comment,
        modified_coordinates=review_data.modified_coordinates
    )

    log_audit(db, current_user, AuditAction.REVIEW_ANNOTATION, request,
              "annotation", str(review_data.annotation_id), {"status": review_data.status.value})

    return review


@router.get("/reviews/{annotation_id}", response_model=List[schemas.AnnotationReviewResponse])
async def get_reviews(
    request: Request,
    annotation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    annotation = crud.get_annotation_by_id(db, annotation_id)
    if not annotation:
        raise HTTPException(status_code=404, detail="标注不存在")

    reviews = crud.get_reviews_by_annotation(db, annotation_id)

    log_audit(db, current_user, AuditAction.VIEW, request, "reviews", str(annotation_id))

    return reviews


@router.post("/{annotation_id}/finalize", response_model=schemas.AnnotationResponse)
async def finalize_annotation(
    request: Request,
    annotation_id: int,
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    annotation = crud.get_annotation_by_id(db, annotation_id)
    if not annotation:
        raise HTTPException(status_code=404, detail="标注不存在")

    if annotation.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="无权终结此标注")

    updated = crud.update_annotation(
        db=db,
        annotation_id=annotation_id,
        created_by=current_user.id,
        is_draft=False
    )

    log_audit(db, current_user, AuditAction.EDIT_ANNOTATION, request,
              "annotation", str(annotation_id), {"action": "finalize"})

    return updated
