from fastapi import APIRouter, Query, HTTPException
from app.services.observatory_service import ObservatoryService
from app.models import (
    ObservationRequest,
    ObservationResult,
    ExposureTimeRequest
)

router = APIRouter()
observatory_service = ObservatoryService()


@router.get("/telescope-presets")
async def get_telescope_presets():
    """获取望远镜预设参数"""
    return await observatory_service.get_telescope_presets()


@router.get("/camera-presets")
async def get_camera_presets():
    """获取相机预设参数"""
    return await observatory_service.get_camera_presets()


@router.get("/filter-info")
async def get_filter_info():
    """获取滤光片信息"""
    return await observatory_service.get_filter_info()


@router.post("/simulate", response_model=ObservationResult)
async def simulate_observation(request: ObservationRequest):
    """
    模拟观测，计算信噪比和极限星等
    
    根据CCD光度学方程:
    SNR = S / sqrt(S + S_sky + S_dark + N_read^2)
    """
    if request.telescope.aperture <= 0:
        raise HTTPException(status_code=400, detail="望远镜口径必须为正数")
    
    if request.camera.pixel_size <= 0:
        raise HTTPException(status_code=400, detail="像元尺寸必须为正数")
    
    if request.exposure_time <= 0:
        raise HTTPException(status_code=400, detail="曝光时间必须为正数")
    
    if request.num_exposures < 1:
        raise HTTPException(status_code=400, detail="曝光次数必须大于等于1")
    
    valid_filters = ["U", "B", "V", "R", "I", "g", "r", "i", "z"]
    if request.filter_name not in valid_filters:
        raise HTTPException(status_code=400, detail=f"无效的滤光片，有效选项: {valid_filters}")
    
    return await observatory_service.simulate_observation(request)


@router.post("/calculate-exposure")
async def calculate_exposure_time(request: ExposureTimeRequest):
    """
    计算达到目标SNR所需的曝光时间
    
    返回:
    - exposure_time_per_frame: 单帧曝光时间
    - total_exposure_time: 总曝光时间
    - expected_snr: 预期信噪比
    - recommendation: 曝光建议
    """
    if request.telescope.aperture <= 0:
        raise HTTPException(status_code=400, detail="望远镜口径必须为正数")
    
    if request.target_snr <= 0:
        raise HTTPException(status_code=400, detail="目标SNR必须为正数")
    
    valid_filters = ["U", "B", "V", "R", "I", "g", "r", "i", "z"]
    if request.filter_name not in valid_filters:
        raise HTTPException(status_code=400, detail=f"无效的滤光片，有效选项: {valid_filters}")
    
    return await observatory_service.calculate_exposure_time(request)


@router.get("/limiting-magnitude-curve")
async def get_limiting_magnitude_curve(
    aperture: float = Query(0.2, description="望远镜口径（米）"),
    filter_name: str = Query("V", description="滤光片"),
    seeing: float = Query(1.0, description="视宁度（角秒）"),
    moon_phase: float = Query(0.0, description="月相"),
    max_exposure: float = Query(3600, description="最大曝光时间（秒）")
):
    """
    获取极限星等随曝光时间的变化曲线
    用于可视化曝光时间对探测极限的影响
    """
    from app.models import TelescopeParameters, CameraParameters, AtmosphericConditions
    
    telescope = TelescopeParameters(
        aperture=aperture,
        f_ratio=8.0,
        mirror_coating="aluminum",
        central_obstruction=0.0
    )
    
    camera = CameraParameters(
        pixel_size=4.3,
        read_noise=3.0,
        dark_current=0.01,
        gain=1.0,
        full_well=50000,
        quantum_efficiency=0.75
    )
    
    atmosphere = AtmosphericConditions(
        seeing=seeing,
        transparency=0.8,
        airmass=1.0,
        moon_phase=moon_phase
    )
    
    exposure_times = [1, 5, 10, 30, 60, 120, 300, 600, 900, 1200, 1800, 2400, 3000, 3600]
    exposure_times = [t for t in exposure_times if t <= max_exposure]
    
    results = []
    for exp_time in exposure_times:
        request = ObservationRequest(
            telescope=telescope,
            camera=camera,
            atmosphere=atmosphere,
            filter_name=filter_name,
            exposure_time=exp_time,
            binning=1,
            target_magnitude=20.0,
            num_exposures=1
        )
        
        result = await observatory_service.simulate_observation(request)
        results.append({
            "exposure_time": exp_time,
            "limiting_magnitude": result.limiting_magnitude,
            "snr_for_20mag": result.snr
        })
    
    return {
        "telescope": f"{aperture * 100:.0f}cm f/{telescope.f_ratio}",
        "filter": filter_name,
        "seeing": f"{seeing}\"",
        "moon_phase": f"{moon_phase * 100:.0f}%",
        "curve": results
    }
