import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.response.use(
  response => response.data,
  error => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

export const dataApi = {
  ingest: (data) => api.post('/data/ingest', data),
  ingestSingle: (data) => api.post('/data/ingest/single', data),
  query: (params) => api.get('/data/query', { params }),
  getDevices: () => api.get('/data/devices'),
  getSensors: (deviceId) => 
    deviceId ? api.get(`/data/devices/${deviceId}/sensors`) : api.get('/data/sensors'),
  uploadCSV: (file, deviceId, sensorType) => {
    const formData = new FormData();
    formData.append('file', file);
    if (deviceId) formData.append('device_id', deviceId);
    if (sensorType) formData.append('sensor_type', sensorType);
    return api.post('/data/upload/csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  batchAnalyze: (params) => api.post('/data/batch/analyze', null, { params })
};

export const alertsApi = {
  getAlerts: (params) => api.get('/alerts', { params }),
  getAlertStats: () => api.get('/alerts/stats'),
  getAlertById: (id) => api.get(`/alerts/${id}`),
  resolveAlert: (id) => api.post(`/alerts/${id}/resolve`),
  getAlertTrace: (id, options = {}) => api.get(`/alerts/${id}/trace`, { 
    params: {
      cross_device: options.crossDevice !== false,
      time_window_minutes: options.timeWindowMinutes || 30,
      ...options
    }
  })
};

export const rulesApi = {
  mineRules: (params) => api.post('/rules/mine', null, { params }),
  getRules: (params) => api.get('/rules', { params }),
  getRulesGraph: (params) => api.get('/rules/graph', { params }),
  getRuleById: (id) => api.get(`/rules/${id}`)
};

export const statsApi = {
  getOverall: () => api.get('/stats'),
  getRealtime: (params) => api.get('/stats/realtime', { params }),
  getDeviceStats: (deviceId, days) => 
    api.get(`/stats/devices/${deviceId}`, { params: { days } }),
  healthCheck: () => api.get('/stats/health')
};

export const analysisApi = {
  analyzeRootCause: (alertId, params = {}) => 
    api.post(`/analysis/root-cause/${alertId}`, null, { params }),
  getRootCauseAnalysis: (alertId, params = {}) => 
    api.get(`/analysis/root-cause/${alertId}`, { params }),
  sendAlertNotification: (alertId, params = {}) => 
    api.post(`/analysis/notifications/send/${alertId}`, null, { params }),
  sendBatchNotifications: (params = {}) => 
    api.post('/analysis/notifications/batch', null, { params }),
  getNotificationStatus: () => api.get('/analysis/notifications/status'),
  getTopologySummary: () => api.get('/analysis/topology'),
  addTopologyRelationship: (params) => 
    api.post('/analysis/topology/relationship', null, { params }),
  getTopologyNeighbors: (deviceId, sensorType, params = {}) => 
    api.get('/analysis/topology/neighbors', { 
      params: { device_id: deviceId, sensor_type: sensorType, ...params } 
    }),
  getRelatedNodes: (deviceId, sensorType, params = {}) => 
    api.get('/analysis/topology/related', { 
      params: { device_id: deviceId, sensor_type: sensorType, ...params } 
    })
};

export default api;
