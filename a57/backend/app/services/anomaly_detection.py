import numpy as np
from typing import List, Dict, Any, Tuple
from datetime import datetime
from sklearn.ensemble import IsolationForest
from scipy import stats

from ..config import settings

class ThreeSigmaDetector:
    def __init__(self, threshold: float = None):
        self.threshold = threshold or settings.THREE_SIGMA_THRESHOLD
        self.mean = None
        self.std = None
        self.median = None
        self.mad = None

    def fit(self, data: List[float]):
        if len(data) < 10:
            raise ValueError("Need at least 10 data points to fit 3-sigma model")
        
        data_array = np.array(data)
        
        q1 = np.percentile(data_array, 25)
        q3 = np.percentile(data_array, 75)
        iqr = q3 - q1
        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr
        
        filtered_data = data_array[(data_array >= lower_bound) & (data_array <= upper_bound)]
        
        if len(filtered_data) < 5:
            filtered_data = data_array
        
        self.mean = np.mean(filtered_data)
        self.std = np.std(filtered_data)
        self.median = np.median(filtered_data)
        self.mad = stats.median_abs_deviation(filtered_data)
        
        if self.std == 0:
            self.std = 1e-6

    def detect(self, value: float) -> Tuple[bool, Dict[str, Any]]:
        if self.mean is None or self.std is None:
            raise ValueError("Model not fitted. Call fit() first.")
        
        z_score = abs((value - self.mean) / self.std)
        
        mad_threshold = 3.0
        modified_z_score = abs(0.6745 * (value - self.median) / self.mad) if self.mad != 0 else 0
        
        is_anomaly = z_score > self.threshold
        
        details = {
            "mean": float(self.mean),
            "std": float(self.std),
            "median": float(self.median),
            "mad": float(self.mad),
            "z_score": float(z_score),
            "modified_z_score": float(modified_z_score),
            "threshold": self.threshold,
            "upper_bound": float(self.mean + self.threshold * self.std),
            "lower_bound": float(self.mean - self.threshold * self.std),
            "mad_upper_bound": float(self.median + mad_threshold * self.mad),
            "mad_lower_bound": float(self.median - mad_threshold * self.mad)
        }
        
        return is_anomaly, details

    def detect_batch(self, values: List[float]) -> List[Tuple[bool, Dict[str, Any]]]:
        return [self.detect(v) for v in values]


class IsolationForestDetector:
    def __init__(self, contamination: float = None):
        self.contamination = contamination or settings.ISOLATION_FOREST_CONTAMINATION
        self.model = None
        self.score_threshold = None

    def fit(self, data: List[float]):
        if len(data) < 10:
            raise ValueError("Need at least 10 data points to fit Isolation Forest model")
        
        data_array = np.array(data)
        
        q1 = np.percentile(data_array, 25)
        q3 = np.percentile(data_array, 75)
        iqr = q3 - q1
        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr
        
        filtered_data = data_array[(data_array >= lower_bound) & (data_array <= upper_bound)]
        
        if len(filtered_data) < 5:
            filtered_data = data_array
        
        X = filtered_data.reshape(-1, 1)
        
        auto_contamination = min(self.contamination, 0.02)
        
        self.model = IsolationForest(
            contamination=auto_contamination,
            random_state=42,
            n_estimators=200,
            max_samples='auto',
            bootstrap=True
        )
        self.model.fit(X)
        
        scores = self.model.decision_function(X)
        self.score_threshold = np.percentile(scores, 2)

    def detect(self, value: float) -> Tuple[bool, Dict[str, Any]]:
        if self.model is None:
            raise ValueError("Model not fitted. Call fit() first.")
        
        X = np.array([[value]])
        prediction = self.model.predict(X)[0]
        score = self.model.decision_function(X)[0]
        
        if self.score_threshold is not None:
            is_anomaly = score < self.score_threshold
        else:
            is_anomaly = prediction == -1
        
        details = {
            "score": float(score),
            "contamination": self.contamination,
            "score_threshold": float(self.score_threshold) if self.score_threshold is not None else None,
            "model_offset": float(-self.model.offset_)
        }
        
        return is_anomaly, details

    def detect_batch(self, values: List[float]) -> List[Tuple[bool, Dict[str, Any]]]:
        if self.model is None:
            raise ValueError("Model not fitted. Call fit() first.")
        
        X = np.array(values).reshape(-1, 1)
        predictions = self.model.predict(X)
        scores = self.model.decision_function(X)
        
        results = []
        for pred, score in zip(predictions, scores):
            if self.score_threshold is not None:
                is_anomaly = score < self.score_threshold
            else:
                is_anomaly = pred == -1
            
            details = {
                "score": float(score),
                "contamination": self.contamination,
                "score_threshold": float(self.score_threshold) if self.score_threshold is not None else None,
                "model_offset": float(-self.model.offset_)
            }
            results.append((is_anomaly, details))
        
        return results


