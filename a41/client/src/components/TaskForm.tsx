import React, { useState } from 'react';
import { WebRTCService } from '../services/WebRTCService';
import { PRIORITY_NAMES, PRIORITY_COLORS } from '../types';
import type { PriorityLevel } from '../types';

interface TaskFormProps {
  onTaskCreated: (taskId: string) => void;
}

const PRIORITY_OPTIONS: { value: PriorityLevel; label: string; description: string }[] = [
  { value: 1, label: 'Critical', description: 'Immediate execution, preempts lower priorities' },
  { value: 2, label: 'High', description: 'High priority, may preempt Normal/Low' },
  { value: 3, label: 'Normal', description: 'Standard priority (default)' },
  { value: 4, label: 'Low', description: 'Lower priority, runs when resources available' },
  { value: 5, label: 'Background', description: 'Lowest priority, background tasks only' }
];

const TaskForm: React.FC<TaskFormProps> = ({ onTaskCreated }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [chunkCount, setChunkCount] = useState(4);
  const [priority, setPriority] = useState<PriorityLevel>(3);
  const [data, setData] = useState('{}');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const parsedData = JSON.parse(data);
      const result = await WebRTCService.createTask(name, description, parsedData, chunkCount, priority);
      
      if (result.id) {
        onTaskCreated(result.id);
        setName('');
        setDescription('');
        setChunkCount(4);
        setPriority(3);
        setData('{}');
      } else {
        setError(result.error || 'Failed to create task');
      }
    } catch (err) {
      setError('Invalid JSON data or server error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Task Name *
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter task name"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Task description"
          rows={2}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Priority
        </label>
        <div className="space-y-1">
          {PRIORITY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex items-start p-2 rounded-lg cursor-pointer transition-colors ${
                priority === option.value
                  ? 'bg-gray-700 border border-gray-500'
                  : 'hover:bg-gray-800 border border-transparent'
              }`}
            >
              <input
                type="radio"
                name="priority"
                value={option.value}
                checked={priority === option.value}
                onChange={() => setPriority(option.value)}
                className="mt-1 mr-3"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: PRIORITY_COLORS[option.value] }}
                  />
                  <span className="text-sm font-medium text-white">
                    {option.label}
                  </span>
                  {option.value <= 2 && (
                    <span className="text-xs bg-yellow-600/30 text-yellow-300 px-1.5 py-0.5 rounded">
                      Can preempt
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {option.description}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Number of Chunks
        </label>
        <input
          type="number"
          value={chunkCount}
          onChange={(e) => setChunkCount(Math.max(1, parseInt(e.target.value) || 1))}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          min={1}
          max={64}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Task Data (JSON)
        </label>
        <textarea
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder='{"key": "value"}'
          rows={3}
        />
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-300 px-3 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
      >
        <span
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: PRIORITY_COLORS[priority] }}
        />
        {loading ? 'Creating...' : `Create ${PRIORITY_NAMES[priority]} Task`}
      </button>
    </form>
  );
};

export default TaskForm;
