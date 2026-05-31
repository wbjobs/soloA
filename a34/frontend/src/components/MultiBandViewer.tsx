import { useState, useEffect, useRef, useCallback } from 'react';
import { Layers, Eye, EyeOff, RotateCcw, Image, Palette, Sun, Contrast } from 'lucide-react';
import type { MultiBandLayer } from '../types';

const COLORMAP_PRESETS = [
  { id: 'gray', name: '灰度', color: '#6b7280' },
  { id: 'heat', name: '热成像', color: '#ef4444' },
  { id: 'inferno', name: 'Inferno', color: '#f97316' },
  { id: 'plasma', name: 'Plasma', color: '#a855f7' },
  { id: 'viridis', name: 'Viridis', color: '#10b981' },
  { id: 'blue', name: '蓝色调', color: '#3b82f6' },
  { id: 'red', name: '红色调', color: '#ef4444' },
  { id: 'green', name: '绿色调', color: '#22c55e' },
];

const SCALE_METHODS = [
  { id: 'zscale', name: 'ZScale' },
  { id: 'percentile', name: 'Percentile (99%)' },
  { id: 'minmax', name: 'Min/Max' },
];

const STRETCH_METHODS = [
  { id: 'linear', name: '线性' },
  { id: 'log', name: '对数' },
  { id: 'sqrt', name: '平方根' },
  { id: 'asinh', name: 'Asinh' },
];

const OBJECT_TYPES = [
  { id: 'galaxy', name: '星系' },
  { id: 'star_cluster', name: '星团' },
  { id: 'nebula', name: '星云' },
];

const DEFAULT_LAYERS: MultiBandLayer[] = [
  {
    id: 'radio_5GHz',
    band: 'radio_5GHz',
    name: '射电 5GHz',
    colormap: 'blue',
    opacity: 0.5,
    visible: true,
    contrast: 1.0,
    brightness: 0.0
  },
  {
    id: 'infrared_K',
    band: 'infrared_K',
    name: '红外 K 波段',
    colormap: 'red',
    opacity: 0.6,
    visible: true,
    contrast: 1.0,
    brightness: 0.0
  },
  {
    id: 'optical_r',
    band: 'optical_r',
    name: '光学 r 波段',
    colormap: 'green',
    opacity: 0.7,
    visible: true,
    contrast: 1.0,
    brightness: 0.0
  },
  {
    id: 'optical_g',
    band: 'optical_g',
    name: '光学 g 波段',
    colormap: 'heat',
    opacity: 0.8,
    visible: true,
    contrast: 1.0,
    brightness: 0.0
  }
];

