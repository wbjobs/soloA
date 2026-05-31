import React, { useState, useEffect, useRef, useCallback } from 'react';
import { commentsApi } from '../services/api';
import type { Comment, MentionableUser } from '../types';

interface CommentsSidebarProps {
  noteId: string;
  currentUserId: string;
  canComment: boolean;
}

export function CommentsSidebar({ noteId, currentUserId, canComment }: CommentsSidebarProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionableUsers, setMentionableUsers] = useState<MentionableUser[]>([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionStartPos, setMentionStartPos] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadComments = useCallback(async () => {
    try {
      setLoading(true);
      const { comments: fetchedComments } = await commentsApi.getByNote(noteId);
      setComments(fetchedComments);
    } catch (error) {
      console.error('Failed to load comments:', error);
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const searchMentionableUsers = useCallback(async (query: string) => {
    if (!query.trim()) {
      setMentionableUsers([]);
      setShowMentionDropdown(false);
      return;
    }
    
    try {
      const { users } = await commentsApi.getMentionableUsers(noteId, query);
      setMentionableUsers(users);
      setShowMentionDropdown(users.length > 0);
    } catch (error) {
      console.error('Failed to search users:', error);
    }
  }, [noteId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>, isReply = false) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    
    if (isReply) {
      setReplyContent(value);
    } else {
      setNewComment(value);
    }

    const textBeforeCursor = value.substring(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([^\s@]*)$/);
    
    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionStartPos(cursorPos - atMatch[1].length - 1);
      searchMentionableUsers(atMatch[1]);
    } else {
      setShowMentionDropdown(false);
      setMentionQuery('');
    }
  };

  const insertMention = (user: MentionableUser, isReply = false) => {
    const content = isReply ? replyContent : newComment;
    const setContent = isReply ? setReplyContent : setNewComment;
    
    if (mentionStartPos !== null) {
      const mentionText = `@[${user.username}](${user._id}) `;
      const newContent = 
        content.substring(0, mentionStartPos) + 
        mentionText + 
        content.substring(mentionStartPos + mentionQuery.length + 1);
      
      setContent(newContent);
    }
    
    setShowMentionDropdown(false);
    setMentionQuery('');
    setMentionStartPos(null);
    
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const submitComment = async (isReply = false) => {
    const content = isReply ? replyContent : newComment;
    if (!content.trim()) return;

    try {
      await commentsApi.create(noteId, {
        content: content.trim(),
        parentId: isReply && replyingTo ? replyingTo : undefined
      });
      
      if (isReply) {
        setReplyContent('');
        setReplyingTo(null);
      } else {
        setNewComment('');
      }
      
      loadComments();
    } catch (error) {
      console.error('Failed to submit comment:', error);
    }
  };

  const resolveComment = async (commentId: string, currentResolved: boolean) => {
    try {
      await commentsApi.update(commentId, { resolved: !currentResolved });
      loadComments();
    } catch (error) {
      console.error('Failed to resolve comment:', error);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!window.confirm('Delete this comment?')) return;
    
    try {
      await commentsApi.delete(commentId);
      loadComments();
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  };

  const toggleReaction = async (commentId: string, emoji: string) => {
    try {
      await commentsApi.toggleReaction(commentId, emoji);
      loadComments();
    } catch (error) {
      console.error('Failed to toggle reaction:', error);
    }
  };

  const formatContentWithMentions = (content: string) => {
    return content.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, (_, username) => {
      return `<span class="inline-flex items-center px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded text-xs font-medium">@${username}</span>`;
    });
  };

  const isCommentOwner = (comment: Comment) => {
    const createdById = typeof comment.createdBy === 'object' 
      ? comment.createdBy.id 
      : comment.createdBy;
    return createdById === currentUserId;
  };

  const getCommentAuthorName = (comment: Comment) => {
    return typeof comment.createdBy === 'object' 
      ? comment.createdBy.username 
      : 'User';
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const renderComment = (comment: Comment, isReply = false) => (
    <div
      key={comment._id}
      className={`p-4 rounded-lg ${
        isReply ? 'bg-slate-50 ml-8' : 'bg-white border border-slate-200'
      } ${
        comment.resolvedAt ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center text-white text-xs font-medium">
            {getCommentAuthorName(comment).charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700">
              {getCommentAuthorName(comment)}
            </p>
            <p className="text-xs text-slate-400">{formatTime(comment.createdAt)}</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-1">
          <button
            onClick={() => resolveComment(comment._id, !!comment.resolvedAt)}
            className={`p-1 rounded hover:bg-slate-100 ${
              comment.resolvedAt ? 'text-green-500' : 'text-slate-400'
            }`}
            title={comment.resolvedAt ? 'Unresolve' : 'Resolve'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </button>
          
          {isCommentOwner(comment) && (
            <button
              onClick={() => deleteComment(comment._id)}
              className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-red-500"
              title="Delete"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
      
      <div 
        className="text-sm text-slate-600 mb-3 prose-sm"
        dangerouslySetInnerHTML={{ __html: formatContentWithMentions(comment.content) }}
      />
      
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {['👍', '❤️', '👀', '🔥'].map(emoji => {
            const reaction = comment.reactions.find(r => r.emoji === emoji);
            const hasReacted = reaction?.users.includes(currentUserId);
            return (
              <button
                key={emoji}
                onClick={() => toggleReaction(comment._id, emoji)}
                className={`flex items-center px-2 py-1 rounded-full text-xs ${
                  hasReacted
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span className="mr-1">{emoji}</span>
                {reaction && reaction.users.length > 0 && (
                  <span>{reaction.users.length}</span>
                )}
              </button>
            );
          })}
        </div>
        
        {canComment && !isReply && (
          <button
            onClick={() => setReplyingTo(replyingTo === comment._id ? null : comment._id)}
            className="text-xs text-slate-400 hover:text-primary-600"
          >
            Reply
          </button>
        )}
      </div>
      
      {replyingTo === comment._id && (
        <div className="mt-3 ml-8">
          <textarea
            ref={textareaRef}
            value={replyContent}
            onChange={(e) => handleInputChange(e, true)}
            placeholder="Write a reply... Use @ to mention someone"
            rows={2}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
          <div className="flex justify-end space-x-2 mt-2">
            <button
              onClick={() => {
                setReplyingTo(null);
                setReplyContent('');
              }}
              className="px-3 py-1 text-sm text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={() => submitComment(true)}
              disabled={!replyContent.trim()}
              className="px-3 py-1 bg-primary-500 text-white text-sm rounded hover:bg-primary-600 disabled:opacity-50"
            >
              Reply
            </button>
          </div>
        </div>
      )}
      
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-3 space-y-3">
          {comment.replies.map(reply => renderComment(reply, true))}
        </div>
      )}
    </div>
  );

  return (
    <div className="w-80 bg-white border-l border-slate-200 flex flex-col">
      <div className="p-4 border-b border-slate-200">
        <h3 className="font-semibold text-slate-700">
          Comments ({comments.length})
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm text-slate-400">No comments yet</p>
          </div>
        ) : (
          comments.map(comment => renderComment(comment))
        )}
      </div>

      {canComment && (
        <div className="p-4 border-t border-slate-200">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={newComment}
              onChange={(e) => handleInputChange(e)}
              placeholder="Add a comment... Use @ to mention someone"
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            />
            
            {showMentionDropdown && mentionableUsers.length > 0 && (
              <div className="absolute bottom-full left-0 w-full mb-2 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {mentionableUsers.map(user => (
                  <button
                    key={user._id}
                    onClick={() => insertMention(user)}
                    className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center space-x-2"
                  >
                    <div className="w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center text-white text-xs">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-700">{user.username}</p>
                      <p className="text-xs text-slate-400">{user.email}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex justify-end mt-2">
            <button
              onClick={() => submitComment(false)}
              disabled={!newComment.trim()}
              className="px-4 py-2 bg-primary-500 text-white text-sm rounded-lg hover:bg-primary-600 disabled:opacity-50 transition-colors"
            >
              Post Comment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CommentsSidebar;
