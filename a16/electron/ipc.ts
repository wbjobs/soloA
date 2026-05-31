import { ipcMain, dialog } from 'electron'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import * as fs from 'fs'
import * as path from 'path'
import { connectionStore, queryHistoryStore, backupRecordStore, backupScheduleStore, savedSQLStore, sqlCategoryStore } from './store'
import { createDatabaseConnection, closeConnection } from './database'
import { ConnectionConfig, QueryHistory, IPCResponse, DatabaseType, BackupSchedule, BackupRecord, SavedSQL, SQLCategory, CompareResult } from './types'
import { createBackup, restoreBackup, deleteBackupFile, getBackupDirectory } from './backup/manager'
import { startSchedule, stopSchedule, getPresetSchedules, createDefaultSchedule } from './backup/scheduler'
import { compareTables, generateSQLFix } from './compare/manager'

function response<T>(success: boolean, data?: T, error?: string): IPCResponse<T> {
  return { success, data, error }
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

export function setupIPC() {
  ipcMain.handle('connection:list', async (): Promise<IPCResponse<ConnectionConfig[]>> => {
    try {
      const connections = connectionStore.getAll()
      return response(true, connections)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('connection:save', async (_event, connection: ConnectionConfig): Promise<IPCResponse<ConnectionConfig>> => {
    try {
      if (!connection.id) {
        connection.id = generateId()
      }
      const saved = connectionStore.save(connection)
      return response(true, saved)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('connection:delete', async (_event, id: string): Promise<IPCResponse<boolean>> => {
    try {
      await closeConnection(id)
      const success = connectionStore.delete(id)
      return response(true, success)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('connection:test', async (_event, config: ConnectionConfig): Promise<IPCResponse<boolean>> => {
    try {
      const connection = createDatabaseConnection(config)
      const result = await connection.testConnection()
      return response(true, result)
    } catch (err: any) {
      return response(false, false, err.message)
    }
  })

  ipcMain.handle('connection:connect', async (_event, id: string): Promise<IPCResponse<boolean>> => {
    try {
      const config = connectionStore.getById(id)
      if (!config) {
        return response(false, false, '连接不存在')
      }
      const connection = createDatabaseConnection(config)
      await connection.connect()
      return response(true, true)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('connection:disconnect', async (_event, id: string): Promise<IPCResponse<boolean>> => {
    try {
      await closeConnection(id)
      return response(true, true)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('database:tables', async (_event, connectionId: string): Promise<IPCResponse<string[]>> => {
    try {
      const config = connectionStore.getById(connectionId)
      if (!config) {
        return response(false, undefined, '连接不存在')
      }
      const connection = createDatabaseConnection(config)
      const tables = await connection.getTables()
      return response(true, tables)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('database:table-structure', async (_event, connectionId: string, tableName: string): Promise<IPCResponse<any[]>> => {
    try {
      const config = connectionStore.getById(connectionId)
      if (!config) {
        return response(false, undefined, '连接不存在')
      }
      const connection = createDatabaseConnection(config)
      const structure = await connection.getTableStructure(tableName)
      return response(true, structure)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('database:query', async (_event, connectionId: string, sql: string): Promise<IPCResponse<any>> => {
    try {
      const config = connectionStore.getById(connectionId)
      if (!config) {
        return response(false, undefined, '连接不存在')
      }
      const connection = createDatabaseConnection(config)
      const result = await connection.executeQuery(sql)

      const history: QueryHistory = {
        id: generateId(),
        connectionId,
        connectionName: config.name,
        database: config.database || '',
        sql,
        executedAt: Date.now(),
        rowCount: result.rowCount,
        executionTime: result.executionTime
      }
      queryHistoryStore.add(history)

      return response(true, result)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('database:insert', async (_event, connectionId: string, tableName: string, data: Record<string, any>): Promise<IPCResponse<any>> => {
    try {
      const config = connectionStore.getById(connectionId)
      if (!config) {
        return response(false, undefined, '连接不存在')
      }
      const connection = createDatabaseConnection(config)
      const result = await connection.insert(tableName, data)
      return response(true, result)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('database:update', async (_event, connectionId: string, tableName: string, data: Record<string, any>, where: Record<string, any>): Promise<IPCResponse<number>> => {
    try {
      const config = connectionStore.getById(connectionId)
      if (!config) {
        return response(false, undefined, '连接不存在')
      }
      const connection = createDatabaseConnection(config)
      const result = await connection.update(tableName, data, where)
      return response(true, result)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('database:delete', async (_event, connectionId: string, tableName: string, where: Record<string, any>): Promise<IPCResponse<number>> => {
    try {
      const config = connectionStore.getById(connectionId)
      if (!config) {
        return response(false, undefined, '连接不存在')
      }
      const connection = createDatabaseConnection(config)
      const result = await connection.delete(tableName, where)
      return response(true, result)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('history:list', async (): Promise<IPCResponse<QueryHistory[]>> => {
    try {
      const histories = queryHistoryStore.getAll()
      return response(true, histories)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('history:clear', async (): Promise<IPCResponse<boolean>> => {
    try {
      queryHistoryStore.clear()
      return response(true, true)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('history:delete', async (_event, id: string): Promise<IPCResponse<boolean>> => {
    try {
      const success = queryHistoryStore.delete(id)
      return response(true, success)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('export:csv', async (_event, data: any[], fileName: string): Promise<IPCResponse<string>> => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: '导出 CSV',
        defaultPath: fileName,
        filters: [{ name: 'CSV 文件', extensions: ['csv'] }]
      })

      if (canceled || !filePath) {
        return response(true, '')
      }

      const csv = Papa.unparse(data)
      fs.writeFileSync(filePath, '\ufeff' + csv, 'utf8')
      return response(true, filePath)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('export:excel', async (_event, data: any[], sheetName: string, fileName: string): Promise<IPCResponse<string>> => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: '导出 Excel',
        defaultPath: fileName,
        filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }]
      })

      if (canceled || !filePath) {
        return response(true, '')
      }

      const worksheet = XLSX.utils.json_to_sheet(data)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
      XLSX.writeFile(workbook, filePath)
      return response(true, filePath)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('import:csv', async (_event): Promise<IPCResponse<any[]>> => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '导入 CSV',
        filters: [{ name: 'CSV 文件', extensions: ['csv'] }],
        properties: ['openFile']
      })

      if (canceled || filePaths.length === 0) {
        return response(true, [])
      }

      const filePath = filePaths[0]
      const content = fs.readFileSync(filePath, 'utf8')
      const result = Papa.parse(content, { header: true, skipEmptyLines: true })
      return response(true, result.data as any[])
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('import:excel', async (_event): Promise<IPCResponse<any[]>> => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '导入 Excel',
        filters: [{ name: 'Excel 文件', extensions: ['xlsx', 'xls'] }],
        properties: ['openFile']
      })

      if (canceled || filePaths.length === 0) {
        return response(true, [])
      }

      const filePath = filePaths[0]
      const workbook = XLSX.readFile(filePath)
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(firstSheet)
      return response(true, data as any[])
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('export:chart', async (_event, base64: string, fileName: string, format: 'png' | 'svg'): Promise<IPCResponse<string>> => {
    try {
      const ext = format === 'png' ? 'png' : 'svg'
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: `导出 ${ext.toUpperCase()}`,
        defaultPath: fileName.endsWith(`.${ext}`) ? fileName : `${fileName}.${ext}`,
        filters: [{ name: `${ext.toUpperCase()} 文件`, extensions: [ext] }]
      })

      if (canceled || !filePath) {
        return response(true, '')
      }

      if (format === 'png') {
        const base64Data = base64.replace(/^data:image\/png;base64,/, '')
        fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'))
      } else {
        fs.writeFileSync(filePath, base64, 'utf8')
      }
      return response(true, filePath)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('file:open', async (_event, filters?: Electron.FileFilter[]): Promise<IPCResponse<string>> => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '选择文件',
        filters: filters || [{ name: '所有文件', extensions: ['*'] }],
        properties: ['openFile']
      })

      if (canceled || filePaths.length === 0) {
        return response(true, '')
      }

      return response(true, filePaths[0])
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('backup:create', async (_event, connectionId: string, backupType: string, saveDirectory: string, tables?: string[], compress?: boolean): Promise<IPCResponse<BackupRecord>> => {
    try {
      const config = connectionStore.getById(connectionId)
      if (!config) {
        return response(false, undefined, '连接不存在')
      }
      const record = await createBackup(config, backupType as any, saveDirectory, tables, compress)
      return response(true, record)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('backup:restore', async (_event, connectionId: string, filePath: string): Promise<IPCResponse<boolean>> => {
    try {
      const config = connectionStore.getById(connectionId)
      if (!config) {
        return response(false, undefined, '连接不存在')
      }
      const result = await restoreBackup(config, filePath)
      return response(true, result)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('backup:records', async (_event, connectionId?: string): Promise<IPCResponse<BackupRecord[]>> => {
    try {
      const records = connectionId 
        ? backupRecordStore.getByConnection(connectionId)
        : backupRecordStore.getAll()
      return response(true, records)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('backup:delete', async (_event, id: string, deleteFile?: boolean): Promise<IPCResponse<boolean>> => {
    try {
      const records = backupRecordStore.getAll()
      const record = records.find(r => r.id === id)
      if (deleteFile && record?.filePath) {
        deleteBackupFile(record.filePath)
      }
      const success = backupRecordStore.delete(id)
      return response(true, success)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('backup:directory', async (): Promise<IPCResponse<string>> => {
    try {
      return response(true, getBackupDirectory())
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('backup:choose-directory', async (): Promise<IPCResponse<string>> => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '选择备份目录',
        properties: ['openDirectory', 'createDirectory']
      })
      if (canceled || filePaths.length === 0) {
        return response(true, '')
      }
      return response(true, filePaths[0])
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('schedule:list', async (): Promise<IPCResponse<BackupSchedule[]>> => {
    try {
      return response(true, backupScheduleStore.getAll())
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('schedule:save', async (_event, schedule: BackupSchedule): Promise<IPCResponse<BackupSchedule>> => {
    try {
      if (!schedule.id) {
        schedule.id = generateId()
      }
      const saved = backupScheduleStore.save(schedule)
      if (schedule.enabled) {
        startSchedule(saved)
      } else {
        stopSchedule(saved.id)
      }
      return response(true, saved)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('schedule:delete', async (_event, id: string): Promise<IPCResponse<boolean>> => {
    try {
      stopSchedule(id)
      const success = backupScheduleStore.delete(id)
      return response(true, success)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('schedule:toggle', async (_event, id: string, enabled: boolean): Promise<IPCResponse<boolean>> => {
    try {
      const schedule = backupScheduleStore.getById(id)
      if (!schedule) {
        return response(false, undefined, '任务不存在')
      }
      schedule.enabled = enabled
      backupScheduleStore.save(schedule)
      if (enabled) {
        startSchedule(schedule)
      } else {
        stopSchedule(id)
      }
      return response(true, true)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('schedule:presets', async (): Promise<IPCResponse<any[]>> => {
    try {
      return response(true, getPresetSchedules())
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('schedule:default', async (_event, connectionId: string, connectionName: string): Promise<IPCResponse<BackupSchedule>> => {
    try {
      return response(true, createDefaultSchedule(connectionId, connectionName))
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('sql:list', async (_event, category?: string): Promise<IPCResponse<SavedSQL[]>> => {
    try {
      const sqls = category 
        ? savedSQLStore.getByCategory(category)
        : savedSQLStore.getAll()
      return response(true, sqls)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('sql:save', async (_event, savedSQL: SavedSQL): Promise<IPCResponse<SavedSQL>> => {
    try {
      if (!savedSQL.id) {
        savedSQL.id = generateId()
      }
      const saved = savedSQLStore.save(savedSQL)
      return response(true, saved)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('sql:delete', async (_event, id: string): Promise<IPCResponse<boolean>> => {
    try {
      const success = savedSQLStore.delete(id)
      return response(true, success)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('sql:get', async (_event, id: string): Promise<IPCResponse<SavedSQL | undefined>> => {
    try {
      const sql = savedSQLStore.getById(id)
      return response(true, sql)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('sql:execute', async (_event, id: string): Promise<IPCResponse<any>> => {
    try {
      const saved = savedSQLStore.getById(id)
      if (!saved) {
        return response(false, undefined, 'SQL不存在')
      }
      const config = connectionStore.getById(saved.connectionId)
      if (!config) {
        return response(false, undefined, '连接不存在')
      }
      const connection = createDatabaseConnection(config)
      const result = await connection.executeQuery(saved.sql)
      savedSQLStore.incrementExecution(id)
      return response(true, result)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('sql-categories:list', async (): Promise<IPCResponse<SQLCategory[]>> => {
    try {
      return response(true, sqlCategoryStore.getAll())
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('sql-categories:save', async (_event, category: SQLCategory): Promise<IPCResponse<SQLCategory>> => {
    try {
      if (!category.id) {
        category.id = generateId()
      }
      const saved = sqlCategoryStore.save(category)
      return response(true, saved)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('sql-categories:delete', async (_event, id: string): Promise<IPCResponse<boolean>> => {
    try {
      const success = sqlCategoryStore.delete(id)
      return response(true, success)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('compare:tables', async (
    _event, 
    connectionAId: string, 
    connectionBId: string, 
    tableA: string, 
    tableB: string, 
    primaryKey: string
  ): Promise<IPCResponse<CompareResult>> => {
    try {
      const configA = connectionStore.getById(connectionAId)
      const configB = connectionStore.getById(connectionBId)
      
      if (!configA || !configB) {
        return response(false, undefined, '连接不存在')
      }
      
      const result = await compareTables(configA, configB, tableA, tableB, primaryKey)
      return response(true, result)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })

  ipcMain.handle('compare:generate-fix', async (
    _event, 
    result: CompareResult, 
    diffIndex: number
  ): Promise<IPCResponse<string>> => {
    try {
      if (!result.differences[diffIndex]) {
        return response(false, undefined, '差异不存在')
      }
      const sql = generateSQLFix(result, result.differences[diffIndex])
      return response(true, sql)
    } catch (err: any) {
      return response(false, undefined, err.message)
    }
  })
}
