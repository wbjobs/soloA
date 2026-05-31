import { useEffect, useState } from 'react'
import { projectApi } from '../services/api'
import { useAppStore } from '../store/appStore'
import { CreateProjectModal } from './CreateProjectModal'
import './Layout.module.css'

export function Sidebar() {
  const { projects, setProjects, currentProject, setCurrentProject, clearCurrentProject } = useAppStore()
  const [showCreateModal, setShowCreateModal] = useState(false)

  const loadProjects = async () => {
    try {
      const response = await projectApi.getAll()
      setProjects(response.data)
    } catch (error) {
      console.error('Failed to load projects:', error)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [])

  const handleProjectClick = (project: typeof projects[0]) => {
    if (currentProject?.id === project.id) {
      clearCurrentProject()
    } else {
      setCurrentProject(project)
    }
  }

  return (
    <aside className="sidebar">
      <div style={{ padding: '1rem' }}>
        <button
          className="btn btn-primary"
          style={{ width: '100%', marginBottom: '1rem' }}
          onClick={() => setShowCreateModal(true)}
        >
          + New Project
        </button>

        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Projects ({projects.length})
        </div>
      </div>

      <ul className="project-list">
        {projects.length === 0 ? (
          <li style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            No projects yet
          </li>
        ) : (
          projects.map((project) => (
            <li
              key={project.id}
              className={`project-item ${currentProject?.id === project.id ? 'active' : ''}`}
              onClick={() => handleProjectClick(project)}
            >
              <div className="name">{project.name}</div>
              <div className="meta">
                {new Date(project.created_at).toLocaleDateString()}
              </div>
            </li>
          ))
        )}
      </ul>

      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onCreated={loadProjects}
        />
      )}
    </aside>
  )
}
