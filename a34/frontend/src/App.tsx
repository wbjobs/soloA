import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { useEffect } from 'react';
import { useAppStore } from './store';
import StarField from './components/StarField';
import CoordinateGrid from './components/CoordinateGrid';
import ControlPanel from './components/ControlPanel';
import SpectrumPanel from './components/SpectrumPanel';
import FITSViewer from './components/FITSViewer';
import TimeSeriesPanel from './components/TimeSeriesPanel';
import ObservatorySimulator from './components/ObservatorySimulator';
import MultiBandViewer from './components/MultiBandViewer';
import { Star, BarChart3, FileImage, Eye, Activity, Telescope, Layers } from 'lucide-react';

export default function App() {
  const {
    activeTab,
    setActiveTab,
    coordinateSystem,
    loadStars,
    stars
  } = useAppStore();

  useEffect(() => {
    loadStars(100000);
  }, [loadStars]);

  const tabs = [
    { id: 'starmap', name: '3D星场', icon: Star },
    { id: 'spectrum', name: '光谱分析', icon: BarChart3 },
    { id: 'timeseries', name: '时域天文', icon: Activity },
    { id: 'multiband', name: '多波段叠加', icon: Layers },
    { id: 'observatory', name: '观测模拟', icon: Telescope },
    { id: 'fits', name: 'FITS文件', icon: FileImage }
  ] as const;

  return (
    <div className="w-full h-full flex flex-col bg-space-950">
      <header className="h-14 border-b border-space-700 bg-space-900 flex items-center px-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Eye size={18} className="text-white" />
          </div>
          <h1 className="text-lg font-bold text-white">天文观测数据可视化平台</h1>
        </div>

        <nav className="ml-8 flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-space-700 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-space-800'
                }`}
              >
                <Icon size={16} />
                {tab.name}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-4 text-sm text-gray-400">
          {stars.length > 0 && (
            <span className="flex items-center gap-1">
              <Star size={14} className="text-yellow-400" />
              {stars.length.toLocaleString()} 颗恒星
            </span>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {activeTab === 'starmap' && (
          <>
            <ControlPanel />
            <div className="flex-1 relative">
              <Canvas
                camera={{ position: [0, 0, 2.5], fov: 60 }}
                gl={{ antialias: true, alpha: false }}
                style={{ background: '#050510' }}
              >
                <color attach="background" args={['#050510']} />
                <fog attach="fog" args={['#050510', 2, 5]} />
                
                <ambientLight intensity={0.1} />
                
                <Stars
                  radius={100}
                  depth={50}
                  count={5000}
                  factor={4}
                  saturation={0}
                  fade
                  speed={1}
                />

                <CoordinateGrid system={coordinateSystem} />
                <StarField coordinateSystem={coordinateSystem} />

                <OrbitControls
                  enableDamping
                  dampingFactor={0.05}
                  minDistance={0.5}
                  maxDistance={10}
                />
              </Canvas>

              <div className="absolute bottom-4 left-4 bg-space-900/80 backdrop-blur rounded-lg p-3 text-sm">
                <p className="text-gray-400 text-xs mb-1">坐标系</p>
                <p className="text-white font-medium">
                  {coordinateSystem === 'icrs' ? '赤道坐标系 (ICRS)' :
                   coordinateSystem === 'galactic' ? '银道坐标系 (Galactic)' :
                   '地平坐标系 (Alt/Az)'}
                </p>
              </div>

              <div className="absolute bottom-4 right-4 bg-space-900/80 backdrop-blur rounded-lg p-3 text-xs text-gray-400">
                <p>🖱️ 拖拽旋转 | 滚轮缩放 | 右键平移</p>
              </div>
            </div>
          </>
        )}

        {activeTab === 'spectrum' && <SpectrumPanel />}
        {activeTab === 'timeseries' && <TimeSeriesPanel />}
        {activeTab === 'multiband' && <MultiBandViewer />}
        {activeTab === 'observatory' && <ObservatorySimulator />}
        {activeTab === 'fits' && <FITSViewer />}
      </main>
    </div>
  );
}
