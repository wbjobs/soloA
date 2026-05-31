import React, { useState, useEffect } from 'react';
import { WebRTCService } from './services/WebRTCService';
import TopologyGraph from './components/TopologyGraph';
import NodeDetails from './components/NodeDetails';
import TaskForm from './components/TaskForm';
import TaskQueuePanel from './components/TaskQueuePanel';
import TaskResults from './components/TaskResults';
import LogViewer from './components/LogViewer';
import { PRIORITY_COLORS, PRIORITY_NAMES } from './types';
import type { NodeData, PriorityLevel } from './types';

let webrtcService: WebRTCService | null = null;

function App() {
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [nodeId, setNodeId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'results' | 'logs'>('results');
  const [preemptionNotice, setPreemptionNotice] = useState<{ show: boolean; data?: any }>({ show: false });

  useEffect(() => {
    webrtcService = new WebRTCService();
    setNodeId(webrtcService.getNodeId());

    const unsubscribeNodes = webrtcService.onNodesUpdate((updatedNodes) => {
      setNodes(updatedNodes);
    });

    const unsubscribeConnection = webrtcService.onConnectionStatus((status) => {
      setConnected(status);
    });

    const unsubscribePreemption = webrtcService.onPreemption((data) => {
      setPreemptionNotice({ show: true, data });
      setTimeout(() => setPreemptionNotice({ show: false }), 5000);
    });

    webrtcService.connect().catch(console.error);

    return () => {
      unsubscribeNodes();
      unsubscribeConnection();
      unsubscribePreemption();
      webrtcService?.disconnect();
    };
  }, []);

  const handleTaskCreated = (taskId: string) => {
    setSelectedTaskId(taskId);
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;

  const onlineCount = nodes.filter(n => n.status === 'online' || n.status === 'busy').length;
  const busyCount = nodes.filter(n => n.status === 'busy').length;
  const offlineCount = nodes.filter(n => n.status === 'offline').length;

  const avgLoad = nodes.length > 0
    ? nodes.reduce((acc, n) => acc + (n.load_score || 0), 0) / nodes.length
    : 0;

  const tasksByPriority = nodes.reduce((acc, n) => {
    if (n.current_task_priority) {
      const p = n.current_task_priority as PriorityLevel;
      acc[p] = (acc[p] || 0) + 1;
    }
    return acc;
  }, {} as Record<number, number>);

  return (
    <div className="min-h-screen bg-gray-950 text-white relative">
      {preemptionNotice.show && preemptionNotice.data && (
        <div className="fixed top-4 right-4 z-50 bg-orange-900/90 border border-orange-500 rounded-lg p-4 max-w-sm shadow-xl animate-pulse">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">⚠️</span>
            <span className="font-bold text-orange-200">Preemption Notice</span>
          </div>
          <p className="text-sm text-orange-100">
            Your current task was preempted by a higher priority task
            <span className="font-semibold ml-1" style={{ color: PRIORITY_COLORS[preemptionNotice.data.priority as PriorityLevel] }}>
              ({PRIORITY_NAMES[preemptionNotice.data.priority as PriorityLevel]})
            </span>
          </p>
        </div>
      )}

      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-blue-400">
              WebRTC Distributed Computing
            </h1>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-sm text-gray-400">
                {connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="text-gray-400">Online: <span className="text-white font-medium">{onlineCount}</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                <span className="text-gray-400">Busy: <span className="text-white font-medium">{busyCount}</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <span className="text-gray-400">Offline: <span className="text-white font-medium">{offlineCount}</span></span>
              </div>
            </div>

            {nodes.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 rounded-lg">
                <span className="text-gray-400">Avg Load:</span>
                <span className={`font-bold ${
                  avgLoad < 40 ? 'text-green-400' : avgLoad < 70 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {avgLoad.toFixed(1)}%
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 rounded-lg">
              <span className="text-gray-400">Your Node:</span>
              <span className="font-mono text-blue-400">{nodeId.slice(0, 8)}...</span>
            </div>
          </div>
        </div>
      </header>

      <main className="p-6">
        <div className="grid grid-cols-12 gap-6 h-[calc(100vh-140px)]">
          <div className="col-span-3 flex flex-col gap-4">
            <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 bg-gray-800/50">
                <h2 className="font-semibold text-gray-200">Create New Task</h2>
              </div>
              <div className="p-4 max-h-[400px] overflow-y-auto">
                <TaskForm onTaskCreated={handleTaskCreated} />
              </div>
            </div>
          </div>

          <div className="col-span-3 flex flex-col gap-4">
            <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden flex-1">
              <div className="px-4 py-3 border-b border-gray-800 bg-gray-800/50">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-200">Task Queue</h2>
                  <div className="flex items-center gap-2 text-xs">
                    {([1, 2, 3, 4, 5] as PriorityLevel[]).map((p) => (
                      <div key={p} className="flex items-center gap-1" title={PRIORITY_NAMES[p]}>
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: PRIORITY_COLORS[p] }}
                        />
                        <span className="text-gray-500">{tasksByPriority[p] || 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="h-full">
                <TaskQueuePanel
                  selectedTaskId={selectedTaskId}
                  onSelectTask={setSelectedTaskId}
                />
              </div>
            </div>
          </div>

          <div className="col-span-4 flex flex-col gap-4">
            <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden flex-1">
              <div className="px-4 py-3 border-b border-gray-800 bg-gray-800/50 flex items-center justify-between">
                <h2 className="font-semibold text-gray-200">Node Topology</h2>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-green-500" />
                    Online
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-yellow-500" />
                    Busy
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded-full bg-red-500" />
                    Offline
                  </div>
                </div>
              </div>
              <div className="flex-1 p-4" style={{ minHeight: '350px' }}>
                <TopologyGraph
                  nodes={nodes}
                  onNodeClick={setSelectedNodeId}
                  selectedNodeId={selectedNodeId}
                />
              </div>
            </div>

            <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden" style={{ maxHeight: '280px' }}>
              <div className="flex border-b border-gray-800 bg-gray-800/50">
                <button
                  onClick={() => setActiveTab('results')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'results'
                      ? 'text-white bg-gray-800'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Results
                </button>
                <button
                  onClick={() => setActiveTab('logs')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    activeTab === 'logs'
                      ? 'text-white bg-gray-800'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  Execution Logs
                </button>
              </div>
              <div className="p-4" style={{ height: '230px' }}>
                {activeTab === 'results' ? (
                  <TaskResults taskId={selectedTaskId} />
                ) : (
                  <LogViewer taskId={selectedTaskId} />
                )}
              </div>
            </div>
          </div>

          <div className="col-span-2">
            <div className="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden h-full">
              <div className="px-4 py-3 border-b border-gray-800 bg-gray-800/50">
                <h2 className="font-semibold text-gray-200">Node Details</h2>
              </div>
              <NodeDetails node={selectedNode} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
