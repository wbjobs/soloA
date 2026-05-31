export interface Star {
  source_id: string;
  ra: number;
  dec: number;
  l?: number;
  b?: number;
  parallax?: number;
  distance?: number;
  magnitude: number;
  bp_rp?: number;
  teff?: number;
  spectral_type?: string;
  x?: number;
  y?: number;
  z?: number;
  color_r: number;
  color_g: number;
  color_b: number;
}

export type CoordinateSystem = 'icrs' | 'galactic' | 'altaz';

export interface CoordinatePoint {
  lon: number;
  lat: number;
  distance?: number;
}

export interface CoordinateConversion {
  source: CoordinatePoint;
  source_system: CoordinateSystem;
  target: CoordinatePoint;
  target_system: CoordinateSystem;
  cartesian: { x: number; y: number; z: number };
}

export interface SpectrumData {
  wavelengths: number[];
  fluxes: number[];
  errors?: number[];
  wavelength_unit: string;
  flux_unit: string;
  redshift?: number;
  spectral_type?: string;
}

export interface LineIdentification {
  rest_wavelength: number;
  observed_wavelength: number;
  name: string;
  line_type: 'emission' | 'absorption';
  intensity: number;
  equivalent_width?: number;
}

export interface FITSMetadata {
  filename: string;
  naxis: number;
  naxis1?: number;
  naxis2?: number;
  naxis3?: number;
  bitpix: string;
  object_name?: string;
  ra?: number;
  dec?: number;
  date_obs?: string;
  instrument?: string;
  telescope?: string;
  exposure_time?: number;
  filter?: string;
  additional_headers: Record<string, string>;
}

export interface LightCurvePoint {
  time: number;
  magnitude: number;
  error?: number;
  band?: string;
}

export interface LightCurveData {
  source_id: string;
  name: string;
  variable_type: string;
  period?: number;
  amplitude: number;
  time_unit: string;
  magnitude_unit: string;
  points: LightCurvePoint[];
  median_magnitude: number;
}

export interface PeriodogramPeak {
  frequency: number;
  period: number;
  power: number;
  significance?: number;
}

export interface LombScargleResult {
  frequencies: number[];
  powers: number[];
  best_period: number;
  best_frequency: number;
  peaks: PeriodogramPeak[];
  false_alarm_probability?: number;
}

export interface PhaseFoldedData {
  phase: number[];
  magnitude: number[];
  error?: number[];
  period: number;
  phase_coverage: number;
}

export interface VariableStarInfo {
  source_id: string;
  name: string;
  variable_type: string;
  ra: number;
  dec: number;
  period?: number;
  amplitude: number;
  median_magnitude: number;
  distance?: number;
  spectral_type?: string;
}

export interface MultiBandLayer {
  id: string;
  name: string;
  band: string;
  wavelength_min?: number;
  wavelength_max?: number;
  colormap: string;
  opacity: number;
  visible: boolean;
  contrast: number;
  brightness: number;
}

export interface TelescopeParameters {
  aperture: number;
  focal_length?: number;
  f_ratio?: number;
  mirror_coating: string;
  central_obstruction: number;
}

export interface CameraParameters {
  pixel_size: number;
  read_noise: number;
  dark_current: number;
  gain: number;
  full_well: number;
  quantum_efficiency: number;
}

export interface AtmosphericConditions {
  seeing: number;
  transparency: number;
  airmass: number;
  moon_phase: number;
  sky_brightness?: number;
}

export interface ObservationResult {
  signal_electrons: number;
  sky_electrons: number;
  dark_electrons: number;
  read_noise_total: number;
  total_noise: number;
  snr: number;
  snr_per_exposure: number;
  limiting_magnitude: number;
  saturation_warning: boolean;
  pixel_scale: number;
  plate_scale: number;
  fwhm_pixels: number;
}

export type TabType = 'starmap' | 'spectrum' | 'fits' | 'timeseries' | 'observatory' | 'multiband';
