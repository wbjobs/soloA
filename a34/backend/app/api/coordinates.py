from fastapi import APIRouter, Query
from app.services.coordinate_service import CoordinateService
from app.models import CoordinateConversionRequest, CoordinateConversionResponse

router = APIRouter()
coord_service = CoordinateService()


@router.post("/convert", response_model=CoordinateConversionResponse)
async def convert_coordinates(request: CoordinateConversionRequest):
    """坐标系转换：ICRS(赤道) ↔ Galactic(银道) ↔ AltAz(地平)"""
    return await coord_service.convert(request)


@router.get("/systems")
async def get_supported_systems():
    """获取支持的坐标系列表"""
    return {
        "systems": [
            {"code": "icrs", "name": "ICRS (赤道坐标系)", "description": "国际天球参考系，基于FK5/J2000.0"},
            {"code": "galactic", "name": "Galactic (银道坐标系)", "description": "以银心为中心的坐标系"},
            {"code": "altaz", "name": "AltAz (地平坐标系)", "description": "基于观测者位置的地平坐标系，需要观测者参数"}
        ]
    }


@router.post("/batch-convert")
async def batch_convert(
    coordinates: list[dict],
    from_system: str = Query(..., pattern="^(icrs|galactic|altaz)$"),
    to_system: str = Query(..., pattern="^(icrs|galactic|altaz)$"),
    observer_lon: float = Query(116.397, description="观测者经度（度）"),
    observer_lat: float = Query(39.907, description="观测者纬度（度）"),
    observer_height: float = Query(0.0, description="观测者高度（米）")
):
    """批量转换坐标，用于3D星场渲染"""
    return await coord_service.batch_convert(
        coordinates, from_system, to_system,
        observer_lon, observer_lat, observer_height
    )
