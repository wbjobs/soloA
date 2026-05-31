import { ConnectionConfig, CompareResult, CompareStatus, CompareRow, QueryResult } from '../types'
import { createDatabaseConnection } from '../database'

export async function compareTables(
  connectionA: ConnectionConfig,
  connectionB: ConnectionConfig,
  tableA: string,
  tableB: string,
  primaryKey: string,
  maxCompare: number = 10000
): Promise<CompareResult> {
  const startTime = Date.now()

  const connA = createDatabaseConnection(connectionA)
  const connB = createDatabaseConnection(connectionB)

  await connA.connect()
  await connB.connect()

  try {
    const tablesA = await connA.getTables()
    const tablesB = await connB.getTables()

    if (!tablesA.includes(tableA)) {
      throw new Error(`连接 A 中不存在表: ${tableA}`)
    }
    if (!tablesB.includes(tableB)) {
      throw new Error(`连接 B 中不存在表: ${tableB}`)
    }

    const [resultA, resultB] = await Promise.all([
      connA.executeQuery(`SELECT * FROM "${tableA}" LIMIT ${maxCompare}`),
      connB.executeQuery(`SELECT * FROM "${tableB}" LIMIT ${maxCompare}`)
    ])

    const columnsA = resultA.columns
    const columnsB = resultB.columns
    const commonColumns = columnsA.filter(c => columnsB.includes(c))

    if (!commonColumns.includes(primaryKey)) {
      throw new Error(`主键字段 ${primaryKey} 在两个表中不存在或不一致`)
    }

    const mapA = new Map<string, Record<string, any>>()
    resultA.rows.forEach(row => {
      const key = String(row[primaryKey])
      if (key !== undefined && key !== null) {
        mapA.set(key, row)
      }
    })

    const mapB = new Map<string, Record<string, any>>()
    resultB.rows.forEach(row => {
      const key = String(row[primaryKey])
      if (key !== undefined && key !== null) {
        mapB.set(key, row)
      }
    })

    const differences: CompareRow[] = []
    let sameCount = 0
    let differentCount = 0
    let addedCount = 0
    let removedCount = 0

    const allKeys = new Set([...mapA.keys(), ...mapB.keys()])

    for (const key of allKeys) {
      const rowA = mapA.get(key)
      const rowB = mapB.get(key)

      if (rowA && rowB) {
        const diffs = compareRows(rowA, rowB, commonColumns)
        if (diffs.length === 0) {
          sameCount++
        } else {
          differentCount++
          differences.push({
            status: 'different',
            key,
            rowA,
            rowB,
            differences: diffs
          })
        }
      } else if (rowB && !rowA) {
        addedCount++
        differences.push({
          status: 'added',
          key,
          rowB
        })
      } else if (rowA && !rowB) {
        removedCount++
        differences.push({
          status: 'removed',
          key,
          rowA
        })
      }
    }

    const endTime = Date.now()

    return {
      tableA,
      tableB,
      connectionAId: connectionA.id,
      connectionBId: connectionB.id,
      primaryKey,
      totalA: resultA.rowCount,
      totalB: resultB.rowCount,
      sameCount,
      differentCount,
      addedCount,
      removedCount,
      differences,
      columnsA,
      columnsB,
      commonColumns,
      duration: endTime - startTime
    }
  } finally {
    try {
      await connA.disconnect()
      await connB.disconnect()
    } catch (e) {
      // 忽略断开连接时的错误
    }
  }
}

function compareRows(
  rowA: Record<string, any>,
  rowB: Record<string, any>,
  columns: string[]
): string[] {
  const differences: string[] = []

  for (const col of columns) {
    const valA = rowA[col]
    const valB = rowB[col]

    if (!areValuesEqual(valA, valB)) {
      differences.push(col)
    }
  }

  return differences
}

function areValuesEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (a === null && b === null) return true
  if (a === undefined && b === undefined) return true
  if (a === null || b === null) return false
  if (a === undefined || b === undefined) return false

  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b)
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime()
  }

  return String(a) === String(b)
}

export function generateSQLFix(
  result: CompareResult,
  diff: CompareRow
): string {
  if (diff.status === 'added' && diff.rowB) {
    const columns = Object.keys(diff.rowB)
    const values = Object.values(diff.rowB).map(v => formatValue(v))
    return `INSERT INTO "${result.tableB}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});`
  }

  if (diff.status === 'removed' && diff.rowA) {
    return `DELETE FROM "${result.tableB}" WHERE "${result.primaryKey}" = ${formatValue(diff.rowA[result.primaryKey])};`
  }

  if (diff.status === 'different' && diff.rowA && diff.rowB && diff.differences) {
    const updates = diff.differences
      .map(col => `"${col}" = ${formatValue(diff.rowB![col])}`)
      .join(', ')
    return `UPDATE "${result.tableB}" SET ${updates} WHERE "${result.primaryKey}" = ${formatValue(diff.rowA[result.primaryKey])};`
  }

  return ''
}

function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return 'NULL'
  }
  if (typeof value === 'number') {
    return String(value)
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE'
  }
  if (value instanceof Date) {
    return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`
  }
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`
  }
  return `'${String(value).replace(/'/g, "''")}'`
}

export async function getTableRowsCount(
  config: ConnectionConfig,
  tableName: string
): Promise<number> {
  const conn = createDatabaseConnection(config)
  await conn.connect()

  try {
    const result = await conn.executeQuery(`SELECT COUNT(*) as count FROM "${tableName}"`)
    if (result.rows.length > 0) {
      const count = result.rows[0].count || result.rows[0].COUNT
      return Number(count) || 0
    }
    return 0
  } finally {
    await conn.disconnect()
  }
}
