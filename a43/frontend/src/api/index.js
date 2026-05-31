import axios from 'axios'

const API_BASE = '/api'

export const api = {
  getDevices: () => axios.get(`${API_BASE}/devices/`),
  getDevice: (deviceId) => axios.get(`${API_BASE}/devices/${deviceId}`),
  getDeviceRealtime: (deviceId) => axios.get(`${API_BASE}/devices/${deviceId}/realtime`),
  getDeviceHistory: (deviceId, hours = 24) => 
    axios.get(`${API_BASE}/devices/${deviceId}/history`, { params: { hours } }),
  
  checkReservationConflict: (deviceId, startTime, endTime) =>
    axios.get(`${API_BASE}/reservations/check-conflict`, {
      params: { device_id: deviceId, start_time: startTime, end_time: endTime }
    }),
  
  createReservation: (data) => axios.post(`${API_BASE}/reservations/`, data),
  getReservations: () => axios.get(`${API_BASE}/reservations/`),
  cancelReservation: (id) => axios.delete(`${API_BASE}/reservations/${id}`),
  
  getAlerts: (params = {}) => axios.get(`${API_BASE}/alerts/`, { params }),
  getActiveAlerts: (deviceId = null) => 
    axios.get(`${API_BASE}/alerts/active`, { params: deviceId ? { device_id: deviceId } : {} }),
  acknowledgeAlert: (id) => axios.put(`${API_BASE}/alerts/${id}/acknowledge`),
  acknowledgeAllAlerts: (deviceId = null) => 
    axios.put(`${API_BASE}/alerts/acknowledge-all`, null, { 
      params: deviceId ? { device_id: deviceId } : {} 
    }),
  
  getSensorDataRange: (deviceId, hours = 24) =>
    axios.get(`${API_BASE}/sensor-data/range`, { 
      params: { device_id: deviceId, hours } 
    }),
  
  batchInsertData: (data) => axios.post(`${API_BASE}/sensor-data/batch`, { data }),
  
  getCabinets: () => axios.get(`${API_BASE}/consumables/cabinets`),
  getCabinetsStats: () => axios.get(`${API_BASE}/consumables/cabinets/stats`),
  getCabinetStock: (cabinetId) => axios.get(`${API_BASE}/consumables/cabinets/${cabinetId}/stock`),
  
  getConsumables: (category) => axios.get(`${API_BASE}/consumables/`, { params: category ? { category } : {} }),
  getConsumable: (consumableId) => axios.get(`${API_BASE}/consumables/${consumableId}`),
  
  checkStock: (items) => axios.post(`${API_BASE}/consumables/check-stock`, items),
  addStock: (data) => axios.post(`${API_BASE}/consumables/stock`, data),
  recordUsage: (data) => axios.post(`${API_BASE}/consumables/usage`, data),
  getUsageHistory: (consumableId, days = 30) =>
    axios.get(`${API_BASE}/consumables/${consumableId}/usage-history`, { params: { days } }),
  
  createReservationWithConsumables: (data) => 
    axios.post(`${API_BASE}/reservations/with-consumables`, data),
  completeReservation: (id) => axios.post(`${API_BASE}/reservations/${id}/complete`),
  
  generatePurchaseSuggestions: () => axios.post(`${API_BASE}/consumables/generate-suggestions`),
  getPurchaseSuggestions: (status, urgency) => 
    axios.get(`${API_BASE}/consumables/purchase-suggestions`, { 
      params: { status, urgency } 
    }),
  approveSuggestion: (id) => axios.put(`${API_BASE}/consumables/purchase-suggestions/${id}/approve`),
  completeSuggestion: (id) => axios.put(`${API_BASE}/consumables/purchase-suggestions/${id}/complete`)
}
