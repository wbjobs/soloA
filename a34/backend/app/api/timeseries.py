from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List
from app.services.timeseries_service import TimeSeriesService
from app.models import (
    LightCurveData,
    LombScargleResult,
    PhaseFoldedData,
    VariableStarInfo
)

router = APIRouter()
timeseries_service = TimeSeriesService()


@router.get("/variable-types")
async def get_variable_types():
    """获取变星类型信息"""
    return await timeseries_service.get_variable_type_info()


@router.get("/catalog", response_model=List[VariableStarInfo])
async def get_variable_star_catalog(
    variable_type: Optional[str] = Query(None, description="变星类型筛选"),
    limit: int = Query(50, ge=1, le=500)
):
    """获取模拟变星星表"""
    return await timeseries_service.get_variable_star_catalog(variable_type, limit)


@router.get("/lightcurve", response_model=LightCurveData)
async def generate_light_curve(
    variable_type: str = Query("Cepheid", description="变星类型"),
    period: Optional[float] = Query(None, description="周期（天）"),
    amplitude: Optional[float] = Query(None, description="光变幅度（星等）"),
    median_magnitude: float = Query(12.0, description="中位视星等"),
    num_points: int = Query(500, ge=50, le=5000),
    time_span: float = Query(100.0, ge=10, le=1000),
    add_noise: bool = Query(True),
    add_gaps: bool = Query(True),
    error_level: float = Query(0.02, ge=0.001, le=0.5)
):
    """生成模拟光变曲线"""
    valid_types = ["Cepheid", "RR_Lyrae", "Mira", "Eclipsing", "Flare", "Irregular"]
    if variable_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"无效的变星类型，有效类型: {valid_types}")
    
    return await timeseries_service.generate_light_curve(
        variable_type=variable_type,
        period=period,
        amplitude=amplitude,
        median_magnitude=median_magnitude,
        num_points=num_points,
        time_span=time_span,
        add_noise=add_noise,
        add_gaps=add_gaps,
        error_level=error_level
    )


@router.post("/lomb-scargle", response_model=LombScargleResult)
async def compute_lomb_scargle(
    times: List[float],
    magnitudes: List[float],
    errors: Optional[List[float]] = None,
    min_period: float = Query(0.1, description="最小搜索周期（天）"),
    max_period: float = Query(100.0, description="最大搜索周期（天）"),
    oversampling: int = Query(5, ge=1, le=20),
    n_peaks: int = Query(5, ge=1, le=20)
):
    """计算Lomb-Scargle周期图"""
    if len(times) != len(magnitudes):
        raise HTTPException(status_code=400, detail="times 和 magnitudes 长度必须相同")
    
    if errors is not None and len(errors) != len(times):
        raise HTTPException(status_code=400, detail="errors 长度必须与 times 相同")
    
    if max_period <= min_period:
        raise HTTPException(status_code=400, detail="max_period 必须大于 min_period")
    
    return await timeseries_service.compute_lomb_scargle(
        times=times,
        magnitudes=magnitudes,
        errors=errors,
        min_period=min_period,
        max_period=max_period,
        oversampling=oversampling,
        n_peaks=n_peaks
    )


@router.post("/phase-fold", response_model=PhaseFoldedData)
async def phase_fold(
    times: List[float],
    magnitudes: List[float],
    period: float = Query(..., description="折叠周期（天）"),
    errors: Optional[List[float]] = None,
    normalize: bool = Query(True, description="是否归一化星等")
):
    """执行周期折叠"""
    if len(times) != len(magnitudes):
        raise HTTPException(status_code=400, detail="times 和 magnitudes 长度必须相同")
    
    if errors is not None and len(errors) != len(times):
        raise HTTPException(status_code=400, detail="errors 长度必须与 times 相同")
    
    if period <= 0:
        raise HTTPException(status_code=400, detail="period 必须为正数")
    
    return await timeseries_service.phase_fold(
        times=times,
        magnitudes=magnitudes,
        period=period,
        errors=errors,
        normalize=normalize
    )


@router.post("/lightcurve-from-request")
async def analyze_light_curve_from_data(data: dict):
    """从光变曲线数据执行完整分析（周期检测 + 折叠）"""
    times = data.get("times", [])
    magnitudes = data.get("magnitudes", [])
    errors = data.get("errors")
    
    if not times or not magnitudes:
        raise HTTPException(status_code=400, detail="必须提供 times 和 magnitudes 数据")
    
    ls_result = await timeseries_service.compute_lomb_scargle(
        times=times,
        magnitudes=magnitudes,
        errors=errors
    )
    
    phase_result = await timeseries_service.phase_fold(
        times=times,
        magnitudes=magnitudes,
        period=ls_result.best_period,
        errors=errors
    )
    
    return {
        "lomb_scargle": ls_result,
        "phase_folded": phase_result,
        "num_points": len(times),
        "time_baseline": max(times) - min(times)
    }
