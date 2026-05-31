from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_db
from ..models import Alert
from ..schemas import Alert as AlertSchema

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

@router.get("/", response_model=List[AlertSchema])
def get_alerts(
    device_id: Optional[str] = None,
    acknowledged: Optional[bool] = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    query = db.query(Alert)
    
    if device_id:
        query = query.filter(Alert.device_id == device_id)
    if acknowledged is not None:
        query = query.filter(Alert.acknowledged == acknowledged)
    
    return query.order_by(Alert.timestamp.desc()).limit(limit).all()

@router.get("/active", response_model=List[AlertSchema])
def get_active_alerts(
    device_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Alert).filter(Alert.acknowledged == False)
    if device_id:
        query = query.filter(Alert.device_id == device_id)
    return query.order_by(Alert.timestamp.desc()).all()

@router.put("/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    alert.acknowledged = True
    db.commit()
    return {"message": "Alert acknowledged", "id": alert_id}

@router.put("/acknowledge-all")
def acknowledge_all_alerts(
    device_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Alert).filter(Alert.acknowledged == False)
    if device_id:
        query = query.filter(Alert.device_id == device_id)
    
    count = query.update({"acknowledged": True}, synchronize_session=False)
    db.commit()
    return {"message": f"Acknowledged {count} alerts", "count": count}

@router.get("/stats")
def get_alert_stats(
    device_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Alert)
    if device_id:
        query = query.filter(Alert.device_id == device_id)
    
    total = query.count()
    active = query.filter(Alert.acknowledged == False).count()
    acknowledged = total - active
    
    return {
        "total": total,
        "active": active,
        "acknowledged": acknowledged
    }
