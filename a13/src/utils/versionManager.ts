import type { FormSchema } from '@/types/form'
import type { FormVersion } from '@/types/extensions'
import { v4 as uuidv4 } from 'uuid'
import dayjs from 'dayjs'

const DB_NAME = 'LowcodeFormDB'
const VERSIONS_STORE = 'formVersions'

export class VersionManager {
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 3)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        if (!db.objectStoreNames.contains('forms')) {
          db.createObjectStore('forms', { keyPath: 'id' })
        }
        
        if (!db.objectStoreNames.contains('customComponents')) {
          db.createObjectStore('customComponents', { keyPath: 'id' })
        }
        
        if (!db.objectStoreNames.contains(VERSIONS_STORE)) {
          const store = db.createObjectStore(VERSIONS_STORE, { keyPath: 'id' })
          store.createIndex('formId', 'formId', { unique: false })
          store.createIndex('createdAt', 'createdAt', { unique: false })
          store.createIndex('formId_version', ['formId', 'version'] as any, { unique: true })
        }
      }
    })
  }

  async saveVersion(
    form: FormSchema,
    options?: { name?: string; description?: string }
  ): Promise<FormVersion> {
    if (!this.db) await this.init()
    
    const existingVersions = await this.getVersions(form.id)
    const nextVersion = existingVersions.length + 1
    
    const version: FormVersion = {
      id: `version_${uuidv4().slice(0, 12)}`,
      formId: form.id,
      version: nextVersion,
      name: options?.name || `版本 ${nextVersion}`,
      description: options?.description,
      snapshot: JSON.stringify(form),
      createdAt: Date.now(),
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([VERSIONS_STORE], 'readwrite')
      const store = transaction.objectStore(VERSIONS_STORE)
      const request = store.put(version)
      request.onsuccess = () => resolve(version)
      request.onerror = () => reject(request.error)
    })
  }

  async getVersions(formId: string): Promise<FormVersion[]> {
    if (!this.db) await this.init()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([VERSIONS_STORE], 'readonly')
      const store = transaction.objectStore(VERSIONS_STORE)
      const index = store.index('formId')
      const request = index.getAll(formId)
      request.onsuccess = () => {
        const versions = request.result || []
        versions.sort((a, b) => b.createdAt - a.createdAt)
        resolve(versions)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async getVersion(versionId: string): Promise<FormVersion | undefined> {
    if (!this.db) await this.init()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([VERSIONS_STORE], 'readonly')
      const store = transaction.objectStore(VERSIONS_STORE)
      const request = store.get(versionId)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async restoreVersion(versionId: string): Promise<FormSchema | null> {
    const version = await this.getVersion(versionId)
    if (!version) return null
    
    try {
      const form = JSON.parse(version.snapshot) as FormSchema
      return form
    } catch {
      return null
    }
  }

  async deleteVersion(versionId: string): Promise<void> {
    if (!this.db) await this.init()
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([VERSIONS_STORE], 'readwrite')
      const store = transaction.objectStore(VERSIONS_STORE)
      const request = store.delete(versionId)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async deleteAllVersions(formId: string): Promise<void> {
    const versions = await this.getVersions(formId)
    for (const version of versions) {
      await this.deleteVersion(version.id)
    }
  }

  async compareVersions(
    version1: FormVersion,
    version2: FormVersion
  ): Promise<VersionComparison> {
    try {
      const form1 = JSON.parse(version1.snapshot) as FormSchema
      const form2 = JSON.parse(version2.snapshot) as FormSchema
      
      const differences: VersionDifference[] = []
      
      if (form1.name !== form2.name) {
        differences.push({
          type: 'form',
          field: 'name',
          oldValue: form1.name,
          newValue: form2.name,
        })
      }
      
      if (form1.description !== form2.description) {
        differences.push({
          type: 'form',
          field: 'description',
          oldValue: form1.description,
          newValue: form2.description,
        })
      }
      
      const fieldMap1 = new Map(form1.fields.map((f) => [f.id, f]))
      const fieldMap2 = new Map(form2.fields.map((f) => [f.id, f]))
      
      for (const [id, field] of fieldMap1) {
        if (!fieldMap2.has(id)) {
          differences.push({
            type: 'field',
            action: 'deleted',
            fieldId: id,
            fieldName: field.label,
          })
        }
      }
      
      for (const [id, field] of fieldMap2) {
        if (!fieldMap1.has(id)) {
          differences.push({
            type: 'field',
            action: 'added',
            fieldId: id,
            fieldName: field.label,
          })
        } else {
          const oldField = fieldMap1.get(id)!
          const fieldDiffs = this.compareFields(oldField, field)
          differences.push(...fieldDiffs)
        }
      }
      
      return {
        version1,
        version2,
        differences,
      }
    } catch (error) {
      return {
        version1,
        version2,
        differences: [],
        error: String(error),
      }
    }
  }

  private compareFields(
    oldField: any,
    newField: any
  ): VersionDifference[] {
    const differences: VersionDifference[] = []
    const ignoreKeys = ['id', 'validation', 'linkage', 'options', 'props']
    
    for (const key of Object.keys(newField)) {
      if (ignoreKeys.includes(key)) continue
      
      const oldValue = oldField[key]
      const newValue = newField[key]
      
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        differences.push({
          type: 'field',
          action: 'modified',
          fieldId: newField.id,
          fieldName: newField.label,
          field: key,
          oldValue,
          newValue,
        })
      }
    }
    
    return differences
  }

  formatVersionTime(timestamp: number): string {
    return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')
  }

  getVersionLabel(version: FormVersion): string {
    return `v${version.version} - ${version.name}`
  }
}

export interface VersionComparison {
  version1: FormVersion
  version2: FormVersion
  differences: VersionDifference[]
  error?: string
}

export interface VersionDifference {
  type: 'form' | 'field'
  action?: 'added' | 'deleted' | 'modified'
  field?: string
  fieldId?: string
  fieldName?: string
  oldValue?: any
  newValue?: any
}

export const versionManager = new VersionManager()
