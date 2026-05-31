import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from 'react-query';
import { GitPullRequest, Plus, Filter } from 'lucide-react';
import { reviewsApi } from '@/api/reviews';
import { Navbar } from '@/components/Navbar';
import { StatusBadge } from '@/components/StatusBadge';
import { format } from 'date-fns';

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected' | 'merged';

export function ReviewsPage() {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');

  const { data: reviews, isLoading, error } = useQuery(
    ['reviews', statusFilter],
    () => reviewsApi.getReviews(undefined, statusFilter === 'all' ? undefined : statusFilter)
  );

  const statusFilters: { value: FilterStatus; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'merged', label: 'Merged' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Code Reviews</h1>
            <p className="mt-1 text-sm text-gray-600">View and manage all code reviews</p>
          </div>
          <Link
            to="/reviews/new"
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
          >
            <Plus className="w-4 h-4" />
            <span>New Review</span>
          </Link>
        </div>

        <div className="flex items-center space-x-2 mb-6">
          <Filter className="w-4 h-4 text-gray-500" />
          <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-lg">
            {statusFilters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setStatusFilter(filter.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  statusFilter === filter.value
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            Loading reviews...
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700">Failed to load reviews</p>
          </div>
        ) : reviews && reviews.length > 0 ? (
          <div className="bg-white rounded-lg shadow divide-y divide-gray-200">
            {reviews.map((review) => (
              <Link
                key={review.id}
                to={`/reviews/${review.id}`}
                className="block p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className="p-2 rounded-lg bg-primary-100">
                      <GitPullRequest className="w-6 h-6 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{review.title}</h3>
                      <p className="mt-1 text-sm text-gray-500">
                        <span className="font-mono">{review.source_branch_name}</span>
                        <span className="mx-2">→</span>
                        <span className="font-mono">{review.target_branch_name}</span>
                      </p>
                      <div className="mt-2 flex items-center space-x-4 text-xs text-gray-500">
                        <span>Project: {review.project_name}</span>
                        <span>Creator: {review.creator_display_name || review.creator_username}</span>
                        <span>{format(new Date(review.created_at), 'MMM d, yyyy')}</span>
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={review.status} />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-lg shadow">
            <GitPullRequest className="w-16 h-16 mx-auto text-gray-300" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              {statusFilter === 'all' ? 'No code reviews yet' : `No ${statusFilter} reviews`}
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              {statusFilter === 'all'
                ? 'Get started by creating your first code review'
                : `There are no ${statusFilter} code reviews at the moment`}
            </p>
            {statusFilter === 'all' && (
              <Link
                to="/reviews/new"
                className="inline-flex items-center mt-6 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Review
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
