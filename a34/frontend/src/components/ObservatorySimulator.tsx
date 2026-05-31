import { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Telescope, Camera, Cloud, Target, Play, TrendingUp } from 'lucide-react';
import type { 
  TelescopeParameters, 
  CameraParameters, 
  AtmosphericConditions, 
  ObservationResult 
} from '../types';

const TELESCOPE_PRESETS = [
  { id: 'small_refractor', name: '小型折射镜 (10cm)', aperture: 0.1, f_ratio: 10 },
  { id: 'newtonian_8inch', name: '牛顿反射镜 (20cm)', aperture: 0.203, f_ratio: 5 },
  { id: 'schmidt_12inch', name: '施密特卡塞格林 (30cm)', aperture: 0.305, f_ratio: 10 },
  { id: 'rc_16inch', name: 'RC望远镜 (40cm)', aperture: 0.406, f_ratio: 8 },
  { id: 'professional_1m', name: '专业望远镜 (1m)', aperture: 1.0, f_ratio: 8 },
  { id: 'professional_2m', name: '专业望远镜 (2m)', aperture: 2.0, f_ratio: 8 },
  { id: 'professional_4m', name: '专业望远镜 (4m)', aperture: 4.0, f_ratio: 8 },
  { id: 'Keck', name: 'Keck 10m', aperture: 10.0, f_ratio: 15 },
];

const CAMERA_PRESETS = [
  { id: 'basic_DSLR', name: '基础单反相机', pixel_size: 4.3, read_noise: 5.0, dark_current: 0.05, gain: 1.0, full_well: 50000, quantum_efficiency: 0.65 },
  { id: 'astrophotography_DSLR', name: '天文改机', pixel_size: 4.3, read_noise: 3.0, dark_current: 0.02, gain: 1.0, full_well: 60000, quantum_efficiency: 0.75 },
  { id: 'ZWO_ASI183', name: 'ZWO ASI183', pixel_size: 2.4, read_noise: 2.4, dark_current: 0.005, gain: 0.85, full_well: 12000, quantum_efficiency: 0.84 },
  { id: 'ZWO_ASI2600', name: 'ZWO ASI2600', pixel_size: 3.76, read_noise: 1.2, dark_current: 0.003, gain: 0.75, full_well: 45000, quantum_efficiency: 0.91 },
  { id: 'professional_CCD', name: '专业级CCD', pixel_size: 15.0, read_noise: 8.0, dark_current: 0.001, gain: 2.5, full_well: 150000, quantum_efficiency: 0.90 },
];

const FILTERS = ['U', 'B', 'V', 'R', 'I', 'g', 'r', 'i', 'z'];

const MIRROR_COATINGS = [
  { value: 'aluminum', label: '铝镀膜 (85%)' },
  { value: 'enhanced_aluminum', label: '增强铝 (92%)' },
  { value: 'silver', label: '银镀膜 (95%)' },
];

