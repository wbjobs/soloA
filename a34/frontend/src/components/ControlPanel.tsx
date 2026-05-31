import { useState } from 'react';
import { useAppStore } from '../store';
import { Map, Globe, Compass, Sliders, Star } from 'lucide-react';

export default function ControlPanel() {
  const {
    coordinateSystem,
    setCoordinateSystem,
    observerLocation,
    setObserverLocation,
    magnitudeRange,
    setMagnitudeRange,
    starCount,
    isLoadingStars,
    loadStars
  } = useAppStore();

  const [starLimit, setStarLimit] = useState(100000);

  const systems = [
    { id: 'icrs', name: '赤道坐标系', icon: Map, desc: 'ICRS / J2000.0' },
    { id: 'galactic', name: '银道坐标系', icon: Globe, desc: 'Galactic' },
    { id: 'altaz', name: '地平坐标系', icon: Compass, desc: 'Alt/Az' }
  ] as const;

  return (
    <div className="w-80 bg-space-900 border-r border-space-700 flex flex-col overflow-y-auto">
      <div className="p-4 border-b border-space-700">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Star size={20} className="text-yellow-400" />
          星场控制
        </h2>
      </div>

      <div className="p-4 space-y-6">
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-3">星表数据</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">
                恒星数量 (最多50万)
              </label>
              <input
                type="number"
                value={starLimit}
                onChange={(e) => setStarLimit(Math.min(500000, Math.max(100, Number(e.target.value))))}
                className="w-full bg-space-800 border border-space-600 rounded px-3 py-2 text-white text-sm"
              />
            </div>
            <button
              onClick={() => loadStars(starLimit, magnitudeRange[0], magnitudeRange[1])}
              disabled={isLoadingStars}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white py-2 px-4 rounded text-sm font-medium transition-colors"
            >
              {isLoadingStars ? '加载中...' : `加载 ${starLimit.toLocaleString()} 颗恒星`}
            </button>
            <p className="text-xs text-gray-500 text-center">
              当前: {starCount.toLocaleString()} 颗
            </p>
          </div>
        </div>

        <div className="border-t border-space-700 pt-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
            <Sliders size={14} />
            视星等过滤
          </h3>
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">最暗</label>
                <input
                  type="number"
                  value={magnitudeRange[0]}
                  onChange={(e) => setMagnitudeRange([Number(e.target.value), magnitudeRange[1]])}
                  min={0}
                  max={30}
                  step={0.1}
                  className="w-full bg-space-800 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">最亮</label>
                <input
                  type="number"
                  value={magnitudeRange[1]}
                  onChange={(e) => setMagnitudeRange([magnitudeRange[0], Number(e.target.value)])}
                  min={0}
                  max={30}
                  step={0.1}
                  className="w-full bg-space-800 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                />
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={30}
              step={0.5}
              value={magnitudeRange[1]}
              onChange={(e) => setMagnitudeRange([magnitudeRange[0], Number(e.target.value)])}
              className="w-full"
            />
          </div>
        </div>

        <div className="border-t border-space-700 pt-4">
          <h3 className="text-sm font-medium text-gray-400 mb-3">坐标系</h3>
          <div className="space-y-2">
            {systems.map((sys) => {
              const Icon = sys.icon;
              const isActive = coordinateSystem === sys.id;
              return (
                <button
                  key={sys.id}
                  onClick={() => setCoordinateSystem(sys.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                    isActive
                      ? 'bg-space-700 border border-blue-500 text-white'
                      : 'bg-space-800 border border-transparent text-gray-400 hover:text-white hover:bg-space-700'
                  }`}
                >
                  <Icon
                    size={18}
                    className={isActive ? 'text-blue-400' : ''}
                  />
                  <div className="text-left">
                    <p className="text-sm font-medium">{sys.name}</p>
                    <p className="text-xs opacity-70">{sys.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {coordinateSystem === 'altaz' && (
          <div className="border-t border-space-700 pt-4">
            <h3 className="text-sm font-medium text-gray-400 mb-3">
              观测者位置
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  经度 (°)
                </label>
                <input
                  type="number"
                  value={observerLocation.lon}
                  onChange={(e) =>
                    setObserverLocation({ ...observerLocation, lon: Number(e.target.value) })
                  }
                  className="w-full bg-space-800 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  纬度 (°)
                </label>
                <input
                  type="number"
                  value={observerLocation.lat}
                  onChange={(e) =>
                    setObserverLocation({ ...observerLocation, lat: Number(e.target.value) })
                  }
                  className="w-full bg-space-800 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  海拔 (m)
                </label>
                <input
                  type="number"
                  value={observerLocation.height}
                  onChange={(e) =>
                    setObserverLocation({ ...observerLocation, height: Number(e.target.value) })
                  }
                  className="w-full bg-space-800 border border-space-600 rounded px-3 py-1.5 text-white text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