export default function MultiBandViewer() {
  const [layers, setLayers] = useState<MultiBandLayer[]>(DEFAULT_LAYERS);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>('optical_r');
  const [scaleMethod, setScaleMethod] = useState('zscale');
  const [stretchMethod, setStretchMethod] = useState('linear');
  const [objectType, setObjectType] = useState('galaxy');
  const [imageSize] = useState<[number, number]>([256, 256]);
  const [compositeImage, setCompositeImage] = useState<number[][][] | null>(null);
  const [layerImages, setLayerImages] = useState<Record<string, number[][]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const selectedLayer = layers.find(l => l.id === selectedLayerId);

  const renderCompositeImage = useCallback(() => {
    if (!compositeImage || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const h = compositeImage.length;
    const w = compositeImage[0].length;
    canvas.width = w;
    canvas.height = h;

    const imageData = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        imageData.data[idx] = Math.floor(compositeImage[y][x][0] * 255);
        imageData.data[idx + 1] = Math.floor(compositeImage[y][x][1] * 255);
        imageData.data[idx + 2] = Math.floor(compositeImage[y][x][2] * 255);
        imageData.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);

    if (showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      const gridSize = w / 8;
      for (let i = 1; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(i * gridSize, 0);
        ctx.lineTo(i * gridSize, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * gridSize);
        ctx.lineTo(w, i * gridSize);
        ctx.stroke();
      }
    }
  }, [compositeImage, showGrid]);

  useEffect(() => {
    renderCompositeImage();
  }, [renderCompositeImage]);

  const generateComposite = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/multiband/composite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layers: layers.filter(l => l.visible),
          scale_method: scaleMethod,
          stretch_method: stretchMethod,
          image_size: imageSize,
          object_type: objectType
        })
      });
      const data = await response.json();
      setCompositeImage(data.composite_image);
      
      const images: Record<string, number[][]> = {};
      data.layers.forEach((layer: any) => {
        images[layer.id] = layer.image;
      });
      setLayerImages(images);
    } catch (error) {
      console.error('Failed to generate composite:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    generateComposite();
  }, [objectType, scaleMethod, stretchMethod]);

  useEffect(() => {
    generateComposite();
  }, [layers]);

  const toggleLayer = (id: string) => {
    setLayers(prev => prev.map(l => 
      l.id === id ? { ...l, visible: !l.visible } : l
    ));
  };

  const updateLayerOpacity = (id: string, opacity: number) => {
    setLayers(prev => prev.map(l => 
      l.id === id ? { ...l, opacity } : l
    ));
  };

  const updateLayerColormap = (id: string, colormap: string) => {
    setLayers(prev => prev.map(l => 
      l.id === id ? { ...l, colormap } : l
    ));
  };

  const updateLayerContrast = (id: string, contrast: number) => {
    setLayers(prev => prev.map(l => 
      l.id === id ? { ...l, contrast } : l
    ));
  };

  const updateLayerBrightness = (id: string, brightness: number) => {
    setLayers(prev => prev.map(l => 
      l.id === id ? { ...l, brightness } : l
    ));
  };

  const resetToDefault = () => {
    setLayers(DEFAULT_LAYERS);
    setScaleMethod('zscale');
    setStretchMethod('linear');
    setObjectType('galaxy');
  };

  const moveLayerUp = (id: string) => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx > 0) {
      const newLayers = [...layers];
      [newLayers[idx - 1], newLayers[idx]] = [newLayers[idx], newLayers[idx - 1]];
      setLayers(newLayers);
    }
  };

  const moveLayerDown = (id: string) => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx < layers.length - 1) {
      const newLayers = [...layers];
      [newLayers[idx + 1], newLayers[idx]] = [newLayers[idx], newLayers[idx + 1]];
      setLayers(newLayers);
    }
  };

  return (
    <div className="h-full flex bg-space-950">
      <div className="w-80 border-r border-space-700 p-4 overflow-y-auto">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Layers size={20} className="text-cyan-400" />
          多波段图像叠加
        </h2>

        <div className="space-y-4">
          <div className="bg-space-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
              <Image size={14} />
              图像设置
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">目标天体类型</label>
                <select
                  value={objectType}
                  onChange={(e) => setObjectType(e.target.value)}
                  className="w-full bg-space-700 border border-space-600 rounded px-3 py-2 text-white text-sm"
                >
                  {OBJECT_TYPES.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">缩放方法</label>
                  <select
                    value={scaleMethod}
                    onChange={(e) => setScaleMethod(e.target.value)}
                    className="w-full bg-space-700 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                  >
                    {SCALE_METHODS.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">拉伸方式</label>
                  <select
                    value={stretchMethod}
                    onChange={(e) => setStretchMethod(e.target.value)}
                    className="w-full bg-space-700 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                  >
                    {STRETCH_METHODS.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-space-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
                <Layers size={14} />
                图层管理
              </h3>
              <button
                onClick={resetToDefault}
                className="text-xs text-gray-500 hover:text-white flex items-center gap-1"
              >
                <RotateCcw size={12} />
                重置
              </button>
            </div>

            <div className="space-y-2">
              {layers.map((layer, idx) => (
                <div
                  key={layer.id}
                  className={`rounded-lg p-3 cursor-pointer transition-colors ${
                    selectedLayerId === layer.id 
                      ? 'bg-space-600 border border-cyan-500/50' 
                      : 'bg-space-700 hover:bg-space-600'
                  }`}
                  onClick={() => setSelectedLayerId(layer.id)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleLayer(layer.id); }}
                        className="text-gray-400 hover:text-white"
                      >
                        {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <span className={`text-sm ${layer.visible ? 'text-white' : 'text-gray-500'}`}>
                        {layer.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); moveLayerUp(layer.id); }}
                        className="text-gray-500 hover:text-white text-xs p-0.5"
                        disabled={idx === 0}
                      >
                        ↑
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveLayerDown(layer.id); }}
                        className="text-gray-500 hover:text-white text-xs p-0.5"
                        disabled={idx === layers.length - 1}
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={layer.opacity}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => updateLayerOpacity(layer.id, Number(e.target.value))}
                      className="flex-1 h-1 accent-cyan-500"
                    />
                    <span className="text-xs text-gray-400 w-10 text-right">
                      {Math.round(layer.opacity * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {selectedLayer && (
            <div className="bg-space-800 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3">
                图层设置: <span className="text-white">{selectedLayer.name}</span>
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-2 flex items-center gap-1">
                    <Palette size={12} />
                    伪彩色映射
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {COLORMAP_PRESETS.map(cm => (
                      <button
                        key={cm.id}
                        onClick={() => updateLayerColormap(selectedLayer.id, cm.id)}
                        className={`p-2 rounded text-xs text-center transition-all ${
                          selectedLayer.colormap === cm.id
                            ? 'ring-2 ring-cyan-500 bg-space-600'
                            : 'bg-space-700 hover:bg-space-600'
                        }`}
                      >
                        <div 
                          className="w-full h-3 rounded mb-1"
                          style={{ backgroundColor: cm.color }}
                        />
                        <span className="text-gray-300">{cm.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-2 flex items-center gap-1">
                    <Contrast size={12} />
                    对比度: {selectedLayer.contrast.toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="3"
                    step="0.1"
                    value={selectedLayer.contrast}
                    onChange={(e) => updateLayerContrast(selectedLayer.id, Number(e.target.value))}
                    className="w-full h-1 accent-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-2 flex items-center gap-1">
                    <Sun size={12} />
                    亮度: {selectedLayer.brightness > 0 ? '+' : ''}{selectedLayer.brightness.toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min="-0.5"
                    max="0.5"
                    step="0.05"
                    value={selectedLayer.brightness}
                    onChange={(e) => updateLayerBrightness(selectedLayer.id, Number(e.target.value))}
                    className="w-full h-1 accent-cyan-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-500 block mb-2">透明度: {Math.round(selectedLayer.opacity * 100)}%</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedLayer.opacity}
                    onChange={(e) => updateLayerOpacity(selectedLayer.id, Number(e.target.value))}
                    className="w-full h-1 accent-cyan-500"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="bg-space-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-400 mb-3">波段信息</h3>
            <div className="space-y-2 text-xs">
              <div className="p-2 bg-space-700 rounded">
                <span className="text-blue-400">🔵 射电</span>
                <p className="text-gray-500 mt-1">5GHz、1.4GHz、21cm中性氢</p>
              </div>
              <div className="p-2 bg-space-700 rounded">
                <span className="text-red-400">🔴 红外</span>
                <p className="text-gray-500 mt-1">J、H、K、L、M 波段</p>
              </div>
              <div className="p-2 bg-space-700 rounded">
                <span className="text-green-400">🟢 光学</span>
                <p className="text-gray-500 mt-1">UBVRI + SDSS griz</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="border-b border-space-700 p-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">
              可见图层: {layers.filter(l => l.visible).length}/{layers.length}
            </span>
            <label className="flex items-center gap-2 text-xs text-gray-500">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
                className="accent-cyan-500"
              />
              显示网格
            </label>
          </div>
          <button
            onClick={generateComposite}
            disabled={isLoading}
            className="text-xs bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-800 text-white px-3 py-1.5 rounded flex items-center gap-1"
          >
            <RotateCcw size={12} className={isLoading ? 'animate-spin' : ''} />
            {isLoading ? '生成中...' : '重新生成'}
          </button>
        </div>

        <div className="flex-1 p-8 flex items-center justify-center overflow-auto">
          <div className="relative">
            <canvas
              ref={canvasRef}
              className="border border-space-700 rounded-lg shadow-2xl"
              style={{ imageRendering: 'pixelated', width: '512px', height: '512px' }}
            />
            
            <div className="absolute bottom-2 right-2 bg-space-900/80 backdrop-blur rounded px-2 py-1 text-xs text-gray-400">
              WCS对齐 | 视场中心 (0, 0)
            </div>

            <div className="absolute -left-20 top-1/2 -translate-y-1/2">
              <div className="text-xs text-gray-500 text-center -rotate-90 whitespace-nowrap">
                赤纬 (°)
              </div>
            </div>

            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
              <div className="text-xs text-gray-500">
                赤经 (°)
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-space-700 p-4 bg-space-900">
          <div className="flex items-center gap-6 overflow-x-auto">
            {layers.filter(l => l.visible).map(layer => (
              <div key={layer.id} className="flex items-center gap-2 text-xs">
                <div 
                  className="w-4 h-4 rounded border border-gray-600"
                  style={{ backgroundColor: COLORMAP_PRESETS.find(c => c.id === layer.colormap)?.color || '#666' }}
                />
                <span className="text-gray-300">{layer.name}</span>
                <span className="text-gray-600">|</span>
                <span className="text-gray-500">{Math.round(layer.opacity * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
