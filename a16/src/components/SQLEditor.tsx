import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import { format } from 'sql-formatter'

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'ORDER BY', 'GROUP BY', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN',
  'INNER JOIN', 'OUTER JOIN', 'FULL JOIN', 'CROSS JOIN', 'ON', 'AS', 'AND', 'OR',
  'NOT', 'IN', 'LIKE', 'LIMIT', 'OFFSET', 'DISTINCT', 'ALL', 'HAVING', 'UNION',
  'UNION ALL', 'EXISTS', 'BETWEEN', 'IS NULL', 'IS NOT NULL', 'CASE', 'WHEN',
  'THEN', 'ELSE', 'END', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM',
  'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'TRUNCATE TABLE', 'INDEX', 'PRIMARY KEY',
  'FOREIGN KEY', 'REFERENCES', 'UNIQUE', 'NOT NULL', 'DEFAULT', 'AUTO_INCREMENT',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COUNT(*)', 'NOW()', 'CURRENT_DATE',
  'CONCAT', 'SUBSTRING', 'UPPER', 'LOWER', 'LENGTH', 'ROUND', 'FLOOR', 'CEIL',
  'DESCRIBE', 'EXPLAIN', 'SHOW', 'USE', 'COMMIT', 'ROLLBACK', 'BEGIN', 'START TRANSACTION'
]

interface Suggestion {
  text: string
  type: 'keyword' | 'table' | 'column'
}

