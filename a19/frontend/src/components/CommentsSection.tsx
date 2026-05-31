import { useState } from 'react';
import { Comment } from '@/types';
import { User, Clock, CheckCircle, MessageCircle, Send } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/utils/cn';

interface CommentsSectionProps {
  comments: Comment[];
  onAddComment: (content: string, parentId?: string) => Promise<void>;
  onResolveComment?: (commentId: string) => Promise<void>;
  currentUserId?: string;
}

interface CommentItemProps {
  comment: Comment;
  onReply: (content: string) => Promise<void>;
  onResolve?: () => Promise<void>;
  currentUserId?: string;
}

function CommentItem({ comment, onReply, onResolve, currentUserId }: CommentItemProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitReply = async () => {
    if (!replyContent.trim()) return;
    
    setIsSubmitting(true);
    try {
      await onReply(replyContent);
      setReplyContent('');
      setIsReplying(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={cn(
      'border-l-4 pl-4 py-2',
      comment.is_resolved ? 'border-gray-200 opacity-60' : 'border-primary-500'
    )}>
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          {comment.author_avatar ? (
            <img
              src={comment.author_avatar}
              alt={comment.author_display_name || comment.author_username}
              className="w-8 h-8 rounded-full"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              <User className="w-4 h-4 text-gray-500" />
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <span className="font-medium text-sm text-gray-900">
                {comment.author_display_name || comment.author_username}
              </span>
              <span className="flex items-center text-xs text-gray-500">
                <Clock className="w-3 h-3 mr-1" />
                {format(new Date(comment.created_at), 'MMM d, yyyy HH:mm')}
              </span>
              {comment.file_path && (
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  {comment.file_path}:{comment.line_number}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
              {comment.content}
            </p>
            
            <div className="mt-2 flex items-center space-x-4">
              <button
                onClick={() => setIsReplying(!isReplying)}
                className="flex items-center space-x-1 text-xs text-gray-500 hover:text-primary-600"
              >
                <MessageCircle className="w-3 h-3" />
                <span>Reply</span>
              </button>
              
              {onResolve && !comment.is_resolved && (
                <button
                  onClick={onResolve}
                  className="flex items-center space-x-1 text-xs text-gray-500 hover:text-green-600"
                >
                  <CheckCircle className="w-3 h-3" />
                  <span>Resolve</span>
                </button>
              )}
              
              {comment.is_resolved && (
                <span className="flex items-center text-xs text-green-600">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Resolved
                </span>
              )}
            </div>

            {isReplying && (
              <div className="mt-3">
                <textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Write a reply..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  rows={3}
                />
                <div className="mt-2 flex justify-end space-x-2">
                  <button
                    onClick={() => setIsReplying(false)}
                    className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitReply}
                    disabled={isSubmitting || !replyContent.trim()}
                    className="flex items-center space-x-1 px-3 py-1 text-sm text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="w-3 h-3" />
                    <span>Reply</span>
                  </button>
                </div>
              </div>
            )}

            {comment.replies && comment.replies.length > 0 && (
              <div className="mt-4 space-y-3">
                {comment.replies.map((reply) => (
                  <div key={reply.id} className="flex items-start space-x-3 ml-6">
                    {reply.author_avatar ? (
                      <img
                        src={reply.author_avatar}
                        alt={reply.author_display_name || reply.author_username}
                        className="w-6 h-6 rounded-full"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                        <User className="w-3 h-3 text-gray-500" />
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-xs text-gray-900">
                          {reply.author_display_name || reply.author_username}
                        </span>
                        <span className="flex items-center text-xs text-gray-500">
                          <Clock className="w-3 h-3 mr-1" />
                          {format(new Date(reply.created_at), 'MMM d, yyyy HH:mm')}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-700 whitespace-pre-wrap">
                        {reply.content}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CommentsSection({
  comments,
  onAddComment,
  onResolveComment,
  currentUserId
}: CommentsSectionProps) {
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;
    
    setIsSubmitting(true);
    try {
      await onAddComment(newComment);
      setNewComment('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 p-4 rounded-lg">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a general comment..."
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          rows={3}
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={handleSubmitComment}
            disabled={isSubmitting || !newComment.trim()}
            className="flex items-center space-x-1 px-4 py-2 text-sm text-white bg-primary-600 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
            <span>Comment</span>
          </button>
        </div>
      </div>

      {comments.length > 0 ? (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              onReply={(content) => onAddComment(content, comment.id)}
              onResolve={onResolveComment ? () => onResolveComment(comment.id) : undefined}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <MessageCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
          <p>No comments yet</p>
        </div>
      )}
    </div>
  );
}
