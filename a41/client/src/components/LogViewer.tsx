import React, { useEffect, useRef, useState } from 'react';
import type { ExecutionLog } from '../types';

interface LogViewerProps {
  taskId: string | null;
}

const LogViewer: React.FC<LogViewerProps> = ({ taskId }) => {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    setLogs([]);

    if (!taskId) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsStreaming(false);
      return;
    }

    fetch(`http://localhost:8080/api/tasks/${taskId}/logs`)
      .then(res => res.json())
      .then(data => {
        setLogs(data);
        scrollToBottom();
      })
      .catch(console.error);

    const es = new EventSource(`http://localhost:8080/api/tasks/${taskId}/logs/stream`);
    eventSourceRef.current = es;
    setIsStreaming(true);

    es.onmessage = (event) => {
      try {
        const log = JSON.parse(event.data);
        setLogs(prev => {
          const exists = prev.some(l => l.id === log.id);
          if (!exists) {
            return [...prev, log];
          }
          return prev;
        });
        scrollToBottom();
      } catch (e) {
        console.error('Log parse error:', e);
      }
    };

    es.onerror = () => {
      setIsStreaming(false);
    };

    return () => {
      es.close();
      setIsStreaming(false);
    };
  }, [taskId]);

  const getLogStyle = (level: string) => {
    const styles: Record<string, string> = {
      info: 'text-blue-300',
      warn: 'text-yellow-300',
      error: 'text-red-400',
      debug: 'text-gray-500'
    };
    return styles[level] || 'text-gray-300';
  };

  const getLogPrefix = (level: string) => {
    return `[${level.toUpperCase()}]`;
  };

  if (!taskId) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <p>Select a task to view logs</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <h4 className="font-semibold text-white text-sm">
          Execution Logs
        </h4>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
          <span className="text-xs text-gray-400">
            {isStreaming ? 'Live' : 'Disconnected'}
          </span>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
        {logs.length === 0 ? (
          <p className="text-gray-500">No logs available yet...</p>
        ) : (
          logs.map((log, index) => (
            <div key={log.id || index} className="mb-1">
              <span className="text-gray-500">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              {' '}
              <span className={getLogStyle(log.log_level)}>
                {getLogPrefix(log.log_level)}
              </span>
              {' '}
              <span className="text-gray-400">
                [{log.node_name || log.node_id?.slice(0, 8)}]
              </span>
              {' '}
              <span className={getLogStyle(log.log_level)}>
                {log.message}
              </span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
};

export default LogViewer;
