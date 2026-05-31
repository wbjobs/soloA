import uuid
from datetime import datetime
from typing import List, Dict, Any, Set, Tuple, Optional
from collections import defaultdict
import itertools
import math

from ..config import settings

class AprioriAlgorithm:
    def __init__(
        self,
        min_support: float = None,
        min_confidence: float = None,
        min_lift: float = None
    ):
        self.min_support = min_support or settings.APRIORI_MIN_SUPPORT
        self.min_confidence = min_confidence or settings.APRIORI_MIN_CONFIDENCE
        self.min_lift = min_lift or settings.APRIORI_MIN_LIFT

    def _validate_transaction(self, transaction: List[str]) -> bool:
        if not transaction:
            return False
        
        cleaned_items = []
        for item in transaction:
            if item is None:
                continue
            if isinstance(item, str) and item.strip() == "":
                continue
            if not isinstance(item, str):
                item = str(item)
            cleaned_items.append(item.strip())
        
        return len(cleaned_items) > 0

    def _clean_transactions(self, transactions: List[List[str]]) -> List[List[str]]:
        cleaned = []
        
        for transaction in transactions:
            if transaction is None:
                continue
            
            if isinstance(transaction, dict):
                items = list(transaction.values())
            elif isinstance(transaction, (list, tuple, set)):
                items = list(transaction)
            else:
                continue
            
            cleaned_items = []
            for item in items:
                if item is None:
                    continue
                if isinstance(item, str):
                    item_stripped = item.strip()
                    if item_stripped and item_stripped.lower() not in ["none", "null", "nan", ""]:
                        cleaned_items.append(item_stripped)
                elif isinstance(item, (int, float)):
                    if not (isinstance(item, float) and math.isnan(item)):
                        cleaned_items.append(str(item))
            
            if len(cleaned_items) > 0:
                cleaned.append(cleaned_items)
        
        return cleaned

    def _create_c1(self, transactions: List[List[str]]) -> Set[frozenset]:
        c1 = set()
        for transaction in transactions:
            if transaction:
                for item in transaction:
                    if item:
                        c1.add(frozenset([item]))
        return c1

    def _scan_dataset(
        self,
        transactions: List[List[str]],
        candidate_sets: Set[frozenset],
        min_support: float
    ) -> Tuple[Set[frozenset], Dict[frozenset, float]]:
        item_counts = defaultdict(int)
        num_transactions = len(transactions)
        
        if num_transactions == 0:
            return set(), {}
        
        for transaction in transactions:
            if not transaction:
                continue
            
            transaction_set = set(transaction)
            for candidate in candidate_sets:
                if candidate.issubset(transaction_set):
                    item_counts[candidate] += 1
        
        frequent_itemsets = set()
        support_data = {}
        
        for itemset, count in item_counts.items():
            support = count / num_transactions
            if support >= min_support:
                frequent_itemsets.add(itemset)
                support_data[itemset] = support
        
        return frequent_itemsets, support_data

    def _apriori_gen(self, frequent_itemsets: Set[frozenset], k: int) -> Set[frozenset]:
        candidate_sets = set()
        frequent_list = list(frequent_itemsets)
        
        if len(frequent_list) < 2:
            return candidate_sets
        
        for i in range(len(frequent_list)):
            for j in range(i + 1, len(frequent_list)):
                try:
                    l1 = list(frequent_list[i])[:k-2]
                    l2 = list(frequent_list[j])[:k-2]
                    l1.sort()
                    l2.sort()
                    
                    if l1 == l2:
                        candidate = frequent_list[i] | frequent_list[j]
                        candidate_sets.add(candidate)
                except Exception:
                    continue
        
        return candidate_sets

    def _generate_rules(
        self,
        frequent_itemsets: Set[frozenset],
        support_data: Dict[frozenset, float],
        num_transactions: int
    ) -> List[Dict[str, Any]]:
        rules = []
        
        for freq_set in frequent_itemsets:
            if len(freq_set) < 2:
                continue
            
            if freq_set not in support_data:
                continue
            
            for i in range(1, len(freq_set)):
                try:
                    for antecedent in itertools.combinations(freq_set, i):
                        antecedent_set = frozenset(antecedent)
                        consequent_set = freq_set - antecedent_set
                        
                        if len(consequent_set) == 0:
                            continue
                        
                        if antecedent_set not in support_data or consequent_set not in support_data:
                            continue
                        
                        support = support_data[freq_set]
                        antecedent_support = support_data[antecedent_set]
                        
                        if antecedent_support == 0:
                            continue
                        
                        confidence = support / antecedent_support
                        
                        if confidence < self.min_confidence:
                            continue
                        
                        consequent_support = support_data[consequent_set]
                        if consequent_support == 0:
                            continue
                        
                        lift = confidence / consequent_support
                        
                        if lift < self.min_lift:
                            continue
                        
                        expected_confidence = consequent_support
                        leverage = support - (antecedent_support * consequent_support)
                        
                        if confidence == 1.0:
                            conviction = float('inf')
                        else:
                            denom = 1 - confidence
                            conviction = (1 - expected_confidence) / denom if denom != 0 else float('inf')
                        
                        rules.append({
                            "id": str(uuid.uuid4()),
                            "antecedents": sorted(list(antecedent_set)),
                            "consequents": sorted(list(consequent_set)),
                            "support": support,
                            "confidence": confidence,
                            "lift": lift,
                            "leverage": leverage,
                            "conviction": conviction,
                            "created_at": datetime.now()
                        })
                except Exception:
                    continue
        
        return rules

    def fit(
        self,
        transactions: List[List[str]]
    ) -> Tuple[Dict[frozenset, float], List[Dict[str, Any]]]:
        cleaned_transactions = self._clean_transactions(transactions)
        
        if len(cleaned_transactions) < 2:
            raise ValueError("Need at least 2 valid transactions for association rule mining")
        
        num_transactions = len(cleaned_transactions)
        
        c1 = self._create_c1(cleaned_transactions)
        
        if len(c1) == 0:
            return {}, []
        
        l1, support_data = self._scan_dataset(cleaned_transactions, c1, self.min_support)
        
        all_frequent_itemsets = l1.copy()
        k = 2
        current_l = l1
        
        while len(current_l) > 0 and k <= 10:
            ck = self._apriori_gen(current_l, k)
            
            if len(ck) == 0:
                break
            
            lk, support_data_k = self._scan_dataset(cleaned_transactions, ck, self.min_support)
            
            support_data.update(support_data_k)
            all_frequent_itemsets.update(lk)
            current_l = lk
            k += 1
        
        rules = self._generate_rules(all_frequent_itemsets, support_data, num_transactions)
        
        return support_data, rules


