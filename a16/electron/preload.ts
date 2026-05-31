import { contextBridge, ipcRenderer } from 'electron'
import { ConnectionConfig, QueryHistory, IPCResponse, BackupRecord, BackupSchedule, SavedSQL, SQLCategory, CompareResult } from './types'

const api = {
  connection: {
    list: (): Promise<IPCResponse<ConnectionConfig[]>> => ipcRenderer.invoke('connection:list'),
    save: (connection: ConnectionConfig): Promise<IPCResponse<ConnectionConfig>> => ipcRenderer.invoke('connection:save', connection),
    delete: (id: string): Promise<IPCResponse<boolean>> => ipcRenderer.invoke('connection:delete', id),
    test: (config: ConnectionConfig): Promise<IPCResponse<boolean>> => ipcRenderer.invoke('connection:test', config),
    connect: (id: string): Promise<IPCResponse<boolean>> => ipcRenderer.invoke('connection:connect', id),
    disconnect: (id: string): Promise<IPCResponse<boolean>> => ipcRenderer.invoke('connection:disconnect', id)
  },
  database: {
    tables: (connectionId: string): Promise<IPCResponse<string[]>> => ipcRenderer.invoke('database:tables', connectionId),
    tableStructure: (connectionId: string, tableName: string): Promise<IPCResponse<any[]>> => ipcRenderer.invoke('database:table-structure', connectionId, tableName),
    query: (connectionId: string, sql: string): Promise<IPCResponse<any>> => ipcRenderer.invoke('database:query', connectionId, sql),
    insert: (connectionId: string, tableName: string, data: Record<string, any>): Promise<IPCResponse<any>> => ipcRenderer.invoke('database:insert', connectionId, tableName, data),
    update: (connectionId: string, tableName: string, data: Record<string, any>, where: Record<string, any>): Promise<IPCResponse<number>> => ipcRenderer.invoke('database:update', connectionId, tableName, data, where),
    delete: (connectionId: string, tableName: string, where: Record<string, any>): Promise<IPCResponse<number>> => ipcRenderer.invoke('database:delete', connectionId, tableName, where)
  },
  history: {
    list: (): Promise<IPCResponse<QueryHistory[]>> => ipcRenderer.invoke('history:list'),
    clear: (): Promise<IPCResponse<boolean>> => ipcRenderer.invoke('history:clear'),
    delete: (id: string): Promise<IPCResponse<boolean>> => ipcRenderer.invoke('history:delete', id)
  },
  export: {
    csv: (data: any[], fileName: string): Promise<IPCResponse<string>> => ipcRenderer.invoke('export:csv', data, fileName),
    excel: (data: any[], sheetName: string, fileName: string): Promise<IPCResponse<string>> => ipcRenderer.invoke('export:excel', data, sheetName, fileName),
    chart: (base64: string, fileName: string, format: 'png' | 'svg'): Promise<IPCResponse<string>> => ipcRenderer.invoke('export:chart', base64, fileName, format)
  },
  import: {
    csv: (): Promise<IPCResponse<any[]>> => ipcRenderer.invoke('import:csv'),
    excel: (): Promise<IPCResponse<any[]>> => ipcRenderer.invoke('import:excel')
  },
  file: {
    open: (filters?: Electron.FileFilter[]): Promise<IPCResponse<string>> => ipcRenderer.invoke('file:open', filters)
  },
  backup: {
    create: (connectionId: string, backupType: string, saveDirectory: string, tables?: string[], compress?: boolean): Promise<IPCResponse<BackupRecord>> => 
      ipcRenderer.invoke('backup:create', connectionId, backupType, saveDirectory, tables, compress),
    restore: (connectionId: string, filePath: string): Promise<IPCResponse<boolean>> => 
      ipcRenderer.invoke('backup:restore', connectionId, filePath),
    records: (connectionId?: string): Promise<IPCResponse<BackupRecord[]>> => 
      ipcRenderer.invoke('backup:records', connectionId),
    delete: (id: string, deleteFile?: boolean): Promise<IPCResponse<boolean>> => 
      ipcRenderer.invoke('backup:delete', id, deleteFile),
    getDirectory: (): Promise<IPCResponse<string>> => 
      ipcRenderer.invoke('backup:directory'),
    chooseDirectory: (): Promise<IPCResponse<string>> => 
      ipcRenderer.invoke('backup:choose-directory')
  },
  schedule: {
    list: (): Promise<IPCResponse<BackupSchedule[]>> => 
      ipcRenderer.invoke('schedule:list'),
    save: (schedule: BackupSchedule): Promise<IPCResponse<BackupSchedule>> => 
      ipcRenderer.invoke('schedule:save', schedule),
    delete: (id: string): Promise<IPCResponse<boolean>> => 
      ipcRenderer.invoke('schedule:delete', id),
    toggle: (id: string, enabled: boolean): Promise<IPCResponse<boolean>> => 
      ipcRenderer.invoke('schedule:toggle', id, enabled),
    presets: (): Promise<IPCResponse<any[]>> => 
      ipcRenderer.invoke('schedule:presets'),
    default: (connectionId: string, connectionName: string): Promise<IPCResponse<BackupSchedule>> => 
      ipcRenderer.invoke('schedule:default', connectionId, connectionName)
  },
  savedSQL: {
    list: (category?: string): Promise<IPCResponse<SavedSQL[]>> => 
      ipcRenderer.invoke('sql:list', category),
    save: (savedSQL: SavedSQL): Promise<IPCResponse<SavedSQL>> => 
      ipcRenderer.invoke('sql:save', savedSQL),
    delete: (id: string): Promise<IPCResponse<boolean>> => 
      ipcRenderer.invoke('sql:delete', id),
    get: (id: string): Promise<IPCResponse<SavedSQL | undefined>> => 
      ipcRenderer.invoke('sql:get', id),
    execute: (id: string): Promise<IPCResponse<any>> => 
      ipcRenderer.invoke('sql:execute', id)
  },
  sqlCategories: {
    list: (): Promise<IPCResponse<SQLCategory[]>> => 
      ipcRenderer.invoke('sql-categories:list'),
    save: (category: SQLCategory): Promise<IPCResponse<SQLCategory>> => 
      ipcRenderer.invoke('sql-categories:save', category),
    delete: (id: string): Promise<IPCResponse<boolean>> => 
      ipcRenderer.invoke('sql-categories:delete', id)
  },
  compare: {
    tables: (connectionAId: string, connectionBId: string, tableA: string, tableB: string, primaryKey: string): Promise<IPCResponse<CompareResult>> => 
      ipcRenderer.invoke('compare:tables', connectionAId, connectionBId, tableA, tableB, primaryKey),
    generateFix: (result: CompareResult, diffIndex: number): Promise<IPCResponse<string>> => 
      ipcRenderer.invoke('compare:generate-fix', result, diffIndex)
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api
