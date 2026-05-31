import { ConnectionConfig, QueryResult } from '../types'

export interface IDatabaseConnection {
  connect(): Promise<void>
  disconnect(): Promise<void>
  testConnection(): Promise<boolean>
  executeQuery(sql: string): Promise<QueryResult>
  getTables(): Promise<string[]>
  getTableStructure(tableName: string): Promise<any[]>
  insert(tableName: string, data: Record<string, any>): Promise<any>
  update(tableName: string, data: Record<string, any>, where: Record<string, any>): Promise<number>
  delete(tableName: string, where: Record<string, any>): Promise<number>
}

export abstract class DatabaseConnection implements IDatabaseConnection {
  protected config: ConnectionConfig
  protected connected: boolean = false

  constructor(config: ConnectionConfig) {
    this.config = config
  }

  abstract connect(): Promise<void>
  abstract disconnect(): Promise<void>
  abstract testConnection(): Promise<boolean>
  abstract executeQuery(sql: string): Promise<QueryResult>
  abstract getTables(): Promise<string[]>
  abstract getTableStructure(tableName: string): Promise<any[]>
  abstract insert(tableName: string, data: Record<string, any>): Promise<any>
  abstract update(tableName: string, data: Record<string, any>, where: Record<string, any>): Promise<number>
  abstract delete(tableName: string, where: Record<string, any>): Promise<number>

  protected createQueryResult(columns: string[], rows: any[], executionTime: number, affectedRows?: number): QueryResult {
    return {
      columns,
      rows,
      rowCount: rows.length,
      affectedRows,
      executionTime
    }
  }
}
