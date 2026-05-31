import axios from 'axios'
import type {
  Message, Answer, SearchResult, GraphData, FilterOptions, UploadResponse,
  HypothesisResponse, LiteratureReview, Annotation, Notification
} from '../types'

const API_BASE = ''

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const apiService = {
  async health(): Promise<{ status: string }> {
    const response = await api.get('/health')
    return response.data
  },

  async uploadDocument(file: File): Promise<UploadResponse> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await api.post('/api/documents/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  async search(query: string, topK: number = 5): Promise<{ query: string; count: number; results: SearchResult[] }> {
    const response = await api.post('/api/search', {
      query,
      top_k: topK,
      filters: {},
    })
    return response.data
  },

  async ask(
    query: string,
    conversationId: string | null = null,
    topK: number = 5
  ): Promise<{ conversation_id: string; answer: Answer }> {
    const response = await api.post('/api/ask', {
      query,
      conversation_id: conversationId,
      top_k: topK,
      use_graph: true,
    })
    return response.data
  },

  async getGraph(entity?: string, limit: number = 100): Promise<GraphData> {
    const params = new URLSearchParams()
    if (entity) params.append('entity', entity)
    params.append('limit', limit.toString())

    const response = await api.get(`/api/graph?${params.toString()}`)
    return response.data
  },

  async runCypher(query: string): Promise<{ results: any[] }> {
    const response = await api.post('/api/graph/cypher', { query })
    return response.data
  },

  async getFilters(): Promise<FilterOptions> {
    const response = await api.get('/api/filters')
    return response.data
  },

  async getConversation(conversationId: string): Promise<{ conversation_id: string; messages: Message[] }> {
    const response = await api.get(`/api/conversations/${conversationId}`)
    return response.data
  },

  async deleteConversation(conversationId: string): Promise<void> {
    await api.delete(`/api/conversations/${conversationId}`)
  },

  async generateHypotheses(focus?: string): Promise<HypothesisResponse> {
    const params = new URLSearchParams()
    if (focus) params.append('focus', focus)
    const url = `/api/hypotheses${params.toString() ? `?${params.toString()}` : ''}`
    const response = await api.get(url)
    return response.data
  },

  async generateReview(
    query: string,
    topK: number = 20
  ): Promise<LiteratureReview> {
    const response = await api.post('/api/review', {
      query,
      top_k: topK,
      generate_trends: true
    })
    return response.data
  },

  async getTrends(query: string, topK: number = 50): Promise<any> {
    const params = new URLSearchParams()
    params.append('query', query)
    params.append('top_k', topK.toString())
    const response = await api.get(`/api/trends?${params.toString()}`)
    return response.data
  },

  async createAnnotation(data: {
    document_id: string
    chunk_index: number
    start_offset: number
    end_offset: number
    highlighted_text: string
    user_id: string
    user_name: string
    content: string
    parent_id?: string
    mentions?: string[]
  }): Promise<Annotation> {
    const response = await api.post('/api/annotations', data)
    return response.data
  },

  async getDocumentAnnotations(documentId: string, includeReplies: boolean = true): Promise<{ count: number; annotations: Annotation[] }> {
    const params = new URLSearchParams()
    params.append('include_replies', includeReplies.toString())
    const response = await api.get(`/api/annotations/document/${documentId}?${params.toString()}`)
    return response.data
  },

  async getAnnotationThread(annotationId: string): Promise<{ count: number; thread: Annotation[] }> {
    const response = await api.get(`/api/annotations/thread/${annotationId}`)
    return response.data
  },

  async getUserAnnotations(userId: string): Promise<{ count: number; annotations: Annotation[] }> {
    const response = await api.get(`/api/annotations/user/${userId}`)
    return response.data
  },

  async updateAnnotation(annotationId: string, userId: string, content: string): Promise<Annotation> {
    const response = await api.put(`/api/annotations/${annotationId}`, {
      user_id: userId,
      content
    })
    return response.data
  },

  async deleteAnnotation(annotationId: string, userId: string): Promise<{ status: string }> {
    const params = new URLSearchParams()
    params.append('user_id', userId)
    const response = await api.delete(`/api/annotations/${annotationId}?${params.toString()}`)
    return response.data
  },

  async resolveAnnotation(annotationId: string, userId: string): Promise<Annotation> {
    const params = new URLSearchParams()
    params.append('user_id', userId)
    const response = await api.post(`/api/annotations/${annotationId}/resolve?${params.toString()}`)
    return response.data
  },

  async voteAnnotation(annotationId: string, userId: string, direction: 'up' | 'remove'): Promise<Annotation> {
    const response = await api.post('/api/annotations/vote', {
      annotation_id: annotationId,
      user_id: userId,
      direction
    })
    return response.data
  },

  async getNotifications(userId: string, unreadOnly: boolean = true): Promise<{ count: number; notifications: Notification[] }> {
    const params = new URLSearchParams()
    params.append('unread_only', unreadOnly.toString())
    const response = await api.get(`/api/notifications/${userId}?${params.toString()}`)
    return response.data
  },

  async markNotificationRead(userId: string, notificationId: string): Promise<{ status: string }> {
    const params = new URLSearchParams()
    params.append('user_id', userId)
    const response = await api.post(`/api/notifications/${notificationId}/read?${params.toString()}`)
    return response.data
  },

  async markAllNotificationsRead(userId: string): Promise<{ marked_count: number }> {
    const params = new URLSearchParams()
    params.append('user_id', userId)
    const response = await api.post(`/api/notifications/mark-all-read?${params.toString()}`)
    return response.data
  },
}
