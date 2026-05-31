import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const API_BASE_URL = (window as any).__VITE_API_BASE_URL__ || '';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (username: string, password: string) => {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);
    return api.post('/api/auth/login', formData);
  },
  getMe: () => api.get('/api/auth/me'),
  logout: () => api.post('/api/auth/logout'),
};

export const dicomApi = {
  upload: (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    return api.post('/api/dicom/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getPatients: (search?: string) =>
    api.get('/api/dicom/patients', { params: { search } }),
  getStudies: (patientId: number) =>
    api.get(`/api/dicom/patients/${patientId}/studies`),
  getSeries: (studyId: number) =>
    api.get(`/api/dicom/studies/${studyId}/series`),
  getInstances: (seriesId: number, skip: number = 0, limit: number = 50) =>
    api.get(`/api/dicom/series/${seriesId}/instances`, {
      params: { skip, limit },
    }),
  getImageUrl: (instanceId: number, windowCenter?: number, windowWidth?: number) => {
    let url = `${API_BASE_URL}/api/dicom/instance/${instanceId}/image`;
    const params: string[] = [];
    if (windowCenter !== undefined) {
      params.push(`window_center=${windowCenter}`);
    }
    if (windowWidth !== undefined) {
      params.push(`window_width=${windowWidth}`);
    }
    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }
    return url;
  },
  runAIDetection: (seriesId: number) =>
    api.post('/api/dicom/ai/detect', { series_id: seriesId }),
  getAIDetectionStatus: (taskId: string) =>
    api.get(`/api/dicom/ai/detection/${taskId}`),
};

export const reportApi = {
  get: (studyId: number) => api.get(`/api/reports/study/${studyId}`),
  save: (studyId: number, data: any) =>
    api.post(`/api/reports/study/${studyId}`, data),
  finalize: (studyId: number) =>
    api.post(`/api/reports/study/${studyId}/finalize`),
};

export const auditApi = {
  getLogs: (params?: any) => api.get('/api/audit/logs', { params }),
  getMyLogs: () => api.get('/api/audit/my-logs'),
};

export const annotationApi = {
  create: (data: any) => api.post('/api/annotations/', data),
  getBySeries: (seriesId: number) =>
    api.get(`/api/annotations/series/${seriesId}`),
  getByInstance: (instanceId: number) =>
    api.get(`/api/annotations/instance/${instanceId}`),
  get: (annotationId: number) =>
    api.get(`/api/annotations/${annotationId}`),
  update: (annotationId: number, data: any) =>
    api.put(`/api/annotations/${annotationId}`, data),
  delete: (annotationId: number) =>
    api.delete(`/api/annotations/${annotationId}`),
  createReview: (data: any) =>
    api.post('/api/annotations/reviews', data),
  getReviews: (annotationId: number) =>
    api.get(`/api/annotations/reviews/${annotationId}`),
  finalize: (annotationId: number) =>
    api.post(`/api/annotations/${annotationId}/finalize`),
};

export const volumeApi = {
  getMIP: (seriesId: number, axis: number = 0, projectionType: string = 'mip', windowCenter?: number, windowWidth?: number) => {
    const params: string[] = [`axis=${axis}`, `projection_type=${projectionType}`];
    if (windowCenter !== undefined) params.push(`window_center=${windowCenter}`);
    if (windowWidth !== undefined) params.push(`window_width=${windowWidth}`);
    return `${API_BASE_URL}/api/volume/mip/${seriesId}?${params.join('&')}`;
  },
  generateMIP: (data: any) =>
    api.post('/api/volume/mip', data, { responseType: 'blob' }),
  getVolumeMetadata: (seriesId: number) =>
    api.get(`/api/volume/volume-metadata/${seriesId}`),
};

export const templateApi = {
  create: (data: any) => api.post('/api/report-templates/', data),
  list: (modality?: string, bodyPart?: string) =>
    api.get('/api/report-templates/', { params: { modality, body_part: bodyPart } }),
  get: (templateId: number) =>
    api.get(`/api/report-templates/${templateId}`),
  update: (templateId: number, data: any) =>
    api.put(`/api/report-templates/${templateId}`, data),
  delete: (templateId: number) =>
    api.delete(`/api/report-templates/${templateId}`),
};

export default api;
