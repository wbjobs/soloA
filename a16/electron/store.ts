import Store from 'electron-store'
import { ConnectionConfig, QueryHistory, BackupRecord, BackupSchedule, SavedSQL, SQLCategory } from './types'

const store = new Store({
  name: 'data-visualizer',
  defaults: {
    connections: [],
    queryHistory: [],
    backupRecords: [],
    backupSchedules: [],
    savedSQLs: [],
    sqlCategories: [
      { id: 'default', name: '默认分类', color: '#3b82f6', createdAt: Date.now() },
      { id: 'query', name: '查询语句', color: '#10b981', createdAt: Date.now() },
      { id: 'ddl', name: 'DDL语句', color: '#f59e0b', createdAt: Date.now() },
      { id: 'dml', name: 'DML语句', color: '#ef4444', createdAt: Date.now() }
    ]
  }
})

export const connectionStore = {
  getAll: (): ConnectionConfig[] => {
    return store.get('connections', []) as ConnectionConfig[]
  },

  save: (connection: ConnectionConfig): ConnectionConfig => {
    const connections = store.get('connections', []) as ConnectionConfig[]
    const index = connections.findIndex(c => c.id === connection.id)
    
    if (index >= 0) {
      connections[index] = { ...connection, updatedAt: Date.now() }
    } else {
      connections.push({ ...connection, createdAt: Date.now(), updatedAt: Date.now() })
    }
    
    store.set('connections', connections)
    return connection
  },

  delete: (id: string): boolean => {
    const connections = store.get('connections', []) as ConnectionConfig[]
    const filtered = connections.filter(c => c.id !== id)
    store.set('connections', filtered)
    return filtered.length < connections.length
  },

  getById: (id: string): ConnectionConfig | undefined => {
    const connections = store.get('connections', []) as ConnectionConfig[]
    return connections.find(c => c.id === id)
  }
}

export const queryHistoryStore = {
  getAll: (): QueryHistory[] => {
    return store.get('queryHistory', []) as QueryHistory[]
  },

  add: (history: QueryHistory): QueryHistory => {
    const histories = store.get('queryHistory', []) as QueryHistory[]
    histories.unshift(history)
    if (histories.length > 1000) {
      histories.pop()
    }
    store.set('queryHistory', histories)
    return history
  },

  clear: (): void => {
    store.set('queryHistory', [])
  },

  delete: (id: string): boolean => {
    const histories = store.get('queryHistory', []) as QueryHistory[]
    const filtered = histories.filter(h => h.id !== id)
    store.set('queryHistory', filtered)
    return filtered.length < histories.length
  }
}

export const backupRecordStore = {
  getAll: (): BackupRecord[] => {
    return store.get('backupRecords', []) as BackupRecord[]
  },

  add: (record: BackupRecord): BackupRecord => {
    const records = store.get('backupRecords', []) as BackupRecord[]
    records.unshift(record)
    if (records.length > 500) {
      records.pop()
    }
    store.set('backupRecords', records)
    return record
  },

  update: (record: BackupRecord): boolean => {
    const records = store.get('backupRecords', []) as BackupRecord[]
    const index = records.findIndex(r => r.id === record.id)
    if (index >= 0) {
      records[index] = record
      store.set('backupRecords', records)
      return true
    }
    return false
  },

  delete: (id: string): boolean => {
    const records = store.get('backupRecords', []) as BackupRecord[]
    const filtered = records.filter(r => r.id !== id)
    store.set('backupRecords', filtered)
    return filtered.length < records.length
  },

  getByConnection: (connectionId: string): BackupRecord[] => {
    const records = store.get('backupRecords', []) as BackupRecord[]
    return records.filter(r => r.connectionId === connectionId)
  },

  clear: (): void => {
    store.set('backupRecords', [])
  }
}

