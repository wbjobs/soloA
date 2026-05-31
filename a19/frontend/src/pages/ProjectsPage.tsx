import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import { Plus, Git, Lock, FolderOpen } from 'lucide-react';
import { projectsApi } from '@/api/projects';
import { Navbar } from '@/components/Navbar';
import { format } from 'date-fns';

export function ProjectsPage() {
  const { data: projects, isLoading, error } = useQuery('all-projects', projectsApi.getProjects);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-gray-500">Loading projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
            <p className="mt-1 text-sm text-gray-600">Manage your code review projects</p>
          </div>
          <Link
            to="/projects/new"
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </Link>
        </div>

        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">Failed to load projects</p>
          </div>
        ) : projects && projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="block bg-white rounded-lg shadow hover:shadow-md transition-shadow"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 rounded-lg bg-primary-100">
                        <FolderOpen className="w-6 h-6 text-primary-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
                        <p className="text-sm text-gray-500">
                          {project.owner_username || 'Unknown owner'}
                        </p>
                      </div>
                    </div>
                    {project.is_public ? (
                      <Git className="w-5 h-5 text-green-600" />
                    ) : (
                      <Lock className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                  
                  <p className="mt-4 text-sm text-gray-600 line-clamp-2">
                    {project.description || 'No description provided'}
                  </p>
                  
                  <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                    <span>Default: {project.default_branch}</span>
                    <span>{format(new Date(project.created_at), 'MMM d, yyyy')}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-lg shadow">
            <FolderOpen className="w-16 h-16 mx-auto text-gray-300" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No projects yet</h3>
            <p className="mt-2 text-sm text-gray-500">Get started by creating your first project</p>
            <Link
              to="/projects/new"
              className="inline-flex items-center mt-6 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Project
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
