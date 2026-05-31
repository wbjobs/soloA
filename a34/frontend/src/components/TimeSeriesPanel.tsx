import { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Activity, BarChart3, Clock, TrendingUp, RefreshCw } from 'lucide-react';
import type { LightCurveData, LombScargleResult, PhaseFoldedData } from '../types';

const VARIABLE_TYPES = [
  { value: 'Cepheid', label: '造父变星 (Cepheid)' },
  { value: 'RR_Lyrae', label: '天琴座RR (RR Lyrae)' },
  { value: 'Mira', label: '蒭藁增二 (Mira)' },
  { value: 'Eclipsing', label: '食双星 (Eclipsing Binary)' },
  { value: 'Flare', label: '耀星 (Flare Star)' },
  { value: 'Irregular', label: '不规则变星 (Irregular)' }
];

export default function TimeSeriesPanel() {
  const [variableType, setVariableType] = useState('Cepheid');
  const [period, setPeriod] = useState<number | null>(null);
  const [amplitude, setAmplitude] = useState<number | null>(null);
  const [medianMag, setMedianMag] = useState(12);
  const [numPoints, setNumPoints] = useState(500);
  const [timeSpan, setTimeSpan] = useState(100);
  
  const [lightCurve, setLightCurve] = useState<LightCurveData | null>(null);
  const [lombScargle, setLombScargle] = useState<LombScargleResult | null>(null);
  const [phaseFolded, setPhaseFolded] = useState<PhaseFoldedData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'lightcurve' | 'periodogram' | 'phasefold'>('lightcurve');
  
  const lcChartRef = useRef<SVGSVGElement>(null);
  const pgChartRef = useRef<SVGSVGElement>(null);
  const pfChartRef = useRef<SVGSVGElement>(null);

  const generateLightCurve = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        variable_type: variableType,
        median_magnitude: medianMag.toString(),
        num_points: numPoints.toString(),
        time_span: timeSpan.toString(),
        add_noise: 'true',
        add_gaps: 'true'
      });
      if (period) params.append('period', period.toString());
      if (amplitude) params.append('amplitude', amplitude.toString());
      
      const response = await fetch(`/api/timeseries/lightcurve?${params.toString()}`);
      const data = await response.json();
      setLightCurve(data);
      
      await analyzePeriod(data);
    } catch (error) {
      console.error('Failed to generate light curve:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const analyzePeriod = async (data: LightCurveData) => {
    try {
      const times = data.points.map((p: any) => p.time);
      const magnitudes = data.points.map((p: any) => p.magnitude);
      const errors = data.points.map((p: any) => p.error).filter((e: any) => e !== undefined);
      
      const lsResponse = await fetch('/api/timeseries/lomb-scargle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          times,
          magnitudes,
          errors: errors.length === times.length ? errors : null,
          min_period: 0.1,
          max_period: Math.min(timeSpan / 2, 100),
          oversampling: 5,
          n_peaks: 5
        })
      });
      const lsData = await lsResponse.json();
      setLombScargle(lsData);
      
      const pfResponse = await fetch('/api/timeseries/phase-fold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          times,
          magnitudes,
          period: lsData.best_period,
          normalize: true
        })
      });
      const pfData = await pfResponse.json();
      setPhaseFolded(pfData);
    } catch (error) {
      console.error('Failed to analyze period:', error);
    }
  };

  useEffect(() => {
    if (lightCurve && activeTab === 'lightcurve' && lcChartRef.current) {
      renderLightCurveChart();
    }
  }, [lightCurve, activeTab]);

  useEffect(() => {
    if (lombScargle && activeTab === 'periodogram' && pgChartRef.current) {
      renderPeriodogramChart();
    }
  }, [lombScargle, activeTab]);

  useEffect(() => {
    if (phaseFolded && activeTab === 'phasefold' && pfChartRef.current) {
      renderPhaseFoldedChart();
    }
  }, [phaseFolded, activeTab]);

  useEffect(() => {
    generateLightCurve();
  }, []);

  const renderLightCurveChart = () => {
    if (!lightCurve || !lcChartRef.current) return;
    
    const svg = d3.select(lcChartRef.current);
    svg.selectAll('*').remove();
    
    const margin = { top: 20, right: 30, bottom: 50, left: 60 };
    const width = 900 - margin.left - margin.right;
    const height = 350 - margin.top - margin.bottom;
    
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    
    const times = lightCurve.points.map(p => p.time);
    const magnitudes = lightCurve.points.map(p => p.magnitude);
    const errors = lightCurve.points.map(p => p.error || 0);
    
    const x = d3.scaleLinear().domain(d3.extent(times) as [number, number]).range([0, width]);
    const y = d3.scaleLinear()
      .domain([d3.max(magnitudes)! + 0.5, d3.min(magnitudes)! - 0.5])
      .range([height, 0]);
    
    g.append('g').attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(10))
      .selectAll('text').style('fill', '#9ca3af').style('font-size', '11px');
    
    g.append('g')
      .call(d3.axisLeft(y).ticks(8))
      .selectAll('text').style('fill', '#9ca3af').style('font-size', '11px');
    
    g.append('g').attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(10).tickSize(-height).tickFormat('' as any))
      .selectAll('line').style('stroke', 'rgba(255,255,255,0.08)');
    
    g.append('g')
      .call(d3.axisLeft(y).ticks(8).tickSize(-width).tickFormat('' as any))
      .selectAll('line').style('stroke', 'rgba(255,255,255,0.08)');
    
    g.selectAll('.error-bar')
      .data(lightCurve.points)
      .enter()
      .append('line')
      .attr('x1', d => x(d.time))
      .attr('x2', d => x(d.time))
      .attr('y1', d => y(d.magnitude + (d.error || 0)))
      .attr('y2', d => y(d.magnitude - (d.error || 0)))
      .attr('stroke', 'rgba(148, 163, 184, 0.5)')
      .attr('stroke-width', 1);
    
    g.selectAll('.point')
      .data(lightCurve.points)
      .enter()
      .append('circle')
      .attr('cx', d => x(d.time))
      .attr('cy', d => y(d.magnitude))
      .attr('r', 3)
      .attr('fill', '#60a5fa')
      .attr('opacity', 0.7);
    
    g.append('text')
      .attr('transform', `translate(${width/2},${height + 40})`)
      .attr('text-anchor', 'middle')
      .style('fill', '#d1d5db')
      .style('font-size', '12px')
      .text('时间 (天)');
    
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -margin.left + 15)
      .attr('x', -height/2)
      .attr('text-anchor', 'middle')
      .style('fill', '#d1d5db')
      .style('font-size', '12px')
      .text('视星等');
  };

  const renderPeriodogramChart = () => {
    if (!lombScargle || !pgChartRef.current) return;
    
    const svg = d3.select(pgChartRef.current);
    svg.selectAll('*').remove();
    
    const margin = { top: 20, right: 30, bottom: 50, left: 60 };
    const width = 900 - margin.left - margin.right;
    const height = 350 - margin.top - margin.bottom;
    
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    
    const x = d3.scaleLinear().domain(d3.extent(lombScargle.frequencies) as [number, number]).range([0, width]);
    const y = d3.scaleLinear().domain([0, d3.max(lombScargle.powers)! * 1.1]).range([height, 0]);
    
    g.append('g').attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(10))
      .selectAll('text').style('fill', '#9ca3af').style('font-size', '11px');
    
    g.append('g')
      .call(d3.axisLeft(y).ticks(8))
      .selectAll('text').style('fill', '#9ca3af').style('font-size', '11px');
    
    const line = d3.line<number>()
      .x((d, i) => x(lombScargle.frequencies[i]))
      .y(d => y(d))
      .curve(d3.curveMonotoneX);
    
    g.append('path')
      .datum(lombScargle.powers)
      .attr('fill', 'none')
      .attr('stroke', '#a78bfa')
      .attr('stroke-width', 1.5)
      .attr('d', line);
    
    lombScargle.peaks.forEach((peak, i) => {
      g.append('line')
        .attr('x1', x(peak.frequency))
        .attr('y1', 0)
        .attr('x2', x(peak.frequency))
        .attr('y2', height)
        .attr('stroke', i === 0 ? '#fbbf24' : 'rgba(251, 191, 36, 0.4)')
        .attr('stroke-width', i === 0 ? 2 : 1)
        .attr('stroke-dasharray', '4,4');
    });
    
    g.append('text')
      .attr('transform', `translate(${width/2},${height + 40})`)
      .attr('text-anchor', 'middle')
      .style('fill', '#d1d5db')
      .style('font-size', '12px')
      .text('频率 (1/天)');
    
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -margin.left + 15)
      .attr('x', -height/2)
      .attr('text-anchor', 'middle')
      .style('fill', '#d1d5db')
      .style('font-size', '12px')
      .text('Lomb-Scargle 功率');
    
    if (lombScargle.peaks.length > 0) {
      g.append('text')
        .attr('x', width - 10)
        .attr('y', 20)
        .attr('text-anchor', 'end')
        .style('fill', '#fbbf24')
        .style('font-size', '12px')
        .style('font-weight', 'bold')
        .text(`最佳周期: ${lombScargle.best_period.toFixed(3)} 天`);
    }
  };

  const renderPhaseFoldedChart = () => {
    if (!phaseFolded || !pfChartRef.current) return;
    
    const svg = d3.select(pfChartRef.current);
    svg.selectAll('*').remove();
    
    const margin = { top: 20, right: 30, bottom: 50, left: 60 };
    const width = 900 - margin.left - margin.right;
    const height = 350 - margin.top - margin.bottom;
    
    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    
    const x = d3.scaleLinear().domain([0, 2]).range([0, width]);
    const y = d3.scaleLinear()
      .domain([d3.max(phaseFolded.magnitude)! + 0.2, d3.min(phaseFolded.magnitude)! - 0.2])
      .range([height, 0]);
    
    g.append('g').attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(10).tickFormat((d: any) => d.toFixed(1)))
      .selectAll('text').style('fill', '#9ca3af').style('font-size', '11px');
    
    g.append('g')
      .call(d3.axisLeft(y).ticks(8))
      .selectAll('text').style('fill', '#9ca3af').style('font-size', '11px');
    
    const sortedData = phaseFolded.phase.map((phase, i) => ({
      phase,
      magnitude: phaseFolded.magnitude[i]
    })).sort((a, b) => a.phase - b.phase);
    
    g.selectAll('.point')
      .data(sortedData)
      .enter()
      .append('circle')
      .attr('cx', d => x(d.phase))
      .attr('cy', d => y(d.magnitude))
      .attr('r', 3)
      .attr('fill', '#34d399')
      .attr('opacity', 0.7);
    
    const windowSize = 5;
    const smoothed = sortedData.map((d, i, arr) => {
      const start = Math.max(0, i - windowSize);
      const end = Math.min(arr.length, i + windowSize + 1);
      const subset = arr.slice(start, end);
      return {
        phase: d.phase,
        magnitude: d3.mean(subset, s => s.magnitude)!
      };
    });
    
    const line = d3.line<typeof smoothed[0]>()
      .x(d => x(d.phase))
      .y(d => y(d.magnitude))
      .curve(d3.curveBasis);
    
    g.append('path')
      .datum(smoothed)
      .attr('fill', 'none')
      .attr('stroke', '#10b981')
      .attr('stroke-width', 2)
      .attr('d', line);
    
    g.append('line')
      .attr('x1', x(1))
      .attr('y1', 0)
      .attr('x2', x(1))
      .attr('y2', height)
      .attr('stroke', 'rgba(255,255,255,0.3)')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,4');
    
    g.append('text')
      .attr('transform', `translate(${width/2},${height + 40})`)
      .attr('text-anchor', 'middle')
      .style('fill', '#d1d5db')
      .style('font-size', '12px')
      .text('相位');
    
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -margin.left + 15)
      .attr('x', -height/2)
      .attr('text-anchor', 'middle')
      .style('fill', '#d1d5db')
      .style('font-size', '12px')
      .text('相对星等');
    
    g.append('text')
      .attr('x', width - 10)
      .attr('y', 20)
      .attr('text-anchor', 'end')
      .style('fill', '#34d399')
      .style('font-size', '12px')
      .style('font-weight', 'bold')
      .text(`周期: ${phaseFolded.period.toFixed(4)} 天`);
  };

  return (
    <div className="h-full flex bg-space-950">
      <div className="w-80 border-r border-space-700 p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Activity size={20} className="text-amber-400" />
          时域天文分析
        </h2>
        
        <div className="space-y-4">
          <div className="bg-space-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
              <TrendingUp size={14} />
              参数设置
            </h3>
            
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">变星类型</label>
                <select
                  value={variableType}
                  onChange={(e) => setVariableType(e.target.value)}
                  className="w-full bg-space-700 border border-space-600 rounded px-3 py-2 text-white text-sm"
                >
                  {VARIABLE_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  周期（天，留空自动生成）
                </label>
                <input
                  type="number"
                  value={period ?? ''}
                  onChange={(e) => setPeriod(e.target.value ? Number(e.target.value) : null)}
                  step="0.1"
                  min="0.1"
                  placeholder="自动"
                  className="w-full bg-space-700 border border-space-600 rounded px-3 py-2 text-white text-sm"
                />
              </div>
              
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  光变幅度（星等，留空自动生成）
                </label>
                <input
                  type="number"
                  value={amplitude ?? ''}
                  onChange={(e) => setAmplitude(e.target.value ? Number(e.target.value) : null)}
                  step="0.1"
                  min="0.1"
                  placeholder="自动"
                  className="w-full bg-space-700 border border-space-600 rounded px-3 py-2 text-white text-sm"
                />
              </div>
              
              <div>
                <label className="text-xs text-gray-500 block mb-1">中位视星等</label>
                <input
                  type="number"
                  value={medianMag}
                  onChange={(e) => setMedianMag(Number(e.target.value))}
                  step="0.5"
                  className="w-full bg-space-700 border border-space-600 rounded px-3 py-2 text-white text-sm"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">数据点数</label>
                  <input
                    type="number"
                    value={numPoints}
                    onChange={(e) => setNumPoints(Number(e.target.value))}
                    min="50"
                    max="5000"
                    className="w-full bg-space-700 border border-space-600 rounded px-3 py-2 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">时间跨度（天）</label>
                  <input
                    type="number"
                    value={timeSpan}
                    onChange={(e) => setTimeSpan(Number(e.target.value))}
                    min="10"
                    max="1000"
                    className="w-full bg-space-700 border border-space-600 rounded px-3 py-2 text-white text-sm"
                  />
                </div>
              </div>
              
              <button
                onClick={generateLightCurve}
                disabled={isLoading}
                className="w-full bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800 text-white py-2 px-4 rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                {isLoading ? '生成中...' : '生成光变曲线'}
              </button>
            </div>
          </div>
          
          {lightCurve && (
            <div className="bg-space-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3">光变曲线信息</h3>
              <div className="space-y-2 text-sm">
                <InfoRow label="变星类型" value={lightCurve.variable_type} />
                <InfoRow 
                  label="周期" 
                  value={lightCurve.period ? `${lightCurve.period.toFixed(3)} 天` : '-'} 
                />
                <InfoRow 
                  label="幅度" 
                  value={`${lightCurve.amplitude.toFixed(2)} 星等`} 
                />
                <InfoRow 
                  label="中位星等" 
                  value={lightCurve.median_magnitude.toFixed(2)} 
                />
                <InfoRow 
                  label="数据点数" 
                  value={lightCurve.points.length.toString()} 
                />
              </div>
            </div>
          )}
          
          {lombScargle && lombScargle.peaks.length > 0 && (
            <div className="bg-space-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3">周期检测结果</h3>
              <div className="space-y-2 text-sm">
                {lombScargle.peaks.slice(0, 3).map((peak, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-gray-500">#{i + 1} 周期</span>
                    <span className={`font-mono ${i === 0 ? 'text-amber-400' : 'text-gray-300'}`}>
                      {peak.period.toFixed(4)} 天
                    </span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-space-700">
                  <span className="text-gray-500">FAP</span>
                  <span className="font-mono text-gray-300">
                    {lombScargle.false_alarm_probability?.toFixed(4) || '-'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex-1 flex flex-col">
        <div className="border-b border-space-700 p-2 flex gap-1">
          <TabButton 
            active={activeTab === 'lightcurve'} 
            onClick={() => setActiveTab('lightcurve')}
            icon={<Clock size={14} />}
          >
            光变曲线
          </TabButton>
          <TabButton 
            active={activeTab === 'periodogram'} 
            onClick={() => setActiveTab('periodogram')}
            icon={<BarChart3 size={14} />}
          >
            Lomb-Scargle 周期图
          </TabButton>
          <TabButton 
            active={activeTab === 'phasefold'} 
            onClick={() => setActiveTab('phasefold')}
            icon={<TrendingUp size={14} />}
          >
            周期折叠
          </TabButton>
        </div>
        
        <div className="flex-1 p-4 overflow-auto flex items-start justify-center">
          {activeTab === 'lightcurve' && (
            <svg ref={lcChartRef} width={900} height={350} className="bg-space-900 rounded-lg" />
          )}
          {activeTab === 'periodogram' && (
            <svg ref={pgChartRef} width={900} height={350} className="bg-space-900 rounded-lg" />
          )}
          {activeTab === 'phasefold' && (
            <svg ref={pfChartRef} width={900} height={350} className="bg-space-900 rounded-lg" />
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-white font-mono">{value}</span>
    </div>
  );
}

function TabButton({ active, onClick, children, icon }: { 
  active: boolean; 
  onClick: () => void; 
  children: any;
  icon?: any;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
        active 
          ? 'bg-space-700 text-white' 
          : 'text-gray-400 hover:text-white hover:bg-space-800'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
