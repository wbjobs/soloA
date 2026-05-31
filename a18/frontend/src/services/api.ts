import axios from 'axios';
import type {
  PipelineNode,
  Pipeline,
  Layer,
  FlowSimulationResult,
  PressureDistribution,
  LeakSimulationResult,
  ShortestPathResult,
  ApiResponse
} from '../types';

const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

api.interceptors.response.use(
  response => response,
  error => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

export const nodeApi = {
  getAll: (params?: { layerId?: string; nodeType?: string }) =>
    api.get<ApiResponse<PipelineNode[]>>('/nodes', { params }),
  
  getById: (id: string) =>
    api.get<ApiResponse<PipelineNode>>(`/nodes/${id}`),
  
  create: (data: Partial<PipelineNode>) =>
    api.post<ApiResponse<PipelineNode>>('/nodes', data),
  
  update: (id: string, data: Partial<PipelineNode>) =>
    api.put<ApiResponse<PipelineNode>>(`/nodes/${id}`, data),
  
  delete: (id: string) =>
    api.delete<ApiResponse<any>>(`/nodes/${id}`),
  
  batchCreate: (nodes: Partial<PipelineNode>[]) =>
    api.post<ApiResponse<PipelineNode[]>>('/nodes/batch', { nodes }),
  
  query: (params: Record<string, any>) =>
    api.get<ApiResponse<PipelineNode[]>>('/nodes/query', { params })
};

export const pipelineApi = {
  getAll: (params?: { layerId?: string; status?: string; material?: string }) =>
    api.get<ApiResponse<Pipeline[]>>('/pipelines', { params }),
  
  getById: (id: string) =>
    api.get<ApiResponse<Pipeline>>(`/pipelines/${id}`),
  
  create: (data: Partial<Pipeline>) =>
    api.post<ApiResponse<Pipeline>>('/pipelines', data),
  
  update: (id: string, data: Partial<Pipeline>) =>
    api.put<ApiResponse<Pipeline>>(`/pipelines/${id}`, data),
  
  delete: (id: string) =>
    api.delete<ApiResponse<any>>(`/pipelines/${id}`),
  
  batchCreate: (pipelines: Partial<Pipeline>[]) =>
    api.post<ApiResponse<Pipeline[]>>('/pipelines/batch', { pipelines }),
  
  query: (params: Record<string, any>) =>
    api.get<ApiResponse<Pipeline[]>>('/pipelines/query', { params })
};

export const layerApi = {
  getAll: () =>
    api.get<ApiResponse<Layer[]>>('/layers'),
  
  getById: (id: string) =>
    api.get<ApiResponse<Layer>>(`/layers/${id}`),
  
  create: (data: Partial<Layer>) =>
    api.post<ApiResponse<Layer>>('/layers', data),
  
  update: (id: string, data: Partial<Layer>) =>
    api.put<ApiResponse<Layer>>(`/layers/${id}`, data),
  
  delete: (id: string) =>
    api.delete<ApiResponse<any>>(`/layers/${id}`),
  
  toggleVisibility: (id: string) =>
    api.patch<ApiResponse<Layer>>(`/layers/${id}/toggle-visibility`),
  
  updateStyle: (id: string, style: Record<string, any>) =>
    api.patch<ApiResponse<Layer>>(`/layers/${id}/style`, { style })
};

export const analysisApi = {
  checkConnectivity: (nodeId1: string, nodeId2: string) =>
    api.post<ApiResponse<{ nodeId1: string; nodeId2: string; connected: boolean }>>('/analysis/connectivity', {
      nodeId1,
      nodeId2
    }),
  
  getUpstream: (nodeId: string, maxDepth: number = 10) =>
    api.post<ApiResponse<{
      startNode: string;
      nodes: string[];
      edges: any[];
    }>>('/analysis/upstream', { nodeId, maxDepth }),
  
  getDownstream: (nodeId: string, maxDepth: number = 10) =>
    api.post<ApiResponse<{
      startNode: string;
      nodes: string[];
      edges: any[];
    }>>('/analysis/downstream', { nodeId, maxDepth }),
  
  detectLoops: () =>
    api.post<ApiResponse<{
      loopCount: number;
      loops: string[][];
    }>>('/analysis/loops'),
  
  getShortestPath: (startNodeId: string, endNodeId: string) =>
    api.post<ApiResponse<ShortestPathResult>>('/analysis/shortest-path', {
      startNodeId,
      endNodeId
    }),
  
  findNearestNode: (x: number, y: number, maxDistance: number = 100) =>
    api.post<ApiResponse<PipelineNode | null>>('/analysis/nearest-node', {
      x,
      y,
      maxDistance
    })
};

export const simulationApi = {
  runFlowSimulation: () =>
    api.post<ApiResponse<FlowSimulationResult>>('/simulation/flow'),
  
  calculatePressureDistribution: () =>
    api.post<ApiResponse<PressureDistribution>>('/simulation/pressure'),
  
  simulateLeak: (leakNodeId: string, leakRate: number = 10) =>
    api.post<ApiResponse<LeakSimulationResult>>('/simulation/leak', {
      leakNodeId,
      leakRate
    }),
  
  getLeakImpactArea: (leakNodeId: string, leakRate: number = 10) =>
    api.post<ApiResponse<LeakSimulationResult['impactArea']>>('/simulation/leak-impact', {
      leakNodeId,
      leakRate
    })
};

export const dataApi = {
  export: (options: { includeNodes?: boolean; includePipelines?: boolean; includeLayers?: boolean }) =>
    api.post<ApiResponse<any>>('/data/export', options),
  
  import: (data: any, overwrite: boolean = false) =>
    api.post<ApiResponse<any>>('/data/import', { ...data, overwrite }),
  
  exportGeoJSON: () =>
    api.get<ApiResponse<any>>('/data/export/geojson'),
  
  importGeoJSON: (geojson: any, overwrite: boolean = false) =>
    api.post<ApiResponse<any>>('/data/import/geojson', { geojson, overwrite })
};

export default api;
