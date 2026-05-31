import { useState, useEffect } from 'react';
import { useSimulationStore } from '../store/simulationStore';
import { useUiStore } from '../store/uiStore';
import { apiService } from '../services/api';
import { wsService } from '../services/websocket';

const sidebarStyle = {
  position: 'absolute' as const,
  left: 0,
  top: 0,
  bottom: 0,
  width: '320px',
  background: 'rgba(10, 15, 30, 0.95)',
  borderRight: '1px solid rgba(100, 150, 255, 0.2)',
  display: 'flex',
  flexDirection: 'column' as const,
  zIndex: 100,
  backdropFilter: 'blur(10px)'
};

const headerStyle = {
  padding: '16px',
  borderBottom: '1px solid rgba(100, 150, 255, 0.2)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between'
};

const titleStyle = {
  fontSize: '18px',
  fontWeight: 'bold' as const,
  color: '#64b5f6',
  margin: 0
};

const tabsStyle = {
  display: 'flex',
  borderBottom: '1px solid rgba(100, 150, 255, 0.2)'
};

const tabStyle = (active: boolean) => ({
  flex: 1,
  padding: '12px',
  textAlign: 'center' as const,
  cursor: 'pointer',
  background: active ? 'rgba(100, 150, 255, 0.15)' : 'transparent',
  borderBottom: active ? '2px solid #64b5f6' : '2px solid transparent',
  color: active ? '#fff' : 'rgba(255, 255, 255, 0.6)',
  fontSize: '13px',
  transition: 'all 0.2s ease'
});

const contentStyle = {
  flex: 1,
  overflowY: 'auto' as const,
  padding: '16px'
};

const cardStyle = {
  background: 'rgba(30, 40, 70, 0.5)',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '12px',
  border: '1px solid rgba(100, 150, 255, 0.15)'
};

const labelStyle = {
  fontSize: '12px',
  color: 'rgba(255, 255, 255, 0.6)',
  marginBottom: '4px'
};

const buttonStyle = {
  width: '100%',
  padding: '10px 16px',
  background: 'linear-gradient(135deg, #64b5f6 0%, #42a5f5 100%)',
  border: 'none',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '14px',
  fontWeight: '500' as const,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  marginBottom: '8px'
};

const secondaryButtonStyle = {
  width: '100%',
  padding: '10px 16px',
  background: 'rgba(100, 150, 255, 0.15)',
  border: '1px solid rgba(100, 150, 255, 0.3)',
  borderRadius: '6px',
  color: '#64b5f6',
  fontSize: '14px',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  marginBottom: '8px'
};

const presetItemStyle = {
  padding: '12px',
  background: 'rgba(0, 0, 0, 0.3)',
  borderRadius: '6px',
  marginBottom: '8px',
  cursor: 'pointer',
  border: '1px solid rgba(100, 150, 255, 0.2)',
  transition: 'all 0.2s ease'
};

const sliderStyle = {
  width: '100%',
  height: '4px',
  background: 'rgba(100, 150, 255, 0.2)',
  borderRadius: '2px',
  outline: 'none',
  cursor: 'pointer'
};

const presetIcons: Record<string, string> = {
  'solar_system': '🌞',
  'binary_star': '⭐',
  'star_cluster': '✨',
  'relativistic_mercury': '🌀',
  'asteroid_belt': '☄️',
  'habitable_zone': '🌍'
};

