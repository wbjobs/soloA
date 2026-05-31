import { useState } from 'react'
import api, { SimulationReport } from '../services/api'

interface ReportPanelProps {
  currentSessionId: number | null
  onShowReport?: (report: SimulationReport) => void
}

function ReportPanel({ currentSessionId, onShowReport }: ReportPanelProps) {
  const [sessions, setSessions] = useState<any[]>([])
  const [selectedSession, setSelectedSession] = useState<number | null>(null)
  const [report, setReport] = useState<SimulationReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPanel, setShowPanel] = useState(false)

  const loadSessions = async () => {
    setLoading(true)
    try {
      const data = await api.getSessions()
      setSessions(data)
    } catch (error) {
      console.error('Failed to load sessions:', error)
    }
    setLoading(false)
  }

  const loadReport = async (sessionId: number) => {
    setLoading(true)
    try {
      const data = await api.getReport(sessionId)
      if (data) {
        setReport(data)
        setSelectedSession(sessionId)
        if (onShowReport) onShowReport(data)
      }
    } catch (error) {
      console.error('Failed to load report:', error)
    }
    setLoading(false)
  }

  const handleToggle = () => {
    setShowPanel(!showPanel)
    if (!showPanel) {
      loadSessions()
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return '#ef5350'
      case 'medium': return '#ffa726'
      default: return '#66bb6a'
    }
  }

  const getUtilizationColor = (util: number) => {
    if (util >= 80) return '#ef5350'
    if (util >= 60) return '#ffa726'
    if (util >= 40) return '#ffee58'
    return '#66bb6a'
  }

  return (
    <>
      <div className="panel">
        <div className="panel-title">
          <span>📊 数据分析</span>
        </div>
        
        <div className="control-row">
          <button 
            className="btn btn-primary"
            onClick={handleToggle}
          >
            {showPanel ? '关闭报告' : '查看分析报告'}
          </button>
        </div>

        {currentSessionId && (
          <div className="control-row">
            <button 
              className="btn btn-success"
              onClick={() => loadReport(currentSessionId)}
            >
              生成当前会话报告
            </button>
          </div>
        )}
      </div>

      {showPanel && (
        <div className="panel report-panel">
          <div className="panel-title">
            <span>📈 仿真报告</span>
          </div>

          <div className="control-row">
            <label className="control-label">选择历史会话</label>
            <select 
              className="process-time-input"
              value={selectedSession || ''}
              onChange={(e) => e.target.value && loadReport(parseInt(e.target.value))}
            >
              <option value="">-- 选择会话 --</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>
                  会话 #{s.id} - {new Date(s.start_time).toLocaleString()}
                  ({s.completed_balls}/{s.total_balls} 个物料)
                </option>
              ))}
            </select>
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: '20px', color: '#4fc3f7' }}>
              ⏳ 加载中...
            </div>
          )}

          {report && !loading && (
            <div className="report-content">
              <div className="report-section">
                <h4>会话信息</h4>
                <div className="stat-grid">
                  <div className="stat-item">
                    <div className="stat-value">#{report.sessionId}</div>
                    <div className="stat-label">会话ID</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">
                      {report.sessionInfo.duration 
                        ? `${(report.sessionInfo.duration / 60).toFixed(1)}分钟` 
                        : '进行中'}
                    </div>
                    <div className="stat-label">持续时间</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">
                      {report.sessionInfo.completedBalls}/{report.sessionInfo.totalBalls}
                    </div>
                    <div className="stat-label">完成/总数</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">
                      {report.sessionInfo.completionRate.toFixed(1)}%
                    </div>
                    <div className="stat-label">完成率</div>
                  </div>
                </div>
              </div>

              <div className="report-section">
                <h4>总体统计</h4>
                <div className="stat-grid">
                  <div className="stat-item">
                    <div 
                      className="stat-value"
                      style={{ color: getUtilizationColor(report.summary.avgUtilization) }}
                    >
                      {report.summary.avgUtilization.toFixed(1)}%
                    </div>
                    <div className="stat-label">平均利用率</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">{report.summary.totalProcessed}</div>
                    <div className="stat-label">总处理数</div>
                  </div>
                  <div className="stat-item">
                    <div 
                      className="stat-value"
                      style={{ color: getUtilizationColor(report.summary.bottleneckUtilization) }}
                    >
                      工位 {report.summary.bottleneckStation + 1}
                    </div>
                    <div className="stat-label">瓶颈工位</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">
                      {(report.summary.avgWaitTime / 1000).toFixed(2)}s
                    </div>
                    <div className="stat-label">平均等待</div>
                  </div>
                </div>
              </div>

              <div className="report-section">
                <h4>工位详情</h4>
                {report.stationDetails.map((station, index) => (
                  <div key={index} className="station-card">
                    <div className="station-header">
                      <span className="station-name">工位 {station.stationId + 1}</span>
                      <span 
                        className="station-status working"
                        style={{ 
                          background: `${getUtilizationColor(station.utilization)}33`,
                          color: getUtilizationColor(station.utilization)
                        }}
                      >
                        {station.utilization.toFixed(1)}% 利用率
                      </span>
                    </div>
                    <div className="station-stats">
                      <div className="stat-item">
                        <div className="stat-value">{station.totalProcessed}</div>
                        <div className="stat-label">处理数量</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{station.maxQueueLength}</div>
                        <div className="stat-label">最大队列</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{(station.avgWaitTime / 1000).toFixed(2)}s</div>
                        <div className="stat-label">平均等待</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-value">{(station.processTime / 1000).toFixed(1)}s</div>
                        <div className="stat-label">处理时间</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {report.recommendations.length > 0 && (
                <div className="report-section">
                  <h4>💡 优化建议</h4>
                  {report.recommendations.map((rec, index) => (
                    <div 
                      key={index} 
                      className="recommendation"
                      style={{ borderLeftColor: getPriorityColor(rec.priority) }}
                    >
                      <div 
                        className="rec-priority"
                        style={{ background: getPriorityColor(rec.priority) }}
                      >
                        {rec.priority === 'high' ? '高' : rec.priority === 'medium' ? '中' : '低'}
                      </div>
                      <div className="rec-message">{rec.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}

export default ReportPanel
