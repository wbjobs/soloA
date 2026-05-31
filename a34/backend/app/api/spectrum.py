from fastapi import APIRouter, Query
from app.services.spectrum_service import SpectrumService
from app.models import SpectrumData, RedshiftMeasurement, LineIdentification

router = APIRouter()
spectrum_service = SpectrumService()


@router.get("/sample", response_model=SpectrumData)
async def get_sample_spectrum(
    star_type: str = Query("G2V", description="恒星光谱型（如O, B, A, F, G, K, M）"),
    redshift: float = Query(0.0, description="红移值"),
    add_noise: bool = Query(True, description="添加观测噪声")
):
    """获取模拟光谱数据"""
    return await spectrum_service.get_sample_spectrum(star_type, redshift, add_noise)


@router.post("/measure-redshift", response_model=RedshiftMeasurement)
async def measure_redshift(spectrum: SpectrumData):
    """测量光谱红移"""
    return await spectrum_service.measure_redshift(spectrum)


@router.post("/identify-lines", response_model=list[LineIdentification])
async def identify_lines(
    spectrum: SpectrumData,
    redshift: float = Query(0.0, description="已知红移值，留空则自动测量")
):
    """识别光谱中的发射线和吸收线"""
    return await spectrum_service.identify_lines(spectrum, redshift)


@router.post("/classify")
async def classify_star(spectrum: SpectrumData):
    """基于光谱进行恒星分类"""
    return await spectrum_service.classify_star(spectrum)
