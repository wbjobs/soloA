import mysql, { Pool, PoolConnection } from 'mysql2/promise'
import { DatabaseConnection } from './base'
import { ConnectionConfig, QueryResult } from '../types'
import { createSSHTunnel, closeSSHTunnel } from '../ssh-tunnel'

export class MySQLConnection extends DatabaseConnection {
  private pool: Pool | null = null
  private tunnelId: string | null = null
  private healthCheckInterval: NodeJS.Timeout | null = null
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5

  private async healthCheck(): Promise<void> {
    if (!this.pool || !this.connected) return
    try {
      const conn = await this.pool.getConnection()
      await conn.ping()
      conn.release()
      this.reconnectAttempts = 0
    } catch (err) {
      console.warn('MySQL 连接健康检查失败，尝试重连:', err)
      await this.attemptReconnect()
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('MySQL 重连次数超过限制，连接已断开')
      await this.disconnect()
      return
    }

    this.reconnectAttempts++
    console.log(`MySQL 尝试重连 (第 ${this.reconnectAttempts} 次)...`)

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
      console.log('MySQL 重连成功')
    } catch (err) {
      console.error('MySQL 重连失败:', err)
    }
  }

  async connect(): Promise<void> {
    if (this.connected && this.pool) return

    let port = this.config.port || 3306
    let host = this.config.host || 'localhost'

    if (this.config.useSSH && this.config.sshConfig) {
      this.tunnelId = `mysql-${this.config.id}`
      port = await createSSHTunnel(this.tunnelId, {
        sshConfig: this.config.sshConfig,
        targetHost: host,
        targetPort: port
      })
      host = '127.0.0.1'
    }

    this.pool = mysql.createPool({
      host,
      port,
      user: this.config.username,
      password: this.config.password,
      database: this.config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      idleTimeout: 60000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      connectTimeout: 10000
    })

    this.pool.on('connection', (conn: PoolConnection) => {
      console.log('MySQL 新连接已建立')
      conn.on('error', (err) => {
        console.error('MySQL 连接错误:', err)
      })
    })

    this.pool.on('error', (err) => {
      console.error('MySQL 连接池错误:', err)
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
      const [rows] = await this.pool!.query('SELECT 1 as test')
      return Array.isArray(rows) && rows.length > 0
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
    
    const [rows] = await this.pool!.query(sql)
    const endTime = Date.now()

    const rowArray = Array.isArray(rows) ? rows : []
    const columns = rowArray.length > 0 ? Object.keys(rowArray[0]) : []
    
    const isResultSet = rowArray.length > 0 && typeof rowArray[0] === 'object' && !Array.isArray(rowArray[0])
    
    if (isResultSet) {
      return this.createQueryResult(columns, rowArray, endTime - startTime)
    } else {
      const result: any = rows
      return this.createQueryResult([], [], endTime - startTime, result.affectedRows)
    }
  }

  async getTables(): Promise<string[]> {
    await this.connect()
    const [rows] = await this.pool!.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = ?',
      [this.config.database]
    )
    return (rows as any[]).map((row: any) => row.TABLE_NAME || row.table_name)
  }

  async getTableStructure(tableName: string): Promise<any[]> {
    await this.connect()
    const [rows] = await this.pool!.query(`DESCRIBE ${this.escapeIdentifier(tableName)}`)
    return rows as any[]
  }

  async insert(tableName: string, data: Record<string, any>): Promise<any> {
    await this.connect()
    const columns = Object.keys(data)
    const values = Object.values(data)
    const placeholders = columns.map(() => '?').join(', ')
    const sql = `INSERT INTO ${this.escapeIdentifier(tableName)} (${columns.map(c => this.escapeIdentifier(c)).join(', ')}) VALUES (${placeholders})`
    const [result] = await this.pool!.query(sql, values)
    return result
  }

  async update(tableName: string, data: Record<string, any>, where: Record<string, any>): Promise<number> {
    await this.connect()
    const setClause = Object.keys(data).map(k => `${this.escapeIdentifier(k)} = ?`).join(', ')
    const whereClause = Object.keys(where).map(k => `${this.escapeIdentifier(k)} = ?`).join(' AND ')
    const values = [...Object.values(data), ...Object.values(where)]
    const sql = `UPDATE ${this.escapeIdentifier(tableName)} SET ${setClause} WHERE ${whereClause}`
    const [result] = await this.pool!.query(sql, values)
    return (result as any).affectedRows
  }

  async delete(tableName: string, where: Record<string, any>): Promise<number> {
    await this.connect()
    const whereClause = Object.keys(where).map(k => `${this.escapeIdentifier(k)} = ?`).join(' AND ')
    const values = Object.values(where)
    const sql = `DELETE FROM ${this.escapeIdentifier(tableName)} WHERE ${whereClause}`
    const [result] = await this.pool!.query(sql, values)
    return (result as any).affectedRows
  }

  private escapeIdentifier(name: string): string {
    return '`' + name.replace(/`/g, '``') + '`'
  }
}
