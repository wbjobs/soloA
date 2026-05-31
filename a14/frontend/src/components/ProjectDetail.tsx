import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '../store/appStore'
import { projectApi, fileApi, analysisApi, exportApi } from '../services/api'
import { UploadFileModal } from './UploadFileModal'
import { MoleculeViewer, type DisplayStyle, type ColorScheme } from './viewer/MoleculeViewer'
import { RMSDChart } from './charts/RMSDChart'
import { RMSFChart } from './charts/RMSFChart'
import { RDFChart } from './charts/RDFChart'
import type {
  TrajectoryFile,
  FrameData,
  FrameInfo,
  AnalysisResult,
  RMSDResult,
  RMSFResult,
  RDFResult
} from '../types'
import './Layout.module.css'

type TabType = 'files' | 'viewer' | 'analysis'

export function ProjectDetail() {
  const { 
    currentProject, 
    projectFiles,
    setProjectFiles,
    currentFile,
    setCurrentFile,
    currentFrame,
    setCurrentFrame,
    analysisResults,
    setAnalysisResults,
    currentAnalysis,
    setCurrentAnalysis,
    fileMetadata,
    setFileMetadata
  } = useAppStore()

  const [activeTab, setActiveTab] = useState<TabType>('files')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [frames, setFrames] = useState<FrameInfo[]>([])
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>('ball_and_stick')
  const [colorScheme, setColorScheme] = useState<ColorScheme>('element')
  const [showBox, setShowBox] = useState(true)
  const [analysisTab, setAnalysisTab] = useState<'rmsd' | 'rmsf' | 'rdf' | 'saved'>('rmsd')
  const [rmsdSelection, setRmsdSelection] = useState('backbone')
  const [rmsfSelection, setRmsfSelection] = useState('name CA')
  const [rdfG1, setRdfG1] = useState('name O')
  const [rdfG2, setRdfG2] = useState('name O')
  const [rdfRange, setRdfRange] = useState<[number, number]>([0, 15])
  const [rdfBins, setRdfBins] = useState(75)

  const loadProjectData = useCallback(async () => {
    if (!currentProject) return
    try {
      const [filesRes, analysisRes] = await Promise.all([
        projectApi.getFiles(currentProject.id),
        projectApi.getAnalysis(currentProject.id)
      ])
      setProjectFiles(filesRes.data)
      setAnalysisResults(analysisRes.data)
    } catch (err) {
      console.error('Failed to load project data:', err)
    }
  }, [currentProject, setProjectFiles, setAnalysisResults])

  useEffect(() => {
    loadProjectData()
  }, [loadProjectData])

  const handleFileSelect = async (file: TrajectoryFile) => {
    setCurrentFile(file)
    setCurrentFrame(null)
    setFrames([])
    setCurrentFrameIndex(0)
    setIsPlaying(false)
    
    try {
      setLoading(true)
      
      if (file.metadata) {
        setFileMetadata(file.metadata)
      } else {
        const infoRes = await fileApi.getInfo(file.id)
        setFileMetadata(infoRes.data)
      }
      
      const framesRes = await fileApi.getFrames(file.id)
      setFrames(framesRes.data)
      
      if (framesRes.data.length > 0) {
        loadFrame(0)
      }
      
      setActiveTab('viewer')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load file')
    } finally {
      setLoading(false)
    }
  }

  const loadFrame = async (frameIndex: number) => {
    if (!currentFile) return
    
    try {
      setLoading(true)
      const frameRes = await fileApi.getFrame(currentFile.id, frameIndex)
      setCurrentFrame(frameRes.data)
      setCurrentFrameIndex(frameIndex)
    } catch (err: any) {
      console.error('Failed to load frame:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let playInterval: ReturnType<typeof setInterval> | null = null
    
    if (isPlaying && currentFile && fileMetadata) {
      playInterval = setInterval(() => {
        const totalFrames = fileMetadata.n_frames
        const nextIndex = (currentFrameIndex + 1) % totalFrames
        loadFrame(nextIndex)
      }, 200)
    }
    
    return () => {
      if (playInterval) clearInterval(playInterval)
    }
  }, [isPlaying, currentFile, fileMetadata, currentFrameIndex])

  const runRMSD = async () => {
    if (!currentFile || !currentProject) return
    
    setLoading(true)
    setError(null)
    
    try {
      const res = await analysisApi.runRMSD(
        currentFile.id,
        { selection: rmsdSelection },
        true,
        currentProject.id,
        `RMSD - ${rmsdSelection}`
      )
      
      setCurrentAnalysis({
        id: res.data.result_id,
        project_id: currentProject.id,
        analysis_type: 'rmsd',
        name: `RMSD - ${rmsdSelection}`,
        created_at: new Date().toISOString(),
        config: { selection: rmsdSelection },
        result_data: res.data.data
      } as any)
      
      setAnalysisTab('saved')
      loadProjectData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'RMSD analysis failed')
    } finally {
      setLoading(false)
    }
  }

  const runRMSF = async () => {
    if (!currentFile || !currentProject) return
    
    setLoading(true)
    setError(null)
    
    try {
      const res = await analysisApi.runRMSF(
        currentFile.id,
        { selection: rmsfSelection },
        true,
        currentProject.id,
        `RMSF - ${rmsfSelection}`
      )
      
      setCurrentAnalysis({
        id: res.data.result_id,
        project_id: currentProject.id,
        analysis_type: 'rmsf',
        name: `RMSF - ${rmsfSelection}`,
        created_at: new Date().toISOString(),
        config: { selection: rmsfSelection },
        result_data: res.data.data
      } as any)
      
      setAnalysisTab('saved')
      loadProjectData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'RMSF analysis failed')
    } finally {
      setLoading(false)
    }
  }

  const runRDF = async () => {
    if (!currentFile || !currentProject) return
    
    setLoading(true)
    setError(null)
    
    try {
      const res = await analysisApi.runRDF(
        currentFile.id,
        {
          g1: rdfG1,
          g2: rdfG2,
          range_start: rdfRange[0],
          range_end: rdfRange[1],
          nbins: rdfBins
        },
        true,
        currentProject.id,
        `RDF - ${rdfG1} vs ${rdfG2}`
      )
      
      setCurrentAnalysis({
        id: res.data.result_id,
        project_id: currentProject.id,
        analysis_type: 'rdf',
        name: `RDF - ${rdfG1} vs ${rdfG2}`,
        created_at: new Date().toISOString(),
        config: { g1: rdfG1, g2: rdfG2 },
        result_data: res.data.data
      } as any)
      
      setAnalysisTab('saved')
      loadProjectData()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'RDF analysis failed')
    } finally {
      setLoading(false)
    }
  }

  const handleExportProject = async () => {
    if (!currentProject) return
    try {
      const response = await exportApi.exportProject(currentProject.id)
      const blob = new Blob([response.data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `project_${currentProject.id}_export.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  const topologyFiles = projectFiles.filter(f => 
    ['gro', 'pdb'].includes(f.file_type)
  )

  if (!currentProject) {
    return (
      <div className="empty-state">
        <div className="icon">📁</div>
        <h2>No project selected</h2>
        <p>Select a project from the sidebar or create a new one</p>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">{currentProject.name}</h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            {currentProject.description || 'No description'}
          </p>
        </div>
        <button className="btn btn-secondary" onClick={handleExportProject}>
          Export Project
        </button>
      </div>

      {error && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.2)',
          color: 'var(--error)',
          padding: '0.75rem 1rem',
          borderRadius: '6px',
          marginBottom: '1rem'
        }}>
          {error}
        </div>
      )}

      <div className="tab-container">
        <ul className="tab-list">
          <li 
            className={`tab-item ${activeTab === 'files' ? 'active' : ''}`}
            onClick={() => setActiveTab('files')}
          >
            Files ({projectFiles.length})
          </li>
          <li 
            className={`tab-item ${activeTab === 'viewer' ? 'active' : ''}`}
            onClick={() => setActiveTab('viewer')}
          >
            3D Viewer
          </li>
          <li 
            className={`tab-item ${activeTab === 'analysis' ? 'active' : ''}`}
            onClick={() => setActiveTab('analysis')}
          >
            Analysis ({analysisResults.length})
          </li>
        </ul>

        <div className="tab-content">
          {activeTab === 'files' && (
            <div>
              <div style={{ marginBottom: '1rem' }}>
                <button 
                  className="btn btn-primary"
                  onClick={() => setShowUploadModal(true)}
                >
                  + Upload File
                </button>
              </div>
              
              {projectFiles.length === 0 ? (
                <div className="empty-state">
                  <div className="icon">📄</div>
                  <p>No files uploaded yet</p>
                  <p style={{ fontSize: '0.875rem' }}>
                    Upload trajectory files to start analyzing
                  </p>
                </div>
              ) : (
                <ul className="file-list">
                  {projectFiles.map((file) => (
                    <li 
                      key={file.id}
                      className={`file-item ${currentFile?.id === file.id ? 'active' : ''}`}
                      onClick={() => handleFileSelect(file)}
                    >
                      <div className="file-info">
                        <div className="file-name">
                          {file.name}
                          <span className="file-type-badge">{file.file_type}</span>
                        </div>
                        <div className="file-meta">
                          {file.metadata ? `Atoms: ${file.metadata.n_atoms}, Frames: ${file.metadata.n_frames}` : 'Loading metadata...'}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {activeTab === 'viewer' && (
            <div>
              {!currentFile ? (
                <div className="empty-state">
                  <div className="icon">🔬</div>
                  <p>Select a file from the Files tab</p>
                </div>
              ) : (
                <div>
                  <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
                    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                      <div>
                        <strong>Current File:</strong> {currentFile.name}
                      </div>
                      {fileMetadata && (
                        <>
                          <div>
                            <strong>Atoms:</strong> {fileMetadata.n_atoms}
                          </div>
                          <div>
                            <strong>Frames:</strong> {fileMetadata.n_frames}
                          </div>
                          {currentFrame && (
                            <div>
                              <strong>Time:</strong> {currentFrame.time.toFixed(1)} ps
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-3" style={{ marginBottom: '1rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Display Style</label>
                      <select 
                        className="form-select"
                        value={displayStyle}
                        onChange={(e) => setDisplayStyle(e.target.value as DisplayStyle)}
                      >
                        <option value="ball_and_stick">Ball & Stick</option>
                        <option value="sphere">Spacefilling</option>
                        <option value="stick">Stick</option>
                        <option value="line">Line</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Color Scheme</label>
                      <select 
                        className="form-select"
                        value={colorScheme}
                        onChange={(e) => setColorScheme(e.target.value as ColorScheme)}
                      >
                        <option value="element">Element</option>
                        <option value="residue">Residue</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0, display: 'flex', alignItems: 'flex-end' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.5rem' }}>
                        <input 
                          type="checkbox"
                          checked={showBox}
                          onChange={(e) => setShowBox(e.target.checked)}
                        />
                        Show Box
                      </label>
                    </div>
                  </div>

                  <MoleculeViewer
                    frameData={currentFrame}
                    height={500}
                    displayStyle={displayStyle}
                    colorScheme={colorScheme}
                    showBox={showBox}
                  />

                  {fileMetadata && fileMetadata.n_frames > 1 && (
                    <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem', padding: '0 1rem' }}>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => setIsPlaying(!isPlaying)}
                      >
                        {isPlaying ? 'Pause' : 'Play'}
                      </button>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => loadFrame(Math.max(0, currentFrameIndex - 1))}
                        disabled={currentFrameIndex <= 0}
                      >
                        Prev
                      </button>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => loadFrame(Math.min(fileMetadata.n_frames - 1, currentFrameIndex + 1))}
                        disabled={currentFrameIndex >= fileMetadata.n_frames - 1}
                      >
                        Next
                      </button>
                      <span style={{ fontSize: '0.875rem', minWidth: '120px' }}>
                        Frame {currentFrameIndex + 1} / {fileMetadata.n_frames}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={fileMetadata.n_frames - 1}
                        value={currentFrameIndex}
                        onChange={(e) => loadFrame(Number(e.target.value))}
                        style={{ flex: 1 }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'analysis' && (
            <div>
              {!currentFile ? (
                <div className="empty-state">
                  <div className="icon">📊</div>
                  <p>Select a file from the Files tab first</p>
                </div>
              ) : (
                <div className="tab-container">
                  <ul className="tab-list">
                    <li 
                      className={`tab-item ${analysisTab === 'rmsd' ? 'active' : ''}`}
                      onClick={() => setAnalysisTab('rmsd')}
                    >
                      RMSD
                    </li>
                    <li 
                      className={`tab-item ${analysisTab === 'rmsf' ? 'active' : ''}`}
                      onClick={() => setAnalysisTab('rmsf')}
                    >
                      RMSF
                    </li>
                    <li 
                      className={`tab-item ${analysisTab === 'rdf' ? 'active' : ''}`}
                      onClick={() => setAnalysisTab('rdf')}
                    >
                      RDF
                    </li>
                    <li 
                      className={`tab-item ${analysisTab === 'saved' ? 'active' : ''}`}
                      onClick={() => setAnalysisTab('saved')}
                    >
                      Saved Results
                    </li>
                  </ul>

                  <div className="tab-content">
                    {analysisTab === 'rmsd' && (
                      <div>
                        <div className="card">
                          <div className="card-header">
                            <h3 className="card-title">RMSD Calculation</h3>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Atom Selection</label>
                            <input
                              type="text"
                              className="form-input"
                              value={rmsdSelection}
                              onChange={(e) => setRmsdSelection(e.target.value)}
                              placeholder="e.g., backbone, name CA, all"
                            />
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                              Use MDAnalysis selection syntax
                            </p>
                          </div>
                          <button 
                            className="btn btn-primary"
                            onClick={runRMSD}
                            disabled={loading}
                          >
                            {loading ? 'Calculating...' : 'Calculate RMSD'}
                          </button>
                        </div>
                      </div>
                    )}

                    {analysisTab === 'rmsf' && (
                      <div>
                        <div className="card">
                          <div className="card-header">
                            <h3 className="card-title">RMSF Calculation</h3>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Atom Selection</label>
                            <input
                              type="text"
                              className="form-input"
                              value={rmsfSelection}
                              onChange={(e) => setRmsfSelection(e.target.value)}
                              placeholder="e.g., name CA"
                            />
                          </div>
                          <button 
                            className="btn btn-primary"
                            onClick={runRMSF}
                            disabled={loading}
                          >
                            {loading ? 'Calculating...' : 'Calculate RMSF'}
                          </button>
                        </div>
                      </div>
                    )}

                    {analysisTab === 'rdf' && (
                      <div>
                        <div className="card">
                          <div className="card-header">
                            <h3 className="card-title">RDF Calculation</h3>
                          </div>
                          <div className="form-row">
                            <div className="form-group">
                              <label className="form-label">Group 1 (g1)</label>
                              <input
                                type="text"
                                className="form-input"
                                value={rdfG1}
                                onChange={(e) => setRdfG1(e.target.value)}
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Group 2 (g2)</label>
                              <input
                                type="text"
                                className="form-input"
                                value={rdfG2}
                                onChange={(e) => setRdfG2(e.target.value)}
                              />
                            </div>
                          </div>
                          <div className="form-row">
                            <div className="form-group">
                              <label className="form-label">Range Start</label>
                              <input
                                type="number"
                                className="form-input"
                                value={rdfRange[0]}
                                onChange={(e) => setRdfRange([Number(e.target.value), rdfRange[1]])}
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Range End</label>
                              <input
                                type="number"
                                className="form-input"
                                value={rdfRange[1]}
                                onChange={(e) => setRdfRange([rdfRange[0], Number(e.target.value)])}
                              />
                            </div>
                            <div className="form-group">
                              <label className="form-label">Bins</label>
                              <input
                                type="number"
                                className="form-input"
                                value={rdfBins}
                                onChange={(e) => setRdfBins(Number(e.target.value))}
                              />
                            </div>
                          </div>
                          <button 
                            className="btn btn-primary"
                            onClick={runRDF}
                            disabled={loading}
                          >
                            {loading ? 'Calculating...' : 'Calculate RDF'}
                          </button>
                        </div>
                      </div>
                    )}

                    {analysisTab === 'saved' && (
                      <div>
                        {analysisResults.length === 0 ? (
                          <div className="empty-state">
                            <div className="icon">📊</div>
                            <p>No saved analysis results</p>
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gap: '1rem' }}>
                            {analysisResults.map((result) => {
                              const isSelected = currentAnalysis && 
                                (currentAnalysis as any).id === result.id;
                              
                              return (
                                <div 
                                  key={result.id}
                                  className="analysis-card"
                                  style={{ 
                                    cursor: 'pointer', 
                                    border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)' 
                                  }}
                                  onClick={() => setCurrentAnalysis(result as any)}
                                >
                                  <div className="analysis-card-header">
                                    <div>
                                      <strong>{result.name}</strong>
                                      <span className="file-type-badge">{result.analysis_type.toUpperCase()}</span>
                                    </div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                      {new Date(result.created_at).toLocaleString()}
                                    </span>
                                  </div>
                                  <div className="analysis-card-body">
                                    {result.analysis_type === 'rmsd' && result.result_data && (
                                      <RMSDChart data={result.result_data as RMSDResult} />
                                    )}
                                    {result.analysis_type === 'rmsf' && result.result_data && (
                                      <RMSFChart data={result.result_data as RMSFResult} />
                                    )}
                                    {result.analysis_type === 'rdf' && result.result_data && (
                                      <RDFChart data={result.result_data as RDFResult} />
                                    )}
                                    {result.result_data && (
                                      <div className="grid grid-2" style={{ marginTop: '1rem' }}>
                                        {(result.result_data as any).summary && 
                                          Object.entries((result.result_data as any).summary).map(([key, value]) => (
                                            <div key={key} className="stat-card">
                                              <div className="stat-value">
                                                {typeof value === 'number' ? value.toFixed(3) : String(value)}
                                              </div>
                                              <div className="stat-label">
                                                {key.replace(/_/g, ' ')}
                                              </div>
                                            </div>
                                          ))
                                        }
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showUploadModal && (
        <UploadFileModal
          projectId={currentProject.id}
          topologyFiles={topologyFiles}
          onClose={() => setShowUploadModal(false)}
          onUploaded={loadProjectData}
        />
      )}
    </div>
  )
}
