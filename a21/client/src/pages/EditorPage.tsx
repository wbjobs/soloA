import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { documentApi, commentApi } from '../api'
import { useCollaboration } from '../hooks/useCollaboration'
import RichEditor from '../components/RichEditor'
import CommentsPanel from '../components/CommentsPanel'
import VersionHistoryPanel from '../components/VersionHistoryPanel'
import { Comment, Document, DocumentVersion } from '../types'
import { CommentSelectionManager } from '../utils/commentSelection'
import { createCommentAnchors } from '../utils/anchorPositions'
import * as Y from 'yjs'

export default function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  const [document, setDocument] = useState<Document | null>(null)
  const [title, setTitle] = useState('')
  const [comments, setComments] = useState<Comment[]>([])
  const [versions, setVersions] = useState<DocumentVersion[]>([])
  const [selectedText, setSelectedText] = useState<{ from: number; to: number; text: string } | null>(null)
  const [showVersions, setShowVersions] = useState(false)
  const [showResolvedComments, setShowResolvedComments] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const [savingSnapshot, setSavingSnapshot] = useState(false)
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected' | 'synchronizing'>('connecting')

  const commentManagerRef = useRef<CommentSelectionManager | null>(null)

  const {
    ydoc,
    isConnected,
    onlineUsers,
    remoteCursors,
    serverVersion,
    syncStatus,
    sendCursorPosition,
    saveDocument
  } = useCollaboration({
    documentId: id || '',
    onStateChange: setConnectionState
  })

  useEffect(() => {
    if (!id || !user) return
    loadDocument()
    loadComments()
    loadVersions()
  }, [id, user])

  useEffect(() => {
    if (!ydoc || !commentManagerRef.current) return
    commentManagerRef.current = new CommentSelectionManager(ydoc)
    
    const existingComments = comments
    for (const comment of existingComments) {
      const anchorFromType = typeof comment.anchorFrom === 'object' ? comment.anchorFrom.type : ''
      const anchorToType = typeof comment.anchorTo === 'object' ? comment.anchorTo.type : ''
      
      if (anchorFromType && anchorToType) {
        commentManagerRef.current.addSelectionFromEncoded(
          comment.id,
          anchorFromType,
          anchorToType,
          comment.selectedText
        )
      }
    }

    return () => {
      commentManagerRef.current?.dispose()
      commentManagerRef.current = null
    }
  }, [ydoc])

  const loadDocument = async () => {
    try {
      const response = await documentApi.getDocument(id!)
      setDocument(response.data)
      setTitle(response.data.title)
      setTitleInput(response.data.title)
    } catch (error) {
      console.error('加载文档失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadComments = async () => {
    try {
      const response = await commentApi.getComments(id!)
      const newComments = response.data
      setComments(newComments)
      
      if (commentManagerRef.current && ydoc) {
        for (const comment of newComments) {
          const anchorFromType = typeof comment.anchorFrom === 'object' ? comment.anchorFrom.type : ''
          const anchorToType = typeof comment.anchorTo === 'object' ? comment.anchorTo.type : ''
          
          if (anchorFromType && anchorToType) {
            commentManagerRef.current.addSelectionFromEncoded(
              comment.id,
              anchorFromType,
              anchorToType,
              comment.selectedText
            )
          }
        }
      }
    } catch (error) {
      console.error('加载评论失败:', error)
    }
  }

  const loadVersions = async () => {
    try {
      const response = await documentApi.getVersions(id!)
      setVersions(response.data)
    } catch (error) {
      console.error('加载版本历史失败:', error)
    }
  }

  const canEdit = useCallback(() => {
    if (!document || !user) return false
    if (document.ownerId === user.id) return true
    return ['editor', 'admin', 'owner'].includes(document.userRole)
  }, [document, user])

  const handleTitleUpdate = async () => {
    if (!id || !titleInput.trim() || titleInput === title) {
      setEditingTitle(false)
      return
    }

    try {
      await documentApi.updateDocument(id, { title: titleInput.trim() })
      setTitle(titleInput.trim())
      setEditingTitle(false)
    } catch (error) {
      console.error('更新标题失败:', error)
    }
  }

  const handleCreateSnapshot = async () => {
    if (!id || !ydoc || savingSnapshot) return

    setSavingSnapshot(true)
    try {
      await saveDocument()
      
      const ydocState = Y.encodeStateAsUpdate(ydoc)
      const contentSnapshot = ydoc.getXmlFragment('prosemirror').toString()

      const response = await documentApi.createSnapshot(id, {
        ydocState,
        contentSnapshot
      })

      const newVersion: DocumentVersion = {
        id: response.data.id,
        versionNumber: response.data.versionNumber,
        contentSnapshot,
        createdBy: user!.id,
        createdByName: user!.username,
        createdAt: response.data.createdAt
      }

      setVersions(prev => [newVersion, ...prev])
    } catch (error) {
      console.error('创建快照失败:', error)
    } finally {
      setSavingSnapshot(false)
    }
  }

  const handleAddComment = async (commentData: Partial<Comment> & { selectedText: string; anchorFrom?: any; anchorTo?: any }) => {
    if (!selectedText || !ydoc || !id) return

    const anchors = createCommentAnchors(ydoc, selectedText.from, selectedText.to)
    
    if (!anchors) {
      console.error('无法创建评论锚点')
      return
    }

    try {
      const response = await commentApi.createComment({
        documentId: id,
        anchorFrom: anchors.anchorFrom,
        anchorTo: anchors.anchorTo,
        selectedText: selectedText.text,
        content: commentData.content || ''
      })

      const newComment: Comment = {
        id: response.data.id,
        documentId: id,
        authorId: user!.id,
        authorName: user!.username,
        authorColor: user!.avatarColor,
        anchorFrom: anchors.anchorFrom,
        anchorTo: anchors.anchorTo,
        selectedText: selectedText.text,
        createdAt: new Date().toISOString(),
        replies: []
      }

      if (commentManagerRef.current) {
        commentManagerRef.current.addSelection(
          response.data.id,
          selectedText.from,
          selectedText.to,
          selectedText.text
        )
      }

      setComments(prev => [newComment, ...prev])
      setSelectedText(null)
    } catch (error) {
      console.error('添加评论失败:', error)
    }
  }

  const handleResolveComment = async (commentId: string) => {
    try {
      await commentApi.resolveComment(commentId)
      setComments(prev => prev.map(c => 
        c.id === commentId ? { ...c, resolvedAt: new Date().toISOString() } : c
      ))
    } catch (error) {
      console.error('解决评论失败:', error)
    }
  }

  const handleReopenComment = async (commentId: string) => {
    try {
      await commentApi.reopenComment(commentId)
      setComments(prev => prev.map(c => 
        c.id === commentId ? { ...c, resolvedAt: undefined, resolvedBy: undefined } : c
      ))
    } catch (error) {
      console.error('重新打开评论失败:', error)
    }
  }

  const handleReplyAdded = (commentId: string, reply: Comment['replies'][0]) => {
    setComments(prev => prev.map(c => 
      c.id === commentId ? { ...c, replies: [...c.replies, reply] } : c
    ))
  }

  const handleRollback = () => {
    alert('版本已回滚，页面将刷新以加载最新版本。')
    window.location.reload()
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN')
  }

  const getConnectionStatusText = () => {
    switch (connectionState) {
      case 'connecting':
        return '连接中...'
      case 'connected':
        return '已连接'
      case 'disconnected':
        return '已断开'
      case 'synchronizing':
        return '同步中...'
      default:
        return '未知'
    }
  }

  const getConnectionStatusColor = () => {
    switch (connectionState) {
      case 'connected':
        return 'bg-green-500'
      case 'connecting':
      case 'synchronizing':
        return 'bg-yellow-500 animate-pulse'
      case 'disconnected':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  if (loading) {
    return (
      <div className='min-h-screen flex items-center justify-center bg-gray-50'>
        <div className='text-center'>
          <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4' />
          <div className='text-gray-500'>加载中...</div>
        </div>
      </div>
    )
  }

  return (
    <div className='min-h-screen bg-gray-50 flex flex-col'>
      <nav className='bg-white shadow-sm border-b border-gray-200'>
        <div className='max-w-full mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex justify-between items-center h-14'>
            <div className='flex items-center space-x-4'>
              <button
                onClick={() => navigate('/documents')}
                className='text-gray-600 hover:text-gray-900'
              >
                ← 返回
              </button>
              <div className='h-5 w-px bg-gray-300' />
              {editingTitle ? (
                <div className='flex items-center space-x-2'>
                  <input
                    type='text'
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onBlur={handleTitleUpdate}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleTitleUpdate()
                      if (e.key === 'Escape') {
                        setTitleInput(title)
                        setEditingTitle(false)
                      }
                    }}
                    className='px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg font-semibold'
                    autoFocus
                  />
                </div>
              ) : (
                <h1 
                  onClick={() => canEdit() && setEditingTitle(true)}
                  className={`text-lg font-semibold text-gray-900 ${canEdit() ? 'cursor-pointer hover:text-blue-600' : ''}`}
                >
                  {title}
                </h1>
              )}
            </div>

            <div className='flex items-center space-x-4'>
              <div className='flex items-center space-x-2'>
                <div className={`w-2 h-2 rounded-full ${getConnectionStatusColor()}`} />
                <span className='text-sm text-gray-600'>
                  {getConnectionStatusText()}
                </span>
                {serverVersion > 0 && (
                  <span className='text-xs text-gray-400'>v{serverVersion}</span>
                )}
              </div>

              {onlineUsers.length > 0 && (
                <div className='flex items-center -space-x-2'>
                  {onlineUsers.filter(u => u.userId !== user?.id).map((u) => (
                    <div
                      key={u.userId}
                      className='w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-medium'
                      style={{ backgroundColor: u.color }}
                      title={u.username}
                    >
                      {u.username.charAt(0).toUpperCase()}
                    </div>
                  ))}
                  {onlineUsers.length > 1 && (
                    <span className='text-xs text-gray-500 ml-3'>
                      {onlineUsers.length} 人在线
                    </span>
                  )}
                </div>
              )}

              {canEdit() && (
                <button
                  onClick={handleCreateSnapshot}
                  disabled={savingSnapshot || connectionState !== 'connected'}
                  className='px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  {savingSnapshot ? '保存中...' : '创建快照'}
                </button>
              )}

              <button
                onClick={() => setShowVersions(!showVersions)}
                className={`px-3 py-1.5 text-sm rounded ${
                  showVersions ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                版本历史
              </button>

              {user && (
                <div className='flex items-center space-x-2'>
                  <div
                    className='w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium'
                    style={{ backgroundColor: user.avatarColor }}
                  >
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                  <span className='text-sm text-gray-700'>{user.username}</span>
                  <span className='text-xs px-2 py-1 bg-gray-100 rounded text-gray-600'>
                    {document?.userRole || 'owner'}
                  </span>
                </div>
              )}

              <button
                onClick={handleLogout}
                className='text-sm text-gray-600 hover:text-gray-900'
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      </nav>

      {connectionState === 'synchronizing' && (
        <div className='bg-yellow-50 border-b border-yellow-200 py-2 px-4'>
          <div className='max-w-full mx-auto flex items-center space-x-2 text-sm text-yellow-700'>
            <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-700' />
            <span>正在同步文档状态...</span>
          </div>
        </div>
      )}

      <main className='flex-1 flex overflow-hidden'>
        <div className='flex-1 overflow-y-auto p-4'>
          <div className='max-w-4xl mx-auto'>
            {user && (
              <RichEditor
                ydoc={ydoc}
                userId={user.id}
                userName={user.username}
                userColor={user.avatarColor}
                editable={canEdit()}
                onSelectionChange={setSelectedText}
                onSelectionUpdate={sendCursorPosition}
                remoteCursors={remoteCursors}
              />
            )}

            {document && (
              <div className='mt-4 p-4 bg-white rounded-lg shadow'>
                <div className='text-sm text-gray-500 space-y-1'>
                  <p>创建者: {document.ownerName}</p>
                  <p>创建时间: {formatDate(document.createdAt)}</p>
                  <p>最后更新: {formatDate(document.updatedAt)}</p>
                  <p>我的权限: {document.userRole || 'owner'}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {showVersions ? (
          <VersionHistoryPanel
            versions={versions}
            documentId={id!}
            onRollback={handleRollback}
          />
        ) : (
          <CommentsPanel
            comments={comments}
            documentId={id!}
            selectedText={selectedText}
            onAddComment={handleAddComment}
            onResolveComment={handleResolveComment}
            onReopenComment={handleReopenComment}
            onReplyAdded={handleReplyAdded}
            showResolved={showResolvedComments}
            onToggleShowResolved={setShowResolvedComments}
          />
        )}
      </main>
    </div>
  )
}
