import React, { useState, useEffect, useCallback } from 'react';
import { WebRTCService } from '../services/WebRTCService';
import { PRIORITY_NAMES, PRIORITY_COLORS } from '../types';
import type { TaskQueueResponse, TaskQueueItem, PriorityLevel, TaskStatus } from '../types';

interface TaskQueuePanelProps {
  selectedTaskId?: string | null;
  onSelectTask: (taskId: string) => void;
}

const TaskQueuePanel: React.FC<TaskQueuePanelProps> = ({ selectedTaskId, onSelectTask }) => {
  const [queueData, setQueueData] = useState<TaskQueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      setError(null);
      const data = await WebRTCService.getTaskQueue();
      setQueueData(data);
    } catch (err) {
      setError('Failed to fetch task queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 2000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  const getStatusColor = (status: TaskStatus): string => {
    const colors: Record<TaskStatus, string> = {
      pending: 'bg-gray-500',
      queued: 'bg-blue-500',
      running: 'bg-green-500',
      paused: 'bg-yellow-500',
      completed: 'bg-emerald-500',
      failed: 'bg-red-500'
    };
    return colors[status] || 'bg-gray-500';
  };

  const getStatusText = (status: TaskStatus): string => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const handlePause = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await WebRTCService.pauseTask(taskId);
      fetchQueue();
    } catch (err) {
      console.error('Failed to pause task:', err);
    }
  };

  const handleResume = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await WebRTCService.resumeTask(taskId);
      fetchQueue();
    } catch (err) {
      console.error('Failed to resume task:', err);
    }
  };

  const groupedByPriority = queueData?.queue.reduce((acc, task) => {
    const priority = task.priority as PriorityLevel;
    if (!acc[priority]) {
      acc[priority] = [];
    }
    acc[priority].push(task);
    return acc;
  }, {} as Record<PriorityLevel, TaskQueueItem[]>) || {};

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mr-2" />
        Loading queue...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {queueData && (
        <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-700">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-gray-400">Online: <span className="text-white font-medium">{queueData.stats.nodes.online_count}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              <span className="text-gray-400">Busy: <span className="text-white font-medium">{queueData.stats.nodes.busy_count}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-gray-400">Offline: <span className="text-white font-medium">{queueData.stats.nodes.offline_count}</span></span>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {([1, 2, 3, 4, 5] as PriorityLevel[]).map((priority) => {
          const tasks = groupedByPriority[priority] || [];
          if (tasks.length === 0) return null;

          return (
            <div key={priority}>
              <div className="flex items-center gap-2 mb-2 px-2">
                <span 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: PRIORITY_COLORS[priority] }}
                />
                <span className="text-sm font-semibold text-gray-300">
                  {PRIORITY_NAMES[priority]}
                </span>
                <span className="text-xs text-gray-500">({tasks.length})</span>
              </div>
              
              <div className="space-y-2 ml-5">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => onSelectTask(task.id)}
                    className={`p-3 rounded-lg cursor-pointer transition-all border ${
                      selectedTaskId === task.id
                        ? 'bg-blue-900/30 border-blue-500'
                        : 'bg-gray-800/50 border-transparent hover:bg-gray-700/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-white text-sm truncate flex-1">
                        {task.name}
                      </span>
                      <span 
                        className={`px-2 py-0.5 rounded text-xs text-white ml-2 ${getStatusColor(task.status)}`}
                      >
                        {getStatusText(task.status)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="text-gray-500 font-mono truncate">
                        {task.id.slice(0, 12)}...
                      </span>
                      <div className="flex gap-2 text-gray-400">
                        <span>{task.completed_chunks}/{task.total_chunks}</span>
                        {task.running_chunks > 0 && (
                          <span className="text-green-400">▶ {task.running_chunks}</span>
                        )}
                        {task.pending_chunks > 0 && (
                          <span className="text-yellow-400">⏳ {task.pending_chunks}</span>
                        )}
                      </div>
                    </div>

                    <div className="w-full bg-gray-700 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full transition-all duration-300"
                        style={{
                          width: `${(task.completed_chunks / Math.max(task.total_chunks, 1)) * 100}%`,
                          backgroundColor: PRIORITY_COLORS[priority]
                        }}
                      />
                    </div>

                    <div className="flex gap-2 mt-2">
                      {task.status === 'running' && (
                        <button
                          onClick={(e) => handlePause(task.id, e)}
                          className="px-2 py-1 bg-yellow-600 hover:bg-yellow-700 text-white text-xs rounded transition-colors"
                        >
                          Pause
                        </button>
                      )}
                      {task.status === 'paused' && (
                        <button
                          onClick={(e) => handleResume(task.id, e)}
                          className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
                        >
                          Resume
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {queueData && queueData.queue.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No active tasks</p>
            <p className="text-xs mt-1">Create a task to see it here</p>
          </div>
        )}
      </div>

      {queueData && (
        <div className="px-4 py-3 bg-gray-800/50 border-t border-gray-700">
          <div className="text-xs text-gray-400">
            <div className="flex items-center gap-4">
              <span>By Priority:</span>
              {([1, 2, 3, 4, 5] as PriorityLevel[]).map((p) => (
                <div key={p} className="flex items-center gap-1">
                  <span 
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: PRIORITY_COLORS[p] }}
                  />
                  <span>{queueData.tasks[`${p === 1 ? 'critical' : p === 2 ? 'high' : p === 3 ? 'normal' : p === 4 ? 'low' : 'background'}_count`] || 0}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskQueuePanel;
