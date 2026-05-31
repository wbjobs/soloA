import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQueryClient } from 'react-query';
import { Git, FolderPlus, AlertCircle } from 'lucide-react';
import { projectsApi } from '@/api/projects';
import { CreateProjectData } from '@/types';
import { Navbar } from '@/components/Navbar';

export function NewProjectPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors }, watch } = useForm<CreateProjectData>();
  const repoUrl = watch('repoUrl');

  const createProjectMutation = useMutation(
    (data: CreateProjectData) => projectsApi.createProject(data),
    {
      onSuccess: (project) => {
        queryClient.invalidateQueries('projects');
        navigate(`/projects/${project.id}`);
      },
      onError: (err: any) => {
        setError(err.response?.data?.message || 'Failed to create project');
      }
    }
  );

  const onSubmit = async (data: CreateProjectData) => {
    setError(null);
    createProjectMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Create New Project</h1>
          <p className="mt-1 text-sm text-gray-600">
            Start a new code review project. You can either initialize a new repository or import an existing one.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {error && (
            <div className="flex items-center p-4 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center space-x-2 mb-4">
              <FolderPlus className="w-5 h-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-gray-900">Project Details</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Project Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  className={`mt-1 block w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                    errors.name ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="my-awesome-project"
                  {...register('name', {
                    required: 'Project name is required',
                    minLength: {
                      value: 1,
                      message: 'Project name cannot be empty'
                    }
                  })}
                />
                {errors.name && (
                  <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  id="description"
                  rows={3}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Brief description of your project"
                  {...register('description')}
                />
              </div>

              <div className="flex items-center">
                <input
                  id="isPublic"
                  type="checkbox"
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  {...register('isPublic')}
                />
                <label htmlFor="isPublic" className="ml-2 block text-sm text-gray-700">
                  Make this project public
                </label>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Git className="w-5 h-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-gray-900">Repository</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="repoUrl" className="block text-sm font-medium text-gray-700">
                  Git Repository URL (Optional)
                </label>
                <input
                  id="repoUrl"
                  type="url"
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="https://github.com/username/repo.git"
                  {...register('repoUrl')}
                />
                <p className="mt-1 text-xs text-gray-500">
                  {repoUrl
                    ? 'Leave empty to create a new empty repository'
                    : 'Leave empty to initialize a new Git repository'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-4">
            <button
              type="button"
              onClick={() => navigate('/projects')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createProjectMutation.isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createProjectMutation.isLoading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
