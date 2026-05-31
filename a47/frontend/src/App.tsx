import React, { useState, useEffect, useCallback } from 'react';
import {
  SupplyChainGraph,
  SupplierMap,
  RiskDashboard,
  SupplierRecommendations
} from './components';
import {
  graphApi,
  riskApi,
  recommendationApi
} from './services/api';
import {
  GraphData,
  SupplierNode,
  DashboardMetrics,
  CascadeResult,
  NTierRisk,
  RiskHeatmapNode,
  RecommendationResponse
} from './types';

type TabType = 'network' | 'map' | 'dashboard' | 'recommendations';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('network');
  const [graphData, setGraphData] = useState<GraphData>({ nodes: [], edges: [] });
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics>({
    total_nodes: 0,
    total_edges: 0,
    max_tier: 0,
    critical_path_length: 0,
    top_betweenness_nodes: [],
    top_pagerank_nodes: []
  });
  const [selectedNode, setSelectedNode] = useState<SupplierNode | null>(null);
  const [failedNodes, setFailedNodes] = useState<Set<string>>(new Set());
  const [cascadeResult, setCascadeResult] = useState<CascadeResult | null>(null);
  const [nTierRisk, setNTierRisk] = useState<NTierRisk[]>([]);
  const [riskHeatmap, setRiskHeatmap] = useState<RiskHeatmapNode[]>([]);
  const [criticalPaths, setCriticalPaths] = useState<string[][]>([]);
  const [criticalPathLength, setCriticalPathLength] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [riskSimulationInput, setRiskSimulationInput] = useState<string>('');
  const [dependencyThreshold, setDependencyThreshold] = useState<number>(0.3);

  const [recommendations, setRecommendations] = useState<RecommendationResponse[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState<boolean>(false);
  const [selectedFailedSupplier, setSelectedFailedSupplier] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [graph, metrics] = await Promise.all([
        graphApi.getFullGraph(5),
        graphApi.getDashboardMetrics()
      ]);

      setGraphData(graph);
      setDashboardMetrics(metrics);

      const pathLength = await riskApi.getCriticalPathLength('OEM');
      setCriticalPathLength(pathLength.critical_path_length || 0);

    } catch (err: any) {
      setError(err.message || 'Failed to load data. Please ensure the backend is running.');
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleNodeClick = useCallback((node: SupplierNode) => {
    setSelectedNode(node);
  }, []);

  const handleExpandNode = useCallback((nodeId: string, subgraph: GraphData) => {
    const existingNodeIds = new Set(graphData.nodes.map(n => n.id));
    const existingEdgeKeys = new Set(
      graphData.edges.map(e => `${e.source}-${e.target}`)
    );

    const newNodes = subgraph.nodes.filter(n => !existingNodeIds.has(n.id));
    const newEdges = subgraph.edges.filter(
      e => !existingEdgeKeys.has(`${e.source}-${e.target}`)
    );

    if (newNodes.length > 0 || newEdges.length > 0) {
      setGraphData(prev => ({
        nodes: [...prev.nodes, ...newNodes],
        edges: [...prev.edges, ...newEdges]
      }));
    }
  }, [graphData]);

  const runRiskSimulation = useCallback(async () => {
    if (!riskSimulationInput.trim()) {
      alert('Please enter at least one supplier ID');
      return;
    }

    const nodes = riskSimulationInput.split(',').map(n => n.trim()).filter(n => n);

    try {
      const result = await riskApi.simulateCascade(
        nodes,
        dependencyThreshold
      );

      setCascadeResult(result);
      setFailedNodes(new Set(result.failed_nodes));

      const [heatmap, tierRisk] = await Promise.all([
        riskApi.getRiskHeatmap(result.failed_nodes),
        riskApi.getNTierRisk(result.failed_nodes, 5)
      ]);

      setRiskHeatmap(heatmap.heatmap || []);
      setNTierRisk(tierRisk.tier_risk || []);

      if (result.failed_nodes.length > 0) {
        const paths = await riskApi.getCriticalPath('OEM', result.failed_nodes[0]);
        setCriticalPaths(paths.paths || []);
      }

    } catch (err: any) {
      alert(`Simulation failed: ${err.message}`);
    }
  }, [riskSimulationInput, dependencyThreshold]);

  const loadRecommendations = useCallback(async (supplierId: string) => {
    try {
      setRecommendationsLoading(true);
      setSelectedFailedSupplier(supplierId);

      const result = await recommendationApi.getAlternativesForSupplier(supplierId);
      setRecommendations(result.alternatives || []);

    } catch (err: any) {
      alert(`Failed to load recommendations: ${err.message}`);
    } finally {
      setRecommendationsLoading(false);
    }
  }, []);

  const resetSimulation = useCallback(() => {
    setCascadeResult(null);
    setFailedNodes(new Set());
    setNTierRisk([]);
    setRiskHeatmap([]);
    setCriticalPaths([]);
    setRiskSimulationInput('');
  }, []);

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'network', label: 'Network Graph', icon: '🔗' },
    { id: 'map', label: 'Geographic Map', icon: '🗺️' },
    { id: 'dashboard', label: 'Risk Dashboard', icon: '📊' },
    { id: 'recommendations', label: 'Recommendations', icon: '💡' }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700">Loading Supply Chain Data...</h2>
          <p className="text-gray-500 mt-2">Connecting to backend service</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-red-600 mb-2">Connection Error</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <div className="bg-gray-50 rounded-lg p-4 text-left text-sm text-gray-700">
            <p className="font-semibold mb-2">Please ensure:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Neo4j database is running</li>
              <li>Backend server is running on port 8000</li>
              <li>Test data has been generated</li>
            </ul>
          </div>
          <button
            onClick={loadData}
            className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-md">
        <div className="max-w-full mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-3xl">⚙️</div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">
                  Supply Chain Risk Simulation Platform
                </h1>
                <p className="text-sm text-gray-500">
                  {graphData.nodes.length} suppliers • {graphData.edges.length} supply links
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={loadData}
                className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                🔄 Refresh Data
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="bg-white border-b">
        <div className="max-w-full mx-auto px-4">
          <nav className="flex gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-blue-600'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-full mx-auto px-4 py-6">
        {activeTab === 'network' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3">
              <div className="bg-white rounded-lg shadow-md p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-800">Supply Chain Network</h2>
                  <div className="text-sm text-gray-500">
                    Click nodes to view details and expand subgraphs
                  </div>
                </div>
                <SupplyChainGraph
                  graphData={graphData}
                  onNodeClick={handleNodeClick}
                  onExpandNode={handleExpandNode}
                  failedNodes={failedNodes}
                  riskHeatmap={riskHeatmap}
                  criticalPaths={criticalPaths}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-lg shadow-md p-4">
                <h3 className="font-semibold text-gray-800 mb-3">Risk Simulation</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Failed Suppliers (comma-separated IDs)
                    </label>
                    <input
                      type="text"
                      value={riskSimulationInput}
                      onChange={(e) => setRiskSimulationInput(e.target.value)}
                      placeholder="e.g., Tier3_A1a, Tier2_C1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dependency Threshold: {(dependencyThreshold * 100).toFixed(0)}%
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="0.9"
                      step="0.1"
                      value={dependencyThreshold}
                      onChange={(e) => setDependencyThreshold(parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={runRiskSimulation}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                    >
                      Run Simulation
                    </button>
                    <button
                      onClick={resetSimulation}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>

              {selectedNode && (
                <div className="bg-white rounded-lg shadow-md p-4">
                  <h3 className="font-semibold text-gray-800 mb-3">Selected Supplier</h3>
                  <div className="space-y-2 text-sm">
                    <p><span className="font-medium text-gray-600">ID:</span> {selectedNode.id}</p>
                    <p><span className="font-medium text-gray-600">Name:</span> {selectedNode.name}</p>
                    <p><span className="font-medium text-gray-600">Tier:</span> {selectedNode.tier}</p>
                    <p><span className="font-medium text-gray-600">Category:</span> {selectedNode.category}</p>
                    <p><span className="font-medium text-gray-600">Country:</span> {selectedNode.country}</p>
                    <p><span className="font-medium text-gray-600">Capacity:</span> {selectedNode.capacity.toLocaleString()}</p>
                    <p><span className="font-medium text-gray-600">Quality:</span> {(selectedNode.quality_score * 100).toFixed(1)}%</p>
                    <p><span className="font-medium text-gray-600">Risk:</span> {(selectedNode.risk_score * 100).toFixed(1)}%</p>
                  </div>
                  {failedNodes.has(selectedNode.id) && (
                    <button
                      onClick={() => loadRecommendations(selectedNode.id)}
                      className="w-full mt-3 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                    >
                      Find Alternatives
                    </button>
                  )}
                </div>
              )}

              {cascadeResult && (
                <div className="bg-red-50 rounded-lg shadow-md p-4 border border-red-200">
                  <h3 className="font-semibold text-red-800 mb-2">⚠️ Cascade Failure Detected</h3>
                  <div className="space-y-1 text-sm text-red-700">
                    <p>Total failed: {cascadeResult.failed_nodes.length} nodes</p>
                    <p>Impact: {cascadeResult.total_impact.toFixed(1)}%</p>
                    <p>Depth: {cascadeResult.propagation_depth} levels</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'map' && (
          <div className="bg-white rounded-lg shadow-md p-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Supplier Geographic Distribution</h2>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3">
                <SupplierMap
                  suppliers={graphData.nodes}
                  riskHeatmap={riskHeatmap}
                  failedNodes={failedNodes}
                  onSupplierClick={handleNodeClick}
                />
              </div>
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-800 mb-3">Legend</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500" />
                      <span>Low Risk</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-amber-500" />
                      <span>Medium Risk</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span>High Risk</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-600 border-2 border-red-300" />
                      <span>Failed</span>
                    </div>
                  </div>
                </div>

                {selectedNode && (
                  <div className="bg-white rounded-lg border p-4">
                    <h3 className="font-semibold text-gray-800 mb-2">{selectedNode.name}</h3>
                    <div className="space-y-1 text-sm text-gray-600">
                      <p>📍 {selectedNode.country}</p>
                      <p>📦 {selectedNode.category}</p>
                      <p>📊 Tier {selectedNode.tier}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <RiskDashboard
            metrics={dashboardMetrics}
            nTierRisk={nTierRisk}
            cascadeResult={cascadeResult}
            criticalPathLength={criticalPathLength}
          />
        )}

        {activeTab === 'recommendations' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="bg-white rounded-lg shadow-md p-6">
                <SupplierRecommendations
                  failedSupplierId={selectedFailedSupplier}
                  recommendations={recommendations}
                  loading={recommendationsLoading}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-lg shadow-md p-4">
                <h3 className="font-semibold text-gray-800 mb-3">Quick Select</h3>
                <div className="space-y-2">
                  {graphData.nodes
                    .filter(n => n.risk_score > 0.5)
                    .sort((a, b) => b.risk_score - a.risk_score)
                    .slice(0, 5)
                    .map(node => (
                      <button
                        key={node.id}
                        onClick={() => loadRecommendations(node.id)}
                        className={`w-full px-3 py-2 text-left text-sm rounded-lg transition-colors ${
                          selectedFailedSupplier === node.id
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span>{node.name}</span>
                          <span className="text-xs px-2 py-1 bg-red-100 text-red-600 rounded">
                            {(node.risk_score * 100).toFixed(0)}%
                          </span>
                        </div>
                      </button>
                    ))}
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h3 className="font-semibold text-blue-800 mb-2">About Recommendations</h3>
                <p className="text-sm text-blue-700">
                  Alternatives are ranked based on weighted scores considering:
                </p>
                <ul className="mt-2 space-y-1 text-sm text-blue-600">
                  <li>• Capacity match (35%)</li>
                  <li>• Geographic proximity (25%)</li>
                  <li>• Historical quality (40%)</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
