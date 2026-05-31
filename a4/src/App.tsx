import { useState, useCallback, useRef } from 'react'
import FactoryScene from './components/FactoryScene'
import ControlPanel from './components/ControlPanel'
import StatusPanel from './components/StatusPanel'
import ReportPanel from './components/ReportPanel'
import { StationState } from './types'
import api from './services/api'
import './App.css'

type ExportStatus = 'idle' | 'syncing' | 'success' | 'error'

function App() {
  const [isRunning, setIsRunning] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [exportStatus, setExportStatus] = useState<ExportStatus>('idle')
  const [exportMessage, setExportMessage] = useState('')
  
  const [stationConfigs, setStationConfigs] = useState([
    { id: 0, processTime: 2000 },
    { id: 1, processTime: 3000 },
    { id: 2, processTime: 1500 },
  ])
  const [stationStates, setStationStates] = useState<StationState[]>([])
  const [totalBalls, setTotalBalls] = useState(0)
  const [completedBalls, setCompletedBalls] = useState(0)

  const sessionStartRef = useRef(false)

  const handleStationStatesUpdate = useCallback((states: StationState[]) => {
    setStationStates(states)
  }, [])

  const handleBallCreated = useCallback(() => {
    setTotalBalls(prev => prev + 1)
  }, [])

  const handleBallCompleted = useCallback(() => {
    setCompletedBalls(prev => prev + 1)
  }, [])

  const handleProcessTimeChange = useCallback((stationId: number, value: number) => {
    setStationConfigs(prev => 
      prev.map(s => s.id === stationId ? { ...s, processTime: value } : s)
    )
  }, [])

  const handleReset = useCallback(() => {
    setTotalBalls(0)
    setCompletedBalls(0)
    sessionStartRef.current = false
  }, [])

  const handleToggleRun = useCallback(async () => {
    const newRunning = !isRunning
    
    if (newRunning && !sessionStartRef.current) {
      try {
        const newSessionId = await api.createSession(speed)
        setSessionId(newSessionId)
        sessionStartRef.current = true
        setExportStatus('success')
        setExportMessage(`会话 #${newSessionId} 已创建`)
      } catch (error) {
        console.error('Failed to create session:', error)
        setExportStatus('error')
        setExportMessage('无法连接到后端服务器')
      }
    } else if (!newRunning && sessionId !== null) {
      try {
        await api.completeSession(sessionId, totalBalls, completedBalls)
        setExportStatus('success')
        setExportMessage(`会话 #${sessionId} 已完成`)
      } catch (error) {
        console.error('Failed to complete session:', error)
      }
    }

    setIsRunning(newRunning)
  }, [isRunning, sessionId, speed, totalBalls, completedBalls])

  const handleExportStatus = useCallback((status: ExportStatus, message?: string) => {
    setExportStatus(status)
    if (message) {
      setExportMessage(message)
    }
  }, [])

  const handleSessionCreated = useCallback((id: number) => {
    setSessionId(id)
  }, [])

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🏭 3D 工厂仿真系统</h1>
        <div className="header-stats">
          <span>总物料: {totalBalls}</span>
          <span>已完成: {completedBalls}</span>
          {sessionId && (
            <span style={{ background: 'rgba(102, 187, 106, 0.1)', borderColor: 'rgba(102, 187, 106, 0.3)', color: '#66bb6a' }}>
              会话 #{sessionId}
            </span>
          )}
        </div>
      </header>

      <main className="app-main">
        <FactoryScene
          isRunning={isRunning}
          speed={speed}
          stationConfigs={stationConfigs}
          showHeatmap={showHeatmap}
          sessionId={sessionId}
          onSessionCreated={handleSessionCreated}
          onStationStatesUpdate={handleStationStatesUpdate}
          onBallCreated={handleBallCreated}
          onBallCompleted={handleBallCompleted}
          onExportStatus={handleExportStatus}
        />
      </main>

      <aside className="sidebar">
        <ControlPanel
          isRunning={isRunning}
          onToggleRun={handleToggleRun}
          speed={speed}
          onSpeedChange={setSpeed}
          onReset={handleReset}
          showHeatmap={showHeatmap}
          onToggleHeatmap={() => setShowHeatmap(prev => !prev)}
          exportStatus={exportStatus}
          exportMessage={exportMessage}
        />
        
        <StatusPanel
          stationStates={stationStates}
          stationConfigs={stationConfigs}
          onProcessTimeChange={handleProcessTimeChange}
        />

        <ReportPanel currentSessionId={sessionId} />
      </aside>
    </div>
  )
}

export default App
