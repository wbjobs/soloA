import axios from 'axios';
import {
  Datasource,
  DatasourceType,
  Flow,
  FlowDefinition,
  FlowVersion,
  Execution,
  ExecutionLog,
} from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

export const datasourceApi = {
  getAll: async (): Promise<Datasource[]> => {
    const response = await api.get('/datasources');
    return response.data;
  },

  getById: async (id: string): Promise<Datasource> => {
    const response = await api.get(`/datasources/${id}`);
    return response.data;
  },

  create: async (data: Partial<Datasource>): Promise<Datasource> => {
    const response = await api.post('/datasources', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Datasource>): Promise<Datasource> => {
    const response = await api.put(`/datasources/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/datasources/${id}`);
  },

  testConnection: async (type: DatasourceType, config: Record<string, any>): Promise<{ success: boolean; message: string }> => {
    const response = await api.post('/datasources/test', { type, config });
    return response.data;
  },
};

export const flowApi = {
  getAll: async (): Promise<Flow[]> => {
    const response = await api.get('/flows');
    return response.data;
  },

  getById: async (id: string): Promise<Flow> => {
    const response = await api.get(`/flows/${id}`);
    return response.data;
  },

  create: async (data: { name: string; description?: string }): Promise<Flow> => {
    const response = await api.post('/flows', data);
    return response.data;
  },

  update: async (id: string, data: Partial<Flow>): Promise<Flow> => {
    const response = await api.put(`/flows/${id}`, data);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/flows/${id}`);
  },

  saveVersion: async (flowId: string, definition: FlowDefinition, changelog?: string): Promise<FlowVersion> => {
    const response = await api.post(`/flows/${flowId}/versions`, { definition, changelog });
    return response.data;
  },

  getVersions: async (flowId: string): Promise<FlowVersion[]> => {
    const response = await api.get(`/flows/${flowId}/versions`);
    return response.data;
  },

  getVersion: async (flowId: string, versionId: string): Promise<FlowVersion> => {
    const response = await api.get(`/flows/${flowId}/versions/${versionId}`);
    return response.data;
  },

  rollback: async (flowId: string, versionId: string): Promise<FlowVersion> => {
    const response = await api.post(`/flows/${flowId}/versions/${versionId}/rollback`);
    return response.data;
  },

  compareVersions: async (flowId: string, version1: string, version2: string): Promise<any> => {
    const response = await api.get(`/flows/${flowId}/compare?version1=${version1}&version2=${version2}`);
    return response.data;
  },

  publish: async (flowId: string, versionId: string, changelog?: string): Promise<Flow> => {
    const response = await api.post(`/flows/${flowId}/publish`, { versionId, changelog });
    return response.data;
  },

  updateSchedule: async (flowId: string, cronExpression: string): Promise<Flow> => {
    const response = await api.put(`/flows/${flowId}/schedule`, { cronExpression });
    return response.data;
  },

  disableSchedule: async (flowId: string): Promise<Flow> => {
    const response = await api.delete(`/flows/${flowId}/schedule`);
    return response.data;
  },

  validateFlow: async (definition: FlowDefinition): Promise<{
    valid: boolean;
    error?: string;
    cycleNodes?: string[];
  }> => {
    const response = await api.post('/flows/validate', definition);
    return response.data;
  },
};

export const executionApi = {
  getAll: async (flowId?: string): Promise<Execution[]> => {
    const url = flowId ? `/executions?flowId=${flowId}` : '/executions';
    const response = await api.get(url);
    return response.data;
  },

  getById: async (id: string): Promise<Execution> => {
    const response = await api.get(`/executions/${id}`);
    return response.data;
  },

  runFlow: async (flowId: string): Promise<Execution> => {
    const response = await api.post(`/executions/run/${flowId}`);
    return response.data;
  },

  getLogs: async (executionId: string): Promise<ExecutionLog[]> => {
    const response = await api.get(`/executions/${executionId}/logs`);
    return response.data;
  },

  getPreviewData: async (executionId: string): Promise<any[]> => {
    const response = await api.get(`/executions/${executionId}/preview`);
    return response.data;
  },

  retry: async (executionId: string): Promise<Execution> => {
    const response = await api.post(`/executions/${executionId}/retry`);
    return response.data;
  },
};

export const lineageApi = {
  getFlowLineage: async (flowId: string): Promise<any> => {
    const response = await api.get(`/lineage/flow/${flowId}`);
    return response.data;
  },

  getDatasourceLineage: async (datasourceId: string): Promise<any> => {
    const response = await api.get(`/lineage/datasource/${datasourceId}`);
    return response.data;
  },
};

export default api;
