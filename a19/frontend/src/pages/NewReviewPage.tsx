import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { GitPullRequest, AlertCircle } from 'lucide-react';
import { projectsApi } from '@/api/projects';
import { reviewsApi } from '@/api/reviews';
import { CreateReviewData } from '@/types';
import { Navbar } from '@/components/Navbar';

export function NewReviewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string>('');

  const { register, handleSubmit, formState: { errors } } = useForm<CreateReviewData>();

  const { data: projects } = useQuery('projects', projectsApi.getProjects);

  const { data: branches } = useQuery(
    ['project-branches', selectedProject],
    () => projectsApi.getBranches(selectedProject),
    { enabled: !!selectedProject }
  );

  const createReviewMutation = useMutation(
    (data: CreateReviewData) => reviewsApi.createReview(data),
    {
      onSuccess: (review) => {
        queryClient.invalidateQueries('reviews');
        navigate(`/reviews/${review.id}`);
      },
      onError: (err: any) => {
        setError(err.response?.data?.message || 'Failed to create review');
      }
    }
  );

  const onSubmit = async (data: CreateReviewData) => {
    setError(null);
    createReviewMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Create Code Review</h1>
          <p className="mt-1 text-sm text-gray-600">
            Start a new code review to compare branches and collaborate with your team.
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
              <GitPullRequest className="w-5 h-5 text-primary-600" />
              <h2 className="text-lg font-semibold text-gray-900">Review Details</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="projectId" className="block text-sm font-medium text-gray-700">
                  Project <span className="text-red-500">*</span>
                </label>
                <select
                  id="projectId"
                  className={`mt-1 block w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                    errors.projectId ? 'border-red-300' : 'border-gray-300'
                  }`}
                  value={selectedProject}
                  onChange={(e) => {
                    setSelectedProject(e.target.value);
                  }}
                  {...register('projectId', {
                    required: 'Please select a project'
                  })}
                >
                  <option value="">Select a project...</option>
                  {projects?.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
                {errors.projectId && (
                  <p className="mt-1 text-sm text-red-600">{errors.projectId.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  id="title"
                  type="text"
                  className={`mt-1 block w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                    errors.title ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="Brief description of the changes"
                  {...register('title', {
                    required: 'Title is required'
                  })}
                />
                {errors.title && (
                  <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  id="description"
                  rows={4}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Describe the changes, context, and any additional information reviewers should know"
                  {...register('description')}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="sourceBranchId" className="block text-sm font-medium text-gray-700">
                    Source Branch <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="sourceBranchId"
                    className={`mt-1 block w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                      errors.sourceBranchId ? 'border-red-300' : 'border-gray-300'
                    }`}
                    disabled={!selectedProject}
                    {...register('sourceBranchId', {
                      required: 'Please select a source branch'
                    })}
                  >
                    <option value="">Select branch...</option>
                    {branches?.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                  {errors.sourceBranchId && (
                    <p className="mt-1 text-sm text-red-600">{errors.sourceBranchId.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="targetBranchId" className="block text-sm font-medium text-gray-700">
                    Target Branch <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="targetBranchId"
                    className={`mt-1 block w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                      errors.targetBranchId ? 'border-red-300' : 'border-gray-300'
                    }`}
                    disabled={!selectedProject}
                    {...register('targetBranchId', {
                      required: 'Please select a target branch'
                    })}
                  >
                    <option value="">Select branch...</option>
                    {branches?.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                  {errors.targetBranchId && (
                    <p className="mt-1 text-sm text-red-600">{errors.targetBranchId.message}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-4">
            <button
              type="button"
              onClick={() => navigate('/reviews')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createReviewMutation.isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createReviewMutation.isLoading ? 'Creating...' : 'Create Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