class AssociationRuleMiner:
    def __init__(self):
        self.apriori = AprioriAlgorithm()
        self.rules_cache: List[Dict[str, Any]] = []

    def _validate_anomaly(self, anomaly: Dict[str, Any]) -> bool:
        if not anomaly or not isinstance(anomaly, dict):
            return False
        
        required_fields = ["device_id", "sensor_type", "method", "timestamp"]
        
        for field in required_fields:
            value = anomaly.get(field)
            if value is None:
                return False
            if isinstance(value, str) and value.strip() == "":
                return False
        
        return True

    def _prepare_transactions_from_anomalies(
        self,
        anomalies: List[Dict[str, Any]],
        time_window_minutes: int = 5
    ) -> List[List[str]]:
        if not anomalies or len(anomalies) == 0:
            return []
        
        valid_anomalies = []
        for anomaly in anomalies:
            if self._validate_anomaly(anomaly):
                valid_anomalies.append(anomaly)
        
        if len(valid_anomalies) == 0:
            return []
        
        try:
            sorted_anomalies = sorted(
                valid_anomalies,
                key=lambda x: x["timestamp"] if x.get("timestamp") else datetime.min
            )
        except Exception:
            sorted_anomalies = valid_anomalies
        
        transactions = []
        current_transaction = []
        
        try:
            window_start = sorted_anomalies[0]["timestamp"]
        except Exception:
            return []
        
        for anomaly in sorted_anomalies:
            try:
                timestamp = anomaly.get("timestamp")
                if timestamp is None:
                    continue
                
                device_id = anomaly.get("device_id", "")
                sensor_type = anomaly.get("sensor_type", "")
                method = anomaly.get("method", "")
                
                if not all([device_id, sensor_type, method]):
                    continue
                
                item = f"{device_id}_{sensor_type}_{method}"
                
                time_diff = (timestamp - window_start).total_seconds() / 60
                
                if time_diff > time_window_minutes:
                    if current_transaction:
                        transactions.append(current_transaction)
                    current_transaction = [item]
                    window_start = timestamp
                else:
                    if item not in current_transaction:
                        current_transaction.append(item)
            except Exception:
                continue
        
        if current_transaction:
            transactions.append(current_transaction)
        
        return transactions

    def mine_rules(
        self,
        anomalies: List[Dict[str, Any]],
        time_window_minutes: int = 5
    ) -> List[Dict[str, Any]]:
        if not anomalies or len(anomalies) < 5:
            return []
        
        try:
            transactions = self._prepare_transactions_from_anomalies(anomalies, time_window_minutes)
            
            if len(transactions) < 2:
                return []
            
            _, rules = self.apriori.fit(transactions)
            
            self.rules_cache = rules
            
            return rules
        except Exception as e:
            print(f"Error mining association rules: {e}")
            return []

    def get_rules(
        self,
        min_lift: Optional[float] = None,
        min_confidence: Optional[float] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        if not self.rules_cache:
            return []
        
        filtered = []
        for rule in self.rules_cache:
            try:
                if min_lift is not None:
                    lift = rule.get("lift")
                    if lift is None or lift < min_lift:
                        continue
                
                if min_confidence is not None:
                    conf = rule.get("confidence")
                    if conf is None or conf < min_confidence:
                        continue
                
                filtered.append(rule)
            except Exception:
                continue
        
        try:
            filtered = sorted(filtered, key=lambda x: x.get("lift", 0), reverse=True)
        except Exception:
            pass
        
        return filtered[:limit]
