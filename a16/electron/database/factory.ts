import { ConnectionConfig } from '../types'
import { IDatabaseConnection } from './base'
import { MySQLConnection } from './mysql'
import { PostgreSQLConnection } from './postgresql'
import { SQLiteConnection } from './sqlite'
import { MongoDBConnection } from './mongodb'

const connections = new Map<string, IDatabaseConnection>()

export function createDatabaseConnection(config: ConnectionConfig): IDatabaseConnection {
  const existing = connections.get(config.id)
  if (existing) {
    return existing
  }

  let connection: IDatabaseConnection

  switch (config.type) {
    case 'mysql':
      connection = new MySQLConnection(config)
      break
    case 'postgresql':
      connection = new PostgreSQLConnection(config)
      break
    case 'sqlite':
      connection = new SQLiteConnection(config)
      break
    case 'mongodb':
      connection = new MongoDBConnection(config)
      break
    default:
      throw new Error(`不支持的数据库类型: ${config.type}`)
  }

  connections.set(config.id, connection)
  return connection
}

export async function closeConnection(connectionId: string): Promise<void> {
  const connection = connections.get(connectionId)
  if (connection) {
    await connection.disconnect()
    connections.delete(connectionId)
  }
}

export async function closeAllConnections(): Promise<void> {
  const ids = Array.from(connections.keys())
  await Promise.all(ids.map(id => closeConnection(id)))
}
