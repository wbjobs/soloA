import Database from 'better-sqlite3'
import { DatabaseConnection } from './base'
import { ConnectionConfig, QueryResult } from '../types'

export class SQLiteConnection extends DatabaseConnection {
  private db: Database.Database | null = null

  async connect(): Promise<void> {
    if (this.connected && this.db) return

    if (!this.config.filePath) {
      throw new Error('SQLite 需要文件路径')
    }

    this.db = new Database(this.config.filePath)
    this.connected = true
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
    this.connected = false
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.connect()
      const row = this.db!.prepare('SELECT 1 as test').get()
      return row !== undefined
    } catch {
      return false
    }
  }

  async executeQuery(sql: string): Promise<QueryResult> {
    await this.connect()
    const startTime = Date.now()

    const stmt = this.db!.prepare(sql)
    
    if (sql.trim().toUpperCase().startsWith('SELECT') || 
        sql.trim().toUpperCase().startsWith('PRAGMA') ||
        sql.trim().toUpperCase().startsWith('EXPLAIN')) {
      const rows = stmt.all() as any[]
      const endTime = Date.now()
      const columns = rows.length > 0 ? Object.keys(rows[0]) : []
      return this.createQueryResult(columns, rows, endTime - startTime, rows.length)
    } else {
      const info = stmt.run()
      const endTime = Date.now()
      return this.createQueryResult([], [], endTime - startTime, info.changes)
    }
  }

  async getTables(): Promise<string[]> {
    await this.connect()
    const rows = this.db!.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all() as any[]
    return rows.map((row: any) => row.name)
  }

  async getTableStructure(tableName: string): Promise<any[]> {
    await this.connect()
    const rows = this.db!.prepare(`PRAGMA table_info(${this.escapeIdentifier(tableName)})`).all() as any[]
    return rows.map((row: any) => ({
      column_name: row.name,
      data_type: row.type,
      is_nullable: row.notnull === 0 ? 'YES' : 'NO',
      column_default: row.dflt_value,
      primary_key: row.pk
    }))
  }

  async insert(tableName: string, data: Record<string, any>): Promise<any> {
    await this.connect()
    const columns = Object.keys(data)
    const placeholders = columns.map(() => '?').join(', ')
    const values = Object.values(data)
    const sql = `INSERT INTO ${this.escapeIdentifier(tableName)} (${columns.map(c => this.escapeIdentifier(c)).join(', ')}) VALUES (${placeholders})`
    const info = this.db!.prepare(sql).run(...values)
    return { lastInsertRowid: info.lastInsertRowid, changes: info.changes }
  }

  async update(tableName: string, data: Record<string, any>, where: Record<string, any>): Promise<number> {
    await this.connect()
    const setClause = Object.keys(data).map(k => `${this.escapeIdentifier(k)} = ?`).join(', ')
    const whereClause = Object.keys(where).map(k => `${this.escapeIdentifier(k)} = ?`).join(' AND ')
    const values = [...Object.values(data), ...Object.values(where)]
    const sql = `UPDATE ${this.escapeIdentifier(tableName)} SET ${setClause} WHERE ${whereClause}`
    const info = this.db!.prepare(sql).run(...values)
    return info.changes
  }

  async delete(tableName: string, where: Record<string, any>): Promise<number> {
    await this.connect()
    const whereClause = Object.keys(where).map(k => `${this.escapeIdentifier(k)} = ?`).join(' AND ')
    const values = Object.values(where)
    const sql = `DELETE FROM ${this.escapeIdentifier(tableName)} WHERE ${whereClause}`
    const info = this.db!.prepare(sql).run(...values)
    return info.changes
  }

  private escapeIdentifier(name: string): string {
    return '"' + name.replace(/"/g, '""') + '"'
  }
}
