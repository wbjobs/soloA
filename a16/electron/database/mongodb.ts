import { MongoClient, Db } from 'mongodb'
import { DatabaseConnection } from './base'
import { ConnectionConfig, QueryResult } from '../types'
import { createSSHTunnel, closeSSHTunnel } from '../ssh-tunnel'

export class MongoDBConnection extends DatabaseConnection {
  private client: MongoClient | null = null
  private db: Db | null = null
  private tunnelId: string | null = null

  private buildConnectionString(): string {
    if (this.config.useSSH) {
      return `mongodb://${this.config.username}:${this.config.password}@127.0.0.1/${this.config.database}`
    }
    
    if (this.config.host) {
      const host = this.config.host
      const port = this.config.port || 27017
      if (this.config.username && this.config.password) {
        return `mongodb://${encodeURIComponent(this.config.username)}:${encodeURIComponent(this.config.password)}@${host}:${port}/${this.config.database}?authSource=admin`
      }
      return `mongodb://${host}:${port}/${this.config.database}`
    }
    
    return `mongodb://localhost:27017/${this.config.database}`
  }

  async connect(): Promise<void> {
    if (this.connected && this.client) return

    let port = this.config.port || 27017
    let host = this.config.host || 'localhost'

    if (this.config.useSSH && this.config.sshConfig) {
      this.tunnelId = `mongo-${this.config.id}`
      await createSSHTunnel(this.tunnelId, {
        sshConfig: this.config.sshConfig,
        targetHost: host,
        targetPort: port
      })
    }

    const uri = this.buildConnectionString()
    this.client = new MongoClient(uri)
    await this.client.connect()
    this.db = this.client.db(this.config.database)
    this.connected = true
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close()
      this.client = null
    }
    this.db = null
    if (this.tunnelId) {
      await closeSSHTunnel(this.tunnelId)
      this.tunnelId = null
    }
    this.connected = false
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.connect()
      await this.db!.command({ ping: 1 })
      return true
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
    
    let rows: any[] = []
    let columns: string[] = []
    
    try {
      const pipeline = JSON.parse(sql)
      if (Array.isArray(pipeline) && pipeline.length > 0) {
        const collectionName = pipeline[0].$match ? 
          (await this.getTables())[0] : 
          (await this.getTables())[0]
        
        if (collectionName) {
          const collection = this.db!.collection(collectionName)
          rows = await collection.aggregate(pipeline).toArray()
        }
      }
    } catch {
      try {
        const query = JSON.parse(sql)
        const collections = await this.getTables()
        if (collections.length > 0) {
          const collection = this.db!.collection(collections[0])
          rows = await collection.find(query).limit(100).toArray()
        }
      } catch {
        const collections = await this.getTables()
        if (collections.length > 0) {
          const collection = this.db!.collection(collections[0])
          rows = await collection.find({}).limit(100).toArray()
        }
      }
    }

    const endTime = Date.now()
    
    if (rows.length > 0) {
      columns = this.extractColumns(rows)
    }

    return this.createQueryResult(columns, rows, endTime - startTime, rows.length)
  }

  private extractColumns(docs: any[]): string[] {
    const columns = new Set<string>()
    docs.forEach(doc => {
      this.flattenKeys(doc, '', columns)
    })
    return Array.from(columns)
  }

  private flattenKeys(obj: any, prefix: string, keys: Set<string>): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        this.flattenKeys(value, fullKey, keys)
      } else {
        keys.add(fullKey)
      }
    }
  }

  async getTables(): Promise<string[]> {
    await this.connect()
    const collections = await this.db!.listCollections().toArray()
    return collections.map(c => c.name)
  }

  async getTableStructure(collectionName: string): Promise<any[]> {
    await this.connect()
    const collection = this.db!.collection(collectionName)
    const sample = await collection.findOne({})
    
    if (!sample) return []
    
    return Object.entries(sample).map(([key, value]) => ({
      field: key,
      type: this.getType(value),
      bsonType: typeof value === 'object' ? (value instanceof Date ? 'date' : 'object') : typeof value
    }))
  }

  private getType(value: any): string {
    if (value === null) return 'null'
    if (Array.isArray(value)) return 'array'
    if (value instanceof Date) return 'date'
    return typeof value
  }

  async insert(tableName: string, data: Record<string, any>): Promise<any> {
    await this.connect()
    const collection = this.db!.collection(tableName)
    const result = await collection.insertOne(data)
    return { insertedId: result.insertedId }
  }

  async update(tableName: string, data: Record<string, any>, where: Record<string, any>): Promise<number> {
    await this.connect()
    const collection = this.db!.collection(tableName)
    const result = await collection.updateMany(where, { $set: data })
    return result.modifiedCount
  }

  async delete(tableName: string, where: Record<string, any>): Promise<number> {
    await this.connect()
    const collection = this.db!.collection(tableName)
    const result = await collection.deleteMany(where)
    return result.deletedCount
  }
}
