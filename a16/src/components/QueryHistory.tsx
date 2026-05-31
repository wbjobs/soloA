import { useState, useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import { useNavigate } from 'react-router-dom'

export default function QueryHistory() {
  const { queryHistory, loadHistory, setActiveConnection, activeConnectionId } = useAppStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [filterConnection, setFilterConnection] = useState<string>('')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [selectedHistory, setSelectedHistory] = useState<string | null>(null)
  const navigate = useNavigate()

  const uniqueConnections = useMemo(() => {
    const conns = new Map<string, string>()
    queryHistory.forEach(h => {
      conns.set(h.connectionId, h.connectionName)
    })
    return Array.from(conns.entries())
  }, [queryHistory])

  const filteredHistory = useMemo(() => {
    return queryHistory.filter(h => {
      if (searchTerm && !h.sql.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false
      }
      if (filterConnection && h.connectionId !== filterConnection) {
        return false
      }
      if (filterStartDate) {
        const startDate = new Date(filterStartDate).getTime()
        if (h.executedAt < startDate) return false
      }
      if (filterEndDate) {
        const endDate = new Date(filterEndDate).getTime() + 86400000
        if (h.executedAt > endDate) return false
      }
      return true
    })
  }, [queryHistory, searchTerm, filterConnection, filterStartDate, filterEndDate])

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const formatSQL = (sql: string) => {
    return sql.replace(/\s+/g, ' ').trim()
  }

  const handleReuse = (history: any) => {
    setActiveConnection(history.connectionId)
    navigate('/', { state: { sql: history.sql } })
  }

  const handleDelete = async (id: string) => {
    if (!window.electronAPI) return
    if (!confirm('确定要删除此历史记录吗？')) return

    try {
      await window.electronAPI.history.delete(id)
      loadHistory()
    } catch (err: any) {
      console.error('删除失败:', err)
    }
  }

  const handleClearAll = async () => {
    if (!window.electronAPI) return
    if (!confirm('确定要清空所有查询历史吗？此操作不可恢复！')) return

    try {
      await window.electronAPI.history.clear()
      loadHistory()
    } catch (err: any) {
      console.error('清空失败:', err)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('已复制到剪贴板')
    })
  }

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">🕐 查询历史</h2>
        <div className="flex gap-2">
          <button
            onClick={loadHistory}
            className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm"
          >
            🔄 刷新
          </button>
          {queryHistory.length > 0 && (
            <button
              onClick={handleClearAll}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
            >
              🗑️ 清空全部
            </button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-dark-800 rounded-lg border border-gray-200 dark:border-dark-700 p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">搜索 SQL</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="输入关键词搜索..."
              className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">按连接筛选</label>
            <select
              value={filterConnection}
              onChange={(e) => setFilterConnection(e.target.value)}
              className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 text-sm"
            >
              <option value="">全部连接</option>
              {uniqueConnections.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">开始日期</label>
            <input
              type="date"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">结束日期</label>
            <input
              type="date"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 text-sm"
            />
          </div>
        </div>
        <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          共 {filteredHistory.length} 条记录（总 {queryHistory.length} 条）
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white dark:bg-dark-800 rounded-lg border border-gray-200 dark:border-dark-700">
        {filteredHistory.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <p className="text-6xl mb-4">📭</p>
              <p>{queryHistory.length === 0 ? '暂无查询历史' : '没有符合条件的记录'}</p>
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-dark-700 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left font-medium">执行时间</th>
                <th className="px-4 py-3 text-left font-medium">连接</th>
                <th className="px-4 py-3 text-left font-medium">SQL</th>
                <th className="px-4 py-3 text-left font-medium w-24">行数</th>
                <th className="px-4 py-3 text-left font-medium w-24">耗时</th>
                <th className="px-4 py-3 text-center font-medium w-32">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.map((h) => (
                <tr
                  key={h.id}
                  className={`border-t border-gray-200 dark:border-dark-700 hover:bg-gray-50 dark:hover:bg-dark-800 cursor-pointer ${
                    selectedHistory === h.id ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                  }`}
                  onClick={() => setSelectedHistory(selectedHistory === h.id ? null : h.id)}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                    {formatDate(h.executedAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      activeConnectionId === h.connectionId
                        ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                        : 'bg-gray-100 dark:bg-dark-700 text-gray-600 dark:text-gray-300'
                    }`}>
                      {h.connectionName}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <code className="font-mono text-xs block truncate max-w-xl">
                      {formatSQL(h.sql)}
                    </code>
                    {selectedHistory === h.id && (
                      <div className="mt-2 p-3 bg-gray-50 dark:bg-dark-900 rounded border border-gray-200 dark:border-dark-600">
                        <pre className="font-mono text-xs whitespace-pre-wrap break-all">
                          {h.sql}
                        </pre>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{h.rowCount}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500 dark:text-gray-400">
                    {h.executionTime}ms
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex justify-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleReuse(h)
                        }}
                        className="px-2 py-1 bg-primary-600 hover:bg-primary-700 text-white rounded text-xs"
                        title="复用此查询"
                      >
                        复用
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          copyToClipboard(h.sql)
                        }}
                        className="px-2 py-1 bg-gray-500 hover:bg-gray-600 text-white rounded text-xs"
                        title="复制SQL"
                      >
                        复制
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(h.id)
                        }}
                        className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs"
                        title="删除"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
