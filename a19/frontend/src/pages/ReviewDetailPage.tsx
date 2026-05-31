import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from 'react-query';
import {
  GitBranch,
  GitPullRequest,
  MessageSquare,
  AlertTriangle,
  Check,
  X,
  GitMerge,
  Code,
  AlertCircle,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import { reviewsApi } from '@/api/reviews';
import { commentsApi } from '@/api/comments';
import { useAuthStore } from '@/hooks/useAuthStore';
import { Comment, DiffFile, CreateCommentData } from '@/types';
import { Navbar } from '@/components/Navbar';
import { StatusBadge } from '@/components/StatusBadge';
import { DiffViewer } from '@/components/DiffViewer';
import { CommentsSection } from '@/components/CommentsSection';
import { format } from 'date-fns';

type Tab = 'changes' | 'comments' | 'analysis';

export function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('changes');
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [newCommentLine, setNewCommentLine] = useState<{ file: string; line: number } | null>(null);
  const [commentText, setCommentText] = useState('');
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const { data: review, isLoading: reviewLoading } = useQuery(
    ['review', id],
    () => reviewsApi.getReview(id!)
  );

  const { data: diff, isLoading: diffLoading } = useQuery(
    ['review-diff', id],
    () => reviewsApi.getDiff(id!),
    { enabled: !!id }
  );

  const { data: comments, refetch: refetchComments } = useQuery(
    ['review-comments', id],
    () => commentsApi.getComments(id!),
    { enabled: !!id }
  );

  const { data: analyses, isLoading: analysisLoading } = useQuery(
    ['review-analysis', id],
    () => reviewsApi.getAnalysis(id!),
    { enabled: !!id }
  );

  const isCreator = user?.id === review?.creator_id;
  const isAssignedReviewer = review?.reviewers?.some(r => r.user_id === user?.id);
  const canChangeStatus = isCreator || isAssignedReviewer;

  const updateStatus = async (status: string) => {
    if (!id) return;
    try {
      await reviewsApi.updateStatus(id, status);
      queryClient.invalidateQueries(['review', id]);
      setShowStatusMenu(false);
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleAddComment = async (content: string, parentId?: string) => {
    if (!id) return;
    
    const data: CreateCommentData = {
      reviewId: id,
      content
    };
    
    if (newCommentLine) {
      data.filePath = newCommentLine.file;
      data.lineNumber = newCommentLine.line;
    }
    
    if (parentId) {
      await commentsApi.replyToComment(parentId, content);
    } else {
      await commentsApi.createComment(data);
    }
    
    setNewCommentLine(null);
    setCommentText('');
    refetchComments();
  };

  const handleResolveComment = async (commentId: string) => {
    await commentsApi.resolveComment(commentId);
    refetchComments();
  };

  const handleLineClick = (file: string, lineNumber: number) => {
    setNewCommentLine({ file, lineNumber });
    setActiveTab('comments');
  };

  const toggleFile = (file: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(file)) {
      newExpanded.delete(file);
    } else {
      newExpanded.add(file);
    }
    setExpandedFiles(newExpanded);
  };

  if (reviewLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-gray-500">Loading review...</p>
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-gray-500">Review not found</p>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'changes', label: 'Changes', icon: <GitPullRequest className="w-4 h-4" />, count: diff?.length },
    { id: 'comments', label: 'Comments', icon: <MessageSquare className="w-4 h-4" />, count: comments?.length },
    { id: 'analysis', label: 'Analysis', icon: <AlertTriangle className="w-4 h-4" />, count: analyses?.length }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-bold text-gray-900">{review.title}</h1>
                <StatusBadge status={review.status} />
              </div>
              <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                <span className="flex items-center space-x-1">
                  <GitBranch className="w-4 h-4" />
                  <span>{review.source_branch_name}</span>
                  <span>→</span>
                  <span>{review.target_branch_name}</span>
                </span>
                <span>in {review.project_name}</span>
                <span>by {review.creator_display_name || review.creator_username}</span>
                <span>{format(new Date(review.created_at), 'MMM d, yyyy')}</span>
              </div>
            </div>
            
            {canChangeStatus && review.status !== 'merged' && (
              <div className="relative">
                <button
                  onClick={() => setShowStatusMenu(!showStatusMenu)}
                  className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  <span>Change Status</span>
                  {showStatusMenu ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                
                {showStatusMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-10">
                    <button
                      onClick={() => updateStatus('approved')}
                      className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-green-700 hover:bg-green-50"
                    >
                      <Check className="w-4 h-4" />
                      <span>Approve</span>
                    </button>
                    <button
                      onClick={() => updateStatus('rejected')}
                      className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
                    >
                      <X className="w-4 h-4" />
                      <span>Reject</span>
                    </button>
                    {isCreator && (
                      <button
                        onClick={() => updateStatus('merged')}
                        className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-purple-700 hover:bg-purple-50"
                      >
                        <GitMerge className="w-4 h-4" />
                        <span>Merge</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          
          {review.description && (
            <div className="mt-4 p-4 bg-gray-100 rounded-lg">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{review.description}</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      activeTab === tab.id
                        ? 'bg-primary-100 text-primary-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'changes' && (
              <div>
                {diffLoading ? (
                  <p className="text-gray-500 text-center py-8">Loading diff...</p>
                ) : diff && diff.length > 0 ? (
                  <DiffViewer
                    diff={diff}
                    onLineClick={handleLineClick}
                  />
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <GitPullRequest className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <p>No changes found between branches</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'comments' && (
              <div>
                {newCommentLine && (
                  <div className="mb-6 p-4 bg-primary-50 border border-primary-200 rounded-lg">
                    <p className="text-sm text-primary-700 mb-2">
                      Adding comment to: <strong>{newCommentLine.file}</strong> line <strong>{newCommentLine.line}</strong>
                    </p>
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Write your comment..."
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                      rows={3}
                    />
                    <div className="mt-2 flex justify-end space-x-2">
                      <button
                        onClick={() => setNewCommentLine(null)}
                        className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleAddComment(commentText)}
                        disabled={!commentText.trim()}
                        className="px-3 py-1 text-sm text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50"
                      >
                        Comment
                      </button>
                    </div>
                  </div>
                )}
                
                <CommentsSection
                  comments={comments || []}
                  onAddComment={handleAddComment}
                  onResolveComment={handleResolveComment}
                  currentUserId={user?.id}
                />
              </div>
            )}

            {activeTab === 'analysis' && (
              <div>
                {analysisLoading ? (
                  <p className="text-gray-500 text-center py-8">Loading analysis results...</p>
                ) : analyses && analyses.length > 0 ? (
                  <div className="space-y-6">
                    {analyses.map((analysis, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Code className="w-5 h-5 text-primary-600" />
                            <span className="font-medium text-gray-900 capitalize">{analysis.tool}</span>
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              analysis.status === 'success'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {analysis.status}
                            </span>
                          </div>
                          <div className="flex items-center space-x-4 text-sm">
                            <span className="text-red-600">
                              {analysis.summary.errors} errors
                            </span>
                            <span className="text-yellow-600">
                              {analysis.summary.warnings} warnings
                            </span>
                            <span className="text-blue-600">
                              {analysis.summary.infos} infos
                            </span>
                          </div>
                        </div>
                        
                        {analysis.issues.length > 0 ? (
                          <div className="divide-y divide-gray-200">
                            {analysis.issues.map((issue, issueIndex) => (
                              <div
                                key={issueIndex}
                                className="px-4 py-3 flex items-start space-x-3"
                              >
                                <div className={`p-1 rounded ${
                                  issue.severity === 'error'
                                    ? 'bg-red-100'
                                    : issue.severity === 'warning'
                                    ? 'bg-yellow-100'
                                    : 'bg-blue-100'
                                }`}>
                                  {issue.severity === 'error' ? (
                                    <AlertCircle className="w-4 h-4 text-red-600" />
                                  ) : issue.severity === 'warning' ? (
                                    <AlertTriangle className="w-4 h-4 text-yellow-600" />
                                  ) : (
                                    <AlertCircle className="w-4 h-4 text-blue-600" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm text-gray-900">{issue.message}</p>
                                  <div className="mt-1 flex items-center space-x-3 text-xs text-gray-500">
                                    <span>{issue.file}:{issue.line}</span>
                                    <span className="px-2 py-0.5 bg-gray-100 rounded">
                                      {issue.rule}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="px-4 py-8 text-center text-gray-500">
                            <Check className="w-8 h-8 mx-auto mb-2 text-green-500" />
                            <p>No issues found</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <Code className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                    <p>No analysis results yet</p>
                    <p className="text-sm mt-1">Analysis runs automatically when a review is created</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
