import numpy as np
from typing import Dict, Any, List, Optional, Tuple
from app.models import MultiBandLayer, MultiBandCompositeRequest


class MultiBandService:
    """
    多波段图像叠加服务 - 基于WCS对齐、伪彩色映射、透明度调节
    
    支持波段:
    - 光学: U, B, V, R, I, g, r, i, z
    - 红外: J, H, K, L, M
    - 射电: 21cm, 1.4GHz, 5GHz
    """
    
    def __init__(self):
        self.band_info = {
            "optical_U": {"name": "U 波段", "wl_min": 3000, "wl_max": 4000, "color": "#9966ff"},
            "optical_B": {"name": "B 波段", "wl_min": 3900, "wl_max": 4800, "color": "#6699ff"},
            "optical_g": {"name": "g 波段", "wl_min": 4000, "wl_max": 5500, "color": "#66ccff"},
            "optical_V": {"name": "V 波段", "wl_min": 5000, "wl_max": 6000, "color": "#ccff99"},
            "optical_R": {"name": "R 波段", "wl_min": 5500, "wl_max": 7000, "color": "#ffcc66"},
            "optical_r": {"name": "r 波段", "wl_min": 5600, "wl_max": 7200, "color": "#ff9966"},
            "optical_I": {"name": "I 波段", "wl_min": 7000, "wl_max": 9000, "color": "#ff6666"},
            "optical_i": {"name": "i 波段", "wl_min": 6900, "wl_max": 8400, "color": "#ff5555"},
            "optical_z": {"name": "z 波段", "wl_min": 8300, "wl_max": 9200, "color": "#cc4444"},
            "infrared_J": {"name": "J 波段", "wl_min": 11000, "wl_max": 14000, "color": "#ff9933"},
            "infrared_H": {"name": "H 波段", "wl_min": 15000, "wl_max": 18000, "color": "#ff6600"},
            "infrared_K": {"name": "K 波段", "wl_min": 20000, "wl_max": 24000, "color": "#cc3300"},
            "infrared_L": {"name": "L 波段", "wl_min": 34000, "wl_max": 40000, "color": "#993300"},
            "infrared_M": {"name": "M 波段", "wl_min": 46000, "wl_max": 50000, "color": "#663300"},
            "radio_21cm": {"name": "21cm 中性氢", "wl_min": 211060000, "wl_max": 211060000, "color": "#00cc99"},
            "radio_1_4GHz": {"name": "1.4GHz 连续谱", "wl_min": 214137470, "wl_max": 214137470, "color": "#33ccaa"},
            "radio_5GHz": {"name": "5GHz 连续谱", "wl_min": 59958491, "wl_max": 59958491, "color": "#66ccbb"},
        }
        
        self.colormap_presets = {
            "gray": "灰度",
            "heat": "热成像",
            "inferno": "Inferno",
            "plasma": "Plasma",
            "viridis": "Viridis",
            "blue": "蓝色调",
            "red": "红色调",
            "green": "绿色调"
        }
        
        np.random.seed(42)
    
    def _generate_mock_image(
        self,
        band: str,
        image_size: Tuple[int, int] = (256, 256),
        object_type: str = "galaxy"
    ) -> np.ndarray:
        """生成模拟的多波段图像"""
        h, w = image_size
        y, x = np.mgrid[0:h, 0:w]
        cy, cx = h // 2, w // 2
        
        dist = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
        
        band_info = self.band_info.get(band, self.band_info["optical_V"])
        
        if object_type == "galaxy":
            galaxy_profile = self._generate_galaxy_profile(dist, h, w, band)
        elif object_type == "star_cluster":
            galaxy_profile = self._generate_star_cluster_profile(x, y, h, w, band)
        elif object_type == "nebula":
            galaxy_profile = self._generate_nebula_profile(x, y, h, w, band)
        else:
            galaxy_profile = self._generate_galaxy_profile(dist, h, w, band)
        
        noise = np.random.normal(0, 0.05, (h, w))
        
        image = galaxy_profile + noise
        image = np.clip(image, 0, None)
        
        return image
    
    def _generate_galaxy_profile(
        self,
        dist: np.ndarray,
        h: int,
        w: int,
        band: str
    ) -> np.ndarray:
        """生成星系轮廓（De Vaucouleurs / Sersic）"""
        max_dist = np.sqrt((h/2)**2 + (w/2)**2)
        normalized_dist = dist / max_dist
        
        sersic_n = 4.0
        r_eff = 0.3 * max_dist
        
        intensity = np.exp(-7.669 * ((normalized_dist * (max_dist / r_eff)) ** (1/sersic_n) - 1))
        
        if "infrared" in band:
            intensity = intensity * 0.8 + 0.2 * np.exp(-((normalized_dist * 5) ** 2) / 2)
        elif "radio" in band:
            intensity = intensity * 0.3 + 0.7 * np.exp(-((normalized_dist * 2) ** 2) / 2)
            intensity *= 1.2
        
        return intensity
    
    def _generate_star_cluster_profile(
        self,
        x: np.ndarray,
        y: np.ndarray,
        h: int,
        w: int,
        band: str
    ) -> np.ndarray:
        """生成星团图像"""
        image = np.zeros((h, w))
        
        n_stars = np.random.randint(100, 500)
        
        for _ in range(n_stars):
            sx = np.random.normal(w/2, w/6)
            sy = np.random.normal(h/2, h/6)
            
            if 0 <= sx < w and 0 <= sy < h:
                brightness = np.random.uniform(0.3, 1.0)
                sigma = np.random.uniform(0.5, 2.0)
                
                star_dist = np.sqrt((x - sx) ** 2 + (y - sy) ** 2)
                star = brightness * np.exp(-star_dist ** 2 / (2 * sigma ** 2))
                image += star
        
        return image
    
    def _generate_nebula_profile(
        self,
        x: np.ndarray,
        y: np.ndarray,
        h: int,
        w: int,
        band: str
    ) -> np.ndarray:
        """生成星云图像（不规则结构）"""
        from scipy.ndimage import gaussian_filter
        
        noise = np.random.randn(h, w)
        smoothed = gaussian_filter(noise, sigma=10)
        
        normalized = (smoothed - smoothed.min()) / (smoothed.max() - smoothed.min())
        
        cy, cx = h // 2, w // 2
        dist = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
        max_dist = np.sqrt((h/2)**2 + (w/2)**2)
        envelope = np.exp(-(dist / (max_dist * 0.6)) ** 2)
        
        image = normalized * envelope
        
        if "infrared" in band:
            image = image ** 0.7
        elif "radio" in band:
            image = image ** 0.5
            image *= 1.3
        
        return image
    
    def _apply_colormap(
        self,
        image: np.ndarray,
        colormap: str,
        contrast: float = 1.0,
        brightness: float = 0.0
    ) -> np.ndarray:
        """应用伪彩色映射"""
        image = (image - image.min()) / (image.max() - image.min() + 1e-10)
        image = np.clip((image - 0.5) * contrast + 0.5 + brightness, 0, 1)
        
        h, w = image.shape
        rgb = np.zeros((h, w, 3))
        
        if colormap == "gray":
            rgb[:, :, 0] = image
            rgb[:, :, 1] = image
            rgb[:, :, 2] = image
            
        elif colormap == "heat":
            rgb[:, :, 0] = np.clip(image * 2, 0, 1)
            rgb[:, :, 1] = np.clip((image - 0.5) * 2, 0, 1)
            rgb[:, :, 2] = np.clip((image - 0.8) * 5, 0, 1)
            
        elif colormap == "inferno":
            for i in range(h):
                for j in range(w):
                    val = image[i, j]
                    r = np.clip(1.5 * val - 0.3, 0, 1)
                    g = np.clip(2 * val - 0.5, 0, 1)
                    b = np.clip(3 * val - 1, 0, 1)
                    rgb[i, j] = [r, g, b]
                    
        elif colormap == "plasma":
            for i in range(h):
                for j in range(w):
                    val = image[i, j]
                    r = np.clip(2 * val - 0.3, 0, 1)
                    g = np.clip(val * 1.5, 0, 1)
                    b = np.clip(1.5 - val, 0, 1)
                    rgb[i, j] = [r, g, b]
                    
        elif colormap == "viridis":
            for i in range(h):
                for j in range(w):
                    val = image[i, j]
                    r = np.clip(3 * val - 1, 0, 1)
                    g = np.clip(val * 1.5 - 0.2, 0, 1)
                    b = np.clip(1 - 2 * val, 0, 1)
                    rgb[i, j] = [r, g, b]
                    
        elif colormap == "blue":
            rgb[:, :, 2] = image
            rgb[:, :, 1] = image * 0.5
            rgb[:, :, 0] = image * 0.2
            
        elif colormap == "red":
            rgb[:, :, 0] = image
            rgb[:, :, 1] = image * 0.3
            rgb[:, :, 2] = image * 0.1
            
        elif colormap == "green":
            rgb[:, :, 1] = image
            rgb[:, :, 0] = image * 0.3
            rgb[:, :, 2] = image * 0.2
            
        else:
            rgb[:, :, 0] = image
            rgb[:, :, 1] = image
            rgb[:, :, 2] = image
        
        return rgb
    
    def _normalize_image(
        self,
        image: np.ndarray,
        method: str = "zscale",
        stretch: str = "linear"
    ) -> np.ndarray:
        """标准化图像（ZScale / Percentile）"""
        image = np.nan_to_num(image, nan=0.0, posinf=0.0, neginf=0.0)
        finite_mask = np.isfinite(image)
        
        if not finite_mask.any():
            return np.zeros_like(image)
        
        finite_data = image[finite_mask]
        
        if method == "zscale":
            data_sorted = np.sort(finite_data)
            n = len(data_sorted)
            median = np.median(data_sorted)
            
            i1 = max(0, int(n * 0.25))
            i2 = min(n - 1, int(n * 0.75))
            q1 = data_sorted[i1]
            q3 = data_sorted[i2]
            iqr = q3 - q1
            
            vmin = max(median - 1.5 * iqr, finite_data.min())
            vmax = min(median + 3.0 * iqr, finite_data.max())
            
        elif method == "percentile":
            vmin = np.percentile(finite_data, 1)
            vmax = np.percentile(finite_data, 99.5)
        else:
            vmin = finite_data.min()
            vmax = finite_data.max()
        
        if vmax <= vmin:
            vmax = vmin + 1
        
        normalized = (image - vmin) / (vmax - vmin)
        normalized = np.clip(normalized, 0, 1)
        
        if stretch == "log":
            normalized = np.log1p(normalized * 9) / np.log(10)
        elif stretch == "sqrt":
            normalized = np.sqrt(normalized)
        elif stretch == "asinh":
            normalized = np.arcsinh(normalized * 10) / np.arcsinh(10)
        
        return normalized
    
    async def get_band_info(self) -> List[Dict]:
        """获取所有可用波段信息"""
        return [
            {"id": key, **value}
            for key, value in self.band_info.items()
        ]
    
    async def get_colormap_presets(self) -> List[Dict]:
        """获取伪彩色预设"""
        return [
            {"id": key, "name": value}
            for key, value in self.colormap_presets.items()
        ]
    
    async def generate_multiband_image(
        self,
        bands: List[str],
        image_size: Tuple[int, int] = (256, 256),
        object_type: str = "galaxy"
    ) -> Dict[str, Any]:
        """生成多波段模拟图像数据"""
        images = {}
        for band in bands:
            img = self._generate_mock_image(band, image_size, object_type)
            normalized = self._normalize_image(img, method="zscale")
            images[band] = normalized.tolist()
        
        return {
            "bands": bands,
            "image_size": image_size,
            "object_type": object_type,
            "images": images
        }
    
    async def create_composite(
        self,
        layers: List[MultiBandLayer],
        scale_method: str = "zscale",
        stretch_method: str = "linear",
        image_size: Tuple[int, int] = (256, 256),
        object_type: str = "galaxy"
    ) -> Dict[str, Any]:
        """创建多波段合成图像"""
        h, w = image_size
        composite = np.zeros((h, w, 3))
        alpha_total = np.zeros((h, w, 1))
        
        layer_data = []
        
        for layer in layers:
            if not layer.visible:
                continue
            
            img = self._generate_mock_image(layer.band, image_size, object_type)
            normalized = self._normalize_image(img, method=scale_method, stretch=stretch_method)
            
            rgb = self._apply_colormap(
                normalized,
                layer.colormap,
                layer.contrast,
                layer.brightness
            )
            
            alpha = layer.opacity
            composite += rgb * alpha
            alpha_total += alpha
            
            layer_data.append({
                "id": layer.id,
                "band": layer.band,
                "name": layer.name,
                "colormap": layer.colormap,
                "opacity": layer.opacity,
                "image": normalized.tolist()
            })
        
        if alpha_total.max() > 0:
            composite = composite / np.maximum(alpha_total, 1e-10)
        
        composite = np.clip(composite, 0, 1)
        
        return {
            "composite_image": composite.tolist(),
            "layers": layer_data,
            "image_size": image_size,
            "scale_method": scale_method,
            "stretch_method": stretch_method
        }
    
    async def get_default_layers(self) -> List[Dict]:
        """获取默认的多波段图层配置"""
        return [
            {
                "id": "radio_5GHz",
                "band": "radio_5GHz",
                "name": "射电 5GHz",
                "colormap": "blue",
                "opacity": 0.5,
                "visible": True,
                "contrast": 1.0,
                "brightness": 0.0
            },
            {
                "id": "infrared_K",
                "band": "infrared_K",
                "name": "红外 K 波段",
                "colormap": "red",
                "opacity": 0.6,
                "visible": True,
                "contrast": 1.0,
                "brightness": 0.0
            },
            {
                "id": "optical_r",
                "band": "optical_r",
                "name": "光学 r 波段",
                "colormap": "green",
                "opacity": 0.7,
                "visible": True,
                "contrast": 1.0,
                "brightness": 0.0
            },
            {
                "id": "optical_g",
                "band": "optical_g",
                "name": "光学 g 波段",
                "colormap": "heat",
                "opacity": 0.8,
                "visible": True,
                "contrast": 1.0,
                "brightness": 0.0
            }
        ]
