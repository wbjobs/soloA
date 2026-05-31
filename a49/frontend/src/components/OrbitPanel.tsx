import { useSimulationStore } from '../store/simulationStore';
import { useUiStore } from '../store/uiStore';

const panelStyle = {
  position: 'absolute' as const,
  right: 0,
  top: 0,
  bottom: 0,
  width: '280px',
  background: 'rgba(10, 15, 30, 0.95)',
  borderLeft: '1px solid rgba(100, 150, 255, 0.2)',
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
  fontSize: '16px',
  fontWeight: 'bold' as const,
  color: '#64b5f6',
  margin: 0
};

const contentStyle = {
  flex: 1,
  overflowY: 'auto' as const,
  padding: '16px'
};

const cardStyle = {
  background: 'rgba(30, 40, 70, 0.5)',
  borderRadius: '8px',
  padding: '12px',
  marginBottom: '12px',
  border: '1px solid rgba(100, 150, 255, 0.15)'
};

const labelStyle = {
  fontSize: '11px',
  color: 'rgba(255, 255, 255, 0.5)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  marginBottom: '2px'
};

const valueStyle = {
  fontSize: '13px',
  color: '#fff',
  fontFamily: 'monospace' as const
};

const bodyItemStyle = (selected: boolean) => ({
  padding: '10px 12px',
  background: selected ? 'rgba(100, 150, 255, 0.2)' : 'rgba(0, 0, 0, 0.3)',
  borderRadius: '6px',
  marginBottom: '6px',
  cursor: 'pointer',
  border: selected ? '1px solid rgba(100, 150, 255, 0.5)' : '1px solid rgba(100, 150, 255, 0.1)',
  display: 'flex',
  alignItems: 'center',
  gap: '10px'
});

const closeBtnStyle = {
  background: 'none',
  border: 'none',
  color: 'rgba(255, 255, 255, 0.6)',
  fontSize: '20px',
  cursor: 'pointer',
  padding: '0',
  width: '28px',
  height: '28px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

export function OrbitPanel() {
  const { currentState, cameraTarget, setCameraTarget } = useSimulationStore();
  const { showOrbitPanel, setShowOrbitPanel, selectedBodyIndex, setSelectedBodyIndex } = useUiStore();

  if (!showOrbitPanel || !currentState) return null;

  const bodies = currentState.bodies;
  const selectedBody = bodies[selectedBodyIndex];

  const handleSelectBody = (index: number) => {
    setSelectedBodyIndex(index);
  };

  const handleFollowBody = (index: number) => {
    setCameraTarget({
      mode: 'follow',
      followBodyIndex: index
    });
  };

  const handleFreeCamera = () => {
    setCameraTarget({
      mode: 'free',
      followBodyIndex: -1
    });
  };

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <h2 style={titleStyle}>📊 轨道参数</h2>
        <button
          style={closeBtnStyle}
          onClick={() => setShowOrbitPanel(false)}
        >
          ×
        </button>
      </div>

      <div style={contentStyle}>
        <div style={cardStyle}>
          <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '10px', color: '#fff' }}>
            天体列表 ({bodies.length})
          </div>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {bodies.map((body, index) => (
              <div
                key={index}
                style={bodyItemStyle(selectedBodyIndex === index)}
                onClick={() => handleSelectBody(index)}
              >
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: body.color,
                    boxShadow: `0 0 8px ${body.color}`
                  }}
                />
                <div style={{ flex: 1, fontSize: '13px' }}>{body.name}</div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFollowBody(index);
                  }}
                  style={{
                    background: cameraTarget.mode === 'follow' && cameraTarget.followBodyIndex === index
                      ? 'rgba(100, 150, 255, 0.3)'
                      : 'rgba(100, 150, 255, 0.1)',
                    border: 'none',
                    color: '#64b5f6',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  👁
                </button>
              </div>
            ))}
          </div>

          {cameraTarget.mode === 'follow' && (
            <button
              onClick={handleFreeCamera}
              style={{
                width: '100%',
                marginTop: '8px',
                padding: '8px',
                background: 'rgba(255, 100, 100, 0.2)',
                border: '1px solid rgba(255, 100, 100, 0.3)',
                borderRadius: '4px',
                color: '#ff6b6b',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              🔓 解锁自由视角
            </button>
          )}
        </div>

        {selectedBody && (
          <div style={cardStyle}>
            <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '12px', color: '#fff' }}>
              {selectedBody.name}
            </div>

            <div style={{ marginBottom: '10px' }}>
              <div style={labelStyle}>质量</div>
              <div style={valueStyle}>{selectedBody.mass.toExponential(2)} kg</div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <div style={labelStyle}>半径</div>
              <div style={valueStyle}>{selectedBody.radius.toExponential(2)} m</div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <div style={labelStyle}>位置 X</div>
              <div style={valueStyle}>{selectedBody.position.x.toExponential(2)} m</div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <div style={labelStyle}>位置 Y</div>
              <div style={valueStyle}>{selectedBody.position.y.toExponential(2)} m</div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <div style={labelStyle}>位置 Z</div>
              <div style={valueStyle}>{selectedBody.position.z.toExponential(2)} m</div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <div style={labelStyle}>速度 X</div>
              <div style={valueStyle}>{selectedBody.velocity.x.toFixed(2)} m/s</div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <div style={labelStyle}>速度 Y</div>
              <div style={valueStyle}>{selectedBody.velocity.y.toFixed(2)} m/s</div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <div style={labelStyle}>速度 Z</div>
              <div style={valueStyle}>{selectedBody.velocity.z.toFixed(2)} m/s</div>
            </div>

            <div>
              <div style={labelStyle}>速度大小</div>
              <div style={valueStyle}>
                {Math.sqrt(
                  selectedBody.velocity.x ** 2 +
                  selectedBody.velocity.y ** 2 +
                  selectedBody.velocity.z ** 2
                ).toFixed(2)} m/s
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
