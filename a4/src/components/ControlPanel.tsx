interface ControlPanelProps {
  isRunning: boolean;
  onToggleRun: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  onReset: () => void;
  showHeatmap: boolean;
  onToggleHeatmap: () => void;
  exportStatus: 'idle' | 'syncing' | 'success' | 'error';
  exportMessage: string;
}

function ControlPanel({
  isRunning,
  onToggleRun,
  speed,
  onSpeedChange,
  onReset,
  showHeatmap,
  onToggleHeatmap,
  exportStatus,
  exportMessage,
}: ControlPanelProps) {
  const getStatusIcon = () => {
    switch (exportStatus) {
      case 'syncing': return '🔄';
      case 'success': return '✅';
      case 'error': return '❌';
      default: return '📦';
    }
  }

  return (
    <div className="panel">
      <div className="panel-title">
        <span>🎮 控制面板</span>
      </div>

      <div className="control-row">
        <button
          className={`btn ${isRunning ? 'btn-primary' : 'btn-success'}`}
          onClick={onToggleRun}
        >
          {isRunning ? (
            <>⏸️ 暂停仿真</>
          ) : (
            <>▶️ 启动仿真</>
          )}
        </button>
      </div>

      <div className="control-row">
        <label className="control-label">
          传送带速度: {speed.toFixed(1)}x
        </label>
        <input
          type="range"
          className="speed-slider"
          min="0.1"
          max="5"
          step="0.1"
          value={speed}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
        />
        <div className="speed-value">
          <span>0.1x</span>
          <span>5x</span>
        </div>
      </div>

      <div className="control-row">
        <div className="heatmap-control">
          <label className="control-label" style={{ marginBottom: 0 }}>
            🔥 3D 热力图
          </label>
          <div 
            className={`toggle-switch ${showHeatmap ? 'active' : ''}`}
            onClick={onToggleHeatmap}
          />
        </div>
      </div>

      {exportStatus !== 'idle' && (
        <div className={`export-status ${exportStatus}`}>
          <span>{getStatusIcon()}</span>
          <span>{exportMessage}</span>
        </div>
      )}

      <div className="control-row">
        <button className="btn btn-danger" onClick={onReset}>
          🔄 重置统计
        </button>
      </div>
    </div>
  )
}

export default ControlPanel
