import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { documentApi } from '../api'
import { Document } from '../types'
import { useAuthStore } from '../store/authStore'

export default function DocumentsPage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    loadDocuments()
  }, [])

  const loadDocuments = async () => {
    try {
      const response = await documentApi.getDocuments()
      setDocuments(response.data)
    } catch (err) {
      console.error('加载文档失败:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!newTitle.trim()) return

    setCreating(true)
    try {
      const response = await documentApi.createDocument({ title: newTitle.trim() })
      navigate(`/documents/${response.data.id}`)
    } catch (err) {
      console.error('创建文档失败:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('zh-CN')
  }

  return (
    <div className='min-h-screen bg-gray-50'>
      <nav className='bg-white shadow-sm'>
        <div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8'>
          <div className='flex justify-between items-center h-16'>
          <h1 className='text-xl font-bold text-gray-900'>协同文档</h1>
          <div className='flex items-center space-x-4'>
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
                  {user.role}
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
      </nav>

      <main className='max-w-7xl mx-auto py-6 sm:px-6 lg:px-8'>
        <div className='mb-6 flex justify-between items-center'>
          <h2 className='text-lg font-semibold text-gray-900'>我的文档</h2>
          <button
            onClick={() => setShowCreate(true)}
            className='inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
          >
            + 新建文档
          </button>
        </div>

        {showCreate && (
          <div className='mb-6 p-4 bg-white rounded-lg shadow'>
            <div className='flex space-x-3'>
              <input
                type='text'
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder='输入文档标题...'
                className='flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500'
                autoFocus
              />
              <button
                onClick={handleCreate}
                disabled={creating}
                className='px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50'
              >
                创建
              </button>
              <button
                onClick={() => {
                  setShowCreate(false)
                  setNewTitle('')
                }}
                className='px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50'
              >
                取消
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className='text-center py-12'>
            <div className='text-gray-500'>加载中...</div>
          </div>
        ) : documents.length === 0 ? (
          <div className='text-center py-12 bg-white rounded-lg shadow'>
            <div className='text-gray-500 mb-4'>还没有文档</div>
            <button
              onClick={() => setShowCreate(true)}
              className='inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700'
            >
              创建第一个文档
            </button>
          </div>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
            {documents.map((doc) => (
              <div
                key={doc.id}
                onClick={() => navigate(`/documents/${doc.id}`)}
                className='bg-white rounded-lg shadow hover:shadow-md cursor-pointer transition-shadow p-6'
              >
                <h3 className='text-lg font-medium text-gray-900 mb-2 line-clamp-2'>
                  {doc.title}
                </h3>
                <div className='text-sm text-gray-500 space-y-1'>
                  <p>创建者: {doc.ownerName}</p>
                  <p>更新于: {formatDate(doc.updatedAt)}</p>
                  <p>我的权限: {doc.userRole}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
