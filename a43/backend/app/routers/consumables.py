from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, timedelta
from collections import defaultdict

from ..database import get_db
from ..models import (
    Consumable, ConsumableStock, ConsumableUsage, 
    ConsumableCabinet, ConsumableLock, PurchaseSuggestion,
    Reservation
)
from ..schemas import (
    Consumable as ConsumableSchema,
    ConsumableCreate,
    ConsumableStock as StockSchema,
    ConsumableStockCreate,
    ConsumableStockWithInfo,
    ConsumableUsage as UsageSchema,
    ConsumableUsageCreate,
    ConsumableCabinet as CabinetSchema,
    ConsumableCabinetCreate,
    CabinetStockInfo,
    PurchaseSuggestion as SuggestionSchema,
    StockCheckResult,
    ConsumableItem
)

router = APIRouter(prefix="/api/consumables", tags=["consumables"])

def calculate_daily_usage_rate(db: Session, consumable_id: str, days: int = 30) -> float:
    since = datetime.utcnow() - timedelta(days=days)
    total_usage = db.query(func.sum(ConsumableUsage.quantity)).filter(
        ConsumableUsage.consumable_id == consumable_id,
        ConsumableUsage.timestamp >= since
    ).scalar() or 0.0
    
    return total_usage / days if days > 0 else 0.0

def linear_regression_estimate(db: Session, consumable_id: str, days: int = 30) -> dict:
    since = datetime.utcnow() - timedelta(days=days)
    usages = db.query(ConsumableUsage).filter(
        ConsumableUsage.consumable_id == consumable_id,
        ConsumableUsage.timestamp >= since
    ).order_by(ConsumableUsage.timestamp.asc()).all()
    
    if len(usages) < 2:
        daily_rate = calculate_daily_usage_rate(db, consumable_id, days)
        return {"daily_rate": daily_rate, "r_squared": 0.0}
    
    n = len(usages)
    base_time = usages[0].timestamp
    x = []
    y = []
    cumulative = 0
    
    for usage in usages:
        days_diff = (usage.timestamp - base_time).total_seconds() / (24 * 3600)
        cumulative += usage.quantity
        x.append(days_diff)
        y.append(cumulative)
    
    x_mean = sum(x) / n
    y_mean = sum(y) / n
    
    numerator = sum((xi - x_mean) * (yi - y_mean) for xi, yi in zip(x, y))
    denominator = sum((xi - x_mean) ** 2 for xi in x)
    
    if denominator == 0:
        return {"daily_rate": 0, "r_squared": 0.0}
    
    slope = numerator / denominator
    intercept = y_mean - slope * x_mean
    
    y_pred = [slope * xi + intercept for xi in x]
    ss_tot = sum((yi - y_mean) ** 2 for yi in y)
    ss_res = sum((yi - yp) ** 2 for yi, yp in zip(y, y_pred))
    
    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0
    
    return {"daily_rate": max(slope, 0), "r_squared": r_squared}

def get_total_available_stock(db: Session, consumable_id: str) -> float:
    stocks = db.query(ConsumableStock).filter(
        ConsumableStock.consumable_id == consumable_id
    ).all()
    
    total = sum(s.quantity - s.reserved_quantity for s in stocks)
    return max(total, 0)

@router.get("/cabinets", response_model=List[CabinetSchema])
def get_cabinets(db: Session = Depends(get_db)):
    return db.query(ConsumableCabinet).all()

