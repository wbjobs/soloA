import * as fs from 'fs'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as zlib from 'zlib'
import { ConnectionConfig, BackupRecord, BackupType } from '../types'
import { createDatabaseConnection } from '../database'
import { backupRecordStore } from '../store'

const execAsync = promisify(exec)

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

function formatDate(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-').slice(0, -5)
}

export async function createBackup(
  config: ConnectionConfig,
  backupType: BackupType,
  saveDirectory: string,
  tables?: string[],
  compress: boolean = true
): Promise<BackupRecord> {
  const record: BackupRecord = {
    id: generateId(),
    connectionId: config.id,
    connectionName: config.name,
    database: config.database || '',
    backupType,
    tables,
    filePath: '',
    fileName: '',
    size: 0,
    status: 'running',
    createdAt: Date.now()
  }

  backupRecordStore.add(record)

  try {
    if (!fs.existsSync(saveDirectory)) {
      fs.mkdirSync(saveDirectory, { recursive: true })
    }

    const timestamp = formatDate(new Date())
    const baseFileName = `${config.name}_${config.database}_${timestamp}`
    let filePath: string
    let actualFileName: string

    if (config.type === 'sqlite') {
      filePath = await backupSQLite(config, saveDirectory, baseFileName)
    } else if (config.type === 'mysql') {
      filePath = await backupMySQL(config, saveDirectory, baseFileName, tables)
    } else if (config.type === 'postgresql') {
      filePath = await backupPostgreSQL(config, saveDirectory, baseFileName, tables)
    } else {
      filePath = await backupGeneric(config, saveDirectory, baseFileName, tables)
    }

    actualFileName = path.basename(filePath)

    if (compress && config.type !== 'sqlite') {
      const compressedPath = filePath + '.gz'
      await compressFile(filePath, compressedPath)
      fs.unlinkSync(filePath)
      filePath = compressedPath
      actualFileName = path.basename(filePath)
    }

    const stats = fs.statSync(filePath)

    record.filePath = filePath
    record.fileName = actualFileName
    record.size = stats.size
    record.status = 'success'
    record.completedAt = Date.now()

    backupRecordStore.update(record)
    return record
  } catch (err: any) {
    record.status = 'failed'
    record.errorMessage = err.message
    record.completedAt = Date.now()
    backupRecordStore.update(record)
    throw err
  }
}

async function backupSQLite(
  config: ConnectionConfig,
  saveDirectory: string,
  baseFileName: string
): Promise<string> {
  if (!config.filePath) {
    throw new Error('SQLite 需要文件路径')
  }

  const filePath = path.join(saveDirectory, `${baseFileName}.sqlite`)
  fs.copyFileSync(config.filePath, filePath)
  return filePath
}

async function backupMySQL(
  config: ConnectionConfig,
  saveDirectory: string,
  baseFileName: string,
  tables?: string[]
): Promise<string> {
  const filePath = path.join(saveDirectory, `${baseFileName}.sql`)
  
  let command = 'mysqldump'
  command += ` --host=${config.host}`
  command += ` --port=${config.port || 3306}`
  command += ` --user=${config.username}`
  if (config.password) {
    command += ` --password=${config.password}`
  }
  command += ` ${config.database}`
  if (tables && tables.length > 0) {
    command += ` ${tables.join(' ')}`
  }
  command += ` > "${filePath}"`

  try {
    await execAsync(command, { maxBuffer: 1024 * 1024 * 100 })
  } catch (err: any) {
    if (!fs.existsSync(filePath)) {
      throw err
    }
  }

  return filePath
}

async function backupPostgreSQL(
  config: ConnectionConfig,
  saveDirectory: string,
  baseFileName: string,
  tables?: string[]
): Promise<string> {
  const filePath = path.join(saveDirectory, `${baseFileName}.sql`)
  
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGPASSWORD: config.password || ''
  }

  let command = 'pg_dump'
  command += ` --host=${config.host}`
  command += ` --port=${config.port || 5432}`
  command += ` --username=${config.username}`
  command += ` --dbname=${config.database}`
  command += ` --file="${filePath}"`
  if (tables && tables.length > 0) {
    tables.forEach(table => {
      command += ` --table=${table}`
    })
  }

  try {
    await execAsync(command, { env, maxBuffer: 1024 * 1024 * 100 })
  } catch (err: any) {
    if (!fs.existsSync(filePath)) {
      throw err
    }
  }

  return filePath
}

