import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const authApi = {
  register: (data: { username: string; email: string; password: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  getMe: () => api.get('/auth/me')
}

export const documentApi = {
  getDocuments: () => api.get('/documents'),
  getDocument: (id: string) => api.get(`/documents/${id}`),
  createDocument: (data: { title: string }) => api.post('/documents', data),
  updateDocument: (id: string, data: { title: string }) => api.put(`/documents/${id}`, data),
  deleteDocument: (id: string) => api.delete(`/documents/${id}`),
  getVersions: (id: string) => api.get(`/documents/${id}/versions`),
  rollbackVersion: (id: string, versionNumber: number) =>
    api.post(`/documents/${id}/versions/${versionNumber}/rollback`),
  createSnapshot: (id: string, data: { ydocState: Uint8Array; contentSnapshot: string }) =>
    api.post(`/documents/${id}/versions/create-snapshot`, data)
}

export const commentApi = {
  getComments: (documentId: string) => api.get(`/comments/document/${documentId}`),
  createComment: (data: {
    documentId: string;
    anchorFrom: Record<string, any>;
    anchorTo: Record<string, any>;
    selectedText: string;
    content: string;
  }) => api.post('/comments', data),
  createReply: (commentId: string, data: { content: string }) =>
    api.post(`/comments/${commentId}/replies`, data),
  resolveComment: (commentId: string) => api.patch(`/comments/${commentId}/resolve`),
  reopenComment: (commentId: string) => api.patch(`/comments/${commentId}/reopen`)
}

export default api