export default function ObservatorySimulator() {
  const [telescopePreset, setTelescopePreset] = useState('newtonian_8inch');
  const [cameraPreset, setCameraPreset] = useState('ZWO_ASI2600');
  
  const [telescope, setTelescope] = useState<TelescopeParameters>({
    aperture: 0.203,
    f_ratio: 5,
    mirror_coating: 'aluminum',
    central_obstruction: 0.0
  });
  
  const [camera, setCamera] = useState<CameraParameters>({
    pixel_size: 3.76,
    read_noise: 1.2,
    dark_current: 0.003,
    gain: 0.75,
    full_well: 45000,
    quantum_efficiency: 0.91
  });
  
  const [atmosphere, setAtmosphere] = useState<AtmosphericConditions>({
    seeing: 1.0,
    transparency: 0.8,
    airmass: 1.0,
    moon_phase: 0.0
  });
  
  const [filterName, setFilterName] = useState('V');
  const [exposureTime, setExposureTime] = useState(300);
  const [binning, setBinning] = useState(1);
  const [targetMagnitude, setTargetMagnitude] = useState(18);
  const [numExposures, setNumExposures] = useState(10);
  
  const [result, setResult] = useState<ObservationResult | null>(null);
  const [limitingCurve, setLimitingCurve] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const curveChartRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const preset = TELESCOPE_PRESETS.find(p => p.id === telescopePreset);
    if (preset) {
      setTelescope(prev => ({
        ...prev,
        aperture: preset.aperture,
        f_ratio: preset.f_ratio
      }));
    }
  }, [telescopePreset]);

  useEffect(() => {
    const preset = CAMERA_PRESETS.find(p => p.id === cameraPreset);
    if (preset) {
      setCamera({
        pixel_size: preset.pixel_size,
        read_noise: preset.read_noise,
        dark_current: preset.dark_current,
        gain: preset.gain,
        full_well: preset.full_well,
        quantum_efficiency: preset.quantum_efficiency
      });
    }
  }, [cameraPreset]);

  const simulateObservation = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/observatory/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telescope,
          camera,
          atmosphere,
          filter_name: filterName,
          exposure_time: exposureTime,
          binning,
          target_magnitude: targetMagnitude,
          num_exposures: numExposures
        })
      });
      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Simulation failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLimitingCurve = async () => {
    try {
      const params = new URLSearchParams({
        aperture: telescope.aperture.toString(),
        filter_name: filterName,
        seeing: atmosphere.seeing.toString(),
        moon_phase: atmosphere.moon_phase.toString()
      });
      const response = await fetch(`/api/observatory/limiting-magnitude-curve?${params.toString()}`);
      const data = await response.json();
      setLimitingCurve(data);
    } catch (error) {
      console.error('Failed to fetch limiting curve:', error);
    }
  };

  useEffect(() => {
    fetchLimitingCurve();
  }, [telescope.aperture, filterName, atmosphere.seeing, atmosphere.moon_phase]);

  useEffect(() => {
    if (limitingCurve && curveChartRef.current) {
      renderLimitingCurve();
    }
  }, [limitingCurve]);

  const renderLimitingCurve = () => {
    if (!limitingCurve || !curveChartRef.current) return;
    
    const svg = d3.select(curveChartRef.current);
    svg.selectAll('*').remove();
    
    const margin = { top: 30, right: 30, bottom: 50, left: 60 };
    const width = 600 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;
    
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    
    const curve = limitingCurve.curve;
    
    const x = d3.scaleLog()
      .domain(d3.extent(curve, (d: any) => d.exposure_time) as [number, number])
      .range([0, width]);
    
    const y = d3.scaleLinear()
      .domain([
        Math.floor(d3.min(curve, (d: any) => d.limiting_magnitude) as number),
        Math.ceil(d3.max(curve, (d: any) => d.limiting_magnitude) as number)
      ])
      .range([height, 0]);
    
    g.append('g').attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x)
        .tickValues([1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600])
        .tickFormat((d: any) => {
          if (d < 60) return `${d}s`;
          if (d < 3600) return `${d/60}m`;
          return `${d/3600}h`;
        })
      )
      .selectAll('text').style('fill', '#9ca3af').style('font-size', '10px');
    
    g.append('g')
      .call(d3.axisLeft(y).ticks(8))
      .selectAll('text').style('fill', '#9ca3af').style('font-size', '10px');
    
    const line = d3.line<any>()
      .x(d => x(d.exposure_time))
      .y(d => y(d.limiting_magnitude))
      .curve(d3.curveMonotoneX);
    
    g.append('path')
      .datum(curve)
      .attr('fill', 'none')
      .attr('stroke', '#f97316')
      .attr('stroke-width', 2)
      .attr('d', line);
    
    g.append('text')
      .attr('transform', `translate(${width/2},${height + 40})`)
      .attr('text-anchor', 'middle')
      .style('fill', '#d1d5db')
      .style('font-size', '11px')
      .text('曝光时间');
    
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -margin.left + 15)
      .attr('x', -height/2)
      .attr('text-anchor', 'middle')
      .style('fill', '#d1d5db')
      .style('font-size', '11px')
      .text('极限星等 (SNR=5)');
    
    g.append('text')
      .attr('x', width / 2)
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .style('fill', '#9ca3af')
      .style('font-size', '11px')
      .text(`${limitingCurve.telescope} | ${limitingCurve.filter}波段 | 视宁${limitingCurve.seeing} | 月相${limitingCurve.moon_phase}`);
  };

  return (
    <div className="h-full flex bg-space-950">
      <div className="w-96 border-r border-space-700 p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Telescope size={20} className="text-orange-400" />
          观测模拟器
        </h2>
        
        <div className="space-y-4">
          <Section title="望远镜参数" icon={<Telescope size={14} />}>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">望远镜预设</label>
                <select
                  value={telescopePreset}
                  onChange={(e) => setTelescopePreset(e.target.value)}
                  className="w-full bg-space-700 border border-space-600 rounded px-3 py-2 text-white text-sm"
                >
                  {TELESCOPE_PRESETS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">口径 (m)</label>
                  <input
                    type="number"
                    value={telescope.aperture}
                    onChange={(e) => setTelescope({...telescope, aperture: Number(e.target.value)})}
                    step="0.01"
                    min="0.05"
                    className="w-full bg-space-700 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">焦比 f/</label>
                  <input
                    type="number"
                    value={telescope.f_ratio ?? ''}
                    onChange={(e) => setTelescope({...telescope, f_ratio: Number(e.target.value)})}
                    step="0.1"
                    min="1"
                    className="w-full bg-space-700 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">镀膜</label>
                <select
                  value={telescope.mirror_coating}
                  onChange={(e) => setTelescope({...telescope, mirror_coating: e.target.value})}
                  className="w-full bg-space-700 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                >
                  {MIRROR_COATINGS.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </Section>
          
          <Section title="相机参数" icon={<Camera size={14} />}>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">相机预设</label>
                <select
                  value={cameraPreset}
                  onChange={(e) => setCameraPreset(e.target.value)}
                  className="w-full bg-space-700 border border-space-600 rounded px-3 py-2 text-white text-sm"
                >
                  {CAMERA_PRESETS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">像元 (μm)</label>
                  <input
                    type="number"
                    value={camera.pixel_size}
                    onChange={(e) => setCamera({...camera, pixel_size: Number(e.target.value)})}
                    step="0.1"
                    className="w-full bg-space-700 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">读出噪声 (e-)</label>
                  <input
                    type="number"
                    value={camera.read_noise}
                    onChange={(e) => setCamera({...camera, read_noise: Number(e.target.value)})}
                    step="0.1"
                    className="w-full bg-space-700 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">暗电流 (e-/s)</label>
                  <input
                    type="number"
                    value={camera.dark_current}
                    onChange={(e) => setCamera({...camera, dark_current: Number(e.target.value)})}
                    step="0.001"
                    className="w-full bg-space-700 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">QE</label>
                  <input
                    type="number"
                    value={camera.quantum_efficiency}
                    onChange={(e) => setCamera({...camera, quantum_efficiency: Number(e.target.value)})}
                    step="0.01"
                    min="0"
                    max="1"
                    className="w-full bg-space-700 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                  />
                </div>
              </div>
            </div>
          </Section>
          
          <Section title="大气条件" icon={<Cloud size={14} />}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">视宁 (")</label>
                  <input
                    type="number"
                    value={atmosphere.seeing}
                    onChange={(e) => setAtmosphere({...atmosphere, seeing: Number(e.target.value)})}
                    step="0.1"
                    min="0.3"
                    max="5"
                    className="w-full bg-space-700 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">透明度</label>
                  <input
                    type="number"
                    value={atmosphere.transparency}
                    onChange={(e) => setAtmosphere({...atmosphere, transparency: Number(e.target.value)})}
                    step="0.05"
                    min="0"
                    max="1"
                    className="w-full bg-space-700 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">空气质量</label>
                  <input
                    type="number"
                    value={atmosphere.airmass}
                    onChange={(e) => setAtmosphere({...atmosphere, airmass: Number(e.target.value)})}
                    step="0.1"
                    min="1"
                    max="5"
                    className="w-full bg-space-700 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">月相</label>
                  <input
                    type="number"
                    value={atmosphere.moon_phase}
                    onChange={(e) => setAtmosphere({...atmosphere, moon_phase: Number(e.target.value)})}
                    step="0.05"
                    min="0"
                    max="1"
                    className="w-full bg-space-700 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                  />
                </div>
              </div>
            </div>
          </Section>
          
          <Section title="观测设置" icon={<Target size={14} />}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">滤光片</label>
                  <select
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    className="w-full bg-space-700 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                  >
                    {FILTERS.map(f => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">像元合并</label>
                  <select
                    value={binning}
                    onChange={(e) => setBinning(Number(e.target.value))}
                    className="w-full bg-space-700 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                  >
                    <option value={1}>1x1</option>
                    <option value={2}>2x2</option>
                    <option value={3}>3x3</option>
                    <option value={4}>4x4</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">单帧曝光 (s)</label>
                  <input
                    type="number"
                    value={exposureTime}
                    onChange={(e) => setExposureTime(Number(e.target.value))}
                    step="1"
                    min="1"
                    className="w-full bg-space-700 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">曝光次数</label>
                  <input
                    type="number"
                    value={numExposures}
                    onChange={(e) => setNumExposures(Number(e.target.value))}
                    step="1"
                    min="1"
                    className="w-full bg-space-700 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">目标天体星等</label>
                <input
                  type="number"
                  value={targetMagnitude}
                  onChange={(e) => setTargetMagnitude(Number(e.target.value))}
                  step="0.5"
                  className="w-full bg-space-700 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                />
              </div>
              <button
                onClick={simulateObservation}
                disabled={isLoading}
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-orange-800 text-white py-2 px-4 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Play size={14} className={isLoading ? 'animate-spin' : ''} />
                {isLoading ? '模拟中...' : '运行模拟'}
              </button>
            </div>
          </Section>
        </div>
      </div>
      
      <div className="flex-1 p-4 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          {result && (
            <div className="bg-space-800 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp size={18} className="text-green-400" />
                模拟结果
              </h3>
              
              {result.saturation_warning && (
                <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded text-yellow-300 text-sm">
                  ⚠️ 警告：信号接近或超过满阱电荷，可能发生饱和
                </div>
              )}
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <ResultCard label="总信噪比" value={result.snr.toFixed(1)} unit="" highlight="green" />
                <ResultCard label="单帧SNR" value={result.snr_per_exposure.toFixed(1)} unit="" />
                <ResultCard label="极限星等" value={result.limiting_magnitude.toFixed(2)} unit="mag" highlight="orange" />
                <ResultCard label="像元尺度" value={result.pixel_scale.toFixed(3)} unit='"/pix' />
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <ResultSmall label="信号电子" value={result.signal_electrons.toFixed(0)} unit="e-" />
                <ResultSmall label="天空背景" value={result.sky_electrons.toFixed(0)} unit="e-" />
                <ResultSmall label="暗电流" value={result.dark_electrons.toFixed(1)} unit="e-" />
                <ResultSmall label="读出噪声" value={result.read_noise_total.toFixed(1)} unit="e-" />
                <ResultSmall label="总噪声" value={result.total_noise.toFixed(1)} unit="e-" />
              </div>
              
              <div className="mt-4 pt-4 border-t border-space-700 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">底片比例尺</span>
                  <p className="text-white font-mono">{result.plate_scale.toFixed(2)} "/mm</p>
                </div>
                <div>
                  <span className="text-gray-500">FWHM</span>
                  <p className="text-white font-mono">{result.fwhm_pixels.toFixed(2)} pix</p>
                </div>
                <div>
                  <span className="text-gray-500">总曝光时间</span>
                  <p className="text-white font-mono">{(exposureTime * numExposures / 60).toFixed(1)} 分钟</p>
                </div>
              </div>
            </div>
          )}
          
          <div className="bg-space-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-4">极限星等曲线</h3>
            <div className="flex justify-center">
              <svg ref={curveChartRef} width={600} height={300} className="bg-space-900 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: any; children: any }) {
  return (
    <div className="bg-space-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

function ResultCard({ label, value, unit, highlight }: { label: string; value: string; unit: string; highlight?: string }) {
  return (
    <div className="bg-space-900 rounded-lg p-3 text-center">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold font-mono ${
        highlight === 'green' ? 'text-green-400' : 
        highlight === 'orange' ? 'text-orange-400' : 'text-white'
      }`}>
        {value}
        <span className="text-sm text-gray-400 ml-1">{unit}</span>
      </p>
    </div>
  );
}

function ResultSmall({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-white font-mono text-sm">{value}<span className="text-gray-500 ml-1">{unit}</span></p>
    </div>
  );
}
