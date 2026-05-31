import React, { useState, useEffect } from 'react';
import { WebRTCService } from '../services/WebRTCService';

interface TaskResultsProps {
  taskId: string | null;
}

const TaskResults: React.FC<TaskResultsProps> = ({ taskId }) => {
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!taskId) {
      setResults(null);
      return;
    }

    const loadResults = async () => {
      setLoading(true);
      try {
        const data = await WebRTCService.getTaskResults(taskId);
        setResults(data);
      } catch (error) {
        console.error('Failed to load results:', error);
      } finally {
        setLoading(false);
      }
    };

    loadResults();
    const interval = setInterval(loadResults, 2000);
    return () => clearInterval(interval);
  }, [taskId]);

  if (!taskId) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <p>Select a task to view results</p>
      </div>
    );
  }

  if (loading && !results) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <p>Loading results...</p>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <p>No results available</p>
      </div>
    );
  }

  const { task, results: chunkResults, totalChunks, completedChunks } = results;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-4 bg-gray-800 border-b border-gray-700">
        <h4 className="font-semibold text-white mb-2">{task.name}</h4>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-400">
            Progress: <span className="text-white font-medium">{completedChunks} / {totalChunks}</span>
          </span>
          {totalChunks > 0 && (
            <div className="flex-1 max-w-xs">
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-green-500 transition-all duration-500"
                  style={{ width: `${(completedChunks / totalChunks) * 100}%` }}
                />
              </div>
            </div>
          )}
          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
            task.status === 'completed' ? 'bg-green-500 text-white' :
            task.status === 'running' ? 'bg-blue-500 text-white' :
            'bg-gray-500 text-white'
          }`}>
            {task.status.toUpperCase()}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chunkResults && chunkResults.length > 0 ? (
          chunkResults.map((result: any, index: number) => (
            <div key={index} className="bg-gray-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-400">
                  Chunk {result.chunkIndex}
                </span>
                <span className="text-xs text-gray-400">
                  {result.nodeName || 'Unknown Node'}
                </span>
              </div>
              <pre className="text-xs text-gray-300 bg-gray-900 p-2 rounded overflow-x-auto">
                {JSON.stringify(result.result, null, 2)}
              </pre>
              {result.completedAt && (
                <div className="mt-2 text-xs text-gray-500">
                  Completed: {new Date(result.completedAt).toLocaleString()}
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center text-gray-400 py-8">
            <p>No completed chunks yet</p>
            <p className="text-xs mt-1">Wait for nodes to process their assigned chunks...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskResults;
