import { StationState } from '../types'

interface StatusPanelProps {
  stationStates: StationState[]
  stationConfigs: { id: number; processTime: number }[]
  onProcessTimeChange: (stationId: number, value: number) => void
}

function StatusPanel({
  stationStates,
  stationConfigs,
  onProcessTimeChange,
}: StatusPanelProps) {
  const stationColors = ['#ef5350', '#42a5f5', '#66bb6a']

  const getStatus = (state: StationState) => {
    if (state.isProcessing) return 'working'
    if (state.queue.length > 0) return 'waiting'
    return 'idle'
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'working': return '处理中'
      case 'waiting': return '有等待'
      default: return '空闲'
    }
  }

  return (
    <div className="panel">
      <div className="panel-title">
        <span>📊 工位状态</span>
      </div>

      {stationConfigs.map((config, index) => {
        const state = stationStates[index]
        const status = state ? getStatus(state) : 'idle'
        
        return (
          <div
            key={config.id}
            className={`station-card ${status === 'working' ? 'active' : ''}`}
            style={{
              borderLeft: `4px solid ${stationColors[index]}`,
            }}
          >
            <div className="station-header">
              <span className="station-name">
                工位 {config.id + 1}
              </span>
              <span className={`station-status ${status}`}>
                {getStatusText(status)}
              </span>
            </div>

            <div className="station-stats">
              <div className="stat-item">
                <div className="stat-value">
                  {state ? `${(state.utilization * 100).toFixed(1)}%` : '0.0%'}
                </div>
                <div className="stat-label">利用率</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">
                  {state ? state.queue.length : 0}
                </div>
                <div className="stat-label">等待队列</div>
              </div>
            </div>

            <div className="control-row">
              <label className="control-label">处理时间</label>
              <div className="input-group">
                <input
                  type="number"
                  className="process-time-input"
                  min="500"
                  max="10000"
                  step="100"
                  value={config.processTime}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 500
                    onProcessTimeChange(config.id, Math.max(500, Math.min(10000, val)))
                  }}
                />
                <span className="unit">毫秒</span>
              </div>
            </div>

            {state && state.isProcessing && (
              <div className="control-row">
                <label className="control-label">
                  剩余处理时间: {(state.remainingTime / 1000).toFixed(1)}s
                </label>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default StatusPanel
