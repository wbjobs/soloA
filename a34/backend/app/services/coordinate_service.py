from astropy.coordinates import SkyCoord, EarthLocation, AltAz, ICRS, Galactic
from astropy import units as u
from astropy.time import Time
from typing import Optional, List
from app.models import (
    CoordinateConversionRequest, 
    CoordinateConversionResponse, 
    CoordinatePoint
)
import numpy as np


class CoordinateService:
    """坐标转换服务 - 基于Astropy实现"""
    
    async def convert(
        self,
        request: CoordinateConversionRequest
    ) -> CoordinateConversionResponse:
        """执行单个坐标转换"""
        coord = self._parse_coordinate(
            request.source,
            request.from_system,
            request.observer_lon,
            request.observer_lat,
            request.observer_height,
            request.observation_time
        )
        
        target_coord = self._convert_to_system(
            coord,
            request.to_system,
            request.observer_lon,
            request.observer_lat,
            request.observer_height,
            request.observation_time
        )
        
        result = self._coordinate_to_point(target_coord, request.to_system)
        cartesian = self._to_cartesian(target_coord)
        
        return CoordinateConversionResponse(
            source=request.source,
            source_system=request.from_system.value,
            target=result,
            target_system=request.to_system.value,
            cartesian=cartesian
        )
    
    async def batch_convert(
        self,
        coordinates: List[dict],
        from_system: str,
        to_system: str,
        observer_lon: float,
        observer_lat: float,
        observer_height: float
    ):
        """批量转换坐标"""
        results = []
        
        for coord_dict in coordinates:
            point = CoordinatePoint(
                lon=coord_dict["lon"],
                lat=coord_dict["lat"],
                distance=coord_dict.get("distance", 1.0)
            )
            
            coord = self._parse_coordinate(
                point,
                from_system,
                observer_lon,
                observer_lat,
                observer_height,
                None
            )
            
            target_coord = self._convert_to_system(
                coord,
                to_system,
                observer_lon,
                observer_lat,
                observer_height,
                None
            )
            
            result = self._coordinate_to_point(target_coord, to_system)
            cartesian = self._to_cartesian(target_coord)
            
            results.append({
                "source": point.model_dump(),
                "target": result.model_dump(),
                "cartesian": cartesian
            })
        
        return {
            "from_system": from_system,
            "to_system": to_system,
            "count": len(results),
            "results": results
        }
    
    def _parse_coordinate(
        self,
        point: CoordinatePoint,
        system: str,
        observer_lon: float,
        observer_lat: float,
        observer_height: float,
        obs_time: Optional[str]
    ) -> SkyCoord:
        """解析输入坐标"""
        distance = u.Quantity(point.distance or 1.0, u.pc)
        
        if system == "icrs":
            return SkyCoord(
                ra=point.lon * u.deg,
                dec=point.lat * u.deg,
                distance=distance,
                frame=ICRS()
            )
        elif system == "galactic":
            return SkyCoord(
                l=point.lon * u.deg,
                b=point.lat * u.deg,
                distance=distance,
                frame=Galactic()
            )
        elif system == "altaz":
            location = EarthLocation(
                lon=observer_lon * u.deg,
                lat=observer_lat * u.deg,
                height=observer_height * u.m
            )
            time = Time(obs_time) if obs_time else Time.now()
            
            return SkyCoord(
                alt=point.lat * u.deg,
                az=point.lon * u.deg,
                distance=distance,
                frame=AltAz(location=location, obstime=time)
            )
        else:
            raise ValueError(f"不支持的坐标系统: {system}")
    
    def _convert_to_system(
        self,
        coord: SkyCoord,
        target_system: str,
        observer_lon: float,
        observer_lat: float,
        observer_height: float,
        obs_time: Optional[str]
    ) -> SkyCoord:
        """转换到目标坐标系统"""
        if target_system == "icrs":
            return coord.icrs
        elif target_system == "galactic":
            return coord.galactic
        elif target_system == "altaz":
            location = EarthLocation(
                lon=observer_lon * u.deg,
                lat=observer_lat * u.deg,
                height=observer_height * u.m
            )
            time = Time(obs_time) if obs_time else Time.now()
            return coord.transform_to(AltAz(location=location, obstime=time))
        else:
            raise ValueError(f"不支持的坐标系统: {target_system}")
    
    def _coordinate_to_point(self, coord: SkyCoord, system: str) -> CoordinatePoint:
        """将SkyCoord转换为CoordinatePoint"""
        distance = coord.distance.value if coord.distance else 1.0
        
        if system == "icrs":
            return CoordinatePoint(
                lon=float(coord.ra.deg),
                lat=float(coord.dec.deg),
                distance=float(distance)
            )
        elif system == "galactic":
            gal = coord.galactic
            return CoordinatePoint(
                lon=float(gal.l.deg),
                lat=float(gal.b.deg),
                distance=float(distance)
            )
        elif system == "altaz":
            return CoordinatePoint(
                lon=float(coord.az.deg),
                lat=float(coord.alt.deg),
                distance=float(distance)
            )
    
    def _to_cartesian(self, coord: SkyCoord) -> dict:
        """转换为笛卡尔坐标"""
        icrs = coord.icrs
        distance = icrs.distance.value if icrs.distance else 1.0
        ra_rad = np.radians(icrs.ra.deg)
        dec_rad = np.radians(icrs.dec.deg)
        
        return {
            "x": float(distance * np.cos(dec_rad) * np.cos(ra_rad)),
            "y": float(distance * np.sin(dec_rad)),
            "z": float(distance * np.cos(dec_rad) * np.sin(ra_rad))
        }