async function backupGeneric(
  config: ConnectionConfig,
  saveDirectory: string,
  baseFileName: string,
  tables?: string[]
): Promise<string> {
  const filePath = path.join(saveDirectory, `${baseFileName}.json`)
  const connection = createDatabaseConnection(config)
  
  await connection.connect()
  
  const allTables = await connection.getTables()
  const exportTables = tables && tables.length > 0 
    ? tables.filter(t => allTables.includes(t))
    : allTables

  const exportData: Record<string, any[]> = {}

  for (const table of exportTables) {
    try {
      const result = await connection.executeQuery(`SELECT * FROM "${table}"`)
      exportData[table] = result.rows
    } catch (err) {
      console.error(`导出表 ${table} 失败:`, err)
      exportData[table] = []
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2), 'utf8')
  return filePath
}

function compressFile(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const gzip = zlib.createGzip()
    const input = fs.createReadStream(inputPath)
    const output = fs.createWriteStream(outputPath)

    input.pipe(gzip).pipe(output)
    output.on('finish', resolve)
    output.on('error', reject)
  })
}

export async function restoreBackup(
  config: ConnectionConfig,
  backupPath: string
): Promise<boolean> {
  if (!fs.existsSync(backupPath)) {
    throw new Error('备份文件不存在')
  }

  if (config.type === 'sqlite') {
    return restoreSQLite(config, backupPath)
  }

  if (backupPath.endsWith('.gz')) {
    const decompressedPath = backupPath.slice(0, -3)
    await decompressFile(backupPath, decompressedPath)
    await restoreFromFile(config, decompressedPath)
    fs.unlinkSync(decompressedPath)
  } else {
    await restoreFromFile(config, backupPath)
  }

  return true
}

function decompressFile(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const gunzip = zlib.createGunzip()
    const input = fs.createReadStream(inputPath)
    const output = fs.createWriteStream(outputPath)

    input.pipe(gunzip).pipe(output)
    output.on('finish', resolve)
    output.on('error', reject)
  })
}

async function restoreSQLite(
  config: ConnectionConfig,
  backupPath: string
): Promise<boolean> {
  if (!config.filePath) {
    throw new Error('SQLite 需要文件路径')
  }
  fs.copyFileSync(backupPath, config.filePath)
  return true
}

async function restoreFromFile(
  config: ConnectionConfig,
  filePath: string
): Promise<void> {
  if (filePath.endsWith('.json')) {
    await restoreFromJSON(config, filePath)
  } else if (filePath.endsWith('.sql')) {
    await restoreFromSQL(config, filePath)
  }
}

async function restoreFromJSON(
  config: ConnectionConfig,
  filePath: string
): Promise<void> {
  const content = fs.readFileSync(filePath, 'utf8')
  const data = JSON.parse(content)
  const connection = createDatabaseConnection(config)

  await connection.connect()

  for (const [table, rows] of Object.entries(data) as [string, any[]][]) {
    if (rows.length === 0) continue

    for (const row of rows) {
      try {
        await connection.insert(table, row)
      } catch (err) {
        console.error(`插入数据到 ${table} 失败:`, err)
      }
    }
  }
}

async function restoreFromSQL(
  config: ConnectionConfig,
  filePath: string
): Promise<void> {
  if (config.type === 'mysql') {
    const command = `mysql --host=${config.host} --port=${config.port || 3306} --user=${config.username} --password=${config.password} ${config.database} < "${filePath}"`
    await execAsync(command, { maxBuffer: 1024 * 1024 * 100 })
  } else if (config.type === 'postgresql') {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PGPASSWORD: config.password || ''
    }
    const command = `psql --host=${config.host} --port=${config.port || 5432} --username=${config.username} --dbname=${config.database} --file="${filePath}"`
    await execAsync(command, { env, maxBuffer: 1024 * 1024 * 100 })
  }
}

export function deleteBackupFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
}

export function getBackupDirectory(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.'
  return path.join(homeDir, 'DataVisualizer', 'backups')
}
