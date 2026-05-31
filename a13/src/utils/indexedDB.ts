import type { FormSchema } from '@/types/form'

const DB_NAME = 'LowcodeFormDB'
const DB_VERSION = 1
const STORE_NAME = 'forms'

class IndexedDBService {
  private db: IDBDatabase | null = null

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('name', 'name', { unique: false })
          store.createIndex('createdAt', 'createdAt', { unique: false })
        }
      }
    })
  }

  async saveForm(form: FormSchema): Promise<void> {
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      form.updatedAt = Date.now()
      const request = store.put(form)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async getForm(id: string): Promise<FormSchema | undefined> {
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(id)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }

  async getAllForms(): Promise<FormSchema[]> {
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
  }

  async deleteForm(id: string): Promise<void> {
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.delete(id)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  }

  async exportFormJSON(form: FormSchema): Promise<string> {
    return JSON.stringify(form, null, 2)
  }

  async importFormJSON(jsonStr: string): Promise<FormSchema> {
    const form = JSON.parse(jsonStr) as FormSchema
    form.id = form.id || this.generateId()
    form.createdAt = form.createdAt || Date.now()
    form.updatedAt = Date.now()
    return form
  }

  private generateId(): string {
    return `form_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

export const indexedDBService = new IndexedDBService()
