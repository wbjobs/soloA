export interface FormField {
  id: string
  type: FieldType
  label: string
  fieldName: string
  placeholder?: string
  defaultValue?: any
  required?: boolean
  disabled?: boolean
  hidden?: boolean
  validation?: ValidationRule[]
  options?: SelectOption[]
  linkage?: LinkageRule[]
  props?: Record<string, any>
}

export type FieldType = 
  | 'input'
  | 'textarea'
  | 'number'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'date'
  | 'daterange'
  | 'time'
  | 'switch'
  | 'rate'
  | 'slider'
  | 'upload'
  | 'table'
  | 'divider'

export interface SelectOption {
  label: string
  value: any
  disabled?: boolean
}

export interface ValidationRule {
  type: 'required' | 'pattern' | 'min' | 'max' | 'minLength' | 'maxLength' | 'email' | 'phone' | 'custom' | 'async'
  value?: any
  message?: string
  pattern?: string
  validator?: string
  asyncValidator?: string
}

export interface LinkageRule {
  id: string
  targetFieldId: string
  type: 'show' | 'hide' | 'setValue' | 'setOptions' | 'enable' | 'disable'
  condition: LinkageCondition
  value?: any
  options?: SelectOption[]
}

export interface LinkageCondition {
  fieldId: string
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'in'
  value: any
}

export interface FormSchema {
  id: string
  name: string
  description?: string
  submitUrl?: string
  fields: FormField[]
  createdAt: number
  updatedAt: number
  isPublished: boolean
  status?: 'draft' | 'published'
  publishUrl?: string
}

export interface FormData {
  [key: string]: any
}

export interface FormResponse {
  success: boolean
  message: string
  data?: any
}
