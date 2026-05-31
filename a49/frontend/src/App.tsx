import { useState } from 'react';
import { Scene3D } from './components/Scene3D';
import { Sidebar } from './components/Sidebar';
import { OrbitPanel } from './components/OrbitPanel';
import { useUiStore } from './store/uiStore';

const headerBarStyle = {
  position: 'absolute' as const,
  top: '12px',
  right: '300px',
  display: 'flex',
  gap: '8px',
  zIndex: 200
};

const headerButtonStyle = {
  padding: '8px 16px',
  background: 'rgba(10, 15, 30, 0.9)',
  border: '1px solid rgba(100, 150, 255, 0.3)',
  borderRadius: '6px',
  color: '#64b5f6',
  fontSize: '13px',
  cursor: 'pointer',
  backdropFilter: 'blur(10px)'
};

function App() {
  const { showOrbitPanel, setShowOrbitPanel } = useUiStore();

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Scene3D />

      <Sidebar />

      <div style={headerBarStyle}>
        <button
          style={headerButtonStyle}
          onClick={() => setShowOrbitPanel(!showOrbitPanel)}
        >
          {showOrbitPanel ? '隐藏参数面板' : '📊 轨道参数'}
        </button>
      </div>

      <OrbitPanel />
    </div>
  );
}

export default App;