export const backupScheduleStore = {
  getAll: (): BackupSchedule[] => {
    return store.get('backupSchedules', []) as BackupSchedule[]
  },

  save: (schedule: BackupSchedule): BackupSchedule => {
    const schedules = store.get('backupSchedules', []) as BackupSchedule[]
    const index = schedules.findIndex(s => s.id === schedule.id)
    
    if (index >= 0) {
      schedules[index] = { ...schedule, updatedAt: Date.now() }
    } else {
      schedules.push({ ...schedule, createdAt: Date.now(), updatedAt: Date.now() })
    }
    
    store.set('backupSchedules', schedules)
    return schedule
  },

  delete: (id: string): boolean => {
    const schedules = store.get('backupSchedules', []) as BackupSchedule[]
    const filtered = schedules.filter(s => s.id !== id)
    store.set('backupSchedules', filtered)
    return filtered.length < schedules.length
  },

  getById: (id: string): BackupSchedule | undefined => {
    const schedules = store.get('backupSchedules', []) as BackupSchedule[]
    return schedules.find(s => s.id === id)
  },

  getEnabled: (): BackupSchedule[] => {
    const schedules = store.get('backupSchedules', []) as BackupSchedule[]
    return schedules.filter(s => s.enabled)
  }
}

export const savedSQLStore = {
  getAll: (): SavedSQL[] => {
    return store.get('savedSQLs', []) as SavedSQL[]
  },

  save: (savedSQL: SavedSQL): SavedSQL => {
    const savedSQLs = store.get('savedSQLs', []) as SavedSQL[]
    const index = savedSQLs.findIndex(s => s.id === savedSQL.id)
    
    if (index >= 0) {
      savedSQLs[index] = { ...savedSQL, updatedAt: Date.now() }
    } else {
      savedSQLs.push({ ...savedSQL, createdAt: Date.now(), updatedAt: Date.now(), executionCount: 0 })
    }
    
    store.set('savedSQLs', savedSQLs)
    return savedSQL
  },

  delete: (id: string): boolean => {
    const savedSQLs = store.get('savedSQLs', []) as SavedSQL[]
    const filtered = savedSQLs.filter(s => s.id !== id)
    store.set('savedSQLs', filtered)
    return filtered.length < savedSQLs.length
  },

  getById: (id: string): SavedSQL | undefined => {
    const savedSQLs = store.get('savedSQLs', []) as SavedSQL[]
    return savedSQLs.find(s => s.id === id)
  },

  getByCategory: (category: string): SavedSQL[] => {
    const savedSQLs = store.get('savedSQLs', []) as SavedSQL[]
    return savedSQLs.filter(s => s.category === category)
  },

  incrementExecution: (id: string): void => {
    const savedSQLs = store.get('savedSQLs', []) as SavedSQL[]
    const index = savedSQLs.findIndex(s => s.id === id)
    if (index >= 0) {
      savedSQLs[index] = {
        ...savedSQLs[index],
        executionCount: savedSQLs[index].executionCount + 1,
        lastExecuted: Date.now(),
        updatedAt: Date.now()
      }
      store.set('savedSQLs', savedSQLs)
    }
  }
}

export const sqlCategoryStore = {
  getAll: (): SQLCategory[] => {
    return store.get('sqlCategories', []) as SQLCategory[]
  },

  save: (category: SQLCategory): SQLCategory => {
    const categories = store.get('sqlCategories', []) as SQLCategory[]
    const index = categories.findIndex(c => c.id === category.id)
    
    if (index >= 0) {
      categories[index] = category
    } else {
      categories.push({ ...category, createdAt: Date.now() })
    }
    
    store.set('sqlCategories', categories)
    return category
  },

  delete: (id: string): boolean => {
    if (id === 'default') return false
    const categories = store.get('sqlCategories', []) as SQLCategory[]
    const filtered = categories.filter(c => c.id !== id)
    store.set('sqlCategories', filtered)
    return filtered.length < categories.length
  },

  getById: (id: string): SQLCategory | undefined => {
    const categories = store.get('sqlCategories', []) as SQLCategory[]
    return categories.find(c => c.id === id)
  }
}

export default store
