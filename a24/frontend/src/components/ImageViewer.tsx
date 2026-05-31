import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Move, ZoomIn, Contrast, Ruler, Circle, Square, Minus, RotateCw, ChevronLeft, ChevronRight, Play, Pause
} from 'lucide-react';
import type { Series, Instance, AIFinding, ToolType } from '../types';
import { dicomApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

interface ImageViewerProps {
  series: Series;
  instances: Instance[];
  totalInstances: number;
  loadMoreInstances?: () => Promise<void>;
  aiFindings?: AIFinding[];
  onSliceChange?: (index: number) => void;
}

const voiPresets = [
  { name: '默认', wc: 0, ww: 200 },
  { name: '肺窗', wc: -600, ww: 1500 },
  { name: '纵隔窗', wc: 40, ww: 400 },
  { name: '骨窗', wc: 300, ww: 1500 },
  { name: '软组织', wc: 40, ww: 350 },
];

const lutPresets = ['默认', '热', '铁', '彩虹', '热金属'];
const INSTANCE_PAGE_SIZE = 50;

const ImageViewer: React.FC<ImageViewerProps> = ({
  series,
  instances,
  totalInstances,
  loadMoreInstances,
  aiFindings = [],
  onSliceChange,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [tool, setTool] = useState<ToolType>('window');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [windowCenter, setWindowCenter] = useState(series.window_center || 40);
  const [windowWidth, setWindowWidth] = useState(series.window_width || 400);
  const [invert, setInvert] = useState(false);
  const [voiLut, setVoiLut] = useState('默认');
  const [play, setPlay] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const playInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const { token } = useAuthStore();

  const currentInstance = instances[currentIndex];
  const displayTotal = totalInstances || instances.length;

  const imageCacheKey = useMemo(() => {
    return `${currentInstance?.id}-${windowCenter}-${windowWidth}`;
  }, [currentInstance?.id, windowCenter, windowWidth]);

  useEffect(() => {
    if (currentInstance && token) {
      setIsLoading(true);
      const url = dicomApi.getImageUrl(currentInstance.id, windowCenter, windowWidth);
      setImageUrl(url + (url.includes('?') ? '&' : '?') + `t=${Date.now()}`);
    }
  }, [imageCacheKey, token]);

  const handleImageLoad = () => {
    setIsLoading(false);
  };

  const handleImageError = () => {
    setIsLoading(false);
  };

  useEffect(() => {
    if (play) {
      playInterval.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % displayTotal);
      }, 100);
    } else {
      if (playInterval.current) {
        clearInterval(playInterval.current);
      }
    }
    return () => {
      if (playInterval.current) {
        clearInterval(playInterval.current);
      }
    };
  }, [play, displayTotal]);

  useEffect(() => {
    onSliceChange?.(currentIndex);

    const startIdx = Math.max(0, currentIndex - 2);
    const endIdx = Math.min(instances.length, currentIndex + 3);
    const needsMore = endIdx >= instances.length && instances.length < displayTotal;

    if (needsMore && loadMoreInstances) {
      loadMoreInstances().catch(console.error);
    }
  }, [currentIndex, onSliceChange, instances.length, displayTotal, loadMoreInstances]);

  const prev = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  };

  const next = () => {
    setCurrentIndex((prev) => Math.min(displayTotal - 1, prev + 1));
  };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY > 0) {
      next();
    } else {
      prev();
    }
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    switch (tool) {
      case 'window':
        setWindowCenter((prev) => Math.max(-2000, Math.min(3000, prev + dy * 2)));
        setWindowWidth((prev) => Math.max(1, Math.min(6000, prev + dx * 2)));
        break;
      case 'zoom':
        setZoom((prev) => Math.max(0.2, Math.min(10, prev + dy * 0.01)));
        break;
      case 'pan':
        setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
        break;
    }

    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setWindowCenter(series.window_center || 40);
    setWindowWidth(series.window_width || 400);
    setInvert(false);
  };

  const applyVOIPreset = (wc: number, ww: number) => {
    setWindowCenter(wc);
    setWindowWidth(ww);
  };

  const currentFindings = aiFindings.filter(
    (f) => f.instance_uid === currentInstance?.instance_uid
  );

  const toolButtons: { name: string; icon: React.ReactNode; value: ToolType }[] = [
    { name: '窗宽窗位', icon: <Contrast className="w-4 h-4" />, value: 'window' },
    { name: '缩放', icon: <ZoomIn className="w-4 h-4" />, value: 'zoom' },
    { name: '平移', icon: <Move className="w-4 h-4" />, value: 'pan' },
    { name: '长度', icon: <Ruler className="w-4 h-4" />, value: 'length' },
    { name: '椭圆 ROI', icon: <Circle className="w-4 h-4" />, value: 'elliptical_roi' },
    { name: '矩形 ROI', icon: <Square className="w-4 h-4" />, value: 'rectangular_roi' },
    { name: '箭头', icon: <Minus className="w-4 h-4" />, value: 'arrow' },
  ];

  const displayInstance = currentInstance || {
    instance_uid: '',
    instance_number: currentIndex + 1,
    slice_location: null,
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-700">
        <div className="flex items-center gap-1">
          {toolButtons.map((t) => (
            <button
              key={t.value}
              onClick={() => setTool(t.value)}
              title={t.name}
              className={`toolbar-btn flex items-center gap-1 ${
                tool === t.value ? 'active' : ''
              }`}
            >
              {t.icon}
              <span className="hidden lg:inline">{t.name}</span>
            </button>
          ))}

          <div className="w-px h-6 bg-slate-600 mx-1" />

          <button
            onClick={() => setInvert(!invert)}
            className={`toolbar-btn ${invert ? 'active' : ''}`}
            title="反色"
          >
            <Contrast className="w-4 h-4" />
          </button>

          <button onClick={resetView} className="toolbar-btn" title="重置">
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={voiLut}
            onChange={(e) => setVoiLut(e.target.value)}
            className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-sm text-white"
          >
            {lutPresets.map((lut) => (
              <option key={lut}>{lut}</option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            {voiPresets.map((p) => (
              <button
                key={p.name}
                onClick={() => applyVOIPreset(p.wc, p.ww)}
                className="toolbar-btn text-xs"
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center bg-black">
        <div
          ref={containerRef}
          className="relative w-full h-full flex items-center justify-center cursor-crosshair"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {imageUrl && currentInstance && (
            <img
              src={imageUrl}
              alt="DICOM Image"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                filter: invert ? 'invert(1)' : 'none',
                maxWidth: '100%',
                maxHeight: '100%',
              }}
              className="select-none"
              draggable={false}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          )}

          {!currentInstance && (
            <div className="text-slate-500">切片数据加载中...</div>
          )}

          {currentFindings.map((finding, idx) => {
            const scaleX = zoom;
            const scaleY = zoom;
            return (
              <div
                key={idx}
                className="absolute pointer-events-none"
                style={{
                  left: `calc(50% + ${pan.x + (finding.bounding_box.x - (series.columns || 512) / 2) * scaleX}px)`,
                  top: `calc(50% + ${pan.y + (finding.bounding_box.y - (series.rows || 512) / 2) * scaleY}px)`,
                  width: `${finding.bounding_box.width * scaleX}px`,
                  height: `${finding.bounding_box.height * scaleY}px`,
                }}
              >
                <div
                  className="absolute inset-0 border-2 pointer-events-none"
                  style={{
                    borderColor:
                      finding.severity === 'high'
                        ? '#ef4444'
                        : finding.severity === 'medium'
                        ? '#f59e0b'
                        : '#3b82f6',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  }}
                />
                <div
                  className="absolute -top-6 left-0 px-1 text-xs text-white whitespace-nowrap rounded"
                  style={{
                    backgroundColor:
                      finding.severity === 'high'
                        ? '#ef4444'
                        : finding.severity === 'medium'
                        ? '#f59e0b'
                        : '#3b82f6',
                  }}
                >
                  {(finding.confidence * 100).toFixed(0)}%
                </div>
              </div>
            );
          })}

          <div className="viewport-overlay">
            <div className="overlay-top-left">
              <div>{series.series_description || '序列'}</div>
              <div className="text-slate-400">{series.modality}</div>
            </div>
            <div className="overlay-top-right">
              <div>W: {windowWidth.toFixed(0)}</div>
              <div>C: {windowCenter.toFixed(0)}</div>
            </div>
            <div className="overlay-bottom-left">
              <div>
                {currentIndex + 1} / {displayTotal}
              </div>
              {displayInstance.slice_location !== null && displayInstance.slice_location !== undefined && (
                <div className="text-slate-400">
                  Slice: {Number(displayInstance.slice_location).toFixed(2)} mm
                </div>
              )}
            </div>
            <div className="overlay-bottom-right">
              <div>Zoom: {(zoom * 100).toFixed(0)}%</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-t border-slate-700">
        <div className="flex items-center gap-2">
          <button
            onClick={prev}
            disabled={currentIndex <= 0}
            className="toolbar-btn"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPlay(!play)}
            className="toolbar-btn"
          >
            {play ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={next}
            disabled={currentIndex >= displayTotal - 1}
            className="toolbar-btn"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 mx-4">
          <input
            type="range"
            min="0"
            max={displayTotal - 1}
            value={currentIndex}
            onChange={(e) => setCurrentIndex(Number(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>

        <div className="text-sm text-slate-400">
          {series.rows}x{series.columns}
        </div>
      </div>
    </div>
  );
};

export default ImageViewer;
