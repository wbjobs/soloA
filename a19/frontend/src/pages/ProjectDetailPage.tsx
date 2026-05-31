import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from 'react-query';
import { GitBranch, GitPullRequest, Trash2, Plus, AlertTriangle } from 'lucide-react';
import { projectsApi } from '@/api/projects';
import { reviewsApi } from '@/api/reviews';
import { useAuthStore } from '@/hooks/useAuthStore';
import { Navbar } from '@/components/Navbar';
import { StatusBadge } from '@/components/StatusBadge';
import { format } from 'date-fns';

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: project, isLoading: projectLoading } = useQuery(
    ['project', id],
    () => projectsApi.getProject(id!)
  );

  const { data: branches, isLoading: branchesLoading } = useQuery(
    ['project-branches', id],
    () => projectsApi.getBranches(id!),
    { enabled: !!id }
  );

  const { data: reviews, isLoading: reviewsLoading } = useQuery(
    ['project-reviews', id],
    () => reviewsApi.getReviews(id!),
    { enabled: !!id }
  );

  const isOwner = user?.id === project?.owner_id;

  const handleDelete = async () => {
    if (!id) return;
    try {
      await projectsApi.deleteProject(id);
      queryClient.invalidateQueries('projects');
      navigate('/projects');
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  if (projectLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-gray-500">Loading project...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-gray-500">Project not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
              <p className="mt-1 text-sm text-gray-600">
                {project.description || 'No description provided'}
              </p>
            </div>
            {isOwner && (
              <div className="flex items-center space-x-3">
                <Link
                  to="/reviews/new"
                  className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
                >
                  <GitPullRequest className="w-4 h-4" />
                  <span>New Review</span>
                </Link>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-md hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <GitPullRequest className="w-5 h-5 text-primary-600" />
                  <h2 className="text-lg font-semibold text-gray-900">Code Reviews</h2>
                </div>
                <Link
                  to="/reviews/new"
                  className="flex items-center space-x-1 text-sm text-primary-600 hover:text-primary-700"
                >
                  <Plus className="w-4 h-4" />
                  <span>New</span>
                </Link>
              </div>
              <div className="divide-y divide-gray-200">
                {reviewsLoading ? (
                  <div className="p-4 text-center text-gray-500">Loading...</div>
                ) : reviews && reviews.length > 0 ? (
                  reviews.map((review) => (
                    <Link
                      key={review.id}
                      to={`/reviews/${review.id}`}
                      className="block p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">{review.title}</h3>
                          <p className="text-sm text-gray-500">
                            {review.source_branch_name} → {review.target_branch_name}
                          </p>
                        </div>
                        <StatusBadge status={review.status} size="sm" />
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    <p>No code reviews yet.</p>
                    <Link
                      to="/reviews/new"
                      className="inline-block mt-2 text-primary-600 hover:text-primary-700"
                    >
                      Create your first review
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center space-x-2">
                  <GitBranch className="w-5 h-5 text-primary-600" />
                  <h2 className="text-lg font-semibold text-gray-900">Branches</h2>
                </div>
              </div>
              <div className="divide-y divide-gray-200">
                {branchesLoading ? (
                  <div className="p-4 text-center text-gray-500">Loading...</div>
                ) : branches && branches.length > 0 ? (
                  branches.map((branch) => (
                    <div key={branch.id} className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">
                            {branch.name}
                            {branch.name === project.default_branch && (
                              <span className="ml-2 px-2 py-0.5 text-xs bg-primary-100 text-primary-800 rounded-full">
                                default
                              </span>
                            )}
                          </h3>
                          {branch.last_commit_message && (
                            <p className="text-xs text-gray-500 truncate">
                              {branch.last_commit_message}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-gray-500">
                    <p>No branches yet</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Project Info</h3>
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase">Created</dt>
                  <dd className="text-sm text-gray-900">
                    {format(new Date(project.created_at), 'MMM d, yyyy')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase">Default Branch</dt>
                  <dd className="text-sm text-gray-900">{project.default_branch}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase">Visibility</dt>
                  <dd className="text-sm text-gray-900">
                    {project.is_public ? 'Public' : 'Private'}
                  </dd>
                </div>
                {project.repo_url && (
                  <div>
                    <dt className="text-xs font-medium text-gray-500 uppercase">Repository</dt>
                    <dd className="text-sm text-gray-900 break-all">{project.repo_url}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="fixed inset-0 bg-black bg-opacity-25" onClick={() => setShowDeleteConfirm(false)} />
            <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-full bg-red-100">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">Delete Project</h3>
              </div>
              <p className="mt-4 text-sm text-gray-600">
                Are you sure you want to delete this project? This action cannot be undone and will remove all code reviews, comments, and repository data.
              </p>
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
