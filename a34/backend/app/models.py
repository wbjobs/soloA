from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum


class CoordinateSystem(str, Enum):
    ICRS = "icrs"
    GALACTIC = "galactic"
    ALTAZ = "altaz"


class StarData(BaseModel):
    source_id: str
    ra: float = Field(description="赤经（度）")
    dec: float = Field(description="赤纬（度）")
    l: Optional[float] = Field(None, description="银经（度）")
    b: Optional[float] = Field(None, description="银纬（度）")
    parallax: Optional[float] = Field(None, description="视差（毫角秒）")
    distance: Optional[float] = Field(None, description="距离（秒差距）")
    magnitude: float = Field(description="视星等")
    bp_rp: Optional[float] = Field(None, description="BP-RP颜色指数")
    teff: Optional[float] = Field(None, description="有效温度（K）")
    spectral_type: Optional[str] = Field(None, description="光谱型")
    x: Optional[float] = Field(None, description="笛卡尔坐标X（归一化）")
    y: Optional[float] = Field(None, description="笛卡尔坐标Y（归一化）")
    z: Optional[float] = Field(None, description="笛卡尔坐标Z（归一化）")
    color_r: int = Field(255, description="颜色R分量")
    color_g: int = Field(255, description="颜色G分量")
    color_b: int = Field(255, description="颜色B分量")


class CatalogQueryResponse(BaseModel):
    count: int
    stars: List[StarData]
    filters: dict
    coordinate_system: str


class CoordinatePoint(BaseModel):
    lon: float = Field(description="经度/赤经/银经/方位角（度）")
    lat: float = Field(description="纬度/赤纬/银纬/高度角（度）")
    distance: Optional[float] = Field(1.0, description="距离（秒差距或归一化）")


class CoordinateConversionRequest(BaseModel):
    source: CoordinatePoint
    from_system: CoordinateSystem
    to_system: CoordinateSystem
    observer_lon: Optional[float] = Field(116.397, description="观测者经度（度，用于AltAz）")
    observer_lat: Optional[float] = Field(39.907, description="观测者纬度（度，用于AltAz）")
    observer_height: Optional[float] = Field(0.0, description="观测者高度（米，用于AltAz）")
    observation_time: Optional[str] = Field(None, description="观测时间ISO格式")


class CoordinateConversionResponse(BaseModel):
    source: CoordinatePoint
    source_system: str
    target: CoordinatePoint
    target_system: str
    cartesian: dict


class SpectrumData(BaseModel):
    wavelengths: List[float] = Field(description="波长序列（埃）")
    fluxes: List[float] = Field(description="流量序列")
    errors: Optional[List[float]] = Field(None, description="流量误差")
    wavelength_unit: str = Field("Angstrom", description="波长单位")
    flux_unit: str = Field("erg/s/cm^2/Angstrom", description="流量单位")
    redshift: Optional[float] = Field(None, description="已知红移值")
    spectral_type: Optional[str] = Field(None, description="光谱型")


class RedshiftMeasurement(BaseModel):
    redshift: float
    confidence: float
    method: str
    identified_lines: List[dict]


class LineIdentification(BaseModel):
    rest_wavelength: float
    observed_wavelength: float
    name: str
    line_type: str
    intensity: float
    equivalent_width: Optional[float]


class FITSMetadata(BaseModel):
    filename: str
    naxis: int
    naxis1: Optional[int]
    naxis2: Optional[int]
    naxis3: Optional[int]
    bitpix: str
    object_name: Optional[str]
    ra: Optional[float]
    dec: Optional[float]
    date_obs: Optional[str]
    instrument: Optional[str]
    telescope: Optional[str]
    exposure_time: Optional[float]
    filter: Optional[str]
    additional_headers: dict


class LightCurvePoint(BaseModel):
    time: float = Field(description="观测时间（儒略日或MJD）")
    magnitude: float = Field(description="视星等")
    error: Optional[float] = Field(None, description="星等误差")
    band: Optional[str] = Field(None, description="波段")


class LightCurveData(BaseModel):
    source_id: str
    name: str
    variable_type: str = Field(description="变星类型：Cepheid, RR_Lyrae, Mira, Eclipsing, Flare, Irregular")
    period: Optional[float] = Field(None, description="周期（天）")
    amplitude: float = Field(description="光变幅度（星等）")
    time_unit: str = Field("MJD", description="时间单位")
    magnitude_unit: str = Field("mag", description="星等单位")
    points: List[LightCurvePoint]
    median_magnitude: float


