import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import pool from './database';
import taskScheduler from './scheduler';
import type { SignalingMessage } from './types';

interface ConnectedClient {
  ws: WebSocket;
  nodeId: string;
  lastSeen: number;
}

export class SignalingServer {
  private wss: WebSocketServer;
  private clients: Map<string, ConnectedClient> = new Map();
  private heartbeatInterval: NodeJS.Timeout;

  constructor(wss: WebSocketServer) {
    this.wss = wss;
    this.heartbeatInterval = setInterval(() => this.checkHeartbeats(), 10000);
    
    this.wss.on('connection', (ws) => this.handleConnection(ws));
  }

  private handleConnection(ws: WebSocket) {
    let nodeId: string | null = null;

    ws.on('message', async (message) => {
      try {
        const parsed: SignalingMessage = JSON.parse(message.toString());
        
        switch (parsed.type) {
          case 'register':
            nodeId = parsed.from || uuidv4();
            await this.registerNode(nodeId, parsed.data, ws);
            break;
          case 'heartbeat':
            if (nodeId) await this.handleHeartbeat(nodeId, parsed.data);
            break;
          case 'offer':
          case 'answer':
          case 'candidate':
            if (parsed.to) {
              this.forwardToNode(parsed.to, parsed);
            }
            break;
          case 'task-complete':
            await this.handleTaskComplete(parsed.data);
            break;
          case 'task-started':
            await this.handleTaskStarted(parsed.data);
            break;
          case 'task-paused':
            await this.handleTaskPaused(parsed.data);
            break;
          case 'task-resumed':
            await this.handleTaskResumed(parsed.data);
            break;
        }
      } catch (error) {
        console.error('Message handling error:', error);
      }
    });

    ws.on('close', async () => {
      if (nodeId) {
        this.clients.delete(nodeId);
        await this.markNodeOffline(nodeId);
        this.broadcastNodeUpdate();
      }
    });
  }

  private async registerNode(nodeId: string, data: any, ws: WebSocket) {
    this.clients.set(nodeId, {
      ws,
      nodeId,
      lastSeen: Date.now()
    });

    const name = data?.name || `Node-${nodeId.slice(0, 8)}`;
    
    await pool.query(`
      INSERT INTO nodes (id, name, status, last_heartbeat)
      VALUES ($1, $2, 'online', NOW())
      ON CONFLICT (id) DO UPDATE
      SET status = 'online', last_heartbeat = NOW(), updated_at = NOW()
    `, [nodeId, name]);

    ws.send(JSON.stringify({
      type: 'registered',
      from: 'server',
      to: nodeId,
      data: { nodeId }
    }));

    this.broadcastNodeUpdate();
  }

  private async handleHeartbeat(nodeId: string, data: any) {
    const client = this.clients.get(nodeId);
    if (client) {
      client.lastSeen = Date.now();
    }

    const hasTask = data?.currentTaskId !== null && data?.currentTaskId !== undefined;

    await pool.query(`
      UPDATE nodes
      SET status = $1,
          cpu_usage = $2,
          memory_usage = $3,
          network_bandwidth = $4,
          current_task_id = $5,
          last_heartbeat = NOW(),
          updated_at = NOW()
      WHERE id = $6
    `, [
      hasTask ? 'busy' : 'online',
      data?.cpuUsage ?? null,
      data?.memoryUsage ?? null,
      data?.networkBandwidth ?? null,
      hasTask ? data.currentTaskId : null,
      nodeId
    ]);

    this.broadcastNodeUpdate();
  }

  private forwardToNode(nodeId: string, message: SignalingMessage) {
    const client = this.clients.get(nodeId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  private checkHeartbeats() {
    const now = Date.now();
    this.clients.forEach(async (client, nodeId) => {
      if (now - client.lastSeen > 10000) {
        client.ws.terminate();
        this.clients.delete(nodeId);
        await this.markNodeOffline(nodeId);
      }
    });
    this.broadcastNodeUpdate();
  }

  private async markNodeOffline(nodeId: string) {
    await pool.query(`
      UPDATE nodes
      SET status = 'offline',
          current_task_id = NULL,
          current_task_priority = NULL,
          updated_at = NOW()
      WHERE id = $1
    `, [nodeId]);

    await pool.query(`
      UPDATE task_chunks
      SET status = 'pending',
          assigned_to = NULL,
          assigned_at = NULL
      WHERE assigned_to = $1 AND status IN ('assigned', 'processing')
    `, [nodeId]);
  }

  private async broadcastNodeUpdate() {
    const result = await pool.query('SELECT * FROM nodes ORDER BY created_at');
    const nodes = result.rows;
    
    const message = JSON.stringify({
      type: 'nodes-update',
      from: 'server',
      data: nodes
    });

    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    });
  }

