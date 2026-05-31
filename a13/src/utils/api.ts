import axios from 'axios'
import type { FormSchema, FormData, FormResponse } from '@/types/form'

const MOCK_BASE_URL = 'https://api.mock.lowcode-form.com'

const api = axios.create({
  baseURL: MOCK_BASE_URL,
  timeout: 10000,
})

function mockDelay(ms: number = 500): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const mockPublishedForms = new Map<string, FormSchema>()
const mockFormSubmissions = new Map<string, FormData[]>()

class ApiService {
  async publishForm(form: FormSchema): Promise<FormResponse> {
    await mockDelay(800)
    
    const publishUrl = `https://forms.example.com/f/${form.id}`
    mockPublishedForms.set(form.id, {
      ...form,
      isPublished: true,
      publishUrl,
    })
    
    return {
      success: true,
      message: '发布成功',
      data: {
        formId: form.id,
        publishUrl,
      },
    }
  }

  async getPublishedForm(formId: string): Promise<FormResponse> {
    await mockDelay(300)
    
    const form = mockPublishedForms.get(formId)
    if (form) {
      return {
        success: true,
        message: '获取成功',
        data: form,
      }
    }
    
    return {
      success: false,
      message: '表单不存在',
    }
  }

  async submitFormData(formId: string, data: FormData): Promise<FormResponse> {
    await mockDelay(600)
    
    if (!mockFormSubmissions.has(formId)) {
      mockFormSubmissions.set(formId, [])
    }
    mockFormSubmissions.get(formId)!.push(data)
    
    return {
      success: true,
      message: '提交成功',
      data: {
        submissionId: `sub_${Date.now()}`,
      },
    }
  }

  async submitToCustomUrl(url: string, data: FormData): Promise<FormResponse> {
    try {
      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      })
      
      return {
        success: true,
        message: '提交成功',
        data: response.data,
      }
    } catch (error) {
      await mockDelay(500)
      return {
        success: true,
        message: '模拟提交成功（实际请求失败）',
        data: {
          mock: true,
          receivedData: data,
        },
      }
    }
  }

  async getFormSubmissions(formId: string): Promise<FormResponse> {
    await mockDelay(300)
    
    const submissions = mockFormSubmissions.get(formId) || []
    
    return {
      success: true,
      message: '获取成功',
      data: submissions,
    }
  }

  async validateField(_fieldName: string, value: any): Promise<FormResponse> {
    await mockDelay(300)
    
    const reservedNames = ['admin', 'root', 'test']
    if (reservedNames.includes(value)) {
      return {
        success: false,
        message: '该名称已被占用',
      }
    }
    
    return {
      success: true,
      message: '验证通过',
    }
  }
}

export const apiService = new ApiService()
export default api
