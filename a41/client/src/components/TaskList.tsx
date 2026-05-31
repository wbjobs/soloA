import React, { useState, useEffect } from 'react';
import { WebRTCService } from '../services/WebRTCService';
import type { Task } from '../types';

interface TaskListProps {
  selectedTaskId?: string | null;
  onSelectTask: (taskId: string) => void;
  refreshTrigger?: number;
}

const TaskList: React.FC<TaskListProps> = ({ selectedTaskId, onSelectTask, refreshTrigger }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const result = await WebRTCService.getTasks();
      setTasks(result);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [refreshTrigger]);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-gray-500',
      running: 'bg-blue-500',
      completed: 'bg-green-500',
      failed: 'bg-red-500'
    };
    return (
      <span className={`px-2 py-0.5 rounded text-white text-xs font-semibold ${styles[status] || 'bg-gray-500'}`}>
        {status}
      </span>
    );
  };

  const dispatchTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const result = await WebRTCService.dispatchTask(taskId);
      if (result.error) {
        alert(result.error);
      } else {
        loadTasks();
      }
    } catch (error) {
      alert('Failed to dispatch task');
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-gray-400 text-center">
        <p>Loading tasks...</p>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="p-4 text-gray-400 text-center">
        <p>No tasks found. Create one to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-96 overflow-y-auto">
      {tasks.map((task) => (
        <div
          key={task.id}
          onClick={() => onSelectTask(task.id)}
          className={`p-3 rounded-lg cursor-pointer transition-colors ${
            selectedTaskId === task.id
              ? 'bg-blue-900/50 border border-blue-500'
              : 'bg-gray-800 hover:bg-gray-700 border border-transparent'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold text-white truncate">{task.name}</h4>
            {getStatusBadge(task.status)}
          </div>
          
          <div className="text-xs text-gray-400 mb-2">
            <span className="font-mono">{task.id.slice(0, 16)}...</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-300">
              {task.completed_chunks} / {task.total_chunks} chunks
            </div>
            
            {task.status === 'pending' && (
              <button
                onClick={(e) => dispatchTask(task.id, e)}
                className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
              >
                Dispatch
              </button>
            )}
          </div>

          {task.total_chunks > 0 && (
            <div className="mt-2">
              <div className="w-full bg-gray-700 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${(task.completed_chunks / task.total_chunks) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default TaskList;
