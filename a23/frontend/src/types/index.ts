export type DatasourceType = 'mysql' | 'postgresql' | 'csv' | 'rest_api';

export interface Datasource {
  id: string;
  name: string;
  type: DatasourceType;
  description?: string;
  config: Record<string, any>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NodeType = 'source' | 'filter' | 'mapping' | 'aggregate' | 'sink' | 'quality';

export type QualityCheckType = 'not_null' | 'regex' | 'unique' | 'range' | 'min_length' | 'max_length' | 'in_list';

export interface QualityCheck {
  id: string;
  type: QualityCheckType;
  field: string;
  severity: 'error' | 'warn';
  message?: string;
  pattern?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  values?: string[];
  stopOnError?: boolean;
}

export interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: {
    label: string;
    config: Record<string, any>;
    datasourceId?: string;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface FlowDefinition {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface FlowVersion {
  id: string;
  flowId: string;
  version: number;
  changelog?: string;
  definition: FlowDefinition;
  createdAt: string;
}

export type FlowStatus = 'draft' | 'published' | 'archived';

export interface Flow {
  id: string;
  name: string;
  description?: string;
  status: FlowStatus;
  currentVersionId?: string;
  versions: FlowVersion[];
  cronExpression?: string;
  isScheduled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Execution {
  id: string;
  flowId: string;
  flowVersionId: string;
  versionNumber: number;
  status: ExecutionStatus;
  metadata?: {
    triggerType: 'manual' | 'schedule' | 'api';
    userId?: string;
    rowsProcessed?: number;
    errors?: Array<{
      nodeId: string;
      nodeType: string;
      message: string;
      timestamp: string;
    }>;
    previewData?: any[];
  };
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  nodeProgress?: Record<string, {
    status: ExecutionStatus;
    startTime?: string;
    endTime?: string;
    rowsProcessed?: number;
  }>;
  createdAt: string;
  updatedAt: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ExecutionLog {
  id: string;
  executionId: string;
  nodeId?: string;
  level: LogLevel;
  message: string;
  data?: any;
  timestamp: string;
}

export interface FilterCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 
    'starts_with' | 'ends_with' | 'greater_than' | 'greater_than_or_equal' |
    'less_than' | 'less_than_or_equal' | 'is_null' | 'is_not_null' |
    'in' | 'not_in';
  value?: string | number | string[];
}

export interface FieldMapping {
  sourceField: string;
  targetField?: string;
  transform: 'none' | 'uppercase' | 'lowercase' | 'trim' |
    'to_number' | 'to_string' | 'to_date' | 'round' | 'floor' | 'ceil' | 'length';
}

export interface Aggregation {
  field?: string;
  operation: 'count' | 'sum' | 'avg' | 'min' | 'max' | 'first' | 'last';
}

export type LineageNodeType = 'datasource' | 'flow' | 'node' | 'table' | 'field';

export interface LineageGraph {
  nodes: Array<{
    id: string;
    label: string;
    type: LineageNodeType;
    datasourceType?: string;
    nodeType?: string;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceType: LineageNodeType;
    targetType: LineageNodeType;
    metadata?: Record<string, any>;
  }>;
}
