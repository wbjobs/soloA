import React, { useState, useEffect, useCallback } from 'react';
import { Layers, Maximize2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import type { Series, ProjectionType, ProjectionAxis } from '../types';
import { volumeApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

interface VolumeViewerProps {
  series: Series;
  windowCenter?: number;
  windowWidth?: number;
}

const VolumeViewer: React.FC<VolumeViewerProps> = ({
  series,
  windowCenter = -600,
  windowWidth = 1500,
}) => {
  const { token } = useAuthStore();
  const [expanded, setExpanded] = useState(true);
  const [activeAxis, setActiveAxis] = useState<ProjectionAxis>(0);
  const [projectionType, setProjectionType] = useState<ProjectionType>('mip');
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const axisLabels: { axis: ProjectionAxis; name: string }[] = [
    { axis: 0, name: '轴位 (Axial)' },
    { axis: 1, name: '矢状位 (Sagittal)' },
    { axis: 2, name: '冠状位 (Coronal)' },
  ];

  const generateProjectionUrl = useCallback((axis: ProjectionAxis, type: ProjectionType) => {
    const params: string[] = [];
    params.push(`axis=${axis}`);
    params.push(`projection_type=${type}`);
    params.push(`window_center=${windowCenter}`);
    params.push(`window_width=${windowWidth}`);
    if (token) {
      const baseUrl = volumeApi.getMIP(series.id);
      return baseUrl.split('?')[0] + `?${params.join('&')}&t=${Date.now()}`;
    }
    return '';
  }, [series.id, windowCenter, windowWidth, token]);

  const loadAllProjections = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const urls: Record<string, string> = {};
      for (const { axis } of axisLabels) {
        for (const type of ['mip', 'minip', 'average'] as ProjectionType[]) {
          const key = `${axis}-${type}`;
          urls[key] = generateProjectionUrl(axis, type);
        }
      }
      setImageUrls(urls);
    } finally {
      setLoading(false);
    }
  }, [generateProjectionUrl, token]);

  useEffect(() => {
    if (expanded && token) {
      loadAllProjections();
    }
  }, [expanded, loadAllProjections, token]);

  const handleRefresh = () => {
    loadAllProjections();
  };

  const getProjectionLabel = (type: ProjectionType) => {
    switch (type) {
      case 'mip': return 'MIP (最大密度)';
      case 'minip': return 'MinIP (最小密度)';
      case 'average': return 'Avg (平均密度)';
    }
  };

  return (
    <div className="bg-slate-900/50 border-t border-slate-800">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <span className="text-white font-medium">3D 体渲染 / MIP 视图</span>
          <span className="text-xs text-slate-500">
            ({series.modality || 'CT'} - {series.series_description || series.series_number})
          </span>
        </div>
        <div className="flex items-center gap-2">
          {loading && <RefreshCw className="w-4 h-4 text-slate-400 animate-spin" />}
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRefresh();
            }}
            className="p-1 hover:bg-slate-700 rounded transition-colors"
          >
            <RefreshCw className="w-4 h-4 text-slate-400" />
          </button>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
              {axisLabels.map(({ axis, name }) => (
                <button
                  key={axis}
                  onClick={() => setActiveAxis(axis)}
                  className={`px-3 py-1 rounded text-xs transition-colors ${
                    activeAxis === axis
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>

            <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
              {(['mip', 'minip', 'average'] as ProjectionType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setProjectionType(type)}
                  className={`px-3 py-1 rounded text-xs transition-colors ${
                    projectionType === type
                      ? 'bg-purple-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {getProjectionLabel(type)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {axisLabels.map(({ axis, name }) => (
              <div key={axis} className="relative">
                <div className="text-xs text-slate-400 mb-1">
                  {name} - {getProjectionLabel(projectionType)}
                </div>
                <div className="relative bg-black rounded-lg overflow-hidden aspect-square flex items-center justify-center">
                  {imageUrls[`${axis}-${projectionType}`] ? (
                    <img
                      src={imageUrls[`${axis}-${projectionType}`]}
                      alt={name}
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <div className="text-slate-600 text-xs">加载中...</div>
                  )}

                  {activeAxis === axis && (
                    <div className="absolute top-1 right-1">
                      <Maximize2 className="w-3 h-3 text-cyan-400" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VolumeViewer;
