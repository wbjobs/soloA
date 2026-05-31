import { Sidebar } from './components/Sidebar'
import { ProjectDetail } from './components/ProjectDetail'
import { useAppStore } from './store/appStore'
import './components/Layout.module.css'

export function App() {
  const { currentProject } = useAppStore()

  return (
    <div className="layout">
      <header className="header">
        <h1>
          🔬 MDVis
          <span className="subtitle">Molecular Dynamics Visualization Platform</span>
        </h1>
      </header>
      
      <div className="main-content">
        <Sidebar />
        <main className="content-area">
          {currentProject ? (
            <ProjectDetail />
          ) : (
            <div className="empty-state" style={{ justifyContent: 'center' }}>
              <div className="icon" style={{ fontSize: '5rem' }}>🧬</div>
              <h2 style={{ marginBottom: '0.5rem' }}>Welcome to MDVis</h2>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', maxWidth: '500px' }}>
                A powerful platform for molecular dynamics simulation data processing and visualization.
                Create a new project or select an existing one to get started.
              </p>
              <div className="grid grid-3" style={{ maxWidth: '700px', margin: '0 auto' }}>
                <div className="card">
                  <h3 style={{ marginBottom: '0.5rem', color: 'var(--accent)' }}>📊 Analysis</h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Calculate RMSD, RMSF, RDF, and other key parameters
                  </p>
                </div>
                <div className="card">
                  <h3 style={{ marginBottom: '0.5rem', color: 'var(--accent)' }}>🔬 3D Viewer</h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Interactive molecular structure visualization with Three.js
                  </p>
                </div>
                <div className="card">
                  <h3 style={{ marginBottom: '0.5rem', color: 'var(--accent)' }}>📈 Charts</h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Beautiful D3.js visualizations of your analysis results
                  </p>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
