import * as XLSX from 'xlsx'
import type { FormSchema, FormData } from '@/types/form'
import type { ExportOptions } from '@/types/extensions'
import dayjs from 'dayjs'

const mockSubmissions: Record<string, FormData[]> = {}

export function setMockSubmissions(formId: string, data: FormData[]) {
  mockSubmissions[formId] = data
}

export function getMockSubmissions(formId: string): FormData[] {
  return mockSubmissions[formId] || generateSampleData(formId, 10)
}

export function generateSampleData(formId: string, count: number = 10): FormData[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `sub_${formId}_${i + 1}`,
    name: `示例用户${i + 1}`,
    email: `user${i + 1}@example.com`,
    phone: `1380000${String(1000 + i).slice(-4)}`,
    submittedAt: dayjs().subtract(count - i, 'day').format('YYYY-MM-DD HH:mm:ss'),
  }))
}

export class ExportManager {
  static async exportToCSV(
    form: FormSchema,
    data: FormData[],
    options: ExportOptions = {}
  ): Promise<string> {
    const includeHeader = options.includeHeader !== false
    const fields = options.fields || form.fields
      .filter((f) => f.type !== 'divider')
      .map((f) => f.fieldName)

    const headers = fields.map((fieldName) => {
      const field = form.fields.find((f) => f.fieldName === fieldName)
      return field?.label || fieldName
    })

    const rows = data.map((item) => {
      return fields.map((fieldName) => {
        const value = item[fieldName]
        return this.formatValueForCSV(value)
      })
    })

    let csvContent = ''
    if (includeHeader) {
      csvContent += this.arrayToCSVRow(headers)
    }
    rows.forEach((row) => {
      csvContent += this.arrayToCSVRow(row)
    })

    const BOM = '\uFEFF'
    return BOM + csvContent
  }

  static async exportToExcel(
    form: FormSchema,
    data: FormData[],
    options: ExportOptions = {}
  ): Promise<ArrayBuffer> {
    const includeHeader = options.includeHeader !== false
    const fields = options.fields || form.fields
      .filter((f) => f.type !== 'divider')
      .map((f) => f.fieldName)

    const headers = fields.map((fieldName) => {
      const field = form.fields.find((f) => f.fieldName === fieldName)
      return field?.label || fieldName
    })

    const rows = data.map((item) => {
      const row: Record<string, any> = {}
      fields.forEach((fieldName, index) => {
        const value = item[fieldName]
        row[headers[index]] = this.formatValueForExcel(value)
      })
      return row
    })

    const worksheetData = includeHeader ? [headers, ...rows.map(r => Object.values(r))] : rows.map(r => Object.values(r))
    const ws = XLSX.utils.aoa_to_sheet(worksheetData)
    
    ws['!cols'] = headers.map(() => ({ wch: 20 }))
    
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '表单数据')
    
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  }

  static downloadCSV(csvContent: string, fileName: string) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    this.downloadBlob(blob, fileName)
  }

  static downloadExcel(buffer: ArrayBuffer, fileName: string) {
    const blob = new Blob([buffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    })
    this.downloadBlob(blob, fileName)
  }

  private static downloadBlob(blob: Blob, fileName: string) {
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', fileName)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  private static formatValueForCSV(value: any): string {
    if (value === null || value === undefined) return ''
    if (Array.isArray(value)) {
      return `"${value.join('; ')}"`
    }
    if (typeof value === 'object') {
      return `"${JSON.stringify(value).replace(/"/g, '""')}"`
    }
    const strValue = String(value)
    if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
      return `"${strValue.replace(/"/g, '""')}"`
    }
    return strValue
  }

  private static formatValueForExcel(value: any): any {
    if (value === null || value === undefined) return ''
    if (Array.isArray(value)) {
      return value.join('; ')
    }
    if (typeof value === 'object') {
      return JSON.stringify(value)
    }
    return value
  }

  private static arrayToCSVRow(fields: string[]): string {
    return fields.join(',') + '\r\n'
  }

  static generateFileName(formName: string, format: 'csv' | 'excel'): string {
    const timestamp = dayjs().format('YYYYMMDD_HHmmss')
    const ext = format === 'csv' ? 'csv' : 'xlsx'
    return `${formName}_${timestamp}.${ext}`
  }

  static async exportFormFields(form: FormSchema): Promise<string> {
    const fields = form.fields.map((field, index) => ({
      序号: index + 1,
      字段名称: field.label,
      字段标识: field.fieldName,
      组件类型: field.type,
      是否必填: field.required ? '是' : '否',
      是否禁用: field.disabled ? '是' : '否',
      占位符: field.placeholder || '',
      默认值: field.defaultValue !== undefined ? String(field.defaultValue) : '',
    }))
    
    const ws = XLSX.utils.json_to_sheet(fields)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '字段配置')
    
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([buffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    })
    
    const fileName = `${form.name}_字段配置_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`
    this.downloadBlob(blob, fileName)
    
    return fileName
  }

  static convertJSONToCSV(jsonData: any[]): string {
    if (jsonData.length === 0) return ''
    
    const headers = Object.keys(jsonData[0])
    let csv = headers.join(',') + '\r\n'
    
    jsonData.forEach((item) => {
      const row = headers.map((header) => this.formatValueForCSV(item[header]))
      csv += row.join(',') + '\r\n'
    })
    
    const BOM = '\uFEFF'
    return BOM + csv
  }
}

export default ExportManager
