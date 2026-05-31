import type { FormField, FieldType, SelectOption } from '@/types/form'
import { v4 as uuidv4 } from 'uuid'

interface FieldConfig {
  type: FieldType
  label: string
  icon: string
  group: 'basic' | 'advanced' | 'layout'
}

export const fieldConfigs: FieldConfig[] = [
  { type: 'input', label: '单行输入', icon: 'Edit', group: 'basic' },
  { type: 'textarea', label: '多行输入', icon: 'Document', group: 'basic' },
  { type: 'number', label: '数字输入', icon: 'Calculator', group: 'basic' },
  { type: 'select', label: '下拉选择', icon: 'ArrowDown', group: 'basic' },
  { type: 'radio', label: '单选框', icon: 'Radio', group: 'basic' },
  { type: 'checkbox', label: '多选框', icon: 'Check', group: 'basic' },
  { type: 'date', label: '日期选择', icon: 'Calendar', group: 'basic' },
  { type: 'daterange', label: '日期范围', icon: 'Date', group: 'basic' },
  { type: 'time', label: '时间选择', icon: 'Timer', group: 'advanced' },
  { type: 'switch', label: '开关', icon: 'Switch', group: 'advanced' },
  { type: 'rate', label: '评分', icon: 'Star', group: 'advanced' },
  { type: 'slider', label: '滑块', icon: 'Slider', group: 'advanced' },
  { type: 'upload', label: '文件上传', icon: 'Upload', group: 'advanced' },
  { type: 'table', label: '子表格', icon: 'Grid', group: 'advanced' },
  { type: 'divider', label: '分割线', icon: 'MoreFilled', group: 'layout' },
]

const defaultOptions: SelectOption[] = [
  { label: '选项1', value: 'option1' },
  { label: '选项2', value: 'option2' },
  { label: '选项3', value: 'option3' },
]

export function createField(type: FieldType, index: number): FormField {
  const id = `field_${uuidv4().slice(0, 8)}`
  const config = fieldConfigs.find((c) => c.type === type)!
  
  const baseField: FormField = {
    id,
    type,
    label: `${config.label}${index + 1}`,
    fieldName: `${type}_${index + 1}`,
    required: false,
    disabled: false,
    hidden: false,
    validation: [],
    linkage: [],
    props: {},
  }

  switch (type) {
    case 'input':
      return {
        ...baseField,
        placeholder: '请输入内容',
        props: { clearable: true, maxlength: 100 },
      }
    case 'textarea':
      return {
        ...baseField,
        placeholder: '请输入详细内容',
        props: { rows: 4, maxlength: 500, showWordLimit: true },
      }
    case 'number':
      return {
        ...baseField,
        defaultValue: 0,
        props: { min: 0, step: 1, controls: true },
      }
    case 'select':
    case 'radio':
    case 'checkbox':
      return {
        ...baseField,
        placeholder: `请选择${config.label}`,
        options: [...defaultOptions],
        props: type === 'select' ? { clearable: true } : {},
      }
    case 'date':
      return {
        ...baseField,
        placeholder: '请选择日期',
        props: { format: 'YYYY-MM-DD', valueFormat: 'YYYY-MM-DD' },
      }
    case 'daterange':
      return {
        ...baseField,
        props: { format: 'YYYY-MM-DD', valueFormat: 'YYYY-MM-DD', startPlaceholder: '开始日期', endPlaceholder: '结束日期' },
      }
    case 'time':
      return {
        ...baseField,
        placeholder: '请选择时间',
        props: { format: 'HH:mm:ss', valueFormat: 'HH:mm:ss' },
      }
    case 'switch':
      return {
        ...baseField,
        defaultValue: false,
        props: { activeText: '是', inactiveText: '否' },
      }
    case 'rate':
      return {
        ...baseField,
        defaultValue: 0,
        props: { max: 5, allowHalf: true },
      }
    case 'slider':
      return {
        ...baseField,
        defaultValue: 0,
        props: { min: 0, max: 100, showStops: false },
      }
    case 'upload':
      return {
        ...baseField,
        props: { limit: 3, multiple: true, accept: '.jpg,.jpeg,.png,.pdf' },
      }
    case 'table':
      return {
        ...baseField,
        props: {
          columns: [
            { label: '字段1', field: 'col1', type: 'input' },
            { label: '字段2', field: 'col2', type: 'input' },
          ],
          minRows: 1,
        },
        defaultValue: [],
      }
    case 'divider':
      return {
        ...baseField,
        props: { contentPosition: 'center' },
      }
    default:
      return baseField
  }
}

export function getFieldIcon(type: FieldType): string {
  return fieldConfigs.find((c) => c.type === type)?.icon || 'QuestionFilled'
}

export function getFieldLabel(type: FieldType): string {
  return fieldConfigs.find((c) => c.type === type)?.label || type
}
