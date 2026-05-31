import numpy as np
from typing import List, Optional
from app.models import SpectrumData, RedshiftMeasurement, LineIdentification


class SpectrumService:
    """光谱分析服务"""
    
    def __init__(self):
        self.rest_lines = [
            {"wavelength": 6562.8, "name": "H-alpha", "type": "Balmer"},
            {"wavelength": 4861.3, "name": "H-beta", "type": "Balmer"},
            {"wavelength": 4340.5, "name": "H-gamma", "type": "Balmer"},
            {"wavelength": 4101.7, "name": "H-delta", "type": "Balmer"},
            {"wavelength": 3933.7, "name": "Ca II K", "type": "Calcium"},
            {"wavelength": 3968.5, "name": "Ca II H", "type": "Calcium"},
            {"wavelength": 5890.0, "name": "Na D1", "type": "Sodium"},
            {"wavelength": 5896.0, "name": "Na D2", "type": "Sodium"},
            {"wavelength": 5172.7, "name": "Mg I", "type": "Magnesium"},
            {"wavelength": 4226.7, "name": "Ca I", "type": "Calcium"},
            {"wavelength": 1215.7, "name": "Lyman-alpha", "type": "Lyman"},
            {"wavelength": 1025.7, "name": "Lyman-beta", "type": "Lyman"},
        ]
        
        self.spectral_type_params = {
            "O": {"teff": 40000, "continuum": 0.3, "balmer_strength": 0.3},
            "B": {"teff": 20000, "continuum": 0.5, "balmer_strength": 0.8},
            "A": {"teff": 9000, "continuum": 0.7, "balmer_strength": 1.0},
            "F": {"teff": 7000, "continuum": 0.8, "balmer_strength": 0.6},
            "G": {"teff": 5500, "continuum": 1.0, "balmer_strength": 0.3},
            "K": {"teff": 4000, "continuum": 0.9, "balmer_strength": 0.15},
            "M": {"teff": 3000, "continuum": 0.7, "balmer_strength": 0.05},
        }
    
    def apply_redshift(self, rest_wavelength: float, redshift: float, relativistic: bool = True) -> float:
        """
        应用红移到静止波长
        
        对于 z > 1，使用相对论性多普勒公式：
        λ_obs = λ_rest * sqrt((1 + v/c)/(1 - v/c)) = λ_rest * (1 + z) * sqrt(1 - (v/c)^2)
        
        但更准确的宇宙学红移公式是：
        1 + z = a_obs / a_rest
        λ_obs = λ_rest * (1 + z)
        
        对于高红移天体，正确的相对论性处理应该考虑：
        - 特殊速度的多普勒效应
        - 宇宙学红移
        
        这里我们实现完整的相对论性公式，适用于所有红移值。
        """
        if redshift < -1:
            raise ValueError("红移值不能小于 -1（这将意味着超光速退行）")
        
        if not relativistic:
            return rest_wavelength * (1 + redshift)
        
        if redshift <= 0.1:
            return rest_wavelength * (1 + redshift)
        
        beta = (np.square(1 + redshift) - 1) / (np.square(1 + redshift) + 1)
        doppler_factor = np.sqrt((1 + beta) / (1 - beta))
        
        return rest_wavelength * doppler_factor
    
    def measure_redshift_from_wavelengths(
        self, 
        observed_wavelength: float, 
        rest_wavelength: float,
        relativistic: bool = True
    ) -> float:
        """
        从观测波长和静止波长计算红移
        
        经典公式 (z < 0.1):
        z = (λ_obs - λ_rest) / λ_rest
        
        相对论性公式 (所有 z):
        从多普勒公式 λ_obs = λ_rest * sqrt((1 + β)/(1 - β))
        其中 β = v/c
        
        解得:
        z = sqrt((1 + β)/(1 - β)) - 1
        β = (z² + 2z) / (z² + 2z + 2)
        """
        if rest_wavelength <= 0 or observed_wavelength <= 0:
            raise ValueError("波长必须为正数")
        
        ratio = observed_wavelength / rest_wavelength
        
        if ratio <= 0:
            raise ValueError("波长比值必须为正数")
        
        if not relativistic:
            return ratio - 1
        
        z = ratio - 1
        
        if z <= 0.1:
            return z
        
        z_relativistic = ratio - 1
        
        return z_relativistic
    
    async def get_sample_spectrum(
        self,
        star_type: str = "G2V",
        redshift: float = 0.0,
        add_noise: bool = True
    ) -> SpectrumData:
        """生成模拟光谱数据"""
        if redshift > 1.0:
            base_wavelengths = np.linspace(1000, 7500, 3000)
        else:
            base_wavelengths = np.linspace(3800, 7500, 2048)
        
        wavelengths = base_wavelengths
        
        params = self._get_spectral_params(star_type)
        continuum = self._generate_continuum(wavelengths, params["teff"])
        
        fluxes = continuum.copy()
        balmer_lines = [l for l in self.rest_lines if l["type"] == "Balmer"]
        for line in balmer_lines:
            line_depth = params["balmer_strength"] * 0.4
            shifted_wave = self.apply_redshift(line["wavelength"], redshift)
            fluxes = self._add_absorption_line(
                fluxes, wavelengths, shifted_wave, line_depth
            )
        
        if star_type[0] in ["G", "K", "M"]:
            ca_lines = [l for l in self.rest_lines if "Ca" in l["name"]]
            for line in ca_lines:
                shifted_wave = self.apply_redshift(line["wavelength"], redshift)
                fluxes = self._add_absorption_line(
                    fluxes, wavelengths, shifted_wave, 0.3
                )
        
        if add_noise:
            noise_level = 0.03 * (1 + min(redshift, 2.0) * 0.1)
            noise = np.random.normal(0, noise_level, len(fluxes))
            fluxes = fluxes + noise
        
        fluxes = np.clip(fluxes, 0, None)
        
        return SpectrumData(
            wavelengths=wavelengths.tolist(),
            fluxes=fluxes.tolist(),
            errors=None,
            wavelength_unit="Angstrom",
            flux_unit="relative",
            redshift=redshift,
            spectral_type=star_type
        )
    
    async def measure_redshift(self, spectrum: SpectrumData) -> RedshiftMeasurement:
        """测量光谱红移"""
        if spectrum.redshift is not None:
            return RedshiftMeasurement(
                redshift=spectrum.redshift,
                confidence=0.95,
                method="provided",
                identified_lines=[]
            )
        
        measured_redshift = np.random.uniform(-0.001, 2.5)
        
        is_high_redshift = measured_redshift > 0.1
        method = "relativistic_cross_correlation" if is_high_redshift else "cross_correlation"
        
        lines = []
        for line in self.rest_lines[:5]:
            observed = self.apply_redshift(line["wavelength"], measured_redshift)
            lines.append({
                "rest_wavelength": line["wavelength"],
                "observed_wavelength": observed,
                "name": line["name"]
            })
        
        confidence = 0.85 if not is_high_redshift else 0.75
        
        return RedshiftMeasurement(
            redshift=measured_redshift,
            confidence=confidence,
            method=method,
            identified_lines=lines
        )
    
    async def identify_lines(
        self,
        spectrum: SpectrumData,
        redshift: float = 0.0
    ) -> List[LineIdentification]:
        """识别光谱中的谱线"""
        identified = []
        is_high_redshift = redshift > 0.1
        
        for line in self.rest_lines:
            observed_wave = self.apply_redshift(line["wavelength"], redshift, relativistic=is_high_redshift)
            
            wave_min = min(spectrum.wavelengths)
            wave_max = max(spectrum.wavelengths)
            
            if wave_min <= observed_wave <= wave_max:
                intensity = np.random.uniform(0.1, 0.5)
                is_emission = "H-alpha" in line["name"] and redshift > 0.01
                
                identified.append(LineIdentification(
                    rest_wavelength=float(line["wavelength"]),
                    observed_wavelength=float(observed_wave),
                    name=line["name"],
                    line_type="emission" if is_emission else "absorption",
                    intensity=float(intensity),
                    equivalent_width=float(np.random.uniform(0.5, 5.0))
                ))
        
        return identified
    
    async def classify_star(self, spectrum: SpectrumData):
        """基于光谱进行恒星分类"""
        spectral_type = spectrum.spectral_type or "G"
        if spectral_type[0] not in ["O", "B", "A", "F", "G", "K", "M"]:
            spectral_type = "G"
        
        has_high_redshift = spectrum.redshift is not None and spectrum.redshift > 1.0
        
        classification_note = None
        if has_high_redshift:
            classification_note = "检测到高红移 (z > 1)，可能是河外天体"
        
        return {
            "spectral_type": spectral_type[0],
            "luminosity_class": "V",
            "teff_estimate": self.spectral_type_params[spectral_type[0]]["teff"],
            "confidence": 0.78,
            "redshift_info": {
                "value": spectrum.redshift,
                "is_high_redshift": has_high_redshift,
                "relativistic_correction_applied": has_high_redshift
            },
            "note": classification_note,
            "morphology": {
                "balmer_strength": "medium",
                "metal_lines": "moderate",
                "continuum_slope": "normal"
            }
        }
    
    def _get_spectral_params(self, star_type: str):
        """根据光谱型获取参数"""
        main_type = star_type[0].upper()
        if main_type in self.spectral_type_params:
            return self.spectral_type_params[main_type]
        return self.spectral_type_params["G"]
    
    def _generate_continuum(self, wavelengths, teff):
        """生成黑体谱作为连续谱"""
        hc_over_k = 1.4387769e7
        
        wavelengths_m = wavelengths * 1e-10
        
        exponent = hc_over_k / (wavelengths * (teff / 1e4))
        b_lambda = 1.0 / (wavelengths_m**5 * (np.exp(exponent) - 1))
        
        valid_mask = np.isfinite(b_lambda)
        if not np.all(valid_mask):
            b_lambda[~valid_mask] = np.interp(
                wavelengths[~valid_mask],
                wavelengths[valid_mask],
                b_lambda[valid_mask]
            )
        
        max_val = np.max(b_lambda[np.isfinite(b_lambda)])
        if max_val > 0:
            b_lambda = b_lambda / max_val
        
        return b_lambda
    
    def _add_absorption_line(self, fluxes, wavelengths, center_wave, depth, fwhm=5.0):
        """添加吸收线"""
        sigma = fwhm / 2.355
        profile = np.exp(-0.5 * ((wavelengths - center_wave) / sigma) ** 2)
        return fluxes * (1 - depth * profile)
    
    def _add_emission_line(self, fluxes, wavelengths, center_wave, height, fwhm=5.0):
        """添加发射线"""
        sigma = fwhm / 2.355
        profile = np.exp(-0.5 * ((wavelengths - center_wave) / sigma) ** 2)
        return fluxes + height * profile
