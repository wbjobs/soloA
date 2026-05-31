from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from .. import crud, schemas
from ..auth import get_current_user, require_roles, log_audit
from ..models import User, UserRole, AuditAction

router = APIRouter(prefix="/api/report-templates", tags=["report-templates"])


@router.post("/", response_model=schemas.ReportTemplateResponse)
async def create_template(
    request: Request,
    template_data: schemas.ReportTemplateCreate,
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    template = crud.create_report_template(
        db=db,
        name=template_data.name,
        created_by=current_user.id,
        category=template_data.category,
        modality=template_data.modality,
        body_part=template_data.body_part,
        findings_template=template_data.findings_template,
        impression_template=template_data.impression_template,
        recommendations_template=template_data.recommendations_template,
        is_default=template_data.is_default,
        is_public=template_data.is_public
    )

    log_audit(db, current_user, AuditAction.EDIT_REPORT, request,
              "template", str(template.id), {"action": "create"})

    return template


@router.get("/", response_model=List[schemas.ReportTemplateResponse])
async def get_templates(
    request: Request,
    modality: Optional[str] = None,
    body_part: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    templates = crud.get_report_templates(
        db=db,
        modality=modality,
        body_part=body_part,
        created_by=current_user.id
    )

    log_audit(db, current_user, AuditAction.VIEW, request, "templates",
              f"{modality or 'all'}:{body_part or 'all'}")

    return templates


@router.get("/{template_id}", response_model=schemas.ReportTemplateResponse)
async def get_template(
    request: Request,
    template_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    template = crud.get_report_template_by_id(db, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")

    if not template.is_public and template.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问此模板")

    log_audit(db, current_user, AuditAction.VIEW, request, "template", str(template_id))

    return template


@router.put("/{template_id}", response_model=schemas.ReportTemplateResponse)
async def update_template(
    request: Request,
    template_id: int,
    update_data: schemas.ReportTemplateUpdate,
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    template = crud.get_report_template_by_id(db, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")

    if template.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="无权修改此模板")

    updated = crud.update_report_template(
        db=db,
        template_id=template_id,
        name=update_data.name,
        findings_template=update_data.findings_template,
        impression_template=update_data.impression_template,
        recommendations_template=update_data.recommendations_template,
        is_default=update_data.is_default
    )

    log_audit(db, current_user, AuditAction.EDIT_REPORT, request,
              "template", str(template_id), {"action": "update"})

    return updated


@router.delete("/{template_id}")
async def delete_template(
    request: Request,
    template_id: int,
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    template = crud.get_report_template_by_id(db, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")

    if template.created_by != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="无权删除此模板")

    success = crud.delete_report_template(db, template_id)

    log_audit(db, current_user, AuditAction.EDIT_REPORT, request,
              "template", str(template_id), {"action": "delete"})

    return {"success": success}
