import numpy as np
from typing import List, Optional, Dict, Any
from scipy import signal
from scipy.interpolate import interp1d
from app.models import (
    LightCurveData,
    LightCurvePoint,
    LombScargleResult,
    PeriodogramPeak,
    PhaseFoldedData,
    VariableStarInfo
)


class TimeSeriesService:
    """时域天文数据分析服务 - 变星光变曲线、Lomb-Scargle周期图、周期折叠"""
    
    def __init__(self):
        self.variable_star_templates = {
            "Cepheid": {
                "period_range": (1.0, 50.0),
                "amplitude_range": (0.3, 1.5),
                "median_mag_range": (6.0, 18.0),
                "shape": "asymmetric",
                "description": "造父变星，经典脉动变星，周光关系"
            },
            "RR_Lyrae": {
                "period_range": (0.2, 1.2),
                "amplitude_range": (0.5, 2.0),
                "median_mag_range": (10.0, 20.0),
                "shape": "sawtooth",
                "description": "天琴座RR型变星，球状星团中常见"
            },
            "Mira": {
                "period_range": (80.0, 1000.0),
                "amplitude_range": (2.5, 10.0),
                "median_mag_range": (8.0, 18.0),
                "shape": "sinusoidal_large",
                "description": "蒭藁增二型变星，长周期脉动变星"
            },
            "Eclipsing": {
                "period_range": (0.5, 30.0),
                "amplitude_range": (0.5, 5.0),
                "median_mag_range": (8.0, 18.0),
                "shape": "eclipse",
                "description": "食双星，周期性掩食"
            },
            "Flare": {
                "period_range": None,
                "amplitude_range": (0.5, 5.0),
                "median_mag_range": (10.0, 25.0),
                "shape": "stochastic",
                "description": "耀星，随机爆发"
            },
            "Irregular": {
                "period_range": None,
                "amplitude_range": (0.1, 2.0),
                "median_mag_range": (8.0, 20.0),
                "shape": "irregular",
                "description": "不规则变星，无明显周期"
            }
        }
        
        np.random.seed(42)
    
    def _generate_light_curve_shape(
        self,
        times: np.ndarray,
        period: float,
        amplitude: float,
        median_mag: float,
        shape_type: str
    ) -> np.ndarray:
        """生成不同类型变星的光变曲线形状"""
        phases = (times % period) / period
        
        if shape_type == "sinusoidal" or shape_type == "sinusoidal_large":
            magnitudes = median_mag + amplitude * np.sin(2 * np.pi * phases)
            
        elif shape_type == "asymmetric":
            rise = np.where(phases < 0.3, phases / 0.3, 1.0 - (phases - 0.3) / 0.7)
            magnitudes = median_mag + amplitude * (1.0 - rise)
            
        elif shape_type == "sawtooth":
            magnitudes = median_mag + amplitude * (2 * (phases - np.floor(phases + 0.5)))
            
        elif shape_type == "eclipse":
            eclipse_depth = amplitude
            eclipse_width = 0.1
            in_eclipse = np.abs(phases - 0.5) < eclipse_width
            in_secondary = np.abs(phases) < eclipse_width / 2
            
            magnitudes = np.ones_like(phases) * median_mag
            magnitudes[in_eclipse] = median_mag + eclipse_depth
            magnitudes[in_secondary] = median_mag + eclipse_depth * 0.3
            
        elif shape_type == "stochastic":
            if period:
                base = median_mag + amplitude * np.sin(2 * np.pi * times / period)
            else:
                base = median_mag
            
            noise = np.random.normal(0, amplitude * 0.3, len(times))
            flare_times = np.random.choice(len(times), size=int(len(times) * 0.05), replace=False)
            flare_shape = np.exp(-((np.arange(10) - 5) ** 2) / (2 * 2 ** 2))
            
            for ft in flare_times:
                end = min(ft + 10, len(times))
                base[ft:end] += amplitude * 2 * flare_shape[:end - ft]
            
            magnitudes = base + noise
            
        elif shape_type == "irregular":
            from scipy.ndimage import gaussian_filter1d
            noise = np.random.normal(0, amplitude, len(times))
            smoothed = gaussian_filter1d(noise, sigma=5)
            magnitudes = median_mag + smoothed
            
        else:
            magnitudes = median_mag + amplitude * np.sin(2 * np.pi * phases)
        
        return magnitudes
    
    async def get_variable_star_catalog(
        self,
        variable_type: Optional[str] = None,
        limit: int = 50
    ) -> List[VariableStarInfo]:
        """获取模拟变星星表"""
        stars = []
        
        types = [variable_type] if variable_type else list(self.variable_star_templates.keys())
        
        for i in range(limit):
            vtype = np.random.choice(types)
            template = self.variable_star_templates[vtype]
            
            if template["period_range"]:
                pmin, pmax = template["period_range"]
                period = np.exp(np.random.uniform(np.log(pmin), np.log(pmax)))
            else:
                period = None
            
            amin, amax = template["amplitude_range"]
            amplitude = np.random.uniform(amin, amax)
            
            mmin, mmax = template["median_mag_range"]
            median_mag = np.random.uniform(mmin, mmax)
            
            ra = np.random.uniform(0, 360)
            dec = np.random.uniform(-90, 90)
            
            star = VariableStarInfo(
                source_id=f"VAR_{vtype}_{i:06d}",
                name=f"{vtype} J{int(ra):02d}{int(dec):+03d}",
                variable_type=vtype,
                ra=float(ra),
                dec=float(dec),
                period=float(period) if period else None,
                amplitude=float(amplitude),
                median_magnitude=float(median_mag),
                distance=float(np.random.uniform(100, 50000)),
                spectral_type=np.random.choice(["F", "G", "K", "M", "A", "B"])
            )
            stars.append(star)
        
        return stars
    
    async def generate_light_curve(
        self,
        source_id: Optional[str] = None,
        variable_type: str = "Cepheid",
        period: Optional[float] = None,
        amplitude: Optional[float] = None,
        median_magnitude: float = 12.0,
        num_points: int = 500,
        time_span: float = 100.0,
        add_noise: bool = True,
        add_gaps: bool = True,
        error_level: float = 0.02
    ) -> LightCurveData:
        """生成模拟光变曲线数据"""
        template = self.variable_star_templates.get(variable_type, self.variable_star_templates["Cepheid"])
        
        if period is None and template["period_range"]:
            pmin, pmax = template["period_range"]
            period = np.exp(np.random.uniform(np.log(pmin), np.log(pmax)))
        
        if amplitude is None:
            amin, amax = template["amplitude_range"]
            amplitude = np.random.uniform(amin, amax)
        
        times = np.sort(np.random.uniform(0, time_span, num_points))
        
        if add_gaps:
            gap_indices = np.sort(np.random.choice(len(times) - 1, size=int(len(times) * 0.15), replace=False))
            for idx in reversed(gap_indices):
                if idx + 1 < len(times):
                    times[idx + 1:] += np.random.uniform(1, 5)
        
        magnitudes = self._generate_light_curve_shape(
            times,
            period or 1.0,
            amplitude,
            median_magnitude,
            template["shape"]
        )
        
        if add_noise:
            noise = np.random.normal(0, error_level, len(magnitudes))
            magnitudes += noise
        
        errors = np.ones_like(magnitudes) * error_level * (1 + 0.3 * np.random.rand(len(magnitudes)))
        
        points = []
        for t, m, e in zip(times, magnitudes, errors):
            points.append(LightCurvePoint(
                time=float(t),
                magnitude=float(m),
                error=float(e),
                band="V"
            ))
        
        return LightCurveData(
            source_id=source_id or f"LC_{variable_type}_{np.random.randint(100000):06d}",
            name=f"{variable_type} Variable",
            variable_type=variable_type,
            period=float(period) if period else None,
            amplitude=float(amplitude),
            time_unit="days",
            magnitude_unit="mag",
            points=points,
            median_magnitude=float(np.median(magnitudes))
        )
    
    async def compute_lomb_scargle(
        self,
        times: List[float],
        magnitudes: List[float],
        errors: Optional[List[float]] = None,
        min_period: float = 0.1,
        max_period: float = 100.0,
        oversampling: int = 5,
        n_peaks: int = 5
    ) -> LombScargleResult:
        """
        计算Lomb-Scargle周期图
        
        参考文献:
        - Lomb, N.R. (1976) Ap&SS, 39, 447
        - Scargle, J.D. (1982) ApJ, 263, 835
        """
        t = np.array(times)
        y = np.array(magnitudes)
        
        if errors is not None and len(errors) == len(y):
            dy = np.array(errors)
            weights = 1.0 / (dy ** 2)
        else:
            weights = np.ones_like(y)
        
        weights = weights / np.sum(weights)
        y_mean = np.sum(y * weights)
        y_centered = y - y_mean
        
        min_freq = 1.0 / max_period
        max_freq = 1.0 / min_period
        
        n_samples = len(t)
        baseline = np.max(t) - np.min(t)
        n_freqs = int(oversampling * baseline * max_freq)
        n_freqs = max(n_freqs, 1000)
        
        frequencies = np.linspace(min_freq, max_freq, n_freqs)
        
        powers = np.zeros_like(frequencies)
        
        for i, f in enumerate(frequencies):
            omega = 2 * np.pi * f
            
            cos_term = np.cos(omega * t)
            sin_term = np.sin(omega * t)
            
            C = np.sum(weights * cos_term)
            S = np.sum(weights * sin_term)
            
            YC = np.sum(weights * y_centered * cos_term)
            YS = np.sum(weights * y_centered * sin_term)
            
            CC = np.sum(weights * cos_term ** 2) - C ** 2
            SS = np.sum(weights * sin_term ** 2) - S ** 2
            CS = np.sum(weights * cos_term * sin_term) - C * S
            
            D = CC * SS - CS ** 2
            
            if D > 0:
                power = (YC ** 2 * SS + YS ** 2 * CC - 2 * YC * YS * CS) / D
            else:
                power = 0.0
            
            powers[i] = power
        
        powers = powers / np.max(powers) if np.max(powers) > 0 else powers
        
        peak_indices = self._find_peaks(powers, n_peaks=n_peaks, min_distance=20)
        
        peaks = []
        for idx in peak_indices:
            freq = frequencies[idx]
            peaks.append(PeriodogramPeak(
                frequency=float(freq),
                period=float(1.0 / freq),
                power=float(powers[idx]),
                significance=float(1.0 - np.exp(-powers[idx]))
            ))
        
        best_idx = np.argmax(powers)
        best_freq = frequencies[best_idx]
        best_period = 1.0 / best_freq
        
        fap = self._compute_false_alarm_probability(powers, best_idx, n_samples)
        
        return LombScargleResult(
            frequencies=frequencies.tolist(),
            powers=powers.tolist(),
            best_period=float(best_period),
            best_frequency=float(best_freq),
            peaks=peaks,
            false_alarm_probability=float(fap)
        )
    
    def _find_peaks(
        self,
        data: np.ndarray,
        n_peaks: int = 5,
        min_distance: int = 10,
        threshold: float = 0.1
    ) -> np.ndarray:
        """寻找功率谱中的峰值"""
        peaks = []
        data = np.array(data)
        
        for i in range(1, len(data) - 1):
            if data[i] > data[i-1] and data[i] > data[i+1] and data[i] > threshold:
                peaks.append((i, data[i]))
        
        peaks.sort(key=lambda x: x[1], reverse=True)
        
        selected = []
        for idx, val in peaks:
            too_close = False
            for s_idx, _ in selected:
                if abs(idx - s_idx) < min_distance:
                    too_close = True
                    break
            if not too_close:
                selected.append((idx, val))
                if len(selected) >= n_peaks:
                    break
        
        return np.array([p[0] for p in selected]) if selected else np.array([])
    
    def _compute_false_alarm_probability(
        self,
        powers: np.ndarray,
        peak_idx: int,
        n_samples: int
    ) -> float:
        """计算假阳性概率（FAP）"""
        peak_power = powers[peak_idx]
        
        n_independent = len(powers) // 10
        gumbel_scale = np.sqrt(2 * np.log(n_independent))
        gumbel_loc = gumbel_scale - (np.euler_gamma / gumbel_scale)
        
        normalized_peak = (peak_power - gumbel_loc) / (1 / gumbel_scale)
        fap = 1.0 - np.exp(-np.exp(-normalized_peak))
        
        return min(fap, 1.0)
    
    async def phase_fold(
        self,
        times: List[float],
        magnitudes: List[float],
        period: float,
        errors: Optional[List[float]] = None,
        normalize: bool = True
    ) -> PhaseFoldedData:
        """执行周期折叠"""
        t = np.array(times)
        m = np.array(magnitudes)
        e = np.array(errors) if errors else None
        
        phases = (t % period) / period
        
        sort_indices = np.argsort(phases)
        phases_sorted = phases[sort_indices]
        magnitudes_sorted = m[sort_indices]
        
        phases_double = np.concatenate([phases_sorted, phases_sorted + 1.0])
        magnitudes_double = np.concatenate([magnitudes_sorted, magnitudes_sorted])
        
        if normalize:
            mag_mean = np.median(magnitudes_sorted)
            magnitudes_double = magnitudes_double - mag_mean
        
        errors_sorted = e[sort_indices] if e is not None else None
        errors_double = np.concatenate([errors_sorted, errors_sorted]) if errors_sorted is not None else None
        
        phase_unique = np.unique(phases_sorted)
        phase_coverage = len(phase_unique) / (period / (np.median(np.diff(t)) if len(t) > 1 else 1))
        phase_coverage = min(phase_coverage, 1.0)
        
        return PhaseFoldedData(
            phase=phases_double.tolist(),
            magnitude=magnitudes_double.tolist(),
            error=errors_double.tolist() if errors_double is not None else None,
            period=float(period),
            phase_coverage=float(phase_coverage)
        )
    
    async def get_variable_type_info(self) -> Dict[str, Any]:
        """获取变星类型信息"""
        return {
            "variable_types": [
                {
                    "code": key,
                    "name": key,
                    **value
                }
                for key, value in self.variable_star_templates.items()
            ]
        }
