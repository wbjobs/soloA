import { v4 as uuidv4 } from 'uuid';
import type { 
  SignalingMessage, 
  PeerConnectionState, 
  NodeData, 
  Task, 
  ActiveTask,
  TaskQueueResponse,
  PriorityLevel
} from '../types';

const SIGNALING_URL = 'ws://localhost:8080/ws';
const API_BASE = 'http://localhost:8080/api';

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

type MessageHandler = (message: SignalingMessage) => void;
type NodesUpdateHandler = (nodes: NodeData[]) => void;
type TaskUpdateHandler = (task: Task) => void;
type ConnectionStatusHandler = (connected: boolean) => void;
type PreemptionHandler = (data: any) => void;

interface PendingTask {
  timeoutId: number;
  task: ActiveTask;
  progress: number;
}

export class WebRTCService {
  private nodeId: string;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private heartbeatInterval: number | null = null;
  private messageHandlers: MessageHandler[] = [];
  private nodesUpdateHandlers: NodesUpdateHandler[] = [];
  private taskUpdateHandlers: TaskUpdateHandler[] = [];
  private connectionStatusHandlers: ConnectionStatusHandler[] = [];
  private preemptionHandlers: PreemptionHandler[] = [];
  private peers: Map<string, PeerConnectionState> = new Map();
  private isRegistered = false;
  private currentTaskId: string | null = null;
  private pendingTasks: Map<string, PendingTask> = new Map();

  constructor(nodeId?: string) {
    this.nodeId = nodeId || uuidv4();
  }

  getNodeId(): string {
    return this.nodeId;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  onNodesUpdate(handler: NodesUpdateHandler): () => void {
    this.nodesUpdateHandlers.push(handler);
    return () => {
      this.nodesUpdateHandlers = this.nodesUpdateHandlers.filter(h => h !== handler);
    };
  }

  onTaskUpdate(handler: TaskUpdateHandler): () => void {
    this.taskUpdateHandlers.push(handler);
    return () => {
      this.taskUpdateHandlers = this.taskUpdateHandlers.filter(h => h !== handler);
    };
  }

  onConnectionStatus(handler: ConnectionStatusHandler): () => void {
    this.connectionStatusHandlers.push(handler);
    return () => {
      this.connectionStatusHandlers = this.connectionStatusHandlers.filter(h => h !== handler);
    };
  }

  onPreemption(handler: PreemptionHandler): () => void {
    this.preemptionHandlers.push(handler);
    return () => {
      this.preemptionHandlers = this.preemptionHandlers.filter(h => h !== handler);
    };
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(SIGNALING_URL);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.reconnectAttempts = 0;
          this.connectionStatusHandlers.forEach(h => h(true));
          this.register();
          this.startHeartbeat();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message: SignalingMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch (e) {
            console.error('Message parse error:', e);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log('WebSocket disconnected');
          this.isRegistered = false;
          this.connectionStatusHandlers.forEach(h => h(false));
          this.stopHeartbeat();
          this.scheduleReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * this.reconnectAttempts, 10000);
    
    console.log(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect().catch(console.error);
    }, delay);
  }

  private register() {
    this.send({
      type: 'register',
      from: this.nodeId,
      data: { name: `Browser-${this.nodeId.slice(0, 6)}` }
    });
  }

