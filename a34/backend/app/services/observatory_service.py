import numpy as np
from typing import Dict, Any, List, Tuple
from app.models import (
    ObservationRequest,
    ObservationResult,
    ExposureTimeRequest
)


class ObservatoryService:
    """
    观测模拟器服务 - 基于光度学公式计算SNR、极限星等
    
    核心公式基于 CCD 光度学方程:
    SNR = S_total / sqrt(S_total + S_sky + S_dark + N_read^2)
    
    其中:
    - S_total: 目标天体总电子数
    - S_sky: 天空背景电子数
    - S_dark: 暗电流电子数
    - N_read: 读出噪声
    """
    
    def __init__(self):
        self.filter_info = {
            "U": {"wl_eff": 3650, "width": 660, "zero_mag_flux": 1.79e-9, "sky_brightness": 22.0},
            "B": {"wl_eff": 4450, "width": 940, "zero_mag_flux": 6.32e-9, "sky_brightness": 22.7},
            "V": {"wl_eff": 5510, "width": 880, "zero_mag_flux": 3.64e-9, "sky_brightness": 21.8},
            "R": {"wl_eff": 6580, "width": 1380, "zero_mag_flux": 2.19e-9, "sky_brightness": 21.0},
            "I": {"wl_eff": 8060, "width": 1490, "zero_mag_flux": 1.13e-9, "sky_brightness": 19.8},
            "g": {"wl_eff": 4754, "width": 1389, "zero_mag_flux": 5.05e-9, "sky_brightness": 22.3},
            "r": {"wl_eff": 6204, "width": 1373, "zero_mag_flux": 2.50e-9, "sky_brightness": 21.2},
            "i": {"wl_eff": 7698, "width": 1535, "zero_mag_flux": 1.37e-9, "sky_brightness": 20.2},
            "z": {"wl_eff": 9111, "width": 1429, "zero_mag_flux": 7.89e-10, "sky_brightness": 18.8}
        }
        
        self.mirror_reflectivity = {
            "aluminum": 0.85,
            "silver": 0.95,
            "enhanced_aluminum": 0.92
        }
        
        self.telescope_presets = {
            "small_refractor": {"name": "小型折射镜 (10cm)", "aperture": 0.1, "f_ratio": 10},
            "newtonian_8inch": {"name": "牛顿反射镜 (20cm)", "aperture": 0.203, "f_ratio": 5},
            "schmidt_12inch": {"name": "施密特卡塞格林 (30cm)", "aperture": 0.305, "f_ratio": 10},
            "rc_16inch": {"name": "RC望远镜 (40cm)", "aperture": 0.406, "f_ratio": 8},
            "professional_1m": {"name": "专业望远镜 (1m)", "aperture": 1.0, "f_ratio": 8},
            "professional_2m": {"name": "专业望远镜 (2m)", "aperture": 2.0, "f_ratio": 8},
            "professional_4m": {"name": "专业望远镜 (4m)", "aperture": 4.0, "f_ratio": 8},
            "Keck": {"name": "Keck 10m", "aperture": 10.0, "f_ratio": 15},
        }
        
        self.camera_presets = {
            "basic_DSLR": {
                "name": "基础单反相机",
                "pixel_size": 4.3,
                "read_noise": 5.0,
                "dark_current": 0.05,
                "gain": 1.0,
                "full_well": 50000,
                "quantum_efficiency": 0.65
            },
            "astrophotography_DSLR": {
                "name": "天文改机",
                "pixel_size": 4.3,
                "read_noise": 3.0,
                "dark_current": 0.02,
                "gain": 1.0,
                "full_well": 60000,
                "quantum_efficiency": 0.75
            },
            "ZWO_ASI183": {
                "name": "ZWO ASI183",
                "pixel_size": 2.4,
                "read_noise": 2.4,
                "dark_current": 0.005,
                "gain": 0.85,
                "full_well": 12000,
                "quantum_efficiency": 0.84
            },
            "ZWO_ASI2600": {
                "name": "ZWO ASI2600",
                "pixel_size": 3.76,
                "read_noise": 1.2,
                "dark_current": 0.003,
                "gain": 0.75,
                "full_well": 45000,
                "quantum_efficiency": 0.91
            },
            "professional_CCD": {
                "name": "专业级CCD",
                "pixel_size": 15.0,
                "read_noise": 8.0,
                "dark_current": 0.001,
                "gain": 2.5,
                "full_well": 150000,
                "quantum_efficiency": 0.90
            }
        }
    
    def _calculate_optical_parameters(
        self,
        aperture: float,
        focal_length: float,
        f_ratio: float,
        pixel_size: float,
        binning: int
    ) -> Dict[str, float]:
        """计算光学参数：焦比、像元尺度、底片比例尺"""
        if f_ratio is None and focal_length is None:
            f_ratio = 8.0
        
        if focal_length is None:
            focal_length = aperture * f_ratio
        
        if f_ratio is None:
            f_ratio = focal_length / aperture
        
        actual_pixel_size = pixel_size * binning
        
        pixel_scale_rad = actual_pixel_size * 1e-6 / focal_length
        pixel_scale_arcsec = pixel_scale_rad * (180.0 / np.pi) * 3600.0
        
        plate_scale = (206265.0 / (focal_length * 1000))
        
        return {
            "focal_length": focal_length,
            "f_ratio": f_ratio,
            "pixel_scale": pixel_scale_arcsec,
            "plate_scale": plate_scale,
            "actual_pixel_size": actual_pixel_size
        }
    
    def _calculate_sky_brightness_electrons(
        self,
        sky_brightness_mag: float,
        filter_info: Dict,
        pixel_scale: float,
        exposure_time: float,
        aperture: float,
        transparency: float,
        airmass: float,
        quantum_efficiency: float
    ) -> float:
        """计算天空背景电子数"""
        h = 6.626e-34
        c = 3e8
        wl_eff_m = filter_info["wl_eff"] * 1e-10
        
        photons_per_mag0 = (filter_info["zero_mag_flux"] * wl_eff_m) / (h * c)
        
        sky_flux = photons_per_mag0 * 10 ** (-0.4 * sky_brightness_mag)
        
        extinction = transparency * 10 ** (-0.4 * 0.15 * (airmass - 1))
        
        aperture_area = np.pi * (aperture / 2) ** 2
        pixel_area_arcsec2 = pixel_scale ** 2
        
        sky_photons = sky_flux * extinction * aperture_area * pixel_area_arcsec2 * exposure_time
        sky_electrons = sky_photons * quantum_efficiency
        
        return max(sky_electrons, 0.1)
    
    def _calculate_target_electrons(
        self,
        target_magnitude: float,
        filter_info: Dict,
        exposure_time: float,
        aperture: float,
        transparency: float,
        airmass: float,
        quantum_efficiency: float,
        fwhm_arcsec: float,
        pixel_scale: float,
        mirror_reflectivity: float,
        central_obstruction: float
    ) -> float:
        """计算目标天体电子数"""
        h = 6.626e-34
        c = 3e8
        wl_eff_m = filter_info["wl_eff"] * 1e-10
        
        photons_per_mag0 = (filter_info["zero_mag_flux"] * wl_eff_m) / (h * c)
        
        target_flux = photons_per_mag0 * 10 ** (-0.4 * target_magnitude)
        
        extinction = transparency * 10 ** (-0.4 * 0.2 * (airmass - 1))
        
        aperture_area = np.pi * (aperture / 2) ** 2
        obstruction_factor = 1 - (central_obstruction ** 2)
        
        effective_area = aperture_area * obstruction_factor * mirror_reflectivity
        
        fwhm_pixels = fwhm_arcsec / pixel_scale
        aperture_radius_pixels = 1.5 * fwhm_pixels
        aperture_area_pixels = np.pi * aperture_radius_pixels ** 2
        
        target_photons = target_flux * extinction * effective_area * exposure_time
        target_electrons = target_photons * quantum_efficiency
        
        return max(target_electrons, 0.1)
    
    def _get_sky_brightness(
        self,
        filter_name: str,
        moon_phase: float,
        user_sky_brightness: float = None
    ) -> float:
        """获取天空背景亮度（考虑月相）"""
        if user_sky_brightness is not None:
            return user_sky_brightness
        
        filter_info = self.filter_info.get(filter_name, self.filter_info["V"])
        base_sky = filter_info["sky_brightness"]
        
        moon_brightening = 5.0 * moon_phase
        
        return max(base_sky - moon_brightening, 18.0)
    
    async def simulate_observation(
        self,
        request: ObservationRequest
    ) -> ObservationResult:
        """
        模拟观测，计算信噪比和极限星等
        
        参考: Howell, S.B. (2006) "Handbook of CCD Astronomy"
        """
        filter_info = self.filter_info.get(request.filter_name, self.filter_info["V"])
        
        optical_params = self._calculate_optical_parameters(
            request.telescope.aperture,
            request.telescope.focal_length,
            request.telescope.f_ratio,
            request.camera.pixel_size,
            request.binning
        )
        
        fwhm_arcsec = request.atmosphere.seeing
        fwhm_pixels = fwhm_arcsec / optical_params["pixel_scale"]
        
        sky_brightness = self._get_sky_brightness(
            request.filter_name,
            request.atmosphere.moon_phase,
            request.atmosphere.sky_brightness
        )
        
        mirror_reflect = self.mirror_reflectivity.get(
            request.telescope.mirror_coating,
            self.mirror_reflectivity["aluminum"]
        )
        
        signal_electrons_per_exp = self._calculate_target_electrons(
            request.target_magnitude,
            filter_info,
            request.exposure_time,
            request.telescope.aperture,
            request.atmosphere.transparency,
            request.atmosphere.airmass,
            request.camera.quantum_efficiency,
            fwhm_arcsec,
            optical_params["pixel_scale"],
            mirror_reflect,
            request.telescope.central_obstruction
        )
        
        sky_electrons_per_exp = self._calculate_sky_brightness_electrons(
            sky_brightness,
            filter_info,
            optical_params["pixel_scale"],
            request.exposure_time,
            request.telescope.aperture,
            request.atmosphere.transparency,
            request.atmosphere.airmass,
            request.camera.quantum_efficiency
        )
        
        fwhm_pixels_area = np.pi * (1.5 * fwhm_pixels) ** 2
        sky_total_per_exp = sky_electrons_per_exp * fwhm_pixels_area
        
        dark_electrons_per_exp = request.camera.dark_current * request.exposure_time * fwhm_pixels_area
        
        read_noise_per_exp = request.camera.read_noise * np.sqrt(fwhm_pixels_area)
        read_noise_total = read_noise_per_exp * np.sqrt(request.num_exposures)
        
        signal_total = signal_electrons_per_exp * request.num_exposures
        sky_total = sky_total_per_exp * request.num_exposures
        dark_total = dark_electrons_per_exp * request.num_exposures
        
        noise_per_exp = np.sqrt(
            signal_electrons_per_exp + 
            sky_total_per_exp + 
            dark_electrons_per_exp + 
            read_noise_per_exp ** 2
        )
        
        total_noise = noise_per_exp * np.sqrt(request.num_exposures)
        snr = signal_total / total_noise if total_noise > 0 else 0
        snr_per_exp = signal_electrons_per_exp / noise_per_exp if noise_per_exp > 0 else 0
        
        limiting_magnitude = self._calculate_limiting_magnitude(
            request, filter_info, optical_params, fwhm_arcsec, mirror_reflect
        )
        
        saturation_warning = signal_total > request.camera.full_well * 0.8
        
        return ObservationResult(
            signal_electrons=float(signal_total),
            sky_electrons=float(sky_total),
            dark_electrons=float(dark_total),
            read_noise_total=float(read_noise_total),
            total_noise=float(total_noise),
            snr=float(snr),
            snr_per_exposure=float(snr_per_exp),
            limiting_magnitude=float(limiting_magnitude),
            saturation_warning=bool(saturation_warning),
            pixel_scale=float(optical_params["pixel_scale"]),
            plate_scale=float(optical_params["plate_scale"]),
            fwhm_pixels=float(fwhm_pixels)
        )
    
    def _calculate_limiting_magnitude(
        self,
        request: ObservationRequest,
        filter_info: Dict,
        optical_params: Dict,
        fwhm_arcsec: float,
        mirror_reflect: float,
        target_snr: float = 5.0
    ) -> float:
        """计算极限星等（SNR=5）"""
        total_exp_time = request.exposure_time * request.num_exposures
        
        sky_brightness = self._get_sky_brightness(
            request.filter_name,
            request.atmosphere.moon_phase,
            request.atmosphere.sky_brightness
        )
        
        sky_electrons = self._calculate_sky_brightness_electrons(
            sky_brightness,
            filter_info,
            optical_params["pixel_scale"],
            total_exp_time,
            request.telescope.aperture,
            request.atmosphere.transparency,
            request.atmosphere.airmass,
            request.camera.quantum_efficiency
        )
        
        fwhm_pixels = fwhm_arcsec / optical_params["pixel_scale"]
        aperture_pixels = np.pi * (1.5 * fwhm_pixels) ** 2
        
        sky_total = sky_electrons * aperture_pixels
        dark_total = request.camera.dark_current * total_exp_time * aperture_pixels
        read_noise_total = request.camera.read_noise * np.sqrt(aperture_pixels * request.num_exposures)
        
        noise_background = np.sqrt(sky_total + dark_total + read_noise_total ** 2)
        
        signal_for_snr = target_snr * noise_background
        
        h = 6.626e-34
        c = 3e8
        wl_eff_m = filter_info["wl_eff"] * 1e-10
        photons_per_mag0 = (filter_info["zero_mag_flux"] * wl_eff_m) / (h * c)
        
        aperture_area = np.pi * (request.telescope.aperture / 2) ** 2
        obstruction_factor = 1 - (request.telescope.central_obstruction ** 2)
        effective_area = aperture_area * obstruction_factor * mirror_reflect
        
        extinction = request.atmosphere.transparency * 10 ** (-0.4 * 0.2 * (request.atmosphere.airmass - 1))
        
        photons_needed = signal_for_snr / request.camera.quantum_efficiency
        flux_needed = photons_needed / (extinction * effective_area * total_exp_time)
        
        if flux_needed > 0:
            limiting_mag = -2.5 * np.log10(flux_needed / photons_per_mag0)
        else:
            limiting_mag = 30.0
        
        return limiting_mag
    
    async def calculate_exposure_time(
        self,
        request: ExposureTimeRequest
    ) -> Dict[str, Any]:
        """计算达到目标SNR所需的曝光时间"""
        filter_info = self.filter_info.get(request.filter_name, self.filter_info["V"])
        
        optical_params = self._calculate_optical_parameters(
            request.telescope.aperture,
            request.telescope.focal_length,
            request.telescope.f_ratio,
            request.camera.pixel_size,
            request.binning
        )
        
        mirror_reflect = self.mirror_reflectivity.get(
            request.telescope.mirror_coating,
            self.mirror_reflectivity["aluminum"]
        )
        
        fwhm_arcsec = request.atmosphere.seeing
        fwhm_pixels = fwhm_arcsec / optical_params["pixel_scale"]
        aperture_pixels = np.pi * (1.5 * fwhm_pixels) ** 2
        
        sky_brightness = self._get_sky_brightness(
            request.filter_name,
            request.atmosphere.moon_phase,
            request.atmosphere.sky_brightness
        )
        
        target_snr = request.target_snr
        
        h = 6.626e-34
        c = 3e8
        wl_eff_m = filter_info["wl_eff"] * 1e-10
        photons_per_mag0 = (filter_info["zero_mag_flux"] * wl_eff_m) / (h * c)
        
        aperture_area = np.pi * (request.telescope.aperture / 2) ** 2
        obstruction_factor = 1 - (request.telescope.central_obstruction ** 2)
        effective_area = aperture_area * obstruction_factor * mirror_reflect
        
        extinction = request.atmosphere.transparency * 10 ** (-0.4 * 0.2 * (request.atmosphere.airmass - 1))
        
        target_flux = photons_per_mag0 * 10 ** (-0.4 * request.target_magnitude)
        signal_rate = target_flux * extinction * effective_area * request.camera.quantum_efficiency
        
        sky_flux = photons_per_mag0 * 10 ** (-0.4 * sky_brightness)
        sky_rate = sky_flux * extinction * effective_area * request.camera.quantum_efficiency * optical_params["pixel_scale"] ** 2
        
        dark_rate = request.camera.dark_current * aperture_pixels
        
        read_noise = request.camera.read_noise * np.sqrt(aperture_pixels)
        
        a = signal_rate ** 2
        b = -target_snr ** 2 * (signal_rate + sky_rate * aperture_pixels + dark_rate)
        c = -target_snr ** 2 * read_noise ** 2
        
        discriminant = b ** 2 - 4 * a * c
        if discriminant < 0:
            t_per_exp = request.max_exposure
        else:
            t_per_exp = (-b + np.sqrt(discriminant)) / (2 * a)
        
        t_per_exp = min(t_per_exp, request.max_exposure)
        
        total_time = t_per_exp
        num_exposures = 1
        
        if t_per_exp <= 0:
            t_per_exp = request.max_exposure
        
        total_snr = signal_rate * t_per_exp / np.sqrt(
            signal_rate * t_per_exp + 
            sky_rate * aperture_pixels * t_per_exp + 
            dark_rate * t_per_exp + 
            read_noise ** 2
        )
        
        return {
            "exposure_time_per_frame": float(t_per_exp),
            "total_exposure_time": float(total_time),
            "num_exposures": num_exposures,
            "expected_snr": float(total_snr),
            "pixel_scale": float(optical_params["pixel_scale"]),
            "recommendation": self._get_exposure_recommendation(total_snr, request.target_snr)
        }
    
    def _get_exposure_recommendation(self, achieved_snr: float, target_snr: float) -> str:
        """生成曝光建议"""
        ratio = achieved_snr / target_snr
        
        if ratio >= 1.2:
            return "曝光充足，可以适当减少单帧曝光时间以避免饱和"
        elif ratio >= 0.9:
            return "曝光时间合适，能够达到目标信噪比"
        elif ratio >= 0.6:
            return "曝光时间稍短，建议增加10-20%的曝光时间"
        else:
            return "曝光时间不足，建议增加曝光时间或使用叠加"
    
    async def get_telescope_presets(self) -> List[Dict]:
        """获取望远镜预设"""
        return [
            {"id": key, **value}
            for key, value in self.telescope_presets.items()
        ]
    
    async def get_camera_presets(self) -> List[Dict]:
        """获取相机预设"""
        return [
            {"id": key, **value}
            for key, value in self.camera_presets.items()
        ]
    
    async def get_filter_info(self) -> List[Dict]:
        """获取滤光片信息"""
        return [
            {"name": key, **value}
            for key, value in self.filter_info.items()
        ]
