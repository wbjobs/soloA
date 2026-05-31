import express, { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from './database';
import taskScheduler, { PRIORITY_NAMES } from './scheduler';
import type { SignalingServer } from './signaling';
import type { PriorityLevel } from './types';

export function createRoutes(signalingServer: SignalingServer) {
  const router = express.Router();

  router.get('/nodes', async (_req: Request, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT n.*, 
               CASE 
                 WHEN n.cpu_usage IS NOT NULL AND n.memory_usage IS NOT NULL 
                 THEN (n.cpu_usage * 0.4 + n.memory_usage * 0.35 + COALESCE(n.network_bandwidth, 100) * 0.25)
                 ELSE NULL
               END as load_score
        FROM nodes n
        ORDER BY created_at DESC
      `);
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch nodes' });
    }
  });

  router.get('/nodes/:id', async (req: Request, res: Response) => {
    try {
      const result = await pool.query('SELECT * FROM nodes WHERE id = $1', [req.params.id]);
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Node not found' });
        return;
      }
      res.json(result.rows[0]);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch node' });
    }
  });

  router.post('/tasks', async (req: Request, res: Response) => {
    try {
      const { name, description, data, chunkCount = 4, priority = 3 } = req.body;
      
      if (!name) {
        res.status(400).json({ error: 'Task name is required' });
        return;
      }

      if (priority < 1 || priority > 5) {
        res.status(400).json({ error: 'Priority must be between 1 and 5' });
        return;
      }

      const taskId = uuidv4();
      const taskPriority = priority as PriorityLevel;
      
      await pool.query(`
        INSERT INTO tasks (id, name, description, priority, status, total_chunks, data)
        VALUES ($1, $2, $3, $4, 'pending', $5, $6)
      `, [taskId, name, description || '', taskPriority, chunkCount, JSON.stringify(data || {})]);

      const dataStr = JSON.stringify(data || {});
      
      for (let i = 0; i < chunkCount; i++) {
        const chunkId = uuidv4();
        await pool.query(`
          INSERT INTO task_chunks (id, task_id, chunk_index, data, status)
          VALUES ($1, $2, $3, $4, 'pending')
        `, [chunkId, taskId, i, dataStr]);
      }

      res.status(201).json({ 
        id: taskId, 
        name, 
        chunkCount, 
        priority: taskPriority,
        priorityName: PRIORITY_NAMES[taskPriority]
      });
    } catch (error) {
      console.error('Create task error:', error);
      res.status(500).json({ error: 'Failed to create task' });
    }
  });

  router.post('/tasks/:id/dispatch', async (req: Request, res: Response) => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const taskId = req.params.id;
      
      const taskResult = await client.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
      if (taskResult.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const task = taskResult.rows[0];
      const taskPriority = task.priority as PriorityLevel;

      const onlineNodes = signalingServer.getOnlineNodeIds();
      if (onlineNodes.length === 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'No online nodes available' });
        return;
      }

      const pendingChunks = await client.query(`
        SELECT * FROM task_chunks 
        WHERE task_id = $1 AND status = 'pending'
        ORDER BY chunk_index
      `, [taskId]);

      if (pendingChunks.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: 'No pending chunks to dispatch' });
        return;
      }

      const assignedChunks: { chunkId: string; nodeId: string }[] = [];
      const preemptedTasks: { pausedChunkId: string; pausedTaskId: string }[] = [];
      let chunksProcessed = 0;

      for (const chunk of pendingChunks.rows) {
        if (chunksProcessed >= onlineNodes.length) {
          break;
        }

        let targetNodeId = await taskScheduler.selectBestNodeForChunk();

        if (!targetNodeId && taskPriority < 3) {
          const { canPreempt, targetNodes } = await taskScheduler.canPreempt(taskPriority);
          
          if (canPreempt && targetNodes.length > 0) {
            const targetNode = targetNodes[0];
            const preemptResult = await taskScheduler.preemptNode(targetNode.id, taskId);
            
            if (preemptResult.success && preemptResult.pausedChunkId && preemptResult.pausedTaskId) {
              preemptedTasks.push({
                pausedChunkId: preemptResult.pausedChunkId,
                pausedTaskId: preemptResult.pausedTaskId
              });
              
              await signalingServer.sendPreemptionNotice(targetNode.id, {
                taskId,
                chunkId: chunk.id,
                priority: taskPriority,
                priorityName: PRIORITY_NAMES[taskPriority],
                pausedChunkId: preemptResult.pausedChunkId
              });
              
              await signalingServer.sendPauseTask(targetNode.id, preemptResult.pausedChunkId, 
                `Preempted by higher priority task (${PRIORITY_NAMES[taskPriority]})`);
              
              targetNodeId = targetNode.id;
            }
          }
        }

        if (!targetNodeId) {
          continue;
        }

        await client.query(`
          UPDATE task_chunks
          SET status = 'assigned',
              assigned_to = $1,
              assigned_at = NOW()
          WHERE id = $2
        `, [targetNodeId, chunk.id]);

        assignedChunks.push({ chunkId: chunk.id, nodeId: targetNodeId });

        await client.query(`
          UPDATE nodes
          SET current_task_id = $1,
              current_task_priority = $2,
              status = 'busy',
              updated_at = NOW()
          WHERE id = $3
        `, [taskId, taskPriority, targetNodeId]);

        signalingServer.sendToNode(targetNodeId, {
          type: 'task-assigned',
          from: 'server',
          data: {
            taskId,
            chunkId: chunk.id,
            chunkIndex: chunk.chunk_index,
            priority: taskPriority,
            priorityName: PRIORITY_NAMES[taskPriority],
            data: chunk.data
          }
        });

        chunksProcessed++;
      }

      if (assignedChunks.length > 0) {
        await client.query(`
          UPDATE tasks
          SET status = 'running',
              updated_at = NOW()
          WHERE id = $1
        `, [taskId]);
      }

      await client.query('COMMIT');

      res.json({ 
        taskId, 
        priority: taskPriority,
        priorityName: PRIORITY_NAMES[taskPriority],
        dispatchedChunks: assignedChunks.length,
        totalPending: pendingChunks.rows.length,
        assignments: assignedChunks,
        preemptedTasks: preemptedTasks
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Dispatch error:', error);
      res.status(500).json({ error: 'Failed to dispatch task' });
    } finally {
      client.release();
    }
  });

  router.post('/tasks/:id/pause', async (req: Request, res: Response) => {
    try {
      const taskId = req.params.id;
      
      const chunksResult = await pool.query(`
        SELECT tc.id, tc.assigned_to, n.status as node_status
        FROM task_chunks tc
        LEFT JOIN nodes n ON tc.assigned_to = n.id
        WHERE tc.task_id = $1 AND tc.status IN ('assigned', 'processing')
      `, [taskId]);

      for (const chunk of chunksResult.rows) {
        if (chunk.assigned_to && chunk.node_status !== 'offline') {
          await signalingServer.sendPauseTask(chunk.assigned_to, chunk.id, 'Manual pause requested');
        }
      }

      res.json({ success: true, pausedChunks: chunksResult.rows.length });
    } catch (error) {
      console.error('Pause error:', error);
      res.status(500).json({ error: 'Failed to pause task' });
    }
  });

  router.post('/tasks/:id/resume', async (req: Request, res: Response) => {
    try {
      const taskId = req.params.id;
      
      const chunksResult = await pool.query(`
        SELECT tc.id, tc.assigned_to, n.status as node_status
        FROM task_chunks tc
        LEFT JOIN nodes n ON tc.assigned_to = n.id
        WHERE tc.task_id = $1 AND tc.status = 'paused'
      `, [taskId]);

      for (const chunk of chunksResult.rows) {
        if (chunk.assigned_to && chunk.node_status !== 'offline') {
          await signalingServer.sendResumeTask(chunk.assigned_to, chunk.id);
        }
      }

      await pool.query(`
        UPDATE tasks
        SET status = 'running',
            updated_at = NOW()
        WHERE id = $1
      `, [taskId]);

      res.json({ success: true, resumedChunks: chunksResult.rows.length });
    } catch (error) {
      console.error('Resume error:', error);
      res.status(500).json({ error: 'Failed to resume task' });
    }
  });

  router.get('/tasks/queue', async (_req: Request, res: Response) => {
    try {
      const queue = await taskScheduler.getTaskQueue();
      const stats = await taskScheduler.getSystemLoadStats();
      
      res.json({
        queue,
        stats,
        priorityNames: PRIORITY_NAMES
      });
    } catch (error) {
      console.error('Queue error:', error);
      res.status(500).json({ error: 'Failed to fetch task queue' });
    }
  });

  router.get('/tasks', async (_req: Request, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT * FROM tasks ORDER BY priority ASC, created_at DESC
      `);
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  });

  router.get('/tasks/:id', async (req: Request, res: Response) => {
    try {
      const taskResult = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
      if (taskResult.rows.length === 0) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const chunksResult = await pool.query(`
        SELECT tc.*, n.name as node_name
        FROM task_chunks tc
        LEFT JOIN nodes n ON tc.assigned_to = n.id
        WHERE tc.task_id = $1
        ORDER BY tc.chunk_index
      `, [req.params.id]);

      res.json({
        ...taskResult.rows[0],
        priorityName: PRIORITY_NAMES[taskResult.rows[0].priority as PriorityLevel],
        chunks: chunksResult.rows
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch task' });
    }
  });

  router.get('/tasks/:id/results', async (req: Request, res: Response) => {
    try {
      const taskResult = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
      if (taskResult.rows.length === 0) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const chunksResult = await pool.query(`
        SELECT tc.*, n.name as node_name, n.id as node_id
        FROM task_chunks tc
        LEFT JOIN nodes n ON tc.assigned_to = n.id
        WHERE tc.task_id = $1
        ORDER BY tc.chunk_index
      `, [req.params.id]);

      const results = chunksResult.rows
        .filter(c => c.status === 'completed' && c.result)
        .map(c => ({
          chunkIndex: c.chunk_index,
          nodeId: c.node_id,
          nodeName: c.node_name,
          result: c.result ? JSON.parse(c.result) : null,
          intermediateResult: c.intermediate_result ? JSON.parse(c.intermediate_result) : null,
          completedAt: c.completed_at
        }));

      res.json({
        task: {
          ...taskResult.rows[0],
          priorityName: PRIORITY_NAMES[taskResult.rows[0].priority as PriorityLevel]
        },
        results,
        totalChunks: chunksResult.rows.length,
        completedChunks: results.length
      });
    } catch (error) {
      console.error('Results error:', error);
      res.status(500).json({ error: 'Failed to fetch results' });
    }
  });

  router.get('/tasks/:id/logs', async (req: Request, res: Response) => {
    try {
      const result = await pool.query(`
        SELECT el.*, n.name as node_name
        FROM execution_logs el
        LEFT JOIN nodes n ON el.node_id = n.id
        WHERE el.task_id = $1
        ORDER BY el.timestamp ASC
      `, [req.params.id]);
      res.json(result.rows);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch logs' });
    }
  });

  router.get('/tasks/:id/logs/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    const taskId = req.params.id;
    
    const sendLog = (log: any) => {
      res.write(`data: ${JSON.stringify(log)}\n\n`);
    };

    let logPollInterval: NodeJS.Timeout | null = null;
    let lastLogId: string | null = null;

    const pollLogs = async () => {
      try {
        let query = `
          SELECT el.*, n.name as node_name
          FROM execution_logs el
          LEFT JOIN nodes n ON el.node_id = n.id
          WHERE el.task_id = $1
          ORDER BY el.timestamp ASC
        `;
        const params = [taskId];

        if (lastLogId) {
          query += ` AND el.id > $2`;
          params.push(lastLogId);
        }

        const result = await pool.query(query, params);
        
        for (const log of result.rows) {
          sendLog(log);
          lastLogId = log.id;
        }
      } catch (error) {
        console.error('SSE poll error:', error);
      }
    };

    pollLogs();
    logPollInterval = setInterval(pollLogs, 2000);

    req.on('close', () => {
      if (logPollInterval) {
        clearInterval(logPollInterval);
      }
    });

    res.write(': ping\n\n');
    setInterval(() => res.write(': ping\n\n'), 30000);
  });

  return router;
}
