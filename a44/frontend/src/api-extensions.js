import axios from 'axios';

const API_BASE = 'http://localhost:8000';

export const amrApi = {
  addRegion: (caseId, regionData) =>
    axios.post(`${API_BASE}/api/amr/${caseId}/regions`, regionData),
  
  getRegions: (caseId) =>
    axios.get(`${API_BASE}/api/amr/${caseId}/regions`),
  
  updateRegion: (caseId, regionId, regionData) =>
    axios.put(`${API_BASE}/api/amr/${caseId}/regions/${regionId}`, regionData),
  
  deleteRegion: (caseId, regionId) =>
    axios.delete(`${API_BASE}/api/amr/${caseId}/regions/${regionId}`),
  
  clearRegions: (caseId) =>
    axios.post(`${API_BASE}/api/amr/${caseId}/regions/clear`),
  
  analyzeAndSuggest: (caseId, options) =>
    axios.post(`${API_BASE}/api/amr/${caseId}/analyze`, options || {}),
  
  applySuggested: (caseId) =>
    axios.post(`${API_BASE}/api/amr/${caseId}/apply-suggested`),
  
  estimateCells: (caseId) =>
    axios.get(`${API_BASE}/api/amr/${caseId}/estimate`),
  
  generateDict: (caseId, options) =>
    axios.post(`${API_BASE}/api/amr/${caseId}/generate-dict`, options || {}),
  
  validateRegions: (caseId) =>
    axios.post(`${API_BASE}/api/amr/${caseId}/validate`),
};

export const validationApi = {
  compareWithReference: (caseId, referenceData, options) =>
    axios.post(`${API_BASE}/api/validation/${caseId}/compare`, referenceData, options || {}),
  
  compareWithFile: (caseId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return axios.post(`${API_BASE}/api/validation/${caseId}/compare-file`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  
  getResult: (resultId) =>
    axios.get(`${API_BASE}/api/validation/${resultId}`),
  
  getCaseHistory: (caseId) =>
    axios.get(`${API_BASE}/api/validation/case/${caseId}/history`),
  
  generateReport: (resultId) =>
    axios.get(`${API_BASE}/api/validation/${resultId}/report`, {
      responseType: 'blob'
    }),
  
  getQuickReport: (caseId) =>
    axios.post(`${API_BASE}/api/validation/${caseId}/quick-report`),
  
  analyzeField: (caseId, fieldName, options) =>
    axios.post(`${API_BASE}/api/validation/field-analysis/${caseId}/${fieldName}`, options || {}),
  
  deleteResult: (resultId) =>
    axios.delete(`${API_BASE}/api/validation/${resultId}`),
};
