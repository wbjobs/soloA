export type PriorityLevel = 1 | 2 | 3 | 4 | 5;
export type TaskStatus = 'pending' | 'queued' | 'running' | 'paused' | 'completed' | 'failed';
export type ChunkStatus = 'pending' | 'queued' | 'assigned' | 'processing' | 'paused' | 'completed' | 'failed';
export type NodeStatus = 'online' | 'offline' | 'busy';

export const PRIORITY_NAMES: Record<PriorityLevel, string> = {
  1: 'Critical',
  2: 'High',
  3: 'Normal',
  4: 'Low',
  5: 'Background'
};

export const PRIORITY_COLORS: Record<PriorityLevel, string> = {
  1: '#ef4444',
  2: '#f97316',
  3: '#3b82f6',
  4: '#22c55e',
  5: '#6b7280'
};

export interface NodeData {
  id: string;
  name: string;
  status: NodeStatus;
  cpu_usage?: number;
  memory_usage?: number;
  network_bandwidth?: number;
  current_task_id?: string | null;
  current_task_priority?: number | null;
  load_score?: number;
  last_heartbeat?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TaskChunk {
  id: string;
  task_id: string;
  chunk_index: number;
  data: string;
  assigned_to?: string;
  status: ChunkStatus;
  intermediate_result?: string;
  result?: string;
  node_name?: string;
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  priority: PriorityLevel;
  priority_name?: string;
  status: TaskStatus;
  total_chunks: number;
  completed_chunks: number;
  data: string;
  chunks?: TaskChunk[];
  created_at?: string;
  updated_at?: string;
}

export interface ExecutionLog {
  id: string;
  task_id: string;
  node_id: string;
  chunk_id: string;
  log_level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
  node_name?: string;
}

export type SignalingMessageType = 
  | 'offer' 
  | 'answer' 
  | 'candidate' 
  | 'register' 
  | 'heartbeat' 
  | 'task-complete'
  | 'task-pause'
  | 'task-resume'
  | 'task-started'
  | 'nodes-update'
  | 'task-update'
  | 'registered'
  | 'task-assigned'
  | 'preemption-notice';

export interface SignalingMessage {
  type: SignalingMessageType;
  from: string;
  to?: string;
  data?: any;
}

export interface PeerConnectionState {
  peerId: string;
  connection: RTCPeerConnection | null;
  dataChannel: RTCDataChannel | null;
  status: 'disconnected' | 'connecting' | 'connected' | 'failed';
}

export interface ActiveTask {
  taskId: string;
  chunkId: string;
  chunkIndex: number;
  data: any;
  priority: PriorityLevel;
  priorityName: string;
  startedAt: number;
  intermediateResult?: any;
}

export interface TaskQueueItem {
  id: string;
  name: string;
  priority: PriorityLevel;
  status: TaskStatus;
  total_chunks: number;
  completed_chunks: number;
  created_at: string;
  pending_chunks: number;
  running_chunks: number;
}

export interface SystemStats {
  nodes: {
    online_count: number;
    busy_count: number;
    offline_count: number;
    avg_cpu: number;
    avg_memory: number;
  };
  tasks: {
    pending_count: number;
    running_count: number;
    paused_count: number;
    completed_count: number;
    critical_count: number;
    high_count: number;
    normal_count: number;
    low_count: number;
    background_count: number;
  };
}

export interface TaskQueueResponse {
  queue: TaskQueueItem[];
  stats: SystemStats;
  priorityNames: Record<string, string>;
}
