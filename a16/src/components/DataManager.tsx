import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'

interface EditRow {
  data: Record<string, any>
  where: Record<string, any>
  isNew: boolean
}

export default function DataManager() {
  const { activeConnectionId } = useAppStore()
  const [tables, setTables] = useState<string[]>([])
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [tableStructure, setTableStructure] = useState<any[]>([])
  const [tableData, setTableData] = useState<any[]>([])
  const [columns, setColumns] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [editingRow, setEditingRow] = useState<EditRow | null>(null)
  const [viewMode, setViewMode] = useState<'data' | 'structure'>('data')
  const [page, setPage] = useState(1)
  const pageSize = 100
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (activeConnectionId) {
      loadTables()
    } else {
      setTables([])
      setSelectedTable(null)
    }
  }, [activeConnectionId])

  useEffect(() => {
    if (selectedTable) {
      if (viewMode === 'data') {
        loadTableData()
      } else {
        loadTableStructure()
      }
    }
  }, [selectedTable, viewMode, page])

  const loadTables = async () => {
    if (!window.electronAPI || !activeConnectionId) return
    try {
      const response = await window.electronAPI.database.tables(activeConnectionId)
      if (response.success) {
        setTables(response.data || [])
      }
    } catch (err: any) {
      setError('加载表失败: ' + err.message)
    }
  }

  const loadTableStructure = async () => {
    if (!window.electronAPI || !activeConnectionId || !selectedTable) return
    setLoading(true)
    setError(null)
    try {
      const response = await window.electronAPI.database.tableStructure(activeConnectionId, selectedTable)
      if (response.success) {
        setTableStructure(response.data || [])
      }
    } catch (err: any) {
      setError('加载表结构失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const loadTableData = async () => {
    if (!window.electronAPI || !activeConnectionId || !selectedTable) return
    setLoading(true)
    setError(null)
    try {
      const response = await window.electronAPI.database.query(
        activeConnectionId,
        `SELECT * FROM ${selectedTable} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`
      )
      if (response.success && response.data) {
        setTableData(response.data.rows || [])
        setColumns(response.data.columns || [])
      }
    } catch (err: any) {
      setError('加载数据失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleSelectTable = (table: string) => {
    setSelectedTable(table)
    setPage(1)
    setEditingRow(null)
  }

  const handleNewRow = () => {
    const data: Record<string, any> = {}
    columns.forEach(col => {
      data[col] = ''
    })
    setEditingRow({
      data,
      where: {},
      isNew: true
    })
  }

  const handleEditRow = (row: Record<string, any>) => {
    const where: Record<string, any> = {}
    tableStructure.forEach((col: any) => {
      const colName = col.column_name || col.field || col.Field
      if (colName && row[colName] !== undefined) {
        where[colName] = row[colName]
      }
    })
    if (Object.keys(where).length === 0) {
      columns.forEach(col => {
        where[col] = row[col]
      })
    }
    setEditingRow({
      data: { ...row },
      where,
      isNew: false
    })
  }

  const handleDeleteRow = async (row: Record<string, any>) => {
    if (!window.electronAPI || !activeConnectionId || !selectedTable) return
    if (!confirm('确定要删除此行吗？')) return

    const where: Record<string, any> = {}
    tableStructure.forEach((col: any) => {
      const colName = col.column_name || col.field || col.Field
      if (colName && row[colName] !== undefined) {
        where[colName] = row[colName]
      }
    })
    if (Object.keys(where).length === 0) {
      columns.forEach(col => {
        where[col] = row[col]
      })
    }

    try {
      const response = await window.electronAPI.database.delete(activeConnectionId, selectedTable, where)
      if (response.success) {
        showMessage('success', `删除成功，影响 ${response.data} 行`)
        loadTableData()
      } else {
        showMessage('error', response.error || '删除失败')
      }
    } catch (err: any) {
      showMessage('error', '删除失败: ' + err.message)
    }
  }

  const handleSaveRow = async () => {
    if (!window.electronAPI || !activeConnectionId || !selectedTable || !editingRow) return

    try {
      if (editingRow.isNew) {
        const response = await window.electronAPI.database.insert(
          activeConnectionId,
          selectedTable,
          editingRow.data
        )
        if (response.success) {
          showMessage('success', '插入成功')
          setEditingRow(null)
          loadTableData()
        } else {
          showMessage('error', response.error || '插入失败')
        }
      } else {
        const response = await window.electronAPI.database.update(
          activeConnectionId,
          selectedTable,
          editingRow.data,
          editingRow.where
        )
        if (response.success) {
          showMessage('success', `更新成功，影响 ${response.data} 行`)
          setEditingRow(null)
          loadTableData()
        } else {
          showMessage('error', response.error || '更新失败')
        }
      }
    } catch (err: any) {
      showMessage('error', '保存失败: ' + err.message)
    }
  }

  const handleImportCSV = async () => {
    if (!window.electronAPI || !activeConnectionId || !selectedTable) return

    try {
      const response = await window.electronAPI.import.csv()
      if (response.success && response.data && response.data.length > 0) {
        let success = 0
        let failed = 0
        for (const row of response.data) {
          try {
            await window.electronAPI.database.insert(activeConnectionId, selectedTable, row)
            success++
          } catch {
            failed++
          }
        }
        showMessage('success', `导入完成：成功 ${success} 条，失败 ${failed} 条`)
        loadTableData()
      }
    } catch (err: any) {
      showMessage('error', '导入失败: ' + err.message)
    }
  }

  const handleImportExcel = async () => {
    if (!window.electronAPI || !activeConnectionId || !selectedTable) return

    try {
      const response = await window.electronAPI.import.excel()
      if (response.success && response.data && response.data.length > 0) {
        let success = 0
        let failed = 0
        for (const row of response.data) {
          try {
            await window.electronAPI.database.insert(activeConnectionId, selectedTable, row)
            success++
          } catch {
            failed++
          }
        }
        showMessage('success', `导入完成：成功 ${success} 条，失败 ${failed} 条`)
        loadTableData()
      }
    } catch (err: any) {
      showMessage('error', '导入失败: ' + err.message)
    }
  }

  const handleExportCSV = async () => {
    if (!window.electronAPI || !tableData.length) return
    try {
      await window.electronAPI.export.csv(tableData, `${selectedTable}_data.csv`)
    } catch (err: any) {
      showMessage('error', '导出失败: ' + err.message)
    }
  }

  const handleExportExcel = async () => {
    if (!window.electronAPI || !tableData.length) return
    try {
      await window.electronAPI.export.excel(tableData, selectedTable || 'Data', `${selectedTable}_data.xlsx`)
    } catch (err: any) {
      showMessage('error', '导出失败: ' + err.message)
    }
  }

  const getColumnInfo = (col: any) => ({
    name: col.column_name || col.field || col.Field || col.name,
    type: col.data_type || col.type || col.Type || col.Type || 'unknown',
    nullable: col.is_nullable === 'YES' || col.Null === 'YES',
    default: col.column_default || col.Default,
    primaryKey: col.primary_key || col.Key === 'PRI'
  })

  return (
    <div className="h-full flex">
      <aside className="w-64 bg-white dark:bg-dark-800 border-r border-gray-200 dark:border-dark-700 flex flex-col shrink-0">
        <div className="p-3 border-b border-gray-200 dark:border-dark-700">
          <h3 className="font-medium">数据库表</h3>
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
                  onClick={() => handleSelectTable(table)}
                  className={`px-2 py-1.5 rounded cursor-pointer text-sm transition-colors ${
                    selectedTable === table
                      ? 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300'
                      : 'hover:bg-gray-100 dark:hover:bg-dark-700'
                  }`}
                >
                  📋 {table}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col p-4 overflow-hidden">
        {message && (
          <div className={`mb-3 p-2 rounded text-sm ${
            message.type === 'success'
              ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
              : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        {error && (
          <div className="mb-3 p-2 rounded text-sm bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {selectedTable ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="font-medium">📋 {selectedTable}</h2>
                <div className="flex rounded border border-gray-300 dark:border-dark-600 overflow-hidden">
                  <button
                    onClick={() => setViewMode('data')}
                    className={`px-3 py-1 text-sm transition-colors ${
                      viewMode === 'data'
                        ? 'bg-primary-600 text-white'
                        : 'hover:bg-gray-100 dark:hover:bg-dark-700'
                    }`}
                  >
                    数据
                  </button>
                  <button
                    onClick={() => setViewMode('structure')}
                    className={`px-3 py-1 text-sm transition-colors ${
                      viewMode === 'structure'
                        ? 'bg-primary-600 text-white'
                        : 'hover:bg-gray-100 dark:hover:bg-dark-700'
                    }`}
                  >
                    结构
                  </button>
                </div>
              </div>

              {viewMode === 'data' && (
                <div className="flex gap-2">
                  <button
                    onClick={handleNewRow}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
                  >
                    ➕ 新建行
                  </button>
                  <button
                    onClick={handleImportCSV}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
                  >
                    📥 导入 CSV
                  </button>
                  <button
                    onClick={handleImportExcel}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm transition-colors"
                  >
                    📥 导入 Excel
                  </button>
                  <button
                    onClick={handleExportCSV}
                    disabled={tableData.length === 0}
                    className="px-3 py-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded text-sm transition-colors"
                  >
                    📤 导出 CSV
                  </button>
                  <button
                    onClick={handleExportExcel}
                    disabled={tableData.length === 0}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-sm transition-colors"
                  >
                    📤 导出 Excel
                  </button>
                </div>
              )}
            </div>

            {viewMode === 'structure' ? (
              <div className="flex-1 overflow-auto border border-gray-200 dark:border-dark-700 rounded">
                {loading ? (
                  <p className="p-4 text-center text-gray-500">加载中...</p>
                ) : tableStructure.length === 0 ? (
                  <p className="p-4 text-center text-gray-500">暂无结构信息</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 dark:bg-dark-700 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium border-r border-gray-200 dark:border-dark-600">字段名</th>
                        <th className="px-3 py-2 text-left font-medium border-r border-gray-200 dark:border-dark-600">类型</th>
                        <th className="px-3 py-2 text-left font-medium border-r border-gray-200 dark:border-dark-600">可空</th>
                        <th className="px-3 py-2 text-left font-medium border-r border-gray-200 dark:border-dark-600">默认值</th>
                        <th className="px-3 py-2 text-left font-medium">主键</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableStructure.map((col, idx) => {
                        const info = getColumnInfo(col)
                        return (
                          <tr key={idx} className="border-t border-gray-200 dark:border-dark-700">
                            <td className="px-3 py-2 border-r border-gray-200 dark:border-dark-600 font-mono">{info.name}</td>
                            <td className="px-3 py-2 border-r border-gray-200 dark:border-dark-600">{info.type}</td>
                            <td className="px-3 py-2 border-r border-gray-200 dark:border-dark-600">{info.nullable ? '✓' : '✗'}</td>
                            <td className="px-3 py-2 border-r border-gray-200 dark:border-dark-600 text-gray-500">{info.default || '-'}</td>
                            <td className="px-3 py-2">{info.primaryKey ? '🔑' : '-'}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <>
                {editingRow ? (
                  <div className="mb-4 p-4 bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded">
                    <h3 className="font-medium mb-3">
                      {editingRow.isNew ? '➕ 新建行' : '✏️ 编辑行'}
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                      {columns.map((col) => (
                        <div key={col}>
                          <label className="block text-sm font-medium mb-1">{col}</label>
                          <input
                            type="text"
                            value={editingRow.data[col] ?? ''}
                            onChange={(e) => setEditingRow(prev => prev ? {
                              ...prev,
                              data: { ...prev.data, [col]: e.target.value }
                            } : null)}
                            className="w-full px-2 py-1 rounded border border-gray-300 dark:border-dark-600 bg-white dark:bg-dark-700 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={handleSaveRow}
                        className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm"
                      >
                        💾 保存
                      </button>
                      <button
                        onClick={() => setEditingRow(null)}
                        className="px-4 py-1.5 bg-gray-500 hover:bg-gray-600 text-white rounded text-sm"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="flex-1 overflow-auto border border-gray-200 dark:border-dark-700 rounded">
                  {loading ? (
                    <p className="p-4 text-center text-gray-500">加载中...</p>
                  ) : tableData.length === 0 ? (
                    <p className="p-4 text-center text-gray-500">暂无数据</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 dark:bg-dark-700 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium border-r border-gray-200 dark:border-dark-600 w-24">操作</th>
                          {columns.map((col) => (
                            <th
                              key={col}
                              className="px-3 py-2 text-left font-medium border-r border-gray-200 dark:border-dark-600"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {tableData.map((row, rowIndex) => (
                          <tr
                            key={rowIndex}
                            className="border-t border-gray-200 dark:border-dark-700 hover:bg-gray-50 dark:hover:bg-dark-800"
                          >
                            <td className="px-3 py-1.5 border-r border-gray-200 dark:border-dark-600">
                              <button
                                onClick={() => handleEditRow(row)}
                                className="text-blue-600 hover:underline mr-2"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDeleteRow(row)}
                                className="text-red-600 hover:underline"
                              >
                                🗑️
                              </button>
                            </td>
                            {columns.map((col) => (
                              <td
                                key={col}
                                className="px-3 py-1.5 border-r border-gray-200 dark:border-dark-600 max-w-xs truncate"
                                title={row[col] !== null && row[col] !== undefined ? String(row[col]) : ''}
                              >
                                {row[col] === null ? (
                                  <span className="text-gray-400">NULL</span>
                                ) : (
                                  String(row[col])
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    第 {page} 页 (每页 {pageSize} 条)
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1 bg-gray-200 dark:bg-dark-700 rounded disabled:opacity-50"
                    >
                      上一页
                    </button>
                    <button
                      onClick={() => setPage(p => p + 1)}
                      className="px-3 py-1 bg-gray-200 dark:bg-dark-700 rounded"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            请从左侧选择一个数据表
          </div>
        )}
      </main>
    </div>
  )
}