export function Sidebar() {
  const {
    currentSimulationId,
    currentState,
    isPaused,
    timeScale,
    viewSettings,
    setTimeScale,
    setPaused,
    setViewSettings,
    setCurrentSimulationId,
    setCurrentState,
    setWsConnected
  } = useSimulationStore();

  const { activeTab, setActiveTab } = useUiStore();

  const [presets, setPresets] = useState<any[]>([]);
  const [simulations, setSimulations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPresets();
    loadSimulations();
  }, []);

  const loadPresets = async () => {
    try {
      const data = await apiService.getPresets();
      setPresets(data);
    } catch (e) {
      console.error('Failed to load presets:', e);
    }
  };

  const loadSimulations = async () => {
    try {
      const data = await apiService.listSimulations();
      setSimulations(data);
    } catch (e) {
      console.error('Failed to load simulations:', e);
    }
  };

  const handleCreateFromPreset = async (presetName: string) => {
    setLoading(true);
    try {
      const sim = await apiService.createFromPreset(presetName);
      await loadSimulation(sim.id);
      await loadSimulations();
    } catch (e) {
      console.error('Failed to create simulation:', e);
    } finally {
      setLoading(false);
    }
  };

  const loadSimulation = async (id: number) => {
    try {
      const result = await apiService.loadSimulation(id);
      setCurrentSimulationId(id);
      setCurrentState(result.state);
      wsService.connect(id);
    } catch (e) {
      console.error('Failed to load simulation:', e);
    }
  };

  const handleTogglePause = () => {
    if (isPaused) {
      wsService.resume();
      setPaused(false);
    } else {
      wsService.pause();
      setPaused(true);
    }
  };

  const handleStep = () => {
    wsService.step(1);
  };

  const handleTimeScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const scale = parseFloat(e.target.value);
    setTimeScale(scale);
    wsService.setTimeScale(scale);
  };

  const handleExport = (format: 'json' | 'csv') => {
    if (currentSimulationId) {
      if (format === 'json') {
        apiService.exportJSON(currentSimulationId);
      } else {
        apiService.exportCSV(currentSimulationId);
      }
    }
  };

  return (
    <div style={sidebarStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>🌌 N-Body 模拟</h1>
      </div>

      <div style={tabsStyle}>
        <div style={tabStyle(activeTab === 'simulations')} onClick={() => setActiveTab('simulations')}>
          模拟
        </div>
        <div style={tabStyle(activeTab === 'settings')} onClick={() => setActiveTab('settings')}>
          设置
        </div>
        <div style={tabStyle(activeTab === 'export')} onClick={() => setActiveTab('export')}>
          导出
        </div>
      </div>

      <div style={contentStyle}>
        {activeTab === 'simulations' && (
          <>
            {currentSimulationId && currentState && (
              <div style={cardStyle}>
                <div style={{ ...labelStyle, marginBottom: '12px' }}>
                  当前状态: Step {currentState.step} | Time {currentState.time.toFixed(2)}
                </div>

                <button
                  style={buttonStyle}
                  onClick={handleTogglePause}
                >
                  {isPaused ? '▶ 继续' : '⏸ 暂停'}
                </button>

                <button
                  style={secondaryButtonStyle}
                  onClick={handleStep}
                >
                  ⏭ 单步
                </button>

                <div style={{ marginTop: '16px' }}>
                  <div style={labelStyle}>时间尺度: {timeScale.toFixed(2)}x</div>
                  <input
                    type="range"
                    min="0.1"
                    max="10"
                    step="0.1"
                    value={timeScale}
                    onChange={handleTimeScaleChange}
                    style={sliderStyle}
                  />
                </div>

                <div style={{ marginTop: '16px' }}>
                  <div style={labelStyle}>天体数量: {currentState.bodies.length}</div>
                </div>
              </div>
            )}

            <div style={cardStyle}>
              <h3 style={{ fontSize: '14px', marginBottom: '12px', color: '#fff' }}>快速预设</h3>
              {presets.map((preset: any) => (
                <div
                  key={preset.name}
                  style={presetItemStyle}
                  onClick={() => handleCreateFromPreset(preset.name)}
                >
                  <div style={{ fontWeight: '500', color: '#fff', marginBottom: '4px' }}>
                    {presetIcons[preset.name] || '�'} {preset.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                    {preset.description}
                  </div>
                </div>
              ))}
            </div>

            {simulations.length > 0 && (
              <div style={cardStyle}>
                <h3 style={{ fontSize: '14px', marginBottom: '12px', color: '#fff' }}>已保存的模拟</h3>
                {simulations.map((sim: any) => (
                  <div
                    key={sim.id}
                    style={{
                      ...presetItemStyle,
                      background: currentSimulationId === sim.id
                        ? 'rgba(100, 150, 255, 0.2)'
                        : 'rgba(0, 0, 0, 0.3)'
                    }}
                    onClick={() => loadSimulation(sim.id)}
                  >
                    <div style={{ fontWeight: '500', color: '#fff' }}>{sim.name}</div>
                    <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)' }}>
                      ID: {sim.id}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'settings' && (
          <>
            <div style={cardStyle}>
              <h3 style={{ fontSize: '14px', marginBottom: '12px', color: '#fff' }}>视图设置</h3>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={viewSettings.showTrails}
                    onChange={(e) => setViewSettings({ showTrails: e.target.checked })}
                    style={{ marginRight: '8px' }}
                  />
                  <span style={{ fontSize: '13px' }}>显示轨迹</span>
                </label>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={(viewSettings as any).showHabitableZone || false}
                    onChange={(e) => setViewSettings({ showHabitableZone: e.target.checked } as any)}
                    style={{ marginRight: '8px' }}
                  />
                  <span style={{ fontSize: '13px' }}>🌍 显示宜居带</span>
                </label>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={labelStyle}>轨迹长度: {viewSettings.trailLength}</div>
                <input
                  type="range"
                  min="10"
                  max="200"
                  step="10"
                  value={viewSettings.trailLength}
                  onChange={(e) => setViewSettings({ trailLength: parseInt(e.target.value) })}
                  style={sliderStyle}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={labelStyle}>粒子缩放: {viewSettings.particleScale.toFixed(1)}x</div>
                <input
                  type="range"
                  min="0.1"
                  max="5"
                  step="0.1"
                  value={viewSettings.particleScale}
                  onChange={(e) => setViewSettings({ particleScale: parseFloat(e.target.value) })}
                  style={sliderStyle}
                />
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={{ fontSize: '14px', marginBottom: '12px', color: '#fff' }}>背景颜色</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['#000008', '#0a0a20', '#001010', '#1a0a0a'].map((color) => (
                  <div
                    key={color}
                    onClick={() => setViewSettings({ background: color })}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '4px',
                      background: color,
                      border: viewSettings.background === color ? '2px solid #64b5f6' : '2px solid transparent',
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={{ fontSize: '14px', marginBottom: '12px', color: '#fff' }}>🌀 相对论修正</h3>
              <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', lineHeight: '1.5' }}>
                1PN 一阶后牛顿修正可用于模拟水星近日点进动等相对论效应。
                此修正仅在使用相对论预设时自动启用。
              </div>
            </div>
          </>
        )}

        {activeTab === 'export' && (
          <>
            <div style={cardStyle}>
              <h3 style={{ fontSize: '14px', marginBottom: '12px', color: '#fff' }}>导出数据</h3>

              <button
                style={buttonStyle}
                onClick={() => handleExport('json')}
                disabled={!currentSimulationId}
              >
                📄 导出 JSON
              </button>

              <button
                style={secondaryButtonStyle}
                onClick={() => handleExport('csv')}
                disabled={!currentSimulationId}
              >
                📊 导出 CSV
              </button>

              {!currentSimulationId && (
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '12px' }}>
                  请先加载或创建一个模拟
                </div>
              )}
            </div>

            {currentState && (
              <div style={cardStyle}>
                <h3 style={{ fontSize: '14px', marginBottom: '12px', color: '#fff' }}>当前信息</h3>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)', lineHeight: '1.8' }}>
                  <div>步数: {currentState.step}</div>
                  <div>时间: {currentState.time.toExponential(2)} s</div>
                  <div>天体数: {currentState.bodies.length}</div>
                  <div>历史记录: {currentState.history.length} 步</div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
