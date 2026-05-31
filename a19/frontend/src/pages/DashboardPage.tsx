import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import { FolderOpen, GitPullRequest, Plus, TrendingUp } from 'lucide-react';
import { projectsApi } from '@/api/projects';
import { reviewsApi } from '@/api/reviews';
import { Navbar } from '@/components/Navbar';
import { StatusBadge } from '@/components/StatusBadge';

export function DashboardPage() {
  const { data: projects, isLoading: projectsLoading } = useQuery('projects', projectsApi.getProjects);
  
  const { data: reviews, isLoading: reviewsLoading } = useQuery('recent-reviews', () =>
    reviewsApi.getReviews()
  );

  const stats = {
    totalProjects: projects?.length || 0,
    pendingReviews: reviews?.filter(r => r.status === 'pending').length || 0,
    approvedReviews: reviews?.filter(r => r.status === 'approved').length || 0
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">Welcome back! Here's what's happening with your projects.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-md bg-primary-100">
                <FolderOpen className="w-6 h-6 text-primary-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Projects</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.totalProjects}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-md bg-yellow-100">
                <GitPullRequest className="w-6 h-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Pending Reviews</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.pendingReviews}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-md bg-green-100">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Approved Reviews</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.approvedReviews}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Your Projects</h2>
              <Link
                to="/projects/new"
                className="flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                <Plus className="w-4 h-4" />
                <span>New</span>
              </Link>
            </div>
            <div className="divide-y divide-gray-200">
              {projectsLoading ? (
                <div className="p-4 text-center text-gray-500">Loading...</div>
              ) : projects && projects.length > 0 ? (
                projects.slice(0, 5).map((project) => (
                  <Link
                    key={project.id}
                    to={`/projects/${project.id}`}
                    className="block p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-gray-900">{project.name}</h3>
                        <p className="text-sm text-gray-500 truncate max-w-md">
                          {project.description || 'No description'}
                        </p>
                      </div>
                      {project.is_public && (
                        <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                          Public
                        </span>
                      )}
                    </div>
                  </Link>
                ))
              ) : (
                <div className="p-8 text-center text-gray-500">
                  <p>No projects yet. Create your first project!</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Recent Reviews</h2>
              <Link
                to="/reviews/new"
                className="flex items-center space-x-1 px-3 py-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
              >
                <Plus className="w-4 h-4" />
                <span>New</span>
              </Link>
            </div>
            <div className="divide-y divide-gray-200">
              {reviewsLoading ? (
                <div className="p-4 text-center text-gray-500">Loading...</div>
              ) : reviews && reviews.length > 0 ? (
                reviews.slice(0, 5).map((review) => (
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
                  <p>No reviews yet. Create your first review!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
