import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useSimulationStore } from '../store/useSimulationStore'
import { simulationApi, animationApi } from '../api/client'
import { WavefieldVisualization } from '../components/WavefieldVisualization'
import { SeismogramChart } from '../components/SeismogramChart'
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Activity,
  Settings,
  MapPin,
  Layers,
  AlertCircle,
  Download,
  Video,
} from 'lucide-react'
import type { SeismogramPoint, AnimationRequest } from '../types'

export function SimulationDetail() {
  const { id } = useParams<{ id: string }>()
  const {
    selectedTask,
    snapshotInfo,
    currentSnapshot,
    isLoading,
    fetchTask,
    fetchSnapshots,
    fetchSnapshot,
    pollProgress,
  } = useSimulationStore()

  const [currentFrame, setCurrentFrame] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(200)
  const [fieldType, setFieldType] = useState<'magnitude' | 'ux' | 'uy'>('magnitude')
  const [seismogram, setSeismogram] = useState<SeismogramPoint | null>(null)
  const [showSeismogram, setShowSeismogram] = useState(false)

  const [showAnimationDialog, setShowAnimationDialog] = useState(false)
  const [animationTaskId, setAnimationTaskId] = useState<string | null>(null)
  const [animationProgress, setAnimationProgress] = useState(0)
  const [animationStatus, setAnimationStatus] = useState<string>('')
  const [animationError, setAnimationError] = useState<string | null>(null)
  const [animationConfig, setAnimationConfig] = useState<AnimationRequest>({
    width: 800,
    height: 600,
    fps: 24,
    format: 'mp4',
    colormap: 'viridis',
    field_type: 'magnitude',
    include_time_label: true,
    include_colorbar: true,
    quality: 85
  })

  const taskId = id ? parseInt(id) : 0

  useEffect(() => {
    if (taskId) {
      fetchTask(taskId)
      const cleanup = pollProgress(taskId)
      return cleanup
    }
  }, [taskId])

  useEffect(() => {
    if (selectedTask?.status === 'completed' && !snapshotInfo) {
      fetchSnapshots(taskId)
    }
  }, [selectedTask?.status, taskId])

  useEffect(() => {
    if (snapshotInfo && snapshotInfo.n_snapshots > 0 && !currentSnapshot) {
      fetchSnapshot(taskId, 0)
    }
  }, [snapshotInfo])

  useEffect(() => {
    if (!isPlaying || !snapshotInfo) return

    const interval = setInterval(() => {
      setCurrentFrame((prev) => {
        const next = prev + 1
        if (next >= snapshotInfo.n_snapshots) {
          setIsPlaying(false)
          return 0
        }
        fetchSnapshot(taskId, next)
        return next
      })
    }, playbackSpeed)

    return () => clearInterval(interval)
  }, [isPlaying, snapshotInfo, playbackSpeed, taskId])

  const handleJumpToFrame = useCallback(
    (frame: number) => {
      if (snapshotInfo && frame >= 0 && frame < snapshotInfo.n_snapshots) {
        setCurrentFrame(frame)
        fetchSnapshot(taskId, frame)
      }
    },
    [snapshotInfo, taskId]
  )

  const loadSeismogram = async () => {
    if (!selectedTask) return

    const x = selectedTask.source_params.x
    const y = selectedTask.source_params.y + 200

    try {
      const result = await simulationApi.getSeismograms(taskId, [[x, y]])
      if (result.seismograms.length > 0) {
        setSeismogram(result.seismograms[0])
        setShowSeismogram(true)
      }
    } catch (err) {
      console.error('Failed to load seismogram:', err)
    }
  }

  const startAnimationExport = async () => {
    if (!selectedTask) return

    try {
      setAnimationError(null)
      const result = await animationApi.export(taskId, animationConfig)
      setAnimationTaskId(result.task_id)
      setAnimationStatus(result.status)
    } catch (err: any) {
      setAnimationError(err.response?.data?.detail || 'Failed to start animation export')
      console.error('Failed to start animation export:', err)
    }
  }

  useEffect(() => {
    if (!animationTaskId) return

    const pollInterval = setInterval(async () => {
      try {
        const result = await animationApi.getProgress(animationTaskId)
        setAnimationProgress(result.progress)
        setAnimationStatus(result.status)

        if (result.status === 'completed' || result.status === 'failed') {
          clearInterval(pollInterval)
          if (result.status === 'failed') {
            setAnimationError(result.message || 'Animation export failed')
          }
        }
      } catch (err) {
        console.error('Failed to get animation progress:', err)
      }
    }, 1000)

    return () => clearInterval(pollInterval)
  }, [animationTaskId])

  const downloadAnimation = () => {
    if (animationTaskId) {
      window.open(animationApi.getDownloadUrl(animationTaskId), '_blank')
    }
  }

  const statusConfig = {
    pending: { color: 'text-yellow-400 bg-yellow-400/10', label: 'Pending' },
    running: { color: 'text-blue-400 bg-blue-400/10', label: 'Running' },
    completed: { color: 'text-green-400 bg-green-400/10', label: 'Completed' },
    failed: { color: 'text-red-400 bg-red-400/10', label: 'Failed' },
    cancelled: { color: 'text-gray-400 bg-gray-400/10', label: 'Cancelled' },
  }

  if (!selectedTask) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Loading simulation...</div>
      </div>
    )
  }

  const status = statusConfig[selectedTask.status]

  return (
    <div className="space-y-6">
      <div className="bg-seismic-card rounded-xl border border-seismic-border p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">{selectedTask.name}</h2>
            <p className="text-gray-400 mt-1">Simulation #{selectedTask.id}</p>
          </div>
          <span
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium ${status.color}`}
          >
            <Activity className="w-4 h-4" />
            {status.label}
          </span>
        </div>

        {selectedTask.status === 'running' && (
          <div className="mt-6">
            <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
              <span>Progress</span>
              <span>{Math.round(selectedTask.progress * 100)}%</span>
            </div>
            <div className="w-full h-3 bg-seismic-border rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 transition-all duration-300"
                style={{ width: `${selectedTask.progress * 100}%` }}
              />
            </div>
          </div>
        )}

        {selectedTask.status === 'failed' && selectedTask.error_message && (
          <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-400 font-medium">Simulation Failed</p>
              <p className="text-red-300 text-sm mt-1">{selectedTask.error_message}</p>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-seismic-card rounded-xl border border-seismic-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <Layers className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Domain</p>
              <p className="text-white font-medium">
                {selectedTask.grid_params.width}m × {selectedTask.grid_params.height}m
              </p>
            </div>
          </div>
        </div>

        <div className="bg-seismic-card rounded-xl border border-seismic-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
              <Settings className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Velocities</p>
              <p className="text-white font-medium">
                Vp: {selectedTask.material_params.vp} m/s
              </p>
            </div>
          </div>
        </div>

        <div className="bg-seismic-card rounded-xl border border-seismic-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-500/10 rounded-lg flex items-center justify-center">
              <MapPin className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Source</p>
              <p className="text-white font-medium">
                ({selectedTask.source_params.x}, {selectedTask.source_params.y})
              </p>
            </div>
          </div>
        </div>

        <div className="bg-seismic-card rounded-xl border border-seismic-border p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-400">Duration</p>
              <p className="text-white font-medium">
                {selectedTask.solver_params.total_time}s
              </p>
            </div>
          </div>
        </div>
      </div>

      {selectedTask.status === 'completed' && currentSnapshot && (
        <>
          <div className="bg-seismic-card rounded-xl border border-seismic-border overflow-hidden">
            <div className="p-4 border-b border-seismic-border flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold text-white">Wavefield Visualization</h3>
                <select
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value as any)}
                  className="px-3 py-1 bg-seismic-dark border border-seismic-border rounded-lg text-sm text-white focus:outline-none"
                >
                  <option value="magnitude">Magnitude</option>
                  <option value="ux">X Displacement</option>
                  <option value="uy">Y Displacement</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-400">
                  Time: {currentSnapshot.time.toFixed(4)}s
                </div>
                <button
                  onClick={() => setShowAnimationDialog(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm transition-colors"
                >
                  <Video className="w-4 h-4" />
                  Export Animation
                </button>
              </div>
            </div>

            <div className="aspect-video bg-seismic-dark">
              <WavefieldVisualization snapshot={currentSnapshot} fieldType={fieldType} />
            </div>

            {snapshotInfo && (
              <div className="p-4 border-t border-seismic-border">
                <div className="flex items-center justify-center gap-4 mb-4">
                  <button
                    onClick={() => handleJumpToFrame(0)}
                    className="p-2 text-gray-400 hover:text-white hover:bg-seismic-border rounded-lg transition-colors"
                  >
                    <SkipBack className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleJumpToFrame(Math.max(0, currentFrame - 1))}
                    className="p-2 text-gray-400 hover:text-white hover:bg-seismic-border rounded-lg transition-colors"
                  >
                    <SkipBack className="w-5 h-5" style={{ transform: 'scaleX(-1)' }} />
                  </button>
                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="p-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                  >
                    {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                  </button>
                  <button
                    onClick={() =>
                      handleJumpToFrame(
                        Math.min((snapshotInfo?.n_snapshots || 1) - 1, currentFrame + 1)
                      )
                    }
                    className="p-2 text-gray-400 hover:text-white hover:bg-seismic-border rounded-lg transition-colors"
                  >
                    <SkipForward className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() =>
                      handleJumpToFrame((snapshotInfo?.n_snapshots || 1) - 1)
                    }
                    className="p-2 text-gray-400 hover:text-white hover:bg-seismic-border rounded-lg transition-colors"
                  >
                    <SkipForward className="w-5 h-5" />
                  </button>

                  <select
                    value={playbackSpeed}
                    onChange={(e) => setPlaybackSpeed(parseInt(e.target.value))}
                    className="ml-4 px-3 py-1 bg-seismic-dark border border-seismic-border rounded-lg text-sm text-white focus:outline-none"
                  >
                    <option value={500}>0.5x</option>
                    <option value={200}>1x</option>
                    <option value={100}>2x</option>
                    <option value={50}>4x</option>
                  </select>
                </div>

                <input
                  type="range"
                  min={0}
                  max={(snapshotInfo?.n_snapshots || 1) - 1}
                  value={currentFrame}
                  onChange={(e) => handleJumpToFrame(parseInt(e.target.value))}
                  className="w-full h-2 bg-seismic-border rounded-lg appearance-none cursor-pointer accent-primary-500"
                />

                <div className="flex justify-between text-sm text-gray-400 mt-2">
                  <span>Frame: {currentFrame + 1} / {snapshotInfo.n_snapshots}</span>
                  <span>
                    Time: {(snapshotInfo?.times[currentFrame] || 0).toFixed(4)}s /{' '}
                    {(snapshotInfo?.parameters.total_time || 0).toFixed(4)}s
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-seismic-card rounded-xl border border-seismic-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Seismogram</h3>
              {!showSeismogram && (
                <button
                  onClick={loadSeismogram}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm transition-colors"
                >
                  Load Seismogram
                </button>
              )}
            </div>

            {showSeismogram && seismogram ? (
              <div>
                <p className="text-sm text-gray-400 mb-4">
                  Receiver at ({seismogram.actual_x.toFixed(0)},{' '}
                  {seismogram.actual_y.toFixed(0)}) m
                </p>
                <SeismogramChart data={seismogram} />
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                Click "Load Seismogram" to view the waveform at a receiver point
              </div>
            )}
          </div>

          <div className="bg-seismic-card rounded-xl border border-seismic-border p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Simulation Parameters</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <h4 className="text-sm font-medium text-gray-400 uppercase mb-3">Grid</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Width</span>
                    <span className="text-white">{selectedTask.grid_params.width} m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Height</span>
                    <span className="text-white">{selectedTask.grid_params.height} m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Element Size</span>
                    <span className="text-white">{selectedTask.grid_params.element_size} m</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-400 uppercase mb-3">Material</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Vp</span>
                    <span className="text-white">{selectedTask.material_params.vp} m/s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Vs</span>
                    <span className="text-white">{selectedTask.material_params.vs} m/s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Density</span>
                    <span className="text-white">{selectedTask.material_params.density} kg/m³</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-400 uppercase mb-3">Source</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Frequency</span>
                    <span className="text-white">{selectedTask.source_params.frequency} Hz</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Amplitude</span>
                    <span className="text-white">{selectedTask.source_params.amplitude}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Type</span>
                    <span className="text-white">{selectedTask.source_params.source_type}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {(selectedTask.status === 'pending' || selectedTask.status === 'running') && (
        <div className="bg-seismic-card rounded-xl border border-seismic-border p-12 text-center">
          <div className="w-16 h-16 bg-primary-500/10 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Activity className="w-8 h-8 text-primary-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            {selectedTask.status === 'pending' ? 'Queued' : 'Simulation in Progress'}
          </h3>
          <p className="text-gray-400">
            {selectedTask.status === 'pending'
              ? 'Your simulation is waiting in the queue...'
              : 'Please wait while the simulation runs. This page will update automatically.'}
          </p>
          <p className="text-gray-500 text-sm mt-4">
            Progress: {Math.round(selectedTask.progress * 100)}%
          </p>
        </div>
      )}

      {showAnimationDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-seismic-card rounded-xl border border-seismic-border p-6 max-w-lg w-full mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">Export Animation</h3>
              <button
                onClick={() => setShowAnimationDialog(false)}
                className="text-gray-400 hover:text-white"
              >
                ×
              </button>
            </div>

            {animationError && (
              <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">
                {animationError}
              </div>
            )}

            {animationTaskId ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-primary-500 animate-pulse" />
                  <span className="text-white capitalize">{animationStatus}</span>
                </div>
                <div className="w-full h-3 bg-seismic-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 transition-all duration-300"
                    style={{ width: `${animationProgress * 100}%` }}
                  />
                </div>
                <p className="text-sm text-gray-400">
                  Progress: {Math.round(animationProgress * 100)}%
                </p>
                {animationStatus === 'completed' && (
                  <button
                    onClick={downloadAnimation}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download Animation
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Width</label>
                    <input
                      type="number"
                      value={animationConfig.width}
                      onChange={(e) => setAnimationConfig({ ...animationConfig, width: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Height</label>
                    <input
                      type="number"
                      value={animationConfig.height}
                      onChange={(e) => setAnimationConfig({ ...animationConfig, height: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">FPS</label>
                    <input
                      type="number"
                      value={animationConfig.fps}
                      onChange={(e) => setAnimationConfig({ ...animationConfig, fps: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Quality (0-100)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={animationConfig.quality}
                      onChange={(e) => setAnimationConfig({ ...animationConfig, quality: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Format</label>
                  <select
                    value={animationConfig.format}
                    onChange={(e) => setAnimationConfig({ ...animationConfig, format: e.target.value as any })}
                    className="w-full px-3 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:border-primary-500"
                  >
                    <option value="mp4">MP4 (H.264)</option>
                    <option value="webm">WebM (VP9)</option>
                    <option value="gif">GIF</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Colormap</label>
                  <select
                    value={animationConfig.colormap}
                    onChange={(e) => setAnimationConfig({ ...animationConfig, colormap: e.target.value as any })}
                    className="w-full px-3 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:border-primary-500"
                  >
                    <option value="viridis">Viridis</option>
                    <option value="seismic">Seismic</option>
                    <option value="jet">Jet</option>
                    <option value="hot">Hot</option>
                    <option value="cool">Cool</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-1">Field Type</label>
                  <select
                    value={animationConfig.field_type}
                    onChange={(e) => setAnimationConfig({ ...animationConfig, field_type: e.target.value })}
                    className="w-full px-3 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:border-primary-500"
                  >
                    <option value="magnitude">Magnitude</option>
                    <option value="ux">X Displacement</option>
                    <option value="uy">Y Displacement</option>
                  </select>
                </div>

                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-400">
                    <input
                      type="checkbox"
                      checked={animationConfig.include_time_label}
                      onChange={(e) => setAnimationConfig({ ...animationConfig, include_time_label: e.target.checked })}
                      className="rounded border-seismic-border text-primary-500 focus:ring-primary-500"
                    />
                    Time Label
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-400">
                    <input
                      type="checkbox"
                      checked={animationConfig.include_colorbar}
                      onChange={(e) => setAnimationConfig({ ...animationConfig, include_colorbar: e.target.checked })}
                      className="rounded border-seismic-border text-primary-500 focus:ring-primary-500"
                    />
                    Colorbar
                  </label>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setShowAnimationDialog(false)}
                    className="flex-1 px-4 py-2 bg-seismic-dark hover:bg-seismic-border text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={startAnimationExport}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                  >
                    <Video className="w-4 h-4" />
                    Start Export
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
