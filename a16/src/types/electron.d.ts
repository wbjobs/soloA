export type DatabaseType = 'mysql' | 'postgresql' | 'sqlite' | 'mongodb'

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

export interface ElectronAPI {
  connection: {
    list: () => Promise<IPCResponse<ConnectionConfig[]>>
    save: (connection: ConnectionConfig) => Promise<IPCResponse<ConnectionConfig>>
    delete: (id: string) => Promise<IPCResponse<boolean>>
    test: (config: ConnectionConfig) => Promise<IPCResponse<boolean>>
    connect: (id: string) => Promise<IPCResponse<boolean>>
    disconnect: (id: string) => Promise<IPCResponse<boolean>>
  }
  database: {
    tables: (connectionId: string) => Promise<IPCResponse<string[]>>
    tableStructure: (connectionId: string, tableName: string) => Promise<IPCResponse<any[]>>
    query: (connectionId: string, sql: string) => Promise<IPCResponse<QueryResult>>
    insert: (connectionId: string, tableName: string, data: Record<string, any>) => Promise<IPCResponse<any>>
    update: (connectionId: string, tableName: string, data: Record<string, any>, where: Record<string, any>) => Promise<IPCResponse<number>>
    delete: (connectionId: string, tableName: string, where: Record<string, any>) => Promise<IPCResponse<number>>
  }
  history: {
    list: () => Promise<IPCResponse<QueryHistory[]>>
    clear: () => Promise<IPCResponse<boolean>>
    delete: (id: string) => Promise<IPCResponse<boolean>>
  }
  export: {
    csv: (data: any[], fileName: string) => Promise<IPCResponse<string>>
    excel: (data: any[], sheetName: string, fileName: string) => Promise<IPCResponse<string>>
    chart: (base64: string, fileName: string, format: 'png' | 'svg') => Promise<IPCResponse<string>>
  }
  import: {
    csv: () => Promise<IPCResponse<any[]>>
    excel: () => Promise<IPCResponse<any[]>>
  }
  file: {
    open: (filters?: any[]) => Promise<IPCResponse<string>>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