  private async handleTaskStarted(data: any) {
    const { taskId, chunkId } = data;
    
    await pool.query(`
      UPDATE task_chunks
      SET status = 'processing',
          started_at = NOW()
      WHERE id = $1
    `, [chunkId]);

    this.broadcastTaskUpdate(taskId);
  }

  private async handleTaskPaused(data: any) {
    const { taskId, chunkId, intermediateResult } = data;
    
    await pool.query(`
      UPDATE task_chunks
      SET status = 'paused',
          intermediate_result = $1,
          paused_at = NOW()
      WHERE id = $2
    `, [intermediateResult ? JSON.stringify(intermediateResult) : null, chunkId]);

    await pool.query(`
      UPDATE tasks
      SET status = CASE 
        WHEN completed_chunks < total_chunks THEN 'paused'
        ELSE status
      END,
      updated_at = NOW()
      WHERE id = $1
    `, [taskId]);

    this.broadcastTaskUpdate(taskId);
  }

  private async handleTaskResumed(data: any) {
    const { taskId, chunkId } = data;
    
    await pool.query(`
      UPDATE task_chunks
      SET status = 'processing',
          started_at = COALESCE(started_at, NOW())
      WHERE id = $1
    `, [chunkId]);

    await pool.query(`
      UPDATE tasks
      SET status = 'running',
          updated_at = NOW()
      WHERE id = $1
    `, [taskId]);

    this.broadcastTaskUpdate(taskId);
  }

  private async handleTaskComplete(data: any) {
    const { taskId, chunkId, result, logs } = data;
    
    const chunkResult = await pool.query(`
      SELECT task_id FROM task_chunks WHERE id = $1
    `, [chunkId]);
    
    if (chunkResult.rows.length === 0) return;
    const actualTaskId = chunkResult.rows[0].task_id;

    await pool.query(`
      UPDATE task_chunks
      SET status = $1,
          result = $2,
          completed_at = NOW()
      WHERE id = $3
    `, [result ? 'completed' : 'failed', JSON.stringify(result), chunkId]);

    if (logs && Array.isArray(logs)) {
      for (const log of logs) {
        await pool.query(`
          INSERT INTO execution_logs (id, task_id, node_id, chunk_id, log_level, message)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          uuidv4(),
          actualTaskId,
          log.nodeId,
          chunkId,
          log.level || 'info',
          log.message
        ]);
      }
    }

    const progress = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) as total
      FROM task_chunks
      WHERE task_id = $1
    `, [actualTaskId]);

    const { completed, total } = progress.rows[0];
    
    const newStatus = parseInt(completed) === parseInt(total) ? 'completed' : 'running';
    
    await pool.query(`
      UPDATE tasks
      SET status = $1,
          completed_chunks = $2,
          updated_at = NOW()
      WHERE id = $3
    `, [newStatus, completed, actualTaskId]);

    this.broadcastTaskUpdate(actualTaskId);
  }

  private async broadcastTaskUpdate(taskId: string) {
    const result = await pool.query(`
      SELECT t.*, 
             JSON_AGG(tc.* ORDER BY tc.chunk_index) as chunks
      FROM tasks t
      LEFT JOIN task_chunks tc ON t.id = tc.task_id
      WHERE t.id = $1
      GROUP BY t.id
    `, [taskId]);

    if (result.rows.length > 0) {
      const message = JSON.stringify({
        type: 'task-update',
        from: 'server',
        data: result.rows[0]
      });

      this.clients.forEach((client) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(message);
        }
      });
    }
  }

  public async sendPauseTask(nodeId: string, chunkId: string, reason: string) {
    this.sendToNode(nodeId, {
      type: 'task-pause',
      from: 'server',
      data: { chunkId, reason }
    });
  }

  public async sendResumeTask(nodeId: string, chunkId: string) {
    this.sendToNode(nodeId, {
      type: 'task-resume',
      from: 'server',
      data: { chunkId }
    });
  }

  public async sendPreemptionNotice(nodeId: string, highPriorityTask: any) {
    this.sendToNode(nodeId, {
      type: 'preemption-notice',
      from: 'server',
      data: highPriorityTask
    });
  }

  public getOnlineNodeIds(): string[] {
    return Array.from(this.clients.keys());
  }

  public sendToNode(nodeId: string, message: any) {
    const client = this.clients.get(nodeId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  public close() {
    clearInterval(this.heartbeatInterval);
    this.wss.close();
  }
}
