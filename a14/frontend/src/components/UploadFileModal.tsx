import { useState } from 'react'
import { fileApi } from '../services/api'
import { useAppStore } from '../store/appStore'
import type { TrajectoryFile } from '../types'
import './Layout.module.css'

interface UploadFileModalProps {
  projectId: number
  topologyFiles: TrajectoryFile[]
  onClose: () => void
  onUploaded?: () => void
}

export function UploadFileModal({ projectId, topologyFiles, onClose, onUploaded }: UploadFileModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [topologyId, setTopologyId] = useState<number | ''>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const droppedFile = e.dataTransfer.files?.[0]
    if (droppedFile) {
      setFile(droppedFile)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) {
      setError('Please select a file to upload')
      return
    }

    setLoading(true)
    setError('')

    try {
      await fileApi.upload(
        projectId,
        file,
        topologyId !== '' ? topologyId : undefined
      )
      onUploaded?.()
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload file')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Upload Trajectory File</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Select File</label>
            <div
              className={`dropzone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <div className="dropzone-icon">📁</div>
              <p>{file ? file.name : 'Click or drag file here'}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                Supported: .gro, .trr, .xtc, .pdb, .xyz, .dump
              </p>
              <input
                id="file-input"
                type="file"
                style={{ display: 'none' }}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          {topologyFiles.length > 0 && (
            <div className="form-group">
              <label className="form-label">Topology File (for trajectory files)</label>
              <select
                className="form-select"
                value={topologyId}
                onChange={(e) => setTopologyId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <option value="">None (standalone file)</option>
                {topologyFiles.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                For trajectory files (trr, xtc, dump), you may need to specify a topology file (gro, pdb)
              </p>
            </div>
          )}

          {error && <p style={{ color: 'var(--error)', marginBottom: '1rem' }}>{error}</p>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !file}>
              {loading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
