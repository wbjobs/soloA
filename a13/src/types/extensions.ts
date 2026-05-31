export interface CustomComponent {
  id: string
  name: string
  label: string
  icon: string
  description: string
  template: string
  script: string
  styles?: string
  props?: CustomComponentProp[]
  events?: CustomComponentEvent[]
  createdAt: number
  updatedAt: number
}

export interface CustomComponentProp {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  label: string
  defaultValue?: any
  description?: string
  required?: boolean
}

export interface CustomComponentEvent {
  name: string
  label: string
  description?: string
}

export interface FormVersion {
  id: string
  formId: string
  version: number
  name: string
  description?: string
  snapshot: string
  createdAt: number
  createdBy?: string
}

export interface ExportOptions {
  format?: 'csv' | 'excel'
  includeHeader?: boolean
  fileName?: string
  fields?: string[]
}

export interface ExportRecord {
  id: string
  formId: string
  format: 'csv' | 'excel'
  fileName: string
  createdAt: number
  rowCount: number
}
