import { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { ConnectionConfig, SSHConfig, DatabaseType } from '../types/electron'

const defaultSSHConfig: SSHConfig = {
  host: '',
  port: 22,
  username: '',
  password: ''
}

const defaultConnection: ConnectionConfig = {
  id: '',
  name: '',
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  username: 'root',
  password: '',
  database: '',
  useSSH: false,
  createdAt: 0,
  updatedAt: 0
}

const dbTypeDefaults: Record<DatabaseType, Partial<ConnectionConfig>> = {
  mysql: { host: 'localhost', port: 3306, username: 'root' },
  postgresql: { host: 'localhost', port: 5432, username: 'postgres' },
  sqlite: { filePath: '' },
  mongodb: { host: 'localhost', port: 27017, username: '' }
}

export default function ConnectionManager() {
  const { connections, addConnection, removeConnection, updateConnection, loadConnections } = useAppStore()
  const [selectedConn, setSelectedConn] = useState<ConnectionConfig | null>(null)
  const [formData, setFormData] = useState<ConnectionConfig>({ ...defaultConnection })
  const [sshConfig, setSSHConfig] = useState<SSHConfig>({ ...defaultSSHConfig })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadConnections()
  }, [])

  const handleNewConnection = () => {
    setSelectedConn(null)
    setFormData({ ...defaultConnection, id: '' })
    setSSHConfig({ ...defaultSSHConfig })
    setTestResult(null)
  }

  const handleSelectConnection = (conn: ConnectionConfig) => {
    setSelectedConn(conn)
    setFormData({ ...conn })
    setSSHConfig(conn.sshConfig || { ...defaultSSHConfig })
    setTestResult(null)
  }

  const handleTypeChange = (type: DatabaseType) => {
    setFormData(prev => ({
      ...prev,
      type,
      ...dbTypeDefaults[type]
    }))
  }

  const handleTestConnection = async () => {
    if (!window.electronAPI) {
      setTestResult({ success: false, message: 'Electron API 不可用' })
      return
    }

    setTesting(true)
    setTestResult(null)

    try {
      const config = { ...formData, sshConfig: formData.useSSH ? sshConfig : undefined }
      const response = await window.electronAPI.connection.test(config)
      setTestResult({
        success: response.success && response.data === true,
        message: response.success && response.data ? '连接成功！' : (response.error || '连接失败')
      })
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || '连接失败' })
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    if (!formData.name) {
      setMessage({ type: 'error', text: '请输入连接名称' })
      return
    }

    if (formData.type !== 'sqlite' && !formData.host) {
      setMessage({ type: 'error', text: '请输入主机地址' })
      return
    }

    if (formData.type === 'sqlite' && !formData.filePath) {
      setMessage({ type: 'error', text: '请选择SQLite数据库文件' })
      return
    }

    if (!window.electronAPI) {
      setMessage({ type: 'error', text: 'Electron API 不可用' })
      return
    }

    try {
      const config = { ...formData, sshConfig: formData.useSSH ? sshConfig : undefined }
      const response = await window.electronAPI.connection.save(config)
      
      if (response.success && response.data) {
        if (selectedConn) {
          updateConnection(response.data)
        } else {
          addConnection(response.data)
        }
        setSelectedConn(response.data)
        setMessage({ type: 'success', text: '保存成功！' })
        setTimeout(() => setMessage(null), 3000)
      } else {
        setMessage({ type: 'error', text: response.error || '保存失败' })
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '保存失败' })
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.electronAPI) return
    if (!confirm('确定要删除此连接吗？')) return

    try {
      const response = await window.electronAPI.connection.delete(id)
      if (response.success) {
        removeConnection(id)
        if (selectedConn?.id === id) {
          handleNewConnection()
        }
        setMessage({ type: 'success', text: '删除成功！' })
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || '删除失败' })
    }
  }

  const handleSelectFile = async () => {
    if (!window.electronAPI) return
    
    const response = await window.electronAPI.file.open([
      { name: 'SQLite 数据库', extensions: ['db', 'sqlite', 'sqlite3'] },
      { name: '所有文件', extensions: ['*'] }
    ])
    
    if (response.success && response.data) {
      setFormData(prev => ({ ...prev, filePath: response.data! }))
    }
  }

  const getDbIcon = (type: DatabaseType) => {
    switch (type) {
      case 'mysql': return '🐬'
      case 'postgresql': return '🐘'
      case 'sqlite': return '📁'
      case 'mongodb': return '🍃'
      default: return '🗄️'
    }
  }

  return (
    <div className="h-full flex">
      <aside className="w-72 bg-white dark:bg-dark-800 border-r border-gray-200 dark:border-dark-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-dark-700">
          <button
            onClick={handleNewConnection}
            className="w-full py-2 bg-primary-600 hover:bg-primary-700 text-white rounded transition-colors"
          >
            + 新建连接
          </button>
        </div>

        <div className="flex-1 overflow-auto p-2">
          {connections.length === 0 ? (
            <p className="text-center text-gray-400 dark:text-gray-500 py-8">
              暂无连接，点击上方按钮创建
            </p>
          ) : (
            <ul className="space-y-1">
              {connections.map((conn) => (
                <li
                  key={conn.id}
                  onClick={() => handleSelectConnection(conn)}
                  className={`p-3 rounded cursor-pointer transition-colors ${
                    selectedConn?.id === conn.id
                      ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                      : 'hover:bg-gray-100 dark:hover:bg-dark-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{getDbIcon(conn.type)}</span>
                      <span className="font-medium">{conn.name}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(conn.id)
                      }}
                      className="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 hover:opacity-100"
                    >
                      🗑️
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {conn.type} - {conn.host || conn.filePath}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6">
        {message && (
          <div className={`mb-4 p-3 rounded ${
            message.type === 'success' 
              ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' 
              : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-bold mb-6">
            {selectedConn ? '编辑连接' : '新建连接'}
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">连接名称 *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="例如：生产数据库"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">数据库类型 *</label>
              <select
                value={formData.type}
                onChange={(e) => handleTypeChange(e.target.value as DatabaseType)}
                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="mysql">🐬 MySQL</option>
                <option value="postgresql">🐘 PostgreSQL</option>
                <option value="sqlite">📁 SQLite</option>
                <option value="mongodb">🍃 MongoDB</option>
              </select>
            </div>

            {formData.type !== 'sqlite' ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">主机 *</label>
                    <input
                      type="text"
                      value={formData.host || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, host: e.target.value }))}
                      className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">端口 *</label>
                    <input
                      type="number"
                      value={formData.port || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, port: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">用户名</label>
                    <input
                      type="text"
                      value={formData.username || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
                      className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">密码</label>
                    <input
                      type="password"
                      value={formData.password || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">数据库</label>
                  <input
                    type="text"
                    value={formData.database || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, database: e.target.value }))}
                    className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-1">数据库文件 *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.filePath || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, filePath: e.target.value }))}
                    className="flex-1 px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="选择SQLite数据库文件"
                  />
                  <button
                    onClick={handleSelectFile}
                    className="px-4 py-2 bg-gray-200 dark:bg-dark-600 hover:bg-gray-300 dark:hover:bg-dark-500 rounded transition-colors"
                  >
                    浏览
                  </button>
                </div>
              </div>
            )}

            {formData.type !== 'sqlite' && (
              <div className="border-t border-gray-200 dark:border-dark-700 pt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.useSSH}
                    onChange={(e) => setFormData(prev => ({ ...prev, useSSH: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm font-medium">使用 SSH 隧道</span>
                </label>

                {formData.useSSH && (
                  <div className="mt-4 space-y-4 pl-6 border-l-2 border-gray-200 dark:border-dark-600">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">SSH 主机 *</label>
                        <input
                          type="text"
                          value={sshConfig.host}
                          onChange={(e) => setSSHConfig(prev => ({ ...prev, host: e.target.value }))}
                          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">SSH 端口 *</label>
                        <input
                          type="number"
                          value={sshConfig.port}
                          onChange={(e) => setSSHConfig(prev => ({ ...prev, port: parseInt(e.target.value) || 22 }))}
                          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">SSH 用户名 *</label>
                        <input
                          type="text"
                          value={sshConfig.username}
                          onChange={(e) => setSSHConfig(prev => ({ ...prev, username: e.target.value }))}
                          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">SSH 密码</label>
                        <input
                          type="password"
                          value={sshConfig.password || ''}
                          onChange={(e) => setSSHConfig(prev => ({ ...prev, password: e.target.value }))}
                          className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {testResult && (
            <div className={`mt-4 p-3 rounded ${
              testResult.success 
                ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' 
                : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
            }`}>
              {testResult.success ? '✅ ' : '❌ '}{testResult.message}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:opacity-50 text-white rounded transition-colors"
            >
              {testing ? '测试中...' : '测试连接'}
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded transition-colors"
            >
              保存连接
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
