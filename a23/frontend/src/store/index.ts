import { create } from 'zustand';
import { Flow, FlowDefinition, FlowVersion, Datasource, Execution, ExecutionLog } from '../types';

interface AppState {
  flows: Flow[];
  datasources: Datasource[];
  currentFlow: Flow | null;
  currentDefinition: FlowDefinition | null;
  currentExecution: Execution | null;
  executionLogs: ExecutionLog[];
  previewData: any[];
  selectedNodeId: string | null;
  isLoading: boolean;

  setFlows: (flows: Flow[]) => void;
  setDatasources: (datasources: Datasource[]) => void;
  setCurrentFlow: (flow: Flow | null) => void;
  setCurrentDefinition: (definition: FlowDefinition | null) => void;
  setCurrentExecution: (execution: Execution | null) => void;
  setExecutionLogs: (logs: ExecutionLog[]) => void;
  addExecutionLog: (log: ExecutionLog) => void;
  setPreviewData: (data: any[]) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  flows: [],
  datasources: [],
  currentFlow: null,
  currentDefinition: null,
  currentExecution: null,
  executionLogs: [],
  previewData: [],
  selectedNodeId: null,
  isLoading: false,

  setFlows: (flows) => set({ flows }),
  setDatasources: (datasources) => set({ datasources }),
  setCurrentFlow: (flow) => set({ currentFlow: flow }),
  setCurrentDefinition: (definition) => set({ currentDefinition: definition }),
  setCurrentExecution: (execution) => set({ currentExecution: execution }),
  setExecutionLogs: (logs) => set({ executionLogs: logs }),
  addExecutionLog: (log) =>
    set((state) => ({
      executionLogs: [...state.executionLogs, log],
    })),
  setPreviewData: (data) => set({ previewData: data }),
  setSelectedNodeId: (nodeId) => set({ selectedNodeId: nodeId }),
  setLoading: (loading) => set({ isLoading: loading }),
}));
