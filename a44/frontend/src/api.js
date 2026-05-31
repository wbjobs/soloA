import axios from 'axios';

const API_BASE = 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

export const caseApi = {
  getAll: () => api.get('/api/cases'),
  get: (id) => api.get(`/api/cases/${id}`),
  getFull: (id) => api.get(`/api/cases/${id}/full`),
  create: (data) => api.post('/api/cases', data),
  update: (id, data) => api.put(`/api/cases/${id}`, data),
  delete: (id) => api.delete(`/api/cases/${id}`),
  uploadStl: (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/api/cases/${id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  generateMesh: (id) => api.post(`/api/cases/${id}/generate-mesh`),
  runSolver: (id) => api.post(`/api/cases/${id}/run-solver`),
  getProgress: (taskId) => api.get(`/api/cases/tasks/${taskId}/progress`),
  duplicate: (id, name) => api.post(`/api/cases/${id}/duplicate?new_name=${encodeURIComponent(name)}`),
  compare: (id1, id2) => api.get(`/api/cases/${id1}/compare/${id2}`),
  getVersions: (id) => api.get(`/api/cases/${id}/versions`),
};

export const dataApi = {
  getGeometry: (id, time = 'constant') => 
    api.get(`/api/data/${id}/geometry?time=${time}`),
  getVtk: (id, time) => {
    const params = time ? `?time=${time}` : '';
    return api.get(`/api/data/${id}/vtk${params}`);
  },
  getFields: (id) => api.get(`/api/data/${id}/fields`),
  getField: (id, field, time) => {
    const params = time ? `?time=${time}` : '';
    return api.get(`/api/data/${id}/field/${field}${params}`);
  },
  getTimes: (id) => api.get(`/api/data/${id}/times`),
  getSlice: (id, axis, position, time) => {
    let params = `?axis=${axis}&position=${position}`;
    if (time) params += `&time=${time}`;
    return api.get(`/api/data/${id}/slices${params}`);
  },
};

export const createWebSocket = (type, caseId) => {
  const wsUrl = `ws://localhost:8000/ws/${type}/${caseId}`;
  return new WebSocket(wsUrl);
};

export default api;
