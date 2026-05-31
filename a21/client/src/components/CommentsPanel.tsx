import { useState } from 'react'
import { Comment } from '../types'
import { commentApi } from '../api'

interface CommentsPanelProps {
  comments: Comment[]
  documentId: string
  selectedText: { from: number; to: number; text: string } | null
  onAddComment: (commentData: Partial<Comment> & { content: string; selectedText: string }) => void
  onResolveComment: (commentId: string) => void
  onReopenComment: (commentId: string) => void
  onReplyAdded: (commentId: string, reply: Comment['replies'][0]) => void
  showResolved: boolean
  onToggleShowResolved: (show: boolean) => void
}

export default function CommentsPanel({
  comments,
  documentId,
  selectedText,
  onAddComment,
  onResolveComment,
  onReopenComment,
  onReplyAdded,
  showResolved,
  onToggleShowResolved
}: CommentsPanelProps) {
  const [newComment, setNewComment] = useState('')
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const filteredComments = comments.filter(c => showResolved ? true : !c.resolvedAt)

  const handleAddComment = async () => {
    if (!selectedText || !newComment.trim() || submitting) return

    setSubmitting(true)
    try {
      await onAddComment({
        content: newComment.trim(),
        selectedText: selectedText.text
      })
      setNewComment('')
    } catch (error) {
      console.error('添加评论失败:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const handleReply = async (commentId: string) => {
    const content = replyInputs[commentId]
    if (!content?.trim() || submitting) return

    setSubmitting(true)
    try {
      const response = await commentApi.createReply(commentId, { content: content.trim() })
      onReplyAdded(commentId, response.data)
      setReplyInputs(prev => ({ ...prev, [commentId]: '' }))
    } catch (error) {
      console.error('添加回复失败:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN')
  }

  return (
    <div className='w-80 bg-white rounded-lg shadow flex flex-col h-full'>
      <div className='p-4 border-b border-gray-200'>
        <div className='flex justify-between items-center mb-4'>
          <h3 className='font-semibold text-gray-900'>评论 ({comments.length})</h3>
          <button
            onClick={() => onToggleShowResolved(!showResolved)}
            className='text-sm text-blue-600 hover:text-blue-800'
          >
            {showResolved ? '隐藏已解决' : '显示已解决'}
          </button>
        </div>

        {selectedText && (
          <div className='mb-4 p-3 bg-blue-50 rounded-lg'>
            <div className='text-xs text-gray-500 mb-2'>选中的文本:</div>
            <div className='text-sm text-gray-700 line-clamp-2 mb-2 italic'>
              "{selectedText.text}"
            </div>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder='添加评论...'
              className='w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none'
              rows={2}
            />
            <button
              onClick={handleAddComment}
              disabled={submitting || !newComment.trim()}
              className='mt-2 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50'
            >
              添加评论
            </button>
          </div>
        )}

        {!selectedText && (
          <div className='mb-4 p-3 bg-gray-50 rounded-lg'>
            <p className='text-xs text-gray-500 text-center'>
              在编辑器中选中文本以添加评论
            </p>
          </div>
        )}
      </div>

      <div className='flex-1 overflow-y-auto p-4 space-y-4'>
        {filteredComments.length === 0 ? (
          <div className='text-center text-gray-500 py-8'>
            {comments.length === 0 ? '还没有评论' : '没有未解决的评论'}
          </div>
        ) : (
          filteredComments.map(comment => (
            <div
              key={comment.id}
              className={`p-3 rounded-lg border transition-colors ${
                comment.resolvedAt 
                  ? 'bg-gray-50 border-gray-200 opacity-75' 
                  : 'bg-white border-gray-200 hover:border-blue-300'
              }`}
            >
              <div className='flex items-start justify-between mb-2'>
                <div className='flex items-center space-x-2'>
                  <div
                    className='w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-medium'
                    style={{ backgroundColor: comment.authorColor }}
                  >
                    {comment.authorName.charAt(0)}
                  </div>
                  <div>
                    <div className='text-sm font-medium text-gray-900'>
                      {comment.authorName}
                    </div>
                    <div className='text-xs text-gray-500'>
                      {formatDate(comment.createdAt)}
                    </div>
                  </div>
                </div>
                {comment.resolvedAt ? (
                  <div className='flex items-center space-x-2'>
                    <span className='text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded'>
                      已解决
                    </span>
                    <button
                      onClick={() => onReopenComment(comment.id)}
                      className='text-xs text-gray-500 hover:text-gray-700'
                    >
                      重新打开
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => onResolveComment(comment.id)}
                    className='text-xs text-green-600 hover:text-green-800'
                  >
                    解决
                  </button>
                )}
              </div>

              {comment.selectedText && (
                <div className='px-2 py-1 bg-gray-100 rounded text-xs text-gray-600 italic mb-2 line-clamp-2'>
                  "{comment.selectedText}"
                </div>
              )}

              {comment.replies.length > 0 && (
                <div className='space-y-2 mb-3'>
                  {comment.replies.map(reply => (
                    <div key={reply.id} className='flex items-start space-x-2'>
                      <div
                        className='w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0'
                        style={{ backgroundColor: reply.authorColor }}
                      >
                        {reply.authorName.charAt(0)}
                      </div>
                      <div className='flex-1 bg-gray-50 rounded px-2 py-1'>
                        <div className='text-xs text-gray-900'>
                          {reply.authorName}
                          <span className='text-gray-400 ml-1'>
                            {formatDate(reply.createdAt)}
                          </span>
                        </div>
                        <div className='text-sm text-gray-700'>{reply.content}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!comment.resolvedAt && (
                <div className='flex space-x-2'>
                  <input
                    type='text'
                    value={replyInputs[comment.id] || ''}
                    onChange={(e) => setReplyInputs(prev => ({ ...prev, [comment.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleReply(comment.id)
                      }
                    }}
                    placeholder='添加回复...'
                    className='flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
                  />
                  <button
                    onClick={() => handleReply(comment.id)}
                    disabled={!replyInputs[comment.id]?.trim()}
                    className='px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200 disabled:opacity-50'
                  >
                    回复
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
