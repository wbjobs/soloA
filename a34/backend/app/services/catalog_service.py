import numpy as np
from typing import List, Optional
from app.models import StarData, CatalogQueryResponse


class CatalogService:
    """星表数据服务 - 生成模拟Gaia DR3风格的恒星数据"""
    
    def __init__(self):
        np.random.seed(42)
        self._cached_stars = {}
    
    async def get_stars(
        self,
        limit: int = 10000,
        min_magnitude: Optional[float] = None,
        max_magnitude: Optional[float] = None,
        ra_range: Optional[str] = None,
        dec_range: Optional[str] = None
    ) -> CatalogQueryResponse:
        """生成模拟恒星数据"""
        cache_key = f"{limit}_{min_magnitude}_{max_magnitude}_{ra_range}_{dec_range}"
        
        if cache_key in self._cached_stars:
            return self._cached_stars[cache_key]
        
        stars = self._generate_stars(limit)
        
        if min_magnitude is not None:
            stars = [s for s in stars if s.magnitude >= min_magnitude]
        if max_magnitude is not None:
            stars = [s for s in stars if s.magnitude <= max_magnitude]
        
        if ra_range:
            ra_min, ra_max = map(float, ra_range.split(','))
            stars = [s for s in stars if ra_min <= s.ra <= ra_max]
        if dec_range:
            dec_min, dec_max = map(float, dec_range.split(','))
            stars = [s for s in stars if dec_min <= s.dec <= dec_max]
        
        self._add_cartesian_and_color(stars)
        
        response = CatalogQueryResponse(
            count=len(stars),
            stars=stars,
            filters={
                "limit": limit,
                "min_magnitude": min_magnitude,
                "max_magnitude": max_magnitude,
                "ra_range": ra_range,
                "dec_range": dec_range
            },
            coordinate_system="icrs"
        )
        
        self._cached_stars[cache_key] = response
        return response
    
    def _generate_stars(self, n: int) -> List[StarData]:
        """生成n颗模拟恒星，模拟银河系分布"""
        ra = np.random.uniform(0, 360, n)
        dec = np.random.uniform(-90, 90, n)
        
        l = np.random.uniform(0, 360, n)
        b = np.random.normal(0, 8, n)
        b = np.clip(b, -90, 90)
        
        mag_g = np.random.normal(15, 3, n)
        mag_g = np.clip(mag_g, 6, 22)
        
        bp_rp = np.random.normal(1.0, 0.8, n)
        bp_rp = np.clip(bp_rp, -0.5, 4.0)
        
        parallax = np.random.exponential(1.0, n)
        distance = np.where(parallax > 0, 1000 / parallax, 10000)
        
        teff = self._bp_rp_to_teff(bp_rp)
        spectral_types = self._teff_to_spectral_type(teff)
        
        stars = []
        for i in range(n):
            r, g, b = self._bp_rp_to_color(bp_rp[i], mag_g[i])
            star = StarData(
                source_id=f"GaiaDR3_{i:010d}",
                ra=float(ra[i]),
                dec=float(dec[i]),
                l=float(l[i]),
                b=float(b[i]),
                parallax=float(parallax[i]),
                distance=float(distance[i]),
                magnitude=float(mag_g[i]),
                bp_rp=float(bp_rp[i]),
                teff=float(teff[i]),
                spectral_type=spectral_types[i],
                color_r=int(r),
                color_g=int(g),
                color_b=int(b)
            )
            stars.append(star)
        
        return stars
    
    def _add_cartesian_and_color(self, stars: List[StarData]):
        """为恒星添加归一化的笛卡尔坐标"""
        max_distance = max(s.distance or 1000 for s in stars)
        
        for star in stars:
            ra_rad = np.radians(star.ra)
            dec_rad = np.radians(star.dec)
            dist = (star.distance or 1000) / max_distance * 0.9 + 0.1
            
            star.x = float(dist * np.cos(dec_rad) * np.cos(ra_rad))
            star.y = float(dist * np.sin(dec_rad))
            star.z = float(dist * np.cos(dec_rad) * np.sin(ra_rad))
    
    def _bp_rp_to_teff(self, bp_rp):
        """将BP-RP颜色指数转换为有效温度（近似关系）"""
        teff = 8000 - 2000 * bp_rp + 300 * bp_rp**2
        return np.clip(teff, 2500, 35000)
    
    def _teff_to_spectral_type(self, teff):
        """将有效温度转换为光谱型"""
        types = []
        for t in teff:
            if t >= 30000:
                types.append("O")
            elif t >= 10000:
                types.append("B")
            elif t >= 7500:
                types.append("A")
            elif t >= 6000:
                types.append("F")
            elif t >= 5200:
                types.append("G")
            elif t >= 3700:
                types.append("K")
            else:
                types.append("M")
        return types
    
    def _bp_rp_to_color(self, bp_rp, magnitude):
        """将BP-RP颜色指数转换为RGB颜色"""
        if bp_rp < 0.0:
            r, g, b = 155, 176, 255
        elif bp_rp < 0.5:
            r, g, b = 202, 215, 255
        elif bp_rp < 1.0:
            r, g, b = 255, 255, 255
        elif bp_rp < 1.5:
            r, g, b = 255, 245, 230
        elif bp_rp < 2.0:
            r, g, b = 255, 220, 180
        elif bp_rp < 3.0:
            r, g, b = 255, 180, 130
        else:
            r, g, b = 255, 140, 90
        
        brightness = max(0.2, 1.0 - (magnitude - 6) / 18)
        r = int(r * brightness)
        g = int(g * brightness)
        b = int(b * brightness)
        
        return r, g, b
    
    async def get_star_detail(self, source_id: str):
        """获取单颗恒星的详细信息"""
        return {
            "source_id": source_id,
            "photometry": {
                "G_mag": 15.2,
                "BP_mag": 15.8,
                "RP_mag": 14.7
            },
            "astrometry": {
                "ra": 265.12345,
                "dec": -28.12345,
                "parallax": 0.456,
                "pmra": 1.23,
                "pmdec": -0.87
            },
            "physical": {
                "teff": 5770,
                "logg": 4.4,
                "fe_h": 0.0,
                "radius": 1.0,
                "mass": 1.0
            }
        }