export default function SQLEditor() {
  const { activeConnectionId, queryResult, setQueryResult, loadHistory } = useAppStore()
  const [sql, setSql] = useState('SELECT * FROM users LIMIT 100')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tables, setTables] = useState<string[]>([])
  const [tableStructure, setTableStructure] = useState<any[]>([])
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 100

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(400)

  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const [suggestionPosition, setSuggestionPosition] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (activeConnectionId) {
      loadTables()
    } else {
      setTables([])
    }
  }, [activeConnectionId])

  useEffect(() => {
    const container = tableContainerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
      }
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [queryResult])

  const loadTables = async () => {
    if (!window.electronAPI || !activeConnectionId) return
    try {
      const response = await window.electronAPI.database.tables(activeConnectionId)
      if (response.success) {
        setTables(response.data || [])
      }
    } catch (err: any) {
      console.error('加载表失败:', err)
    }
  }

  const loadTableStructure = async (tableName: string) => {
    if (!window.electronAPI || !activeConnectionId) return
    try {
      const response = await window.electronAPI.database.tableStructure(activeConnectionId, tableName)
      if (response.success) {
        setTableStructure(response.data || [])
        setSelectedTable(tableName)
      }
    } catch (err: any) {
      console.error('加载表结构失败:', err)
    }
  }

  const handleExecute = async () => {
    if (!window.electronAPI || !activeConnectionId) {
      setError('请先选择数据库连接')
      return
    }

    setLoading(true)
    setError(null)
    setQueryResult(null)
    setCurrentPage(1)

    try {
      const response = await window.electronAPI.database.query(activeConnectionId, sql)
      if (response.success && response.data) {
        setQueryResult(response.data)
        loadHistory()
      } else {
        setError(response.error || '执行失败')
      }
    } catch (err: any) {
      setError(err.message || '执行失败')
    } finally {
      setLoading(false)
    }
  }

  const handleFormat = () => {
    try {
      const formatted = format(sql, {
        language: 'sql',
        indent: '  ',
        linesBetweenQueries: 2
      })
      setSql(formatted)
    } catch (err: any) {
      setError('SQL 格式化失败: ' + err.message)
    }
  }

  const handleSelectAll = async (tableName: string) => {
    setSql(`SELECT * FROM ${tableName} LIMIT 1000`)
    await loadTableStructure(tableName)
  }

  const handleExportCSV = async () => {
    if (!window.electronAPI || !queryResult) return
    try {
      await window.electronAPI.export.csv(queryResult.rows, 'query_result.csv')
    } catch (err: any) {
      console.error('导出失败:', err)
    }
  }

  const handleExportExcel = async () => {
    if (!window.electronAPI || !queryResult) return
    try {
      await window.electronAPI.export.excel(queryResult.rows, 'QueryResult', 'query_result.xlsx')
    } catch (err: any) {
      console.error('导出失败:', err)
    }
  }

  const getCursorWord = useCallback(() => {
    if (!textareaRef.current) return null
    const textarea = textareaRef.current
    const cursorPos = textarea.selectionStart
    const textBeforeCursor = sql.substring(0, cursorPos)
    
    const match = textBeforeCursor.match(/[\w.]+$/)
    if (match) {
      return {
        word: match[0],
        start: cursorPos - match[0].length,
        end: cursorPos
      }
    }
    return null
  }, [sql])

  const getSuggestions = useCallback((word: string): Suggestion[] => {
    const lowerWord = word.toLowerCase()
    const results: Suggestion[] = []

    SQL_KEYWORDS.forEach(keyword => {
      if (keyword.toLowerCase().startsWith(lowerWord)) {
        results.push({ text: keyword, type: 'keyword' })
      }
    })

    tables.forEach(table => {
      if (table.toLowerCase().startsWith(lowerWord)) {
        results.push({ text: table, type: 'table' })
      }
    })

    tableStructure.forEach((col: any) => {
      const colName = col.column_name || col.field || col.Field
      if (colName && colName.toLowerCase().startsWith(lowerWord)) {
        results.push({ text: colName, type: 'column' })
      }
    })

    return results.slice(0, 20)
  }, [tables, tableStructure])

  const getCaretPosition = useCallback(() => {
    if (!textareaRef.current) return { top: 0, left: 0 }
    const textarea = textareaRef.current
    const mirror = document.createElement('div')
    const computed = window.getComputedStyle(textarea)

    mirror.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow: hidden;
      font-family: ${computed.fontFamily};
      font-size: ${computed.fontSize};
      font-weight: ${computed.fontWeight};
      letter-spacing: ${computed.letterSpacing};
      line-height: ${computed.lineHeight};
      padding: ${computed.padding};
      width: ${textarea.offsetWidth}px;
    `

    const textBeforeCursor = sql.substring(0, textarea.selectionStart)
    mirror.textContent = textBeforeCursor.replace(/\n/g, '\n\u200b')

    document.body.appendChild(mirror)

    const rect = mirror.getBoundingClientRect()
    const textareaRect = textarea.getBoundingClientRect()

    document.body.removeChild(mirror)

    return {
      top: rect.bottom - textareaRect.top + textarea.scrollTop + 5,
      left: rect.right - textareaRect.left
    }
  }, [sql])

  const handleInput = useCallback(() => {
    const cursorInfo = getCursorWord()
    if (cursorInfo && cursorInfo.word.length >= 1) {
      const newSuggestions = getSuggestions(cursorInfo.word)
      if (newSuggestions.length > 0) {
        setSuggestions(newSuggestions)
        setSelectedSuggestionIndex(0)
        setSuggestionPosition(getCaretPosition())
        setShowSuggestions(true)
        return
      }
    }
    setShowSuggestions(false)
  }, [getCursorWord, getSuggestions, getCaretPosition])

  const insertSuggestion = useCallback((suggestion: Suggestion) => {
    if (!textareaRef.current) return

    const cursorInfo = getCursorWord()
    if (!cursorInfo) {
      setShowSuggestions(false)
      return
    }

    const newSql = 
      sql.substring(0, cursorInfo.start) + 
      suggestion.text + 
      sql.substring(cursorInfo.end)

    setSql(newSql)
    setShowSuggestions(false)

    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = cursorInfo.start + suggestion.text.length
        textareaRef.current.selectionStart = newPos
        textareaRef.current.selectionEnd = newPos
        textareaRef.current.focus()
      }
    }, 0)
  }, [sql, getCursorWord])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      setShowSuggestions(false)
      handleExecute()
      return
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault()
      handleFormat()
      return
    }

    if (e.key === 'Escape') {
      if (showSuggestions) {
        e.preventDefault()
        setShowSuggestions(false)
        return
      }
    }

    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev => 
          Math.min(prev + 1, suggestions.length - 1)
        )
        return
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev => 
          Math.max(prev - 1, 0)
        )
        return
      }

      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (suggestions[selectedSuggestionIndex]) {
          insertSuggestion(suggestions[selectedSuggestionIndex])
        }
        return
      }
    }
  }, [showSuggestions, suggestions, selectedSuggestionIndex, insertSuggestion])

  const getSortedRows = useCallback(() => {
    if (!queryResult || !sortColumn) return queryResult?.rows || []
    return [...queryResult.rows].sort((a, b) => {
      const aVal = a[sortColumn]
      const bVal = b[sortColumn]
      if (aVal === bVal) return 0
      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1
      const result = aVal > bVal ? 1 : -1
      return sortDirection === 'asc' ? result : -result
    })
  }, [queryResult, sortColumn, sortDirection])

  const sortedRows = useMemo(() => getSortedRows(), [getSortedRows])
  const totalPages = queryResult ? Math.ceil(queryResult.rowCount / pageSize) : 0

  const rowHeight = 36
  const overscanCount = 10

  const visibleRows = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscanCount)
    const endIndex = Math.min(
      sortedRows.length,
      Math.ceil((scrollTop + containerHeight) / rowHeight) + overscanCount
    )
    
    return sortedRows.slice(startIndex, endIndex).map((row, idx) => ({
      row,
      index: startIndex + idx
    }))
  }, [sortedRows, scrollTop, containerHeight])

  const totalHeight = sortedRows.length * rowHeight

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value)
      } catch {
        return String(value)
      }
    }
    return String(value)
  }

  const getSuggestionIcon = (type: Suggestion['type']) => {
    switch (type) {
      case 'keyword': return '🔑'
      case 'table': return '📋'
      case 'column': return '📦'
      default: return '•'
    }
  }

  return (
    <div className="h-full flex">
      <aside className="w-64 bg-white dark:bg-dark-800 border-r border-gray-200 dark:border-dark-700 flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-200 dark:border-dark-700">
          <h3 className="font-medium">数据库表</h3>
          <button
            onClick={loadTables}
            className="text-xs text-primary-600 hover:underline mt-1"
          >
            🔄 刷新
          </button>
        </div>
        <div className="flex-1 overflow-auto p-2">
          {!activeConnectionId ? (
            <p className="text-center text-gray-400 dark:text-gray-500 py-8 text-sm">
              请先在顶部选择数据库连接
            </p>
          ) : tables.length === 0 ? (
            <p className="text-center text-gray-400 dark:text-gray-500 py-8 text-sm">
              暂无数据表
            </p>
          ) : (
            <ul className="space-y-1">
              {tables.map((table) => (
                <li
                  key={table}
                  onClick={() => loadTableStructure(table)}
                  onDoubleClick={() => handleSelectAll(table)}
                  className={`px-2 py-1.5 rounded cursor-pointer text-sm transition-colors flex items-center justify-between group ${
                    selectedTable === table
                      ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                      : 'hover:bg-gray-100 dark:hover:bg-dark-700'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <span>📋</span>
                    <span>{table}</span>
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSelectAll(table)
                    }}
                    className="text-xs text-primary-600 opacity-0 group-hover:opacity-100"
                  >
                    SELECT
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {tableStructure.length > 0 && (
          <div className="border-t border-gray-200 dark:border-dark-700 p-3">
            <h4 className="font-medium text-sm mb-2">📋 {selectedTable}</h4>
            <div className="max-h-48 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 dark:text-gray-400">
                    <th className="text-left">字段</th>
                    <th className="text-left">类型</th>
                  </tr>
                </thead>
                <tbody>
                  {tableStructure.map((col, idx) => (
                    <tr key={idx} className="border-t border-gray-100 dark:border-dark-700">
                      <td className="py-0.5">{col.column_name || col.field || col.Field}</td>
                      <td className="py-0.5 text-gray-500 dark:text-gray-400">
                        {col.data_type || col.type || col.Type}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={handleExecute}
                disabled={loading || !activeConnectionId}
                className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded text-sm transition-colors"
              >
                {loading ? '⏳ 执行中...' : '▶ 执行 (Ctrl+Enter)'}
              </button>
              <button
                onClick={handleFormat}
                disabled={!sql.trim()}
                className="px-4 py-1.5 bg-gray-600 hover:bg-gray-700 disabled:opacity-50 text-white rounded text-sm transition-colors"
              >
                格式化 (Ctrl+I)
              </button>
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              提示: Ctrl+Enter 执行查询，Tab/Enter 确认补全
            </span>
          </div>

          <div className="flex-1 flex flex-col min-h-0 relative">
            <div className="relative flex-1 min-h-[200px]">
              <textarea
                ref={textareaRef}
                value={sql}
                onChange={(e) => {
                  setSql(e.target.value)
                  setTimeout(handleInput, 0)
                }}
                onKeyDown={handleKeyDown}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="在此输入 SQL 查询语句... 支持自动补全"
                className="w-full h-full min-h-[200px] p-4 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
                spellCheck={false}
              />

              {showSuggestions && suggestions.length > 0 && (
                <div
                  className="absolute z-50 bg-white dark:bg-dark-800 border border-gray-300 dark:border-dark-600 rounded-lg shadow-xl overflow-hidden"
                  style={{
                    top: suggestionPosition.top,
                    left: suggestionPosition.left,
                    maxHeight: '300px',
                    minWidth: '200px'
                  }}
                >
                  <div className="px-2 py-1 bg-gray-100 dark:bg-dark-700 text-xs text-gray-500 border-b border-gray-200 dark:border-dark-600">
                    ↓↑ 选择 · Tab/Enter 确认 · Esc 取消
                  </div>
                  <div className="overflow-auto max-h-64">
                    {suggestions.map((suggestion, index) => (
                      <div
                        key={suggestion.text + '-' + index}
                        className={`px-3 py-1.5 cursor-pointer text-sm flex items-center gap-2 ${
                          index === selectedSuggestionIndex
                            ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                            : 'hover:bg-gray-50 dark:hover:bg-dark-700'
                        }`}
                        onClick={() => insertSuggestion(suggestion)}
                        onMouseEnter={() => setSelectedSuggestionIndex(index)}
                      >
                        <span>{getSuggestionIcon(suggestion.type)}</span>
                        <span className="font-mono">{suggestion.text}</span>
                        <span className="ml-auto text-xs text-gray-400">
                          {suggestion.type === 'keyword' ? '关键字' : 
                           suggestion.type === 'table' ? '表' : '字段'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-3 p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded text-sm">
                ❌ {error}
              </div>
            )}
          </div>

          {queryResult && (
            <div className="mt-4 border-t border-gray-200 dark:border-dark-700 pt-4 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm">
                  <span className="text-green-600 dark:text-green-400">✓ 查询成功</span>
                  <span className="text-gray-500 dark:text-gray-400 ml-3">
                    {queryResult.rowCount} 行
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 ml-3">
                    耗时: {queryResult.executionTime}ms
                  </span>
                  {queryResult.affectedRows !== undefined && (
                    <span className="text-gray-500 dark:text-gray-400 ml-3">
                      影响行数: {queryResult.affectedRows}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleExportCSV}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
                  >
                    📥 导出 CSV
                  </button>
                  <button
                    onClick={handleExportExcel}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
                  >
                    📥 导出 Excel
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden border border-gray-200 dark:border-dark-700 rounded flex flex-col">
                <div className="bg-gray-100 dark:bg-dark-700 overflow-x-auto shrink-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="px-3 py-2 text-left font-medium border-r border-gray-200 dark:border-dark-600 w-12">
                          #
                        </th>
                        {queryResult.columns.map((col) => (
                          <th
                            key={col}
                            onClick={() => {
                              if (sortColumn === col) {
                                setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                              } else {
                                setSortColumn(col)
                                setSortDirection('asc')
                              }
                            }}
                            className="px-3 py-2 text-left font-medium border-r border-gray-200 dark:border-dark-600 cursor-pointer hover:bg-gray-200 dark:hover:bg-dark-600 whitespace-nowrap"
                          >
                            {col}
                            {sortColumn === col && (
                              <span className="ml-1">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  </table>
                </div>

                <div
                  ref={tableContainerRef}
                  className="flex-1 overflow-auto"
                  onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
                >
                  <div
                    style={{ height: totalHeight, position: 'relative', width: '100%' }}
                  >
                    <table className="w-full text-sm">
                      <tbody>
                        {visibleRows.map(({ row, index }) => (
                          <tr
                            key={index}
                            className="border-t border-gray-200 dark:border-dark-700 hover:bg-gray-50 dark:hover:bg-dark-800"
                            style={{
                              position: 'absolute',
                              top: index * rowHeight,
                              height: rowHeight,
                              width: '100%',
                              display: 'flex'
                            }}
                          >
                            <td className="px-3 py-1.5 border-r border-gray-200 dark:border-dark-700 text-gray-400 shrink-0 w-12 flex items-center">
                              {index + 1}
                            </td>
                            {queryResult.columns.map((col, colIdx) => {
                              const value = row[col]
                              return (
                                <td
                                  key={col + '-' + colIdx}
                                  className="px-3 py-1.5 border-r border-gray-200 dark:border-dark-700 flex items-center"
                                  style={{ minWidth: '120px', maxWidth: '300px' }}
                                  title={formatValue(value)}
                                >
                                  <span className={value === null || value === undefined ? 'text-gray-400' : ''}>
                                    {formatValue(value)}
                                  </span>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {totalPages > 1 && (
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    第 {currentPage} / {totalPages} 页 (共 {sortedRows.length} 行)
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 bg-gray-200 dark:bg-dark-700 rounded disabled:opacity-50"
                    >
                      上一页
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 bg-gray-200 dark:bg-dark-700 rounded disabled:opacity-50"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
