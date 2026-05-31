import pool from './database';
import { v4 as uuidv4 } from 'uuid';
import type { PriorityLevel, Node, Task, TaskChunk } from './types';

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

interface NodeWithLoad extends Node {
  load_score: number;
  available: boolean;
}

export class TaskScheduler {
  private static instance: TaskScheduler;

  private constructor() {}

  static getInstance(): TaskScheduler {
    if (!TaskScheduler.instance) {
      TaskScheduler.instance = new TaskScheduler();
    }
    return TaskScheduler.instance;
  }

  calculateLoadScore(node: Node): number {
    const cpu = node.cpu_usage ?? 50;
    const mem = node.memory_usage ?? 50;
    const net = node.network_bandwidth ?? 100;

    const normalizedNet = Math.max(0, 100 - (net / 10));

    const loadScore = (
      cpu * 0.4 +
      mem * 0.35 +
      normalizedNet * 0.25
    );

    return loadScore;
  }

  private async getSortedOnlineNodes(): Promise<NodeWithLoad[]> {
    const result = await pool.query(`
      SELECT * FROM nodes 
      WHERE status IN ('online', 'busy')
      ORDER BY created_at ASC
    `);

    const nodes: NodeWithLoad[] = result.rows.map((node: Node) => ({
      ...node,
      load_score: this.calculateLoadScore(node),
      available: node.status === 'online'
    }));

    nodes.sort((a, b) => {
      if (a.available && !b.available) return -1;
      if (!a.available && b.available) return 1;
      return a.load_score - b.load_score;
    });

    return nodes;
  }

  private async getBusyNodesWithLowPriority(minPriority: PriorityLevel): Promise<NodeWithLoad[]> {
    const result = await pool.query(`
      SELECT * FROM nodes 
      WHERE status = 'busy'
      AND (current_task_priority IS NULL OR current_task_priority > $1)
      ORDER BY current_task_priority DESC, last_heartbeat ASC
    `, [minPriority]);

    return result.rows.map((node: Node) => ({
      ...node,
      load_score: this.calculateLoadScore(node),
      available: false
    }));
  }

  async selectBestNodeForChunk(): Promise<string | null> {
    const nodes = await this.getSortedOnlineNodes();
    
    const availableNodes = nodes.filter(n => n.available && n.load_score < 80);
    
    if (availableNodes.length > 0) {
      return availableNodes[0].id;
    }

    const semiAvailableNodes = nodes.filter(n => n.available && n.load_score < 95);
    if (semiAvailableNodes.length > 0) {
      return semiAvailableNodes[0].id;
    }

    const anyAvailable = nodes.find(n => n.available);
    return anyAvailable?.id || null;
  }

  async canPreempt(taskPriority: PriorityLevel): Promise<{ canPreempt: boolean; targetNodes: Node[] }> {
    if (taskPriority >= 3) {
      return { canPreempt: false, targetNodes: [] };
    }

    const preemptPriority = (taskPriority + 1) as PriorityLevel;
    const targetNodes = await this.getBusyNodesWithLowPriority(preemptPriority);

    return {
      canPreempt: targetNodes.length > 0,
      targetNodes: targetNodes.slice(0, 5)
    };
  }

  async preemptNode(nodeId: string, highPriorityTaskId: string): Promise<{
    success: boolean;
    pausedChunkId?: string;
    pausedTaskId?: string;
  }> {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const nodeResult = await client.query(`
        SELECT current_task_id, current_task_priority FROM nodes WHERE id = $1
      `, [nodeId]);

      if (nodeResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false };
      }

      const { current_task_id: pausedTaskId, current_task_priority } = nodeResult.rows[0];
      
      if (!pausedTaskId) {
        await client.query('ROLLBACK');
        return { success: false };
      }

      const chunkResult = await client.query(`
        SELECT id FROM task_chunks 
        WHERE assigned_to = $1 
        AND status IN ('assigned', 'processing')
        ORDER BY assigned_at DESC
        LIMIT 1
      `, [nodeId]);

      let pausedChunkId: string | undefined;
      
      if (chunkResult.rows.length > 0) {
        pausedChunkId = chunkResult.rows[0].id;
        
        await client.query(`
          UPDATE task_chunks 
          SET status = 'paused',
              paused_at = NOW()
          WHERE id = $1
        `, [pausedChunkId]);
      }

      await client.query(`
        UPDATE tasks 
        SET status = CASE 
          WHEN completed_chunks < total_chunks THEN 'paused'
          ELSE status
        END,
        updated_at = NOW()
        WHERE id = $1
      `, [pausedTaskId]);

      await client.query(`
        UPDATE nodes 
        SET current_task_id = $1,
            current_task_priority = (SELECT priority FROM tasks WHERE id = $1),
            updated_at = NOW()
        WHERE id = $2
      `, [highPriorityTaskId, nodeId]);

      await client.query(`
        INSERT INTO execution_logs (id, task_id, node_id, chunk_id, log_level, message)
        VALUES ($1, $2, $3, $4, 'warn', $5)
      `, [
        uuidv4(),
        pausedTaskId,
        nodeId,
        pausedChunkId,
        `Task preempted by higher priority task ${highPriorityTaskId}`
      ]);

      await client.query('COMMIT');

      return {
        success: true,
        pausedChunkId,
        pausedTaskId
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Preemption error:', error);
      return { success: false };
    } finally {
      client.release();
    }
  }

  async getTaskQueue(): Promise<any[]> {
    const result = await pool.query(`
      SELECT 
        t.id,
        t.name,
        t.priority,
        t.status,
        t.total_chunks,
        t.completed_chunks,
        t.created_at,
        COUNT(tc.id) FILTER (WHERE tc.status IN ('pending', 'queued')) as pending_chunks,
        COUNT(tc.id) FILTER (WHERE tc.status IN ('assigned', 'processing')) as running_chunks
      FROM tasks t
      LEFT JOIN task_chunks tc ON t.id = tc.task_id
      WHERE t.status IN ('pending', 'queued', 'running', 'paused')
      GROUP BY t.id, t.name, t.priority, t.status, t.total_chunks, t.completed_chunks, t.created_at
      ORDER BY t.priority ASC, t.created_at ASC
    `);

    return result.rows;
  }

  async getSystemLoadStats(): Promise<any> {
    const nodeStats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'online') as online_count,
        COUNT(*) FILTER (WHERE status = 'busy') as busy_count,
        COUNT(*) FILTER (WHERE status = 'offline') as offline_count,
        AVG(cpu_usage) as avg_cpu,
        AVG(memory_usage) as avg_memory
      FROM nodes
    `);

    const taskStats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'running') as running_count,
        COUNT(*) FILTER (WHERE status = 'paused') as paused_count,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        COUNT(*) FILTER (WHERE priority = 1) as critical_count,
        COUNT(*) FILTER (WHERE priority = 2) as high_count,
        COUNT(*) FILTER (WHERE priority = 3) as normal_count,
        COUNT(*) FILTER (WHERE priority = 4) as low_count,
        COUNT(*) FILTER (WHERE priority = 5) as background_count
      FROM tasks
    `);

    return {
      nodes: nodeStats.rows[0],
      tasks: taskStats.rows[0]
    };
  }
}

export default TaskScheduler.getInstance();
