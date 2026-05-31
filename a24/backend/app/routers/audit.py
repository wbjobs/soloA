from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from typing import Optional, List
from ..database import get_db
from .. import schemas
from ..auth import get_current_user, require_roles
from ..models import User, UserRole, AuditLog, AuditAction
from datetime import datetime

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("/logs", response_model=List[schemas.AuditLogResponse])
async def get_audit_logs(
    user_id: Optional[int] = None,
    action: Optional[AuditAction] = None,
    resource_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(require_roles(UserRole.ADMIN)),
    db: Session = Depends(get_db)
):
    query = db.query(AuditLog)

    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        query = query.filter(AuditLog.action == action)
    if resource_type:
        query = query.filter(AuditLog.resource_type == resource_type)
    if start_date:
        query = query.filter(AuditLog.timestamp >= start_date)
    if end_date:
        query = query.filter(AuditLog.timestamp <= end_date)

    logs = query.order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit).all()
    return [schemas.AuditLogResponse.model_validate(log) for log in logs]


@router.get("/my-logs", response_model=List[schemas.AuditLogResponse])
async def get_my_logs(
    action: Optional[AuditAction] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(AuditLog).filter(AuditLog.user_id == current_user.id)
    if action:
        query = query.filter(AuditLog.action == action)
    logs = query.order_by(AuditLog.timestamp.desc()).offset(skip).limit(limit).all()
    return [schemas.AuditLogResponse.model_validate(log) for log in logs]
