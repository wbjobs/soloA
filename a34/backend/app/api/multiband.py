from fastapi import APIRouter, Query, HTTPException
from typing import List, Optional
from app.services.multiband_service import MultiBandService
from app.models import MultiBandLayer, MultiBandCompositeRequest

router = APIRouter()
multiband_service = MultiBandService()


@router.get("/bands")
async def get_bands():
    """获取所有可用波段信息"""
    return await multiband_service.get_band_info()


@router.get("/colormaps")
async def get_colormaps():
    """获取可用的伪彩色映射"""
    return await multiband_service.get_colormap_presets()


@router.get("/default-layers")
async def get_default_layers():
    """获取默认的多波段图层配置"""
    return await multiband_service.get_default_layers()


@router.get("/generate-images")
async def generate_multiband_images(
    bands: Optional[str] = Query(None, description="波段列表，逗号分隔"),
    image_size: int = Query(256, ge=64, le=512),
    object_type: str = Query("galaxy", description="目标类型：galaxy, star_cluster, nebula")
):
    """
    生成多波段模拟图像
    
    支持的波段:
    - 光学: optical_U, optical_B, optical_g, optical_V, optical_R, optical_r, optical_I, optical_i, optical_z
    - 红外: infrared_J, infrared_H, infrared_K, infrared_L, infrared_M
    - 射电: radio_21cm, radio_1_4GHz, radio_5GHz
    
    目标类型:
    - galaxy: 星系（Sersic轮廓）
    - star_cluster: 星团（多个点源叠加）
    - nebula: 星云（不规则结构）
    """
    valid_object_types = ["galaxy", "star_cluster", "nebula"]
    if object_type not in valid_object_types:
        raise HTTPException(status_code=400, detail=f"无效的目标类型，有效选项: {valid_object_types}")
    
    if bands:
        band_list = [b.strip() for b in bands.split(",")]
    else:
        band_list = ["optical_g", "optical_r", "optical_i", "infrared_K"]
    
    return await multiband_service.generate_multiband_image(
        bands=band_list,
        image_size=(image_size, image_size),
        object_type=object_type
    )


@router.post("/composite")
async def create_composite(
    request: MultiBandCompositeRequest,
    image_size: int = Query(256, ge=64, le=512),
    object_type: str = Query("galaxy", description="目标类型：galaxy, star_cluster, nebula")
):
    """
    创建多波段合成图像
    
    每个图层可以配置:
    - id: 图层唯一标识
    - name: 显示名称
    - band: 波段类型
    - colormap: 伪彩色映射（gray, heat, inferno, plasma, viridis, blue, red, green）
    - opacity: 透明度（0-1）
    - visible: 是否可见
    - contrast: 对比度（0.1-3）
    - brightness: 亮度（-1到1）
    """
    valid_scale_methods = ["zscale", "percentile", "linear", "minmax"]
    if request.scale_method not in valid_scale_methods:
        raise HTTPException(status_code=400, detail=f"无效的缩放方法，有效选项: {valid_scale_methods}")
    
    valid_stretch_methods = ["linear", "log", "sqrt", "asinh"]
    if request.stretch_method not in valid_stretch_methods:
        raise HTTPException(status_code=400, detail=f"无效的拉伸方法，有效选项: {valid_stretch_methods}")
    
    valid_object_types = ["galaxy", "star_cluster", "nebula"]
    if object_type not in valid_object_types:
        raise HTTPException(status_code=400, detail=f"无效的目标类型，有效选项: {valid_object_types}")
    
    if not request.layers:
        raise HTTPException(status_code=400, detail="至少需要一个图层")
    
    return await multiband_service.create_composite(
        layers=request.layers,
        scale_method=request.scale_method,
        stretch_method=request.stretch_method,
        image_size=(image_size, image_size),
        object_type=object_type
    )


@router.get("/preset-composite")
async def get_preset_composite(
    preset: str = Query("galaxy", description="预设类型：galaxy, deep_field, star_cluster"),
    image_size: int = Query(256, ge=64, le=512)
):
    """获取预设的多波段合成图像"""
    default_layers = await multiband_service.get_default_layers()
    
    if preset == "deep_field":
        for layer in default_layers:
            if layer["band"].startswith("radio"):
                layer["opacity"] = 0.4
            elif layer["band"].startswith("infrared"):
                layer["opacity"] = 0.7
                layer["colormap"] = "inferno"
    elif preset == "star_cluster":
        default_layers = [
            {"id": "optical_u", "band": "optical_U", "name": "U", "colormap": "blue", "opacity": 0.6, "visible": True, "contrast": 1.0, "brightness": 0.0},
            {"id": "optical_b", "band": "optical_B", "name": "B", "colormap": "heat", "opacity": 0.7, "visible": True, "contrast": 1.0, "brightness": 0.0},
            {"id": "optical_v", "band": "optical_V", "name": "V", "colormap": "green", "opacity": 0.8, "visible": True, "contrast": 1.0, "brightness": 0.0},
        ]
    
    layers = [MultiBandLayer(**layer) for layer in default_layers]
    
    return await multiband_service.create_composite(
        layers=layers,
        scale_method="zscale",
        stretch_method="linear",
        image_size=(image_size, image_size)
    )
