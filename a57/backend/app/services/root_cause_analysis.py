from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Set, Tuple
from collections import defaultdict
import heapq

from ..config import settings
from .topology_manager import DeviceTopologyManager


class RootCauseCandidate:
    def __init__(
        self,
        device_id: str,
        sensor_type: str,
        score: float,
        evidence: List[str],
        source: str,
        confidence: float = 0.0
    ):
        self.device_id = device_id
        self.sensor_type = sensor_type
        self.score = score
        self.evidence = evidence
        self.source = source
        self.confidence = confidence
        self.fault_location = self._infer_fault_location()
    
    def _infer_fault_location(self) -> str:
        sensor_locations = {
            "temperature": "设备温度监测点",
            "pressure": "压力传感器位置",
            "vibration": "振动监测点",
            "humidity": "环境湿度传感器",
            "current": "电流监测模块",
            "voltage": "电压检测点"
        }
        sensor = self.sensor_type.lower()
        base_location = sensor_locations.get(sensor, f"{self.sensor_type}传感器位置")
        return f"{self.device_id} - {base_location}"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "device_id": self.device_id,
            "sensor_type": self.sensor_type,
            "score": round(self.score, 4),
            "confidence": round(self.confidence, 4),
            "evidence": self.evidence,
            "source": self.source,
            "fault_location": self.fault_location,
            "node_id": f"{self.device_id}_{self.sensor_type}"
        }


