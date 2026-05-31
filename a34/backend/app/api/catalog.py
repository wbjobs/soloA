from fastapi import APIRouter, Query
from app.services.catalog_service import CatalogService
from app.models import StarData, CatalogQueryResponse

router = APIRouter()
catalog_service = CatalogService()


@router.get("/stars", response_model=CatalogQueryResponse)
async def get_stars(
    limit: int = Query(10000, ge=100, le=500000, description="返回恒星数量"),
    min_magnitude: float = Query(None, description="最小视星等（过滤）"),
    max_magnitude: float = Query(None, description="最大视星等（过滤）"),
    ra_range: str = Query(None, description="赤经范围 'min,max'（度）"),
    dec_range: str = Query(None, description="赤纬范围 'min,max'（度）")
):
    """获取模拟星表数据，支持视星等过滤和天区范围限制"""
    result = await catalog_service.get_stars(
        limit=limit,
        min_magnitude=min_magnitude,
        max_magnitude=max_magnitude,
        ra_range=ra_range,
        dec_range=dec_range
    )
    return result


@router.get("/star/{source_id}")
async def get_star_detail(source_id: str):
    """获取单颗恒星的详细信息"""
    return await catalog_service.get_star_detail(source_id)
