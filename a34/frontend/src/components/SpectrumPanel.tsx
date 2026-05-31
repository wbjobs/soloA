import { useState } from 'react';
import { useAppStore } from '../store';
import SpectrumChart from './SpectrumChart';
import { BarChart3, Settings, Activity } from 'lucide-react';
import type { LineIdentification } from '../types';

export default function SpectrumPanel() {
  const { currentSpectrum, loadSpectrum } = useAppStore();
  const [starType, setStarType] = useState('G2V');
  const [redshift, setRedshift] = useState(0);
  const [identifiedLines, setIdentifiedLines] = useState<LineIdentification[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const spectralTypes = ['O5', 'B0', 'B5', 'A0', 'A5', 'F0', 'F5', 'G0', 'G2V', 'G5', 'K0', 'K5', 'M0', 'M5'];

  const handleLoad = () => {
    loadSpectrum(starType, redshift);
  };

  const handleIdentifyLines = async () => {
    if (!currentSpectrum) return;
    setIsAnalyzing(true);
    try {
      const response = await fetch(
        `/api/spectrum/identify-lines?redshift=${redshift}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(currentSpectrum)
        }
      );
      const data = await response.json();
      setIdentifiedLines(data);
    } catch (err) {
      console.error('Failed to identify lines:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClassify = async () => {
    if (!currentSpectrum) return;
    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/spectrum/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentSpectrum)
      });
      const data = await response.json();
      alert(
        `光谱分类结果:\n` +
        `类型: ${data.spectral_type}${data.luminosity_class}\n` +
        `有效温度: ${data.teff_estimate}K\n` +
        `置信度: ${(data.confidence * 100).toFixed(1)}%`
      );
    } catch (err) {
      console.error('Failed to classify:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="h-full flex bg-space-950">
      <div className="w-80 border-r border-space-700 p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <BarChart3 size={20} className="text-teal-400" />
          光谱分析
        </h2>

        <div className="space-y-4">
          <div className="bg-space-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
              <Settings size={14} />
              参数设置
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  光谱型
                </label>
                <select
                  value={starType}
                  onChange={(e) => setStarType(e.target.value)}
                  className="w-full bg-space-700 border border-space-600 rounded px-3 py-2 text-white text-sm"
                >
                  {spectralTypes.map((type) => (
                    <option key={type} value={type}>
                      {type} - {getSpectralTypeDesc(type)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  红移 (z)
                </label>
                <input
                  type="number"
                  value={redshift}
                  onChange={(e) => setRedshift(Number(e.target.value))}
                  step="0.001"
                  min="0"
                  max="5"
                  className="w-full bg-space-700 border border-space-600 rounded px-3 py-2 text-white text-sm"
                />
              </div>

              <button
                onClick={handleLoad}
                className="w-full bg-teal-600 hover:bg-teal-700 text-white py-2 px-4 rounded text-sm font-medium transition-colors"
              >
                生成光谱
              </button>
            </div>
          </div>

          {currentSpectrum && (
            <div className="bg-space-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                <Activity size={14} />
                分析工具
              </h3>

              <div className="space-y-2">
                <button
                  onClick={handleIdentifyLines}
                  disabled={isAnalyzing}
                  className="w-full bg-space-700 hover:bg-space-600 disabled:bg-space-800 text-white py-2 px-4 rounded text-sm transition-colors"
                >
                  {isAnalyzing ? '分析中...' : '识别谱线'}
                </button>

                <button
                  onClick={handleClassify}
                  disabled={isAnalyzing}
                  className="w-full bg-space-700 hover:bg-space-600 disabled:bg-space-800 text-white py-2 px-4 rounded text-sm transition-colors"
                >
                  恒星分类
                </button>
              </div>
            </div>
          )}

          {currentSpectrum && (
            <div className="bg-space-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3">
                光谱信息
              </h3>
              <div className="space-y-2 text-sm">
                <InfoRow label="光谱型" value={currentSpectrum.spectral_type} />
                <InfoRow 
                  label="红移 z" 
                  value={currentSpectrum.redshift?.toFixed(4)} 
                />
                <InfoRow 
                  label="波长范围" 
                  value={`${Math.min(...currentSpectrum.wavelengths).toFixed(0)} - ${Math.max(...currentSpectrum.wavelengths).toFixed(0)} Å`} 
                />
                <InfoRow 
                  label="采样点数" 
                  value={currentSpectrum.wavelengths.length.toString()} 
                />
              </div>
            </div>
          )}

          {identifiedLines.length > 0 && (
            <div className="bg-space-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3">
                识别的谱线 ({identifiedLines.length})
              </h3>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {identifiedLines.map((line, i) => (
                  <div
                    key={i}
                    className="bg-space-700 rounded p-2 text-xs"
                  >
                    <div className="flex justify-between items-center">
                      <span className={line.line_type === 'emission' ? 'text-red-400' : 'text-teal-400'}>
                        {line.name}
                      </span>
                      <span className="text-gray-400">
                        {line.line_type === 'emission' ? '发射' : '吸收'}
                      </span>
                    </div>
                    <div className="text-gray-500 mt-1">
                      观测: {line.observed_wavelength.toFixed(1)}Å | 
                      静止: {line.rest_wavelength.toFixed(1)}Å
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <SpectrumChart data={currentSpectrum} identifiedLines={identifiedLines} />
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="text-white font-mono">{value || '-'}</span>
    </div>
  );
}

function getSpectralTypeDesc(type: string): string {
  const descs: Record<string, string> = {
    'O5': '蓝超巨星',
    'B0': '蓝巨星',
    'B5': '蓝白星',
    'A0': '白星',
    'A5': '白星',
    'F0': '黄白星',
    'F5': '黄白星',
    'G0': '黄星',
    'G2V': '太阳型星',
    'G5': '黄星',
    'K0': '橙星',
    'K5': '橙红星',
    'M0': '红星',
    'M5': '红矮星'
  };
  return descs[type] || '';
}
