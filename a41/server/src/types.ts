export type PriorityLevel = 1 | 2 | 3 | 4 | 5;
export type TaskStatus = 'pending' | 'queued' | 'running' | 'paused' | 'completed' | 'failed';
export type ChunkStatus = 'pending' | 'queued' | 'assigned' | 'processing' | 'paused' | 'completed' | 'failed';
export type NodeStatus = 'online' | 'offline' | 'busy';

export interface Node {
  id: string;
  name: string;
  status: NodeStatus;
  cpu_usage?: number;
  memory_usage?: number;
  network_bandwidth?: number;
  current_task_id?: string | null;
  current_task_priority?: number | null;
  last_heartbeat?: Date;
}

export interface NodeWithLoad extends Node {
  load_score: number;
}

export interface Task {
  id: string;
  name: string;
  description?: string;
  priority: PriorityLevel;
  status: TaskStatus;
  total_chunks: number;
  completed_chunks: number;
  data: string;
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
}

export interface ExecutionLog {
  id: string;
  task_id: string;
  node_id: string;
  chunk_id: string;
  log_level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: Date;
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

export interface TaskQueueItem {
  taskId: string;
  priority: PriorityLevel;
  pendingChunks: number;
  createdAt: Date;
}