class PeriodogramPeak(BaseModel):
    frequency: float = Field(description="频率（1/天）")
    period: float = Field(description="周期（天）")
    power: float = Field(description="功率（Lomb-Scargle功率）")
    significance: Optional[float] = Field(None, description="显著性（FAP假阳性概率）")


class LombScargleResult(BaseModel):
    frequencies: List[float] = Field(description="频率序列")
    powers: List[float] = Field(description="功率序列")
    best_period: float = Field(description="最佳周期（天）")
    best_frequency: float = Field(description="最佳频率")
    peaks: List[PeriodogramPeak]
    false_alarm_probability: Optional[float]


class PhaseFoldedData(BaseModel):
    phase: List[float]
    magnitude: List[float]
    error: Optional[List[float]]
    period: float
    phase_coverage: float


class VariableStarInfo(BaseModel):
    source_id: str
    name: str
    variable_type: str
    ra: float
    dec: float
    period: Optional[float]
    amplitude: float
    median_magnitude: float
    distance: Optional[float]
    spectral_type: Optional[str]


class MultiBandLayer(BaseModel):
    id: str
    name: str
    band: str
    wavelength_min: float
    wavelength_max: float
    colormap: str
    opacity: float = Field(1.0, ge=0, le=1)
    visible: bool = True
    contrast: float = Field(1.0, ge=0.1, le=3)
    brightness: float = Field(0.0, ge=-1, le=1)


class MultiBandCompositeRequest(BaseModel):
    layers: List[MultiBandLayer]
    reference_band: str = "optical_g"
    scale_method: str = Field("zscale", description="zscale, percentile, linear")
    stretch_method: str = Field("linear", description="linear, log, sqrt, asinh")


class TelescopeParameters(BaseModel):
    aperture: float = Field(description="望远镜口径（米）")
    focal_length: Optional[float] = Field(None, description="焦距（米）")
    f_ratio: Optional[float] = Field(None, description="焦比 f/")
    mirror_coating: str = Field("aluminum", description="反射镜镀膜：aluminum, silver, enhanced_aluminum")
    central_obstruction: float = Field(0.0, description="中心遮挡比例")


class CameraParameters(BaseModel):
    pixel_size: float = Field(description="像元尺寸（微米）")
    read_noise: float = Field(description="读出噪声（e-）")
    dark_current: float = Field(0.01, description="暗电流（e-/pixel/s）")
    gain: float = Field(1.0, description="增益（e-/ADU）")
    full_well: float = Field(100000, description="满阱电荷（e-）")
    quantum_efficiency: float = Field(0.8, description="量子效率")


class AtmosphericConditions(BaseModel):
    seeing: float = Field(1.0, description="大气视宁度（角秒）")
    transparency: float = Field(0.8, description="大气透明度")
    airmass: float = Field(1.0, description="空气质量")
    moon_phase: float = Field(0.0, description="月相（0=新月，1=满月）")
    sky_brightness: Optional[float] = Field(None, description="天空背景亮度（mag/arcsec²）")


class ObservationRequest(BaseModel):
    telescope: TelescopeParameters
    camera: CameraParameters
    atmosphere: AtmosphericConditions
    filter_name: str = Field("V", description="滤光片：U, B, V, R, I, g, r, i, z")
    exposure_time: float = Field(description="曝光时间（秒）")
    binning: int = Field(1, description="像元合并：1, 2, 3, 4")
    target_magnitude: float = Field(description="目标天体视星等")
    num_exposures: int = Field(1, description="曝光次数")


class ObservationResult(BaseModel):
    signal_electrons: float
    sky_electrons: float
    dark_electrons: float
    read_noise_total: float
    total_noise: float
    snr: float
    snr_per_exposure: float
    limiting_magnitude: float = Field(description="极限星等（SNR=5）")
    saturation_warning: bool
    pixel_scale: float = Field(description="像元尺度（角秒/像素）")
    plate_scale: float = Field(description="底片比例尺（角秒/毫米）")
    fwhm_pixels: float = Field(description="FWHM（像素）")


class ExposureTimeRequest(BaseModel):
    telescope: TelescopeParameters
    camera: CameraParameters
    atmosphere: AtmosphericConditions
    filter_name: str = "V"
    target_magnitude: float
    target_snr: float = Field(10.0, description="目标信噪比")
    binning: int = 1
    max_exposure: float = Field(3600, description="最大单次曝光时间")