  private startHeartbeat() {
    this.heartbeatInterval = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({
          type: 'heartbeat',
          from: this.nodeId,
          data: {
            cpuUsage: Math.random() * 30 + 10,
            memoryUsage: Math.random() * 40 + 20,
            networkBandwidth: Math.random() * 50 + 50,
            currentTaskId: this.currentTaskId
          }
        });
      }
    }, 5000);
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private cleanupOfflinePeers(currentNodes: NodeData[]) {
    const onlineNodeIds = new Set(currentNodes
      .filter(n => n.status === 'online' || n.status === 'busy')
      .map(n => n.id)
    );

    const peersToRemove: string[] = [];
    
    this.peers.forEach((peer, peerId) => {
      if (peerId !== this.nodeId && !onlineNodeIds.has(peerId)) {
        peersToRemove.push(peerId);
      }
    });

    peersToRemove.forEach(peerId => {
      this.closePeerConnection(peerId);
    });
  }

  private closePeerConnection(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    console.log(`Cleaning up peer connection: ${peerId}`);

    try {
      if (peer.dataChannel) {
        if (peer.dataChannel.readyState === 'open' || peer.dataChannel.readyState === 'connecting') {
          peer.dataChannel.onopen = null;
          peer.dataChannel.onmessage = null;
          peer.dataChannel.onclose = null;
          peer.dataChannel.onerror = null;
          
          if (peer.dataChannel.readyState === 'open') {
            peer.dataChannel.close();
          }
        }
        peer.dataChannel = null;
      }
    } catch (e) {
      console.warn(`Error closing DataChannel for ${peerId}:`, e);
    }

    try {
      if (peer.connection) {
        if (peer.connection.connectionState !== 'closed' && peer.connection.connectionState !== 'failed') {
          peer.connection.onicecandidate = null;
          peer.connection.onconnectionstatechange = null;
          peer.connection.ondatachannel = null;
          peer.connection.close();
        }
        peer.connection = null;
      }
    } catch (e) {
      console.warn(`Error closing PeerConnection for ${peerId}:`, e);
    }

    this.peers.delete(peerId);
    console.log(`Peer connection cleaned up: ${peerId}. Remaining: ${this.peers.size}`);
  }

  private handleMessage(message: SignalingMessage) {
    switch (message.type) {
      case 'registered':
        this.isRegistered = true;
        console.log('Registered as node:', this.nodeId);
        break;
      
      case 'nodes-update':
        if (message.data) {
          this.cleanupOfflinePeers(message.data);
          this.nodesUpdateHandlers.forEach(h => h(message.data));
        }
        break;

      case 'task-update':
        if (message.data) {
          this.taskUpdateHandlers.forEach(h => h(message.data));
        }
        break;

      case 'task-assigned':
        if (message.data) {
          this.handleTaskAssignment(message.data);
        }
        break;

      case 'task-pause':
        if (message.data) {
          this.handleTaskPause(message.data);
        }
        break;

      case 'task-resume':
        if (message.data) {
          this.handleTaskResume(message.data);
        }
        break;

      case 'preemption-notice':
        if (message.data) {
          console.log('Preemption notice received:', message.data);
          this.preemptionHandlers.forEach(h => h(message.data));
        }
        break;

      case 'offer':
        this.handleOffer(message);
        break;

      case 'answer':
        this.handleAnswer(message);
        break;

      case 'candidate':
        this.handleCandidate(message);
        break;

      default:
        this.messageHandlers.forEach(h => h(message));
    }
  }

  private handleTaskAssignment(data: any) {
    const task: ActiveTask = {
      taskId: data.taskId,
      chunkId: data.chunkId,
      chunkIndex: data.chunkIndex,
      data: data.data,
      priority: data.priority || 3,
      priorityName: data.priorityName || 'Normal',
      startedAt: Date.now()
    };

    console.log('Task assigned:', task);
    
    this.currentTaskId = data.taskId;
    
    this.send({
      type: 'task-started',
      from: this.nodeId,
      data: {
        taskId: data.taskId,
        chunkId: data.chunkId
      }
    });

    const duration = 2000 + Math.random() * 8000;
    const progressInterval = 100;
    const totalSteps = duration / progressInterval;
    let currentStep = 0;

    const intervalId = window.setInterval(() => {
      currentStep++;
      const pending = this.pendingTasks.get(data.chunkId);
      if (pending) {
        pending.progress = (currentStep / totalSteps) * 100;
      }

      if (currentStep >= totalSteps) {
        clearInterval(intervalId);
        this.completeTask(data.chunkId);
      }
    }, progressInterval);

    this.pendingTasks.set(data.chunkId, {
      timeoutId: intervalId,
      task,
      progress: 0
    });
  }

  private handleTaskPause(data: any) {
    const { chunkId, reason } = data;
    const pending = this.pendingTasks.get(chunkId);
    
    if (pending) {
      console.log('Task paused:', chunkId, reason);
      clearInterval(pending.timeoutId);
      
      this.send({
        type: 'task-paused',
        from: this.nodeId,
        data: {
          taskId: pending.task.taskId,
          chunkId,
          intermediateResult: {
            progress: pending.progress,
            pausedAt: Date.now()
          }
        }
      });

      pending.task.intermediateResult = {
        progress: pending.progress,
        pausedAt: Date.now()
      };
    }
  }

  private handleTaskResume(data: any) {
    const { chunkId } = data;
    const pending = this.pendingTasks.get(chunkId);
    
    if (pending) {
      console.log('Task resumed:', chunkId);
      
      this.send({
        type: 'task-resumed',
        from: this.nodeId,
        data: {
          taskId: pending.task.taskId,
          chunkId
        }
      });

      const remainingProgress = 100 - (pending.progress || 0);
      const remainingDuration = (remainingProgress / 100) * 5000;
      const progressInterval = 100;
      const totalSteps = remainingDuration / progressInterval;
      let currentStep = 0;

      const intervalId = window.setInterval(() => {
        currentStep++;
        if (pending) {
          pending.progress = (pending.progress || 0) + (currentStep / totalSteps) * remainingProgress;
        }

        if (currentStep >= totalSteps) {
          clearInterval(intervalId);
          this.completeTask(chunkId);
        }
      }, progressInterval);

      pending.timeoutId = intervalId;
    }
  }

  private completeTask(chunkId: string) {
    const pending = this.pendingTasks.get(chunkId);
    if (!pending) return;

    const result = {
      processed: true,
      chunkIndex: pending.task.chunkIndex,
      randomValue: Math.random(),
      duration: Date.now() - pending.task.startedAt
    };

    this.send({
      type: 'task-complete',
      from: this.nodeId,
      data: {
        taskId: pending.task.taskId,
        chunkId,
        result,
        logs: [
          { nodeId: this.nodeId, level: 'info', message: `Starting chunk ${pending.task.chunkIndex}` },
          { nodeId: this.nodeId, level: 'info', message: `Priority: ${pending.task.priorityName}` },
          { nodeId: this.nodeId, level: 'info', message: `Processing data: ${pending.task.chunkIndex}` },
          { nodeId: this.nodeId, level: 'info', message: `Chunk completed in ${(Date.now() - pending.task.startedAt) / 1000}s` }
        ]
      }
    });

    this.pendingTasks.delete(chunkId);
    
    if (this.pendingTasks.size === 0) {
      this.currentTaskId = null;
    }
  }

  private async handleOffer(message: SignalingMessage) {
    const peerId = message.from;
    const offer = message.data;

    let peer = this.peers.get(peerId);
    if (!peer) {
      peer = this.createPeerConnection(peerId);
    }

    if (peer.connection) {
      await peer.connection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);

      this.send({
        type: 'answer',
        from: this.nodeId,
        to: peerId,
        data: answer
      });
    }
  }

  private async handleAnswer(message: SignalingMessage) {
    const peer = this.peers.get(message.from);
    if (peer?.connection && message.data) {
      await peer.connection.setRemoteDescription(new RTCSessionDescription(message.data));
    }
  }

  private async handleCandidate(message: SignalingMessage) {
    const peer = this.peers.get(message.from);
    if (peer?.connection && message.data) {
      await peer.connection.addIceCandidate(new RTCIceCandidate(message.data));
    }
  }

  private createPeerConnection(peerId: string): PeerConnectionState {
    const pc = new RTCPeerConnection(ICE_CONFIG);
    const state: PeerConnectionState = {
      peerId,
      connection: pc,
      dataChannel: null,
      status: 'connecting'
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.send({
          type: 'candidate',
          from: this.nodeId,
          to: peerId,
          data: event.candidate
        });
      }
    };

    pc.onconnectionstatechange = () => {
      state.status = pc.connectionState as any;
    };

    pc.ondatachannel = (event) => {
      state.dataChannel = event.channel;
      this.setupDataChannel(event.channel, peerId);
    };

    this.peers.set(peerId, state);
    return state;
  }

  private setupDataChannel(channel: RTCDataChannel, peerId: string) {
    channel.binaryType = 'arraybuffer';

    channel.onopen = () => {
      console.log(`DataChannel open with ${peerId}`);
    };

    channel.onmessage = (event) => {
      console.log(`DataChannel message from ${peerId}:`, event.data);
    };

    channel.onclose = () => {
      console.log(`DataChannel closed with ${peerId}`);
    };

    channel.onerror = (error) => {
      console.error(`DataChannel error with ${peerId}:`, error);
    };
  }

  async connectToPeer(peerId: string): Promise<RTCDataChannel | null> {
    let peer = this.peers.get(peerId);
    
    if (!peer) {
      peer = this.createPeerConnection(peerId);
    }

    if (!peer.dataChannel && peer.connection) {
      const dataChannel = peer.connection.createDataChannel('distributed-compute');
      peer.dataChannel = dataChannel;
      this.setupDataChannel(dataChannel, peerId);

      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);

      this.send({
        type: 'offer',
        from: this.nodeId,
        to: peerId,
        data: offer
      });
    }

    return peer.dataChannel;
  }

  sendBinary(peerId: string, data: ArrayBuffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const peer = this.peers.get(peerId);
      
      if (peer?.dataChannel?.readyState === 'open') {
        peer.dataChannel.send(data);
        resolve();
      } else {
        reject(new Error('DataChannel not open'));
      }
    });
  }

  private send(message: SignalingMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  disconnect() {
    this.stopHeartbeat();
    
    this.pendingTasks.forEach((pending) => {
      clearInterval(pending.timeoutId);
    });
    this.pendingTasks.clear();
    
    const peerIds = Array.from(this.peers.keys());
    peerIds.forEach(peerId => {
      this.closePeerConnection(peerId);
    });
    
    this.peers.clear();
    this.ws?.close();
    this.ws = null;
  }

  static async getNodes(): Promise<NodeData[]> {
    const response = await fetch(`${API_BASE}/nodes`);
    return response.json();
  }

  static async getNode(id: string): Promise<NodeData> {
    const response = await fetch(`${API_BASE}/nodes/${id}`);
    return response.json();
  }

  static async createTask(name: string, description: string, data: any, chunkCount: number, priority: PriorityLevel = 3): Promise<any> {
    const response = await fetch(`${API_BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, data, chunkCount, priority })
    });
    return response.json();
  }

  static async dispatchTask(taskId: string): Promise<any> {
    const response = await fetch(`${API_BASE}/tasks/${taskId}/dispatch`, {
      method: 'POST'
    });
    return response.json();
  }

  static async pauseTask(taskId: string): Promise<any> {
    const response = await fetch(`${API_BASE}/tasks/${taskId}/pause`, {
      method: 'POST'
    });
    return response.json();
  }

  static async resumeTask(taskId: string): Promise<any> {
    const response = await fetch(`${API_BASE}/tasks/${taskId}/resume`, {
      method: 'POST'
    });
    return response.json();
  }

  static async getTasks(): Promise<Task[]> {
    const response = await fetch(`${API_BASE}/tasks`);
    return response.json();
  }

  static async getTask(id: string): Promise<Task> {
    const response = await fetch(`${API_BASE}/tasks/${id}`);
    return response.json();
  }

  static async getTaskResults(id: string): Promise<any> {
    const response = await fetch(`${API_BASE}/tasks/${id}/results`);
    return response.json();
  }

  static async getTaskLogs(id: string): Promise<any[]> {
    const response = await fetch(`${API_BASE}/tasks/${id}/logs`);
    return response.json();
  }

  static async getTaskQueue(): Promise<TaskQueueResponse> {
    const response = await fetch(`${API_BASE}/tasks/queue`);
    return response.json();
  }
}
