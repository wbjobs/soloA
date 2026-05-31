from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from typing import Optional
from ..database import get_db
from .. import crud, schemas
from ..auth import get_current_user, require_roles, log_audit
from ..models import User, UserRole, AuditAction, Study

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/study/{study_id}", response_model=Optional[schemas.ReportResponse])
async def get_report(
    request: Request,
    study_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    study = db.query(Study).filter(Study.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="检查不存在")

    report = crud.get_report_by_study(db, study_id)
    log_audit(db, current_user, AuditAction.VIEW, request, "report", str(study_id))
    if report:
        return schemas.ReportResponse.model_validate(report)
    return None


@router.post("/study/{study_id}", response_model=schemas.ReportResponse)
async def create_or_update_report(
    request: Request,
    study_id: int,
    report_data: schemas.ReportBase,
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    study = db.query(Study).filter(Study.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="检查不存在")

    report = crud.create_or_update_report(
        db,
        study_id=study_id,
        doctor_id=current_user.id,
        findings=report_data.findings,
        impression=report_data.impression,
        recommendations=report_data.recommendations,
        follow_up=report_data.follow_up,
        is_final=report_data.is_final
    )

    log_audit(db, current_user, AuditAction.EDIT_REPORT, request, "report", str(study_id),
              {"is_final": report_data.is_final})

    return schemas.ReportResponse.model_validate(report)


@router.post("/study/{study_id}/finalize", response_model=schemas.ReportResponse)
async def finalize_report(
    request: Request,
    study_id: int,
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    study = db.query(Study).filter(Study.id == study_id).first()
    if not study:
        raise HTTPException(status_code=404, detail="检查不存在")

    report = crud.get_report_by_study(db, study_id)
    if not report:
        raise HTTPException(status_code=400, detail="报告不存在，请先创建报告")

    if report.is_final:
        raise HTTPException(status_code=400, detail="报告已终结，无法再次修改")

    report.is_final = True
    db.commit()
    db.refresh(report)

    log_audit(db, current_user, AuditAction.EDIT_REPORT, request, "report", str(study_id),
              {"action": "finalize"})

    return schemas.ReportResponse.model_validate(report)
