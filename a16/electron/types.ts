export type DatabaseType = 'mysql' | 'postgresql' | 'sqlite' | 'mongodb'
export type BackupType = 'full' | 'tables' | 'custom'
export type BackupStatus = 'pending' | 'running' | 'success' | 'failed'
export type CompareStatus = 'same' | 'different' | 'added' | 'removed'

export interface SSHConfig {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
}

export interface ConnectionConfig {
  id: string
  name: string
  type: DatabaseType
  host?: string
  port?: number
  username?: string
  password?: string
  database?: string
  filePath?: string
  useSSH: boolean
  sshConfig?: SSHConfig
  createdAt: number
  updatedAt: number
}

export interface QueryResult {
  columns: string[]
  rows: any[]
  rowCount: number
  affectedRows?: number
  executionTime: number
}

export interface QueryHistory {
  id: string
  connectionId: string
  connectionName: string
  database: string
  sql: string
  executedAt: number
  rowCount: number
  executionTime: number
}

export interface ChartConfig {
  chartType: 'bar' | 'line' | 'pie' | 'scatter'
  xAxis: string
  yAxis: string
  yAxisType: 'sum' | 'count' | 'avg' | 'max' | 'min'
  title: string
}

export interface IPCResponse<T = any> {
  success: boolean
  data?: T
  error?: string
}

export interface BackupRecord {
  id: string
  connectionId: string
  connectionName: string
  database: string
  backupType: BackupType
  tables?: string[]
  filePath: string
  fileName: string
  size: number
  status: BackupStatus
  errorMessage?: string
  createdAt: number
  completedAt?: number
}

export interface BackupSchedule {
  id: string
  connectionId: string
  connectionName: string
  backupType: BackupType
  tables?: string[]
  name: string
  cronExpression: string
  enabled: boolean
  saveDirectory: string
  maxBackups: number
  compress: boolean
  lastRun?: number
  nextRun?: number
  createdAt: number
  updatedAt: number
}

export interface SavedSQL {
  id: string
  name: string
  sql: string
  connectionId: string
  connectionName: string
  category: string
  description?: string
  tags: string[]
  createdAt: number
  updatedAt: number
  lastExecuted?: number
  executionCount: number
}

export interface SQLCategory {
  id: string
  name: string
  color: string
  createdAt: number
}

export interface CompareRow {
  status: CompareStatus
  key: string
  rowA?: Record<string, any>
  rowB?: Record<string, any>
  differences?: string[]
}

export interface CompareResult {
  tableA: string
  tableB: string
  connectionAId: string
  connectionBId: string
  primaryKey: string
  totalA: number
  totalB: number
  sameCount: number
  differentCount: number
  addedCount: number
  removedCount: number
  differences: CompareRow[]
  columnsA: string[]
  columnsB: string[]
  commonColumns: string[]
  duration: number
}
