import { Pool } from 'pg'
import { DatabaseConnection } from './base'
import { ConnectionConfig, QueryResult } from '../types'
import { createSSHTunnel, closeSSHTunnel } from '../ssh-tunnel'

export class PostgreSQLConnection extends DatabaseConnection {
  private pool: Pool | null = null
  private tunnelId: string | null = null
  private healthCheckInterval: NodeJS.Timeout | null = null
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5

  private async healthCheck(): Promise<void> {
    if (!this.pool || !this.connected) return
    try {
      await this.pool.query('SELECT 1')
      this.reconnectAttempts = 0
    } catch (err) {
      console.warn('PostgreSQL 连接健康检查失败，尝试重连:', err)
      await this.attemptReconnect()
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('PostgreSQL 重连次数超过限制，连接已断开')
      await this.disconnect()
      return
    }

    this.reconnectAttempts++
    console.log(`PostgreSQL 尝试重连 (第 ${this.reconnectAttempts} 次)...`)

    try {
      if (this.pool) {
        try {
          await this.pool.end()
        } catch (e) {
          // 忽略关闭时的错误
        }
        this.pool = null
      }
      this.connected = false
      await this.connect()
      console.log('PostgreSQL 重连成功')
    } catch (err) {
      console.error('PostgreSQL 重连失败:', err)
    }
  }

  async connect(): Promise<void> {
    if (this.connected && this.pool) return

    let port = this.config.port || 5432
    let host = this.config.host || 'localhost'

    if (this.config.useSSH && this.config.sshConfig) {
      this.tunnelId = `pg-${this.config.id}`
      port = await createSSHTunnel(this.tunnelId, {
        sshConfig: this.config.sshConfig,
        targetHost: host,
        targetPort: port
      })
      host = '127.0.0.1'
    }

    this.pool = new Pool({
      host,
      port,
      user: this.config.username,
      password: this.config.password,
      database: this.config.database,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000
    })

    this.pool.on('error', (err, client) => {
      console.error('PostgreSQL 连接池错误:', err)
    })

    this.pool.on('connect', () => {
      console.log('PostgreSQL 新连接已建立')
    })

    this.connected = true

    if (!this.healthCheckInterval) {
      this.healthCheckInterval = setInterval(() => {
        this.healthCheck()
      }, 30000)
    }
  }

  async disconnect(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
    if (this.pool) {
      await this.pool.end()
      this.pool = null
    }
    if (this.tunnelId) {
      await closeSSHTunnel(this.tunnelId)
      this.tunnelId = null
    }
    this.connected = false
    this.reconnectAttempts = 0
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.connect()
      const result = await this.pool!.query('SELECT 1 as test')
      return result.rows.length > 0
    } catch {
      return false
    } finally {
      if (this.tunnelId) {
        await this.disconnect()
      }
    }
  }

  async executeQuery(sql: string): Promise<QueryResult> {
    await this.connect()
    const startTime = Date.now()
    
    const result = await this.pool!.query(sql)
    const endTime = Date.now()

    const columns = result.fields ? result.fields.map(f => f.name) : []
    const rows = result.rows || []

    return this.createQueryResult(columns, rows, endTime - startTime, result.rowCount)
  }

  async getTables(): Promise<string[]> {
    await this.connect()
    const result = await this.pool!.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    )
    return result.rows.map((row: any) => row.table_name)
  }

  async getTableStructure(tableName: string): Promise<any[]> {
    await this.connect()
    const result = await this.pool!.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [tableName])
    return result.rows
  }

  async insert(tableName: string, data: Record<string, any>): Promise<any> {
    await this.connect()
    const columns = Object.keys(data)
    const values = Object.values(data)
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
    const columnList = columns.map(c => this.escapeIdentifier(c)).join(', ')
    const sql = `INSERT INTO ${this.escapeIdentifier(tableName)} (${columnList}) VALUES (${placeholders}) RETURNING *`
    const result = await this.pool!.query(sql, values)
    return result.rows[0]
  }

  async update(tableName: string, data: Record<string, any>, where: Record<string, any>): Promise<number> {
    await this.connect()
    const setClause = Object.keys(data).map((k, i) => `${this.escapeIdentifier(k)} = $${i + 1}`).join(', ')
    const whereStart = Object.keys(data).length + 1
    const whereClause = Object.keys(where).map((k, i) => `${this.escapeIdentifier(k)} = $${whereStart + i}`).join(' AND ')
    const values = [...Object.values(data), ...Object.values(where)]
    const sql = `UPDATE ${this.escapeIdentifier(tableName)} SET ${setClause} WHERE ${whereClause}`
    const result = await this.pool!.query(sql, values)
    return result.rowCount || 0
  }

  async delete(tableName: string, where: Record<string, any>): Promise<number> {
    await this.connect()
    const whereClause = Object.keys(where).map((k, i) => `${this.escapeIdentifier(k)} = $${i + 1}`).join(' AND ')
    const values = Object.values(where)
    const sql = `DELETE FROM ${this.escapeIdentifier(tableName)} WHERE ${whereClause}`
    const result = await this.pool!.query(sql, values)
    return result.rowCount || 0
  }

  private escapeIdentifier(name: string): string {
    return '"' + name.replace(/"/g, '""') + '"'
  }
}