@router.post("/cabinets", response_model=CabinetSchema)
def create_cabinet(cabinet: ConsumableCabinetCreate, db: Session = Depends(get_db)):
    existing = db.query(ConsumableCabinet).filter(
        ConsumableCabinet.cabinet_id == cabinet.cabinet_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Cabinet already exists")
    
    db_cabinet = ConsumableCabinet(**cabinet.model_dump())
    db.add(db_cabinet)
    db.commit()
    db.refresh(db_cabinet)
    return db_cabinet

@router.get("/cabinets/{cabinet_id}/stock", response_model=List[ConsumableStockWithInfo])
def get_cabinet_stock(cabinet_id: str, db: Session = Depends(get_db)):
    cabinet = db.query(ConsumableCabinet).filter(
        ConsumableCabinet.cabinet_id == cabinet_id
    ).first()
    if not cabinet:
        raise HTTPException(status_code=404, detail="Cabinet not found")
    
    stocks = db.query(ConsumableStock).filter(
        ConsumableStock.cabinet_id == cabinet_id
    ).all()
    
    result = []
    for stock in stocks:
        stock_info = ConsumableStockWithInfo.model_validate(stock)
        stock_info.consumable = stock.consumable
        result.append(stock_info)
    
    return result

@router.get("/cabinets/stats", response_model=List[CabinetStockInfo])
def get_cabinets_stats(db: Session = Depends(get_db)):
    cabinets = db.query(ConsumableCabinet).all()
    stats = []
    
    for cabinet in cabinets:
        stocks = db.query(ConsumableStock).filter(
            ConsumableStock.cabinet_id == cabinet.cabinet_id
        ).all()
        
        total_items = len(stocks)
        total_quantity = sum(s.quantity for s in stocks)
        
        below_threshold = 0
        for stock in stocks:
            if stock.consumable:
                available = stock.quantity - stock.reserved_quantity
                if available < stock.consumable.safety_threshold:
                    below_threshold += 1
        
        max_possible = total_items * 100
        stock_level = (total_quantity / max_possible * 100) if max_possible > 0 else 50
        stock_level = min(max(stock_level, 0), 100)
        
        stats.append(CabinetStockInfo(
            cabinet_id=cabinet.cabinet_id,
            cabinet_name=cabinet.name,
            total_items=total_items,
            total_quantity=total_quantity,
            below_threshold_count=below_threshold,
            stock_level_percentage=stock_level
        ))
    
    return stats

@router.get("/", response_model=List[ConsumableSchema])
def get_consumables(
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Consumable)
    if category:
        query = query.filter(Consumable.category == category)
    return query.all()

@router.post("/", response_model=ConsumableSchema)
def create_consumable(consumable: ConsumableCreate, db: Session = Depends(get_db)):
    existing = db.query(Consumable).filter(
        Consumable.consumable_id == consumable.consumable_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Consumable already exists")
    
    db_consumable = Consumable(**consumable.model_dump())
    db.add(db_consumable)
    db.commit()
    db.refresh(db_consumable)
    return db_consumable

@router.get("/{consumable_id}", response_model=ConsumableSchema)
def get_consumable(consumable_id: str, db: Session = Depends(get_db)):
    consumable = db.query(Consumable).filter(
        Consumable.consumable_id == consumable_id
    ).first()
    if not consumable:
        raise HTTPException(status_code=404, detail="Consumable not found")
    return consumable

@router.post("/stock", response_model=StockSchema)
def add_stock(stock: ConsumableStockCreate, db: Session = Depends(get_db)):
    consumable = db.query(Consumable).filter(
        Consumable.consumable_id == stock.consumable_id
    ).first()
    if not consumable:
        raise HTTPException(status_code=404, detail="Consumable not found")
    
    cabinet = db.query(ConsumableCabinet).filter(
        ConsumableCabinet.cabinet_id == stock.cabinet_id
    ).first()
    if not cabinet:
        raise HTTPException(status_code=404, detail="Cabinet not found")
    
    existing = db.query(ConsumableStock).filter(
        ConsumableStock.consumable_id == stock.consumable_id,
        ConsumableStock.cabinet_id == stock.cabinet_id
    ).first()
    
    if existing:
        existing.quantity += stock.quantity
        if stock.lot_number:
            existing.lot_number = stock.lot_number
        if stock.expiry_date:
            existing.expiry_date = stock.expiry_date
        db.commit()
        db.refresh(existing)
        return existing
    
    db_stock = ConsumableStock(**stock.model_dump())
    db.add(db_stock)
    db.commit()
    db.refresh(db_stock)
    return db_stock

@router.post("/check-stock", response_model=StockCheckResult)
def check_stock_availability(items: List[ConsumableItem], db: Session = Depends(get_db)):
    shortages = []
    available_stocks = []
    all_available = True
    
    for item in items:
        consumable = db.query(Consumable).filter(
            Consumable.consumable_id == item.consumable_id
        ).first()
        
        if not consumable:
            shortages.append({
                "consumable_id": item.consumable_id,
                "name": "Unknown",
                "requested": item.quantity,
                "available": 0,
                "reason": "Consumable not found"
            })
            all_available = False
            continue
        
        available = get_total_available_stock(db, item.consumable_id)
        
        available_stocks.append({
            "consumable_id": item.consumable_id,
            "name": consumable.name,
            "unit": consumable.unit,
            "available": available,
            "safety_threshold": consumable.safety_threshold
        })
        
        if available < item.quantity:
            shortages.append({
                "consumable_id": item.consumable_id,
                "name": consumable.name,
                "unit": consumable.unit,
                "requested": item.quantity,
                "available": available,
                "deficit": item.quantity - available
            })
            all_available = False
    
    return StockCheckResult(
        available=all_available,
        message="All items available" if all_available else f"Shortages found: {len(shortages)} items",
        shortages=shortages,
        available_stocks=available_stocks
    )

@router.post("/usage", response_model=UsageSchema)
def record_usage(usage: ConsumableUsageCreate, db: Session = Depends(get_db)):
    consumable = db.query(Consumable).filter(
        Consumable.consumable_id == usage.consumable_id
    ).first()
    if not consumable:
        raise HTTPException(status_code=404, detail="Consumable not found")
    
    available = get_total_available_stock(db, usage.consumable_id)
    if available < usage.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock. Available: {available}, Requested: {usage.quantity}"
        )
    
    stocks = db.query(ConsumableStock).filter(
        ConsumableStock.consumable_id == usage.consumable_id
    ).order_by(ConsumableStock.expiry_date.asc().nullslast()).all()
    
    remaining = usage.quantity
    for stock in stocks:
        if remaining <= 0:
            break
        
        stock_available = stock.quantity - stock.reserved_quantity
        if stock_available <= 0:
            continue
        
        deduct = min(remaining, stock_available)
        stock.quantity -= deduct
        remaining -= deduct
    
    db_usage = ConsumableUsage(**usage.model_dump())
    db.add(db_usage)
    db.commit()
    db.refresh(db_usage)
    
    return db_usage

@router.get("/{consumable_id}/usage-history")
def get_usage_history(
    consumable_id: str,
    days: int = 30,
    db: Session = Depends(get_db)
):
    since = datetime.utcnow() - timedelta(days=days)
    usages = db.query(ConsumableUsage).filter(
        ConsumableUsage.consumable_id == consumable_id,
        ConsumableUsage.timestamp >= since
    ).order_by(ConsumableUsage.timestamp.desc()).all()
    
    stats = linear_regression_estimate(db, consumable_id, days)
    
    return {
        "consumable_id": consumable_id,
        "days": days,
        "total_usage": sum(u.quantity for u in usages),
        "usage_count": len(usages),
        "daily_usage_rate": stats["daily_rate"],
        "r_squared": stats["r_squared"],
        "usages": usages
    }

@router.post("/generate-suggestions", response_model=List[SuggestionSchema])
def generate_purchase_suggestions(db: Session = Depends(get_db)):
    consumables = db.query(Consumable).all()
    suggestions = []
    
    db.query(PurchaseSuggestion).filter(
        PurchaseSuggestion.status == "pending"
    ).delete()
    
    for consumable in consumables:
        current_stock = get_total_available_stock(db, consumable.consumable_id)
        
        stats = linear_regression_estimate(db, consumable.consumable_id, 30)
        daily_rate = stats["daily_rate"]
        
        estimated_days = None
        if daily_rate > 0:
            estimated_days = current_stock / daily_rate
        
        needs_reorder = False
        urgency = "normal"
        reason = ""
        
        if current_stock < consumable.safety_threshold:
            needs_reorder = True
            urgency = "critical"
            reason = f"Stock below safety threshold ({consumable.safety_threshold})"
        elif estimated_days is not None and estimated_days <= consumable.lead_time_days * 2:
            needs_reorder = True
            urgency = "high"
            reason = f"Estimated depletion in {estimated_days:.1f} days (lead time: {consumable.lead_time_days} days)"
        elif estimated_days is not None and estimated_days <= consumable.lead_time_days * 4:
            needs_reorder = True
            urgency = "medium"
            reason = f"Estimated depletion in {estimated_days:.1f} days"
        
        if needs_reorder:
            suggested_qty = max(
                consumable.min_order_quantity,
                daily_rate * consumable.lead_time_days * 3 if daily_rate > 0 else consumable.min_order_quantity
            )
            
            suggestion = PurchaseSuggestion(
                consumable_id=consumable.consumable_id,
                current_stock=current_stock,
                reserved_stock=sum(
                    s.reserved_quantity for s in db.query(ConsumableStock).filter(
                        ConsumableStock.consumable_id == consumable.consumable_id
                    ).all()
                ),
                safety_threshold=consumable.safety_threshold,
                daily_usage_rate=daily_rate,
                estimated_days_to_empty=estimated_days,
                suggested_quantity=suggested_qty,
                urgency_level=urgency,
                reason=reason,
                status="pending"
            )
            
            db.add(suggestion)
            suggestions.append(suggestion)
    
    db.commit()
    
    for suggestion in suggestions:
        db.refresh(suggestion)
    
    return suggestions

@router.get("/purchase-suggestions", response_model=List[SuggestionSchema])
def get_purchase_suggestions(
    status: Optional[str] = None,
    urgency: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(PurchaseSuggestion)
    
    if status:
        query = query.filter(PurchaseSuggestion.status == status)
    if urgency:
        query = query.filter(PurchaseSuggestion.urgency_level == urgency)
    
    return query.order_by(
        PurchaseSuggestion.urgency_level.desc(),
        PurchaseSuggestion.generated_at.desc()
    ).all()

@router.put("/purchase-suggestions/{suggestion_id}/approve")
def approve_suggestion(suggestion_id: int, db: Session = Depends(get_db)):
    suggestion = db.query(PurchaseSuggestion).filter(
        PurchaseSuggestion.id == suggestion_id
    ).first()
    
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    
    suggestion.status = "approved"
    db.commit()
    
    return {"message": "Suggestion approved", "id": suggestion_id}

@router.put("/purchase-suggestions/{suggestion_id}/complete")
def complete_suggestion(suggestion_id: int, db: Session = Depends(get_db)):
    suggestion = db.query(PurchaseSuggestion).filter(
        PurchaseSuggestion.id == suggestion_id
    ).first()
    
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    
    suggestion.status = "completed"
    db.commit()
    
    return {"message": "Suggestion marked as completed", "id": suggestion_id}