class RootCauseAnalyzer:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self.topology_manager = DeviceTopologyManager()
        self.min_lift = settings.ROOT_CAUSE_MIN_LIFT
        self.min_confidence = settings.ROOT_CAUSE_MIN_CONFIDENCE
        self.max_depth = settings.ROOT_CAUSE_MAX_DEPTH
        self._initialized = True
    
    def analyze_alert_root_cause(
        self,
        alert: Dict[str, Any],
        anomalies: List[Dict[str, Any]],
        rules: List[Dict[str, Any]] = None,
        time_window_minutes: int = 30
    ) -> Dict[str, Any]:
        if not alert:
            return {"error": "No alert data provided", "candidates": []}
        
        alert_device = alert.get("device_id")
        alert_sensor = alert.get("sensor_type")
        alert_time = alert.get("timestamp")
        
        if not all([alert_device, alert_sensor]):
            return {"error": "Missing required alert fields", "candidates": []}
        
        candidates = []
        evidence_summary = defaultdict(list)
        
        if rules:
            rule_candidates = self._analyze_by_rules(
                alert_device, alert_sensor, rules, anomalies
            )
            candidates.extend(rule_candidates)
        
        topology_candidates = self._analyze_by_topology(
            alert_device, alert_sensor, anomalies
        )
        candidates.extend(topology_candidates)
        
        historical_candidates = self._analyze_historical_patterns(
            alert_device, alert_sensor, anomalies, time_window_minutes
        )
        candidates.extend(historical_candidates)
        
        merged_candidates = self._merge_and_rank_candidates(candidates)
        
        return {
            "alert": {
                "device_id": alert_device,
                "sensor_type": alert_sensor,
                "timestamp": alert_time.isoformat() if isinstance(alert_time, datetime) else alert_time
            },
            "candidates": [c.to_dict() for c in merged_candidates],
            "top_candidates": [c.to_dict() for c in merged_candidates[:3]],
            "analysis_timestamp": datetime.now().isoformat(),
            "total_candidates": len(merged_candidates)
        }
    
    def _analyze_by_rules(
        self,
        alert_device: str,
        alert_sensor: str,
        rules: List[Dict[str, Any]],
        anomalies: List[Dict[str, Any]]
    ) -> List[RootCauseCandidate]:
        candidates = []
        alert_node = f"{alert_device}_{alert_sensor}"
        
        strong_rules = [
            r for r in rules 
            if r.get("lift", 0) >= self.min_lift 
            and r.get("confidence", 0) >= self.min_confidence
        ]
        
        for rule in strong_rules:
            antecedents = rule.get("antecedents", [])
            consequents = rule.get("consequents", [])
            
            if alert_node in consequents:
                for antecedent in antecedents:
                    parts = antecedent.split("_", 1)
                    if len(parts) >= 2:
                        device_id = parts[0]
                        sensor_type = parts[1]
                        
                        if device_id == alert_device and sensor_type == alert_sensor:
                            continue
                        
                        has_anomaly = any(
                            a.get("device_id") == device_id 
                            and a.get("sensor_type") == sensor_type 
                            for a in anomalies
                        )
                        
                        if has_anomaly or device_id != alert_device:
                            score = rule.get("lift", 1.0) * rule.get("confidence", 0.5)
                            confidence = rule.get("confidence", 0.5)
                            
                            evidence = [
                                f"关联规则显示: {antecedent} → {alert_node}",
                                f"提升度(Lift): {rule.get('lift', 0):.3f}",
                                f"置信度: {rule.get('confidence', 0)*100:.1f}%"
                            ]
                            
                            if rule.get("rule_id"):
                                evidence.append(f"规则ID: {rule['rule_id']}")
                            
                            candidates.append(RootCauseCandidate(
                                device_id=device_id,
                                sensor_type=sensor_type,
                                score=score * 1.2,
                                evidence=evidence,
                                source="association_rules",
                                confidence=confidence
                            ))
            
            if alert_node in antecedents:
                for consequent in consequents:
                    parts = consequent.split("_", 1)
                    if len(parts) >= 2:
                        device_id = parts[0]
                        sensor_type = parts[1]
                        
                        if device_id == alert_device and sensor_type == alert_sensor:
                            continue
                        
                        has_anomaly = any(
                            a.get("device_id") == device_id 
                            and a.get("sensor_type") == sensor_type 
                            for a in anomalies
                        )
                        
                        if has_anomaly:
                            score = rule.get("lift", 1.0) * 0.8
                            confidence = rule.get("confidence", 0.5) * 0.8
                            
                            evidence = [
                                f"可能是 {alert_node} 异常的连锁影响",
                                f"相关规则: {alert_node} → {consequent}",
                                f"该传感器在同一时间窗口内也检测到异常"
                            ]
                            
                            candidates.append(RootCauseCandidate(
                                device_id=device_id,
                                sensor_type=sensor_type,
                                score=score,
                                evidence=evidence,
                                source="rule_consequence",
                                confidence=confidence
                            ))
        
        return candidates
    
    def _analyze_by_topology(
        self,
        alert_device: str,
        alert_sensor: str,
        anomalies: List[Dict[str, Any]]
    ) -> List[RootCauseCandidate]:
        candidates = []
        
        related = self.topology_manager.find_all_related_nodes(
            alert_device, alert_sensor, max_depth=self.max_depth
        )
        
        upstream_nodes = related.get("upstream", [])
        
        for node in upstream_nodes:
            has_anomaly = any(
                a.get("device_id") == node["device_id"] 
                and a.get("sensor_type") == node["sensor_type"]
                for a in anomalies
            )
            
            if has_anomaly:
                weight = node.get("total_weight", 1.0)
                depth = node.get("depth", 1)
                
                score = weight * (1.0 / (depth * 0.5 + 0.5))
                confidence = min(weight * 0.3, 0.9)
                
                evidence = [
                    f"拓扑关系: 上游节点 (深度 {depth})",
                    f"关系权重: {weight:.2f}",
                    f"该传感器在同一时间窗口内检测到异常",
                    f"故障传播方向: {node['device_id']}_{node['sensor_type']} → {alert_device}_{alert_sensor}"
                ]
                
                if weight >= 2.0:
                    evidence.append("⚠️ 这是强因果关系节点")
                
                candidates.append(RootCauseCandidate(
                    device_id=node["device_id"],
                    sensor_type=node["sensor_type"],
                    score=score * 1.5,
                    evidence=evidence,
                    source="topology_upstream",
                    confidence=confidence
                ))
        
        downstream_nodes = related.get("downstream", [])
        for node in downstream_nodes:
            has_anomaly = any(
                a.get("device_id") == node["device_id"] 
                and a.get("sensor_type") == node["sensor_type"]
                for a in anomalies
            )
            
            if has_anomaly:
                weight = node.get("total_weight", 1.0)
                depth = node.get("depth", 1)
                
                score = weight * 0.5 / (depth + 0.5)
                confidence = 0.3
                
                evidence = [
                    f"拓扑关系: 下游节点 (深度 {depth})",
                    f"可能是 {alert_device}_{alert_sensor} 异常的影响结果",
                    f"但也可能存在共同根因"
                ]
                
                candidates.append(RootCauseCandidate(
                    device_id=node["device_id"],
                    sensor_type=node["sensor_type"],
                    score=score,
                    evidence=evidence,
                    source="topology_downstream",
                    confidence=confidence
                ))
        
        same_device_anomalies = [
            a for a in anomalies 
            if a.get("device_id") == alert_device 
            and a.get("sensor_type") != alert_sensor
        ]
        
        for a in same_device_anomalies:
            neighbors = self.topology_manager.get_neighbors(
                alert_device, a["sensor_type"]
            )
            
            is_connected = any(
                n[0] == alert_device and n[1] == alert_sensor
                for n in neighbors
            )
            
            if is_connected:
                candidates.append(RootCauseCandidate(
                    device_id=a["device_id"],
                    sensor_type=a["sensor_type"],
                    score=0.8,
                    evidence=[
                        f"同一设备 {alert_device} 的其他传感器异常",
                        f"传感器: {a['sensor_type']}",
                        f"异常值: {a.get('value', 'N/A')}",
                        "与告警传感器存在拓扑连接"
                    ],
                    source="same_device",
                    confidence=0.6
                ))
        
        return candidates
    
    def _analyze_historical_patterns(
        self,
        alert_device: str,
        alert_sensor: str,
        anomalies: List[Dict[str, Any]],
        time_window_minutes: int
    ) -> List[RootCauseCandidate]:
        candidates = []
        
        if not anomalies:
            return candidates
        
        anomaly_count = defaultdict(int)
        for a in anomalies:
            key = f"{a.get('device_id')}_{a.get('sensor_type')}"
            anomaly_count[key] += 1
        
        for key, count in anomaly_count.items():
            parts = key.split("_", 1)
            if len(parts) < 2:
                continue
            
            device_id = parts[0]
            sensor_type = parts[1]
            
            if device_id == alert_device and sensor_type == alert_sensor:
                continue
            
            frequency_score = count / len(anomalies) if anomalies else 0
            
            if frequency_score > 0.1:
                time_proximity = 1.0
                
                if count >= 3:
                    score = frequency_score * 2.0 * time_proximity
                    confidence = min(frequency_score * 1.5, 0.8)
                    
                    evidence = [
                        f"在 {time_window_minutes} 分钟时间窗口内检测到 {count} 次异常",
                        f"异常频率: {frequency_score*100:.1f}%",
                        "高频异常可能暗示系统性问题"
                    ]
                    
                    candidates.append(RootCauseCandidate(
                        device_id=device_id,
                        sensor_type=sensor_type,
                        score=score,
                        evidence=evidence,
                        source="historical_frequency",
                        confidence=confidence
                    ))
        
        return candidates
    
    def _merge_and_rank_candidates(
        self,
        candidates: List[RootCauseCandidate]
    ) -> List[RootCauseCandidate]:
        if not candidates:
            return []
        
        merged = defaultdict(list)
        for c in candidates:
            key = f"{c.device_id}_{c.sensor_type}"
            merged[key].append(c)
        
        final_candidates = []
        
        for key, group in merged.items():
            base = group[0]
            
            total_score = sum(c.score for c in group)
            max_confidence = max(c.confidence for c in group)
            
            sources = set(c.source for c in group)
            source_bonus = len(sources) * 0.2
            
            all_evidence = []
            for c in group:
                source_label = {
                    "association_rules": "📊 关联规则",
                    "rule_consequence": "📊 规则关联",
                    "topology_upstream": "🔗 拓扑上游",
                    "topology_downstream": "🔗 拓扑下游",
                    "same_device": "📦 同设备",
                    "historical_frequency": "📈 历史模式"
                }.get(c.source, c.source)
                
                for e in c.evidence:
                    all_evidence.append(f"[{source_label}] {e}")
            
            final_candidates.append(RootCauseCandidate(
                device_id=base.device_id,
                sensor_type=base.sensor_type,
                score=total_score + source_bonus,
                evidence=all_evidence,
                source=" + ".join(sorted(list(sources))),
                confidence=min(max_confidence + source_bonus * 0.2, 1.0)
            ))
        
        final_candidates.sort(key=lambda c: (c.score, c.confidence), reverse=True)
        
        return final_candidates
    
    def get_root_cause_summary(
        self,
        analysis_result: Dict[str, Any]
    ) -> Dict[str, Any]:
        candidates = analysis_result.get("candidates", [])
        top_candidates = analysis_result.get("top_candidates", [])
        
        if not top_candidates:
            return {
                "has_root_cause": False,
                "summary": "未发现明确的根因，请检查更多历史数据或扩展分析时间范围"
            }
        
        primary = top_candidates[0]
        
        recommendations = []
        for i, c in enumerate(top_candidates[:3], 1):
            rec = (
                f"推荐 #{i}: 检查 {c['fault_location']}\n"
                f"  - 置信度: {c['confidence']*100:.1f}%\n"
                f"  - 评分: {c['score']:.3f}\n"
                f"  - 证据来源: {c['source']}"
            )
            recommendations.append(rec)
        
        return {
            "has_root_cause": True,
            "primary_root_cause": {
                "device_id": primary["device_id"],
                "sensor_type": primary["sensor_type"],
                "fault_location": primary["fault_location"],
                "confidence": round(primary["confidence"], 4),
                "score": round(primary["score"], 4)
            },
            "recommendations": recommendations,
            "evidence_count": sum(len(c.get("evidence", [])) for c in candidates),
            "analysis_timestamp": datetime.now().isoformat()
        }
    
    def generate_report_url(self, alert_id: str) -> str:
        base_url = settings.REPORT_BASE_URL.rstrip("/")
        return f"{base_url}/alerts?trace={alert_id}"
