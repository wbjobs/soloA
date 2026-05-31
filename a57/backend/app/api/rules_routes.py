from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional
from datetime import datetime, timedelta

from ..services.service_manager import ServiceManager

router = APIRouter(prefix="/api/rules", tags=["Association Rules"])

def get_service_manager():
    return ServiceManager()

@router.post("/mine")
async def mine_association_rules(
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    device_ids: Optional[str] = Query(None, description="Comma-separated list of device IDs"),
    time_window_minutes: int = Query(5, ge=1, le=60),
    min_support: float = Query(0.1, ge=0.01, le=1.0),
    min_confidence: float = Query(0.5, ge=0.01, le=1.0),
    min_lift: float = Query(1.0, ge=0.01),
    service_manager: ServiceManager = Depends(get_service_manager)
):
    try:
        if not end_time:
            end_time = datetime.now()
        
        if not start_time:
            start_time = end_time - timedelta(days=7)
        
        device_list = [d.strip() for d in device_ids.split(',')] if device_ids else None
        
        anomalies = service_manager.influxdb_service.query_anomalies(
            start_time=start_time,
            end_time=end_time,
            device_ids=device_list
        )
        
        if len(anomalies) < 5:
            return {
                "message": "Not enough anomalies to mine rules. Need at least 5 anomalies.",
                "anomalies_count": len(anomalies),
                "rules": []
            }
        
        from ..services.association_rules import AssociationRuleMiner
        rule_miner = AssociationRuleMiner()
        
        if min_support != 0.1 or min_confidence != 0.5 or min_lift != 1.0:
            from ..services.association_rules import AprioriAlgorithm
            rule_miner.apriori = AprioriAlgorithm(
                min_support=min_support,
                min_confidence=min_confidence,
                min_lift=min_lift
            )
        
        rules = rule_miner.mine_rules(anomalies, time_window_minutes)
        
        service_manager.rule_miner = rule_miner
        
        return {
            "message": "Association rules mined successfully",
            "anomalies_count": len(anomalies),
            "rules_count": len(rules),
            "rules": rules,
            "parameters": {
                "time_window_minutes": time_window_minutes,
                "min_support": min_support,
                "min_confidence": min_confidence,
                "min_lift": min_lift
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("")
async def get_rules(
    min_lift: Optional[float] = Query(None, ge=0.01),
    min_confidence: Optional[float] = Query(None, ge=0.01),
    limit: int = Query(100, ge=1, le=1000),
    service_manager: ServiceManager = Depends(get_service_manager)
):
    try:
        rules = service_manager.rule_miner.get_rules(
            min_lift=min_lift,
            min_confidence=min_confidence,
            limit=limit
        )
        
        return {
            "count": len(rules),
            "rules": rules,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/graph")
async def get_rules_graph(
    min_lift: Optional[float] = Query(None, ge=0.01),
    min_confidence: Optional[float] = Query(None, ge=0.01),
    service_manager: ServiceManager = Depends(get_service_manager)
):
    try:
        rules = service_manager.rule_miner.get_rules(
            min_lift=min_lift,
            min_confidence=min_confidence
        )
        
        nodes = set()
        edges = []
        
        for rule in rules:
            for antecedent in rule["antecedents"]:
                nodes.add(antecedent)
            
            for consequent in rule["consequents"]:
                nodes.add(consequent)
            
            for antecedent in rule["antecedents"]:
                for consequent in rule["consequents"]:
                    edges.append({
                        "source": antecedent,
                        "target": consequent,
                        "support": rule["support"],
                        "confidence": rule["confidence"],
                        "lift": rule["lift"],
                        "rule_id": rule["id"]
                    })
        
        return {
            "nodes": [{"id": node, "name": node} for node in nodes],
            "edges": edges,
            "rules_count": len(rules),
            "nodes_count": len(nodes),
            "edges_count": len(edges)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{rule_id}")
async def get_rule_by_id(
    rule_id: str,
    service_manager: ServiceManager = Depends(get_service_manager)
):
    try:
        rules = service_manager.rule_miner.get_rules()
        rule = next((r for r in rules if r.get("id") == rule_id), None)
        
        if not rule:
            raise HTTPException(status_code=404, detail=f"Rule {rule_id} not found")
        
        return rule
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