class CombinedAnomalyDetector:
    def __init__(self, require_both_methods: bool = True):
        self.three_sigma = ThreeSigmaDetector()
        self.isolation_forest = IsolationForestDetector()
        self.fitted = False
        self.require_both_methods = require_both_methods
        self.recent_anomalies = []
        self.max_recent = 100

    def fit(self, historical_data: List[float]):
        if len(historical_data) < 20:
            raise ValueError("Need at least 20 data points for reliable anomaly detection")
        
        self.three_sigma.fit(historical_data)
        self.isolation_forest.fit(historical_data)
        self.fitted = True

    def _check_consecutive_anomalies(self, current_is_anomaly: bool, method: str) -> bool:
        if not current_is_anomaly:
            return False
        
        recent_for_method = [
            a for a in self.recent_anomalies[-3:] 
            if a.get("method") == method
        ]
        
        if len(recent_for_method) >= 2:
            return True
        
        return False

    def detect(self, timestamp: datetime, device_id: str, sensor_type: str, value: float) -> List[Dict[str, Any]]:
        if not self.fitted:
            raise ValueError("Detector not fitted. Call fit() first.")
        
        anomalies = []
        
        three_sigma_result, three_sigma_details = self.three_sigma.detect(value)
        if_result, if_details = self.isolation_forest.detect(value)
        
        if self.require_both_methods:
            is_confirmed_anomaly = three_sigma_result and if_result
            
            if is_confirmed_anomaly:
                anomalies.append({
                    "timestamp": timestamp,
                    "device_id": device_id,
                    "sensor_type": sensor_type,
                    "value": value,
                    "method": "3sigma",
                    "score": three_sigma_details["z_score"],
                    "details": three_sigma_details
                })
                anomalies.append({
                    "timestamp": timestamp,
                    "device_id": device_id,
                    "sensor_type": sensor_type,
                    "value": value,
                    "method": "isolation_forest",
                    "score": abs(if_details["score"]),
                    "details": if_details
                })
        else:
            if three_sigma_result:
                if self._check_consecutive_anomalies(True, "3sigma") or three_sigma_details["z_score"] > 4.5:
                    anomalies.append({
                        "timestamp": timestamp,
                        "device_id": device_id,
                        "sensor_type": sensor_type,
                        "value": value,
                        "method": "3sigma",
                        "score": three_sigma_details["z_score"],
                        "details": three_sigma_details
                    })
            
            if if_result:
                if self._check_consecutive_anomalies(True, "isolation_forest"):
                    anomalies.append({
                        "timestamp": timestamp,
                        "device_id": device_id,
                        "sensor_type": sensor_type,
                        "value": value,
                        "method": "isolation_forest",
                        "score": abs(if_details["score"]),
                        "details": if_details
                    })
        
        self.recent_anomalies.extend(anomalies)
        if len(self.recent_anomalies) > self.max_recent:
            self.recent_anomalies = self.recent_anomalies[-self.max_recent:]
        
        return anomalies

    def detect_batch(self, data_points: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not self.fitted:
            raise ValueError("Detector not fitted. Call fit() first.")
        
        all_anomalies = []
        values = [dp["value"] for dp in data_points]
        
        three_sigma_results = self.three_sigma.detect_batch(values)
        if_results = self.isolation_forest.detect_batch(values)
        
        for i, dp in enumerate(data_points):
            ts_result, ts_details = three_sigma_results[i]
            if_r, if_d = if_results[i]
            
            if self.require_both_methods:
                if ts_result and if_r:
                    all_anomalies.append({
                        "timestamp": dp["timestamp"],
                        "device_id": dp["device_id"],
                        "sensor_type": dp["sensor_type"],
                        "value": dp["value"],
                        "method": "3sigma",
                        "score": ts_details["z_score"],
                        "details": ts_details
                    })
                    all_anomalies.append({
                        "timestamp": dp["timestamp"],
                        "device_id": dp["device_id"],
                        "sensor_type": dp["sensor_type"],
                        "value": dp["value"],
                        "method": "isolation_forest",
                        "score": abs(if_d["score"]),
                        "details": if_d
                    })
            else:
                if ts_result and ts_details["z_score"] > 4.5:
                    all_anomalies.append({
                        "timestamp": dp["timestamp"],
                        "device_id": dp["device_id"],
                        "sensor_type": dp["sensor_type"],
                        "value": dp["value"],
                        "method": "3sigma",
                        "score": ts_details["z_score"],
                        "details": ts_details
                    })
                
                if if_r:
                    all_anomalies.append({
                        "timestamp": dp["timestamp"],
                        "device_id": dp["device_id"],
                        "sensor_type": dp["sensor_type"],
                        "value": dp["value"],
                        "method": "isolation_forest",
                        "score": abs(if_d["score"]),
                        "details": if_d
                    })
        
        return all_anomalies
