import { compile, h, defineComponent, markRaw } from 'vue'
import type { CustomComponent } from '@/types/extensions'
import { v4 as uuidv4 } from 'uuid'

const DB_NAME = 'LowcodeFormDB'
const CUSTOM_COMPONENTS_STORE = 'customComponents'

export class CustomComponentManager {
  private db: IDBDatabase | null = null
  private componentCache = new Map<string, any>()
  private loadedComponents = new Map<string, CustomComponent>()

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2)

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
        
        if (!db.objectStoreNames.contains(CUSTOM_COMPONENTS_STORE)) {
          const store = db.createObjectStore(CUSTOM_COMPONENTS_STORE, { keyPath: 'id' })
          store.createIndex('name', 'name', { unique: true })
          store.createIndex('createdAt', 'createdAt', { unique: false })
        }
      }
    })
  }

  async saveComponent(component: CustomComponent): Promise<void> {
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CUSTOM_COMPONENTS_STORE], 'readwrite')
      const store = transaction.objectStore(CUSTOM_COMPONENTS_STORE)
      component.updatedAt = Date.now()
      const request = store.put(component)
      request.onsuccess = () => {
        this.loadedComponents.delete(component.id)
        this.componentCache.delete(component.id)
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  }

  async getComponent(id: string): Promise<CustomComponent | undefined> {
    if (!this.db) await this.init()
    
    if (this.loadedComponents.has(id)) {
      return this.loadedComponents.get(id)
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CUSTOM_COMPONENTS_STORE], 'readonly')
      const store = transaction.objectStore(CUSTOM_COMPONENTS_STORE)
      const request = store.get(id)
      request.onsuccess = () => {
        if (request.result) {
          this.loadedComponents.set(id, request.result)
        }
        resolve(request.result)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async getAllComponents(): Promise<CustomComponent[]> {
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CUSTOM_COMPONENTS_STORE], 'readonly')
      const store = transaction.objectStore(CUSTOM_COMPONENTS_STORE)
      const request = store.getAll()
      request.onsuccess = () => {
        const components = request.result || []
        components.forEach((c) => this.loadedComponents.set(c.id, c))
        resolve(components)
      }
      request.onerror = () => reject(request.error)
    })
  }

  async deleteComponent(id: string): Promise<void> {
    if (!this.db) await this.init()
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([CUSTOM_COMPONENTS_STORE], 'readwrite')
      const store = transaction.objectStore(CUSTOM_COMPONENTS_STORE)
      const request = store.delete(id)
      request.onsuccess = () => {
        this.loadedComponents.delete(id)
        this.componentCache.delete(id)
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  }

  createComponent(
    name: string,
    label: string,
    template: string,
    script: string,
    options?: Partial<CustomComponent>
  ): CustomComponent {
    return {
      id: `custom_${uuidv4().slice(0, 8)}`,
      name,
      label,
      icon: options?.icon || 'MagicStick',
      description: options?.description || '自定义组件',
      template,
      script,
      styles: options?.styles,
      props: options?.props || [],
      events: options?.events || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  }

  compileComponent(component: CustomComponent): any {
    if (this.componentCache.has(component.id)) {
      return this.componentCache.get(component.id)
    }

    try {
      const render = this.compileTemplate(component.template)
      
      let setup: any = undefined
      if (component.script && component.script.trim()) {
        try {
          const setupFn = this.extractSetupFunction(component.script)
          setup = setupFn
        } catch (e) {
          console.warn('自定义组件 script 解析失败:', e)
        }
      }

      const compiled = defineComponent({
        name: `Custom_${component.name}`,
        props: this.buildPropsDefinition(component),
        emits: (component.events || []).map((e) => e.name),
        setup,
        render,
      })

      this.componentCache.set(component.id, markRaw(compiled))
      return compiled
    } catch (error) {
      console.error('自定义组件编译失败:', error)
      return this.createFallbackComponent(component, error as Error)
    }
  }

  private compileTemplate(template: string): any {
    try {
      const compiled = compile(template, { mode: 'function' }) as any
      const { code } = compiled
      const fn = new Function('h', 'Vue', code)
      return (_ctx: any) => fn(h, {})
    } catch (error) {
      console.error('模板编译失败:', error)
      return (_ctx: any) => h('div', { class: 'custom-component-error' }, [
        h('p', { style: { color: 'red' } }, '模板编译错误'),
        h('pre', { style: { fontSize: '12px' } }, String(error))
      ])
    }
  }

  private extractSetupFunction(scriptContent: string): any | undefined {
    if (!scriptContent.includes('setup') && !scriptContent.includes('function')) {
      return undefined
    }

    try {
      const wrappedCode = `
        (function() {
          ${scriptContent}
          if (typeof setup === 'function') {
            return setup
          }
          return undefined
        })()
      `
      const result = new Function(wrappedCode)()
      return result
    } catch (e) {
      console.warn('setup 函数提取失败:', e)
      return undefined
    }
  }

  private buildPropsDefinition(component: CustomComponent): Record<string, any> {
    const props: Record<string, any> = {}
    if (component.props) {
      component.props.forEach((prop) => {
        props[prop.name] = {
          type: this.mapPropType(prop.type),
          default: prop.defaultValue,
          required: prop.required || false,
        }
      })
    }
    props.modelValue = {
      type: null,
      default: undefined,
    }
    props.field = {
      type: Object,
      required: true,
    }
    return props
  }

  private mapPropType(type: string): any {
    switch (type) {
      case 'string': return String
      case 'number': return Number
      case 'boolean': return Boolean
      case 'object': return Object
      case 'array': return Array
      default: return null
    }
  }

  private createFallbackComponent(component: CustomComponent, error: Error): any {
    return defineComponent({
      name: `Fallback_${component.name}`,
      props: ['modelValue', 'field'],
      render() {
        return h('div', { 
          style: {
            padding: '16px',
            border: '2px dashed #f56c6c',
            borderRadius: '4px',
            background: '#fef0f0',
            color: '#f56c6c'
          }
        }, [
          h('div', { style: { fontWeight: 'bold', marginBottom: '8px' } }, 
            `自定义组件 "${component.label}" 加载失败`
          ),
          h('div', { style: { fontSize: '12px' } }, error.message)
        ])
      }
    })
  }

  clearCache() {
    this.componentCache.clear()
    this.loadedComponents.clear()
  }

  getComponentConfig(id: string): CustomComponent | undefined {
    return this.loadedComponents.get(id)
  }
}

export const customComponentManager = new CustomComponentManager()
