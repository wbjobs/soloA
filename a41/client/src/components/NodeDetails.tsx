import React from 'react';
import { PRIORITY_NAMES, PRIORITY_COLORS } from '../types';
import type { NodeData } from '../types';

interface NodeDetailsProps {
  node: NodeData | null;
}

const NodeDetails: React.FC<NodeDetailsProps> = ({ node }) => {
  if (!node) {
    return (
      <div className="p-4 text-gray-400 text-center">
        <p>Select a node to view details</p>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      online: 'bg-green-500',
      busy: 'bg-yellow-500',
      offline: 'bg-red-500'
    };
    return (
      <span className={`px-2 py-1 rounded text-white text-xs font-semibold ${styles[status] || 'bg-gray-500'}`}>
        {status.toUpperCase()}
      </span>
    );
  };

  const ProgressBar = ({ value, label, color }: { value?: number; label: string; color: string }) => {
    const percent = value ? Math.min(value, 100) : 0;
    return (
      <div className="mb-3">
        <div className="flex justify-between text-sm mb-1">
          <span className="text-gray-300">{label}</span>
          <span className="text-white font-medium">{value ? `${value.toFixed(1)}%` : 'N/A'}</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-500 ${color}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    );
  };

  const getLoadColor = (score?: number): string => {
    if (!score) return 'text-gray-400';
    if (score < 40) return 'text-green-400';
    if (score < 70) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-white truncate">{node.name}</h3>
        {getStatusBadge(node.status)}
      </div>
      
      <div className="space-y-4">
        <div className="text-sm">
          <span className="text-gray-400">Node ID: </span>
          <span className="text-gray-200 font-mono text-xs">{node.id}</span>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-gray-300 font-semibold">Load Score</h4>
            <span className={`font-bold text-lg ${getLoadColor(node.load_score)}`}>
              {node.load_score ? node.load_score.toFixed(1) : '-'}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Combined CPU (40%) + Memory (35%) + Network (25%)
          </p>
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <h4 className="text-gray-300 font-semibold mb-3">Resource Usage</h4>
          <ProgressBar value={node.cpu_usage} label="CPU" color="bg-blue-500" />
          <ProgressBar value={node.memory_usage} label="Memory" color="bg-purple-500" />
          {node.network_bandwidth !== undefined && node.network_bandwidth !== null && (
            <div className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-300">Network Bandwidth</span>
                <span className="text-white font-medium">{node.network_bandwidth.toFixed(1)} Mbps</span>
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <h4 className="text-gray-300 font-semibold mb-2">Current Task</h4>
          {node.current_task_id ? (
            <div className="space-y-2">
              <div className="text-sm">
                <span className="text-gray-400">Task ID: </span>
                <span className="text-yellow-400 font-mono text-xs">{node.current_task_id}</span>
              </div>
              {node.current_task_priority !== undefined && node.current_task_priority !== null && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400">Priority: </span>
                  <span 
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: PRIORITY_COLORS[node.current_task_priority as keyof typeof PRIORITY_COLORS] }}
                  />
                  <span className="text-white">
                    {PRIORITY_NAMES[node.current_task_priority as keyof typeof PRIORITY_NAMES]}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500 text-sm">No active task</p>
          )}
        </div>

        {node.last_heartbeat && (
          <div className="text-sm">
            <span className="text-gray-400">Last Heartbeat: </span>
            <span className="text-gray-200">
              {new Date(node.last_heartbeat).toLocaleString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default NodeDetails;
