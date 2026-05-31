import axios from 'axios';
import {
  GraphData,
  SupplierNode,
  CentralityMetrics,
  CascadeResult,
  MonteCarloResult,
  NTierRisk,
  DashboardMetrics
} from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

export const graphApi = {
  getFullGraph: (maxDepth: number = 5): Promise<GraphData> =>
    api.get('/api/graph/full', { params: { max_depth: maxDepth } }).then(r => r.data),

  getNode: (nodeId: string): Promise<SupplierNode> =>
    api.get(`/api/graph/node/${nodeId}`).then(r => r.data),

  getSubgraph: (nodeId: string, direction: 'upstream' | 'downstream' | 'both' = 'downstream', depth: number = 2): Promise<GraphData> =>
    api.get(`/api/graph/node/${nodeId}/subgraph`, {
      params: { direction, depth }
    }).then(r => r.data),

  getNeighbors: (nodeId: string, direction: 'upstream' | 'downstream' | 'all' = 'all'): Promise<SupplierNode[]> =>
    api.get(`/api/graph/node/${nodeId}/neighbors`, {
      params: { direction }
    }).then(r => r.data),

  getNodeCentrality: (nodeId: string): Promise<CentralityMetrics> =>
    api.get(`/api/graph/centrality/${nodeId}`).then(r => r.data),

  getTopNodes: (metric: string, topN: number = 10) =>
    api.get(`/api/graph/centrality/top/${metric}`, {
      params: { top_n: topN }
    }).then(r => r.data),

  getDashboardMetrics: (): Promise<DashboardMetrics> =>
    api.get('/api/graph/dashboard').then(r => r.data),
};

export const riskApi = {
  simulateCascade: (
    initialFailureNodes: string[],
    dependencyThreshold: number = 0.3,
    maxIterations: number = 100
  ): Promise<CascadeResult> =>
    api.post('/api/risk/simulate/cascade', {
      initial_failure_nodes: initialFailureNodes,
      dependency_threshold: dependencyThreshold,
      max_iterations: maxIterations
    }).then(r => r.data),

  runMonteCarlo: (
    numSimulations: number = 1000,
    baseFailureProbability: number = 0.05,
    riskFactorWeight: number = 0.5,
    dependencyThreshold: number = 0.3
  ): Promise<MonteCarloResult> =>
    api.post('/api/risk/simulate/montecarlo', {
      num_simulations: numSimulations,
      base_failure_probability: baseFailureProbability,
      risk_factor_weight: riskFactorWeight,
      dependency_threshold: dependencyThreshold
    }).then(r => r.data),

  runTargetedSimulation: (
    targetNode: string,
    numSimulations: number = 100,
    failureProbability: number = 1.0,
    dependencyThreshold: number = 0.3
  ) =>
    api.post('/api/risk/simulate/targeted', {
      target_node: targetNode,
      num_simulations: numSimulations,
      failure_probability: failureProbability,
      dependency_threshold: dependencyThreshold
    }).then(r => r.data),

  getRiskHeatmap: (failedNodes: string[] = []) =>
    api.get('/api/risk/heatmap', {
      params: { failed_nodes: failedNodes }
    }).then(r => r.data),

  getNTierRisk: (failedNodes: string[] = [], maxTier: number = 5) =>
    api.get('/api/risk/tier-risk', {
      params: { failed_nodes: failedNodes, max_tier: maxTier }
    }).then(r => r.data),

  getCriticalPath: (startNode: string = 'OEM', endNode: string) =>
    api.get('/api/risk/critical-path', {
      params: { start_node: startNode, end_node: endNode }
    }).then(r => r.data),

  getHighRiskNodes: (numSimulations: number = 50, threshold: number = 0.7) =>
    api.get('/api/risk/high-risk-nodes', {
      params: { num_simulations: numSimulations, threshold }
    }).then(r => r.data),

  getCriticalPathLength: (rootNode: string = 'OEM') =>
    api.get('/api/risk/critical-path-length', {
      params: { root_node: rootNode }
    }).then(r => r.data),
};

export const recommendationApi = {
  findAlternatives: (
    failedSupplierId: string,
    weights?: Record<string, number>,
    topN: number = 10
  ) =>
    api.post('/api/recommendation/alternatives', {
      failed_supplier_id: failedSupplierId,
      weights,
      top_n: topN
    }).then(r => r.data),

  getAlternativesForSupplier: (
    supplierId: string,
    topN: number = 10,
    capacityWeight: number = 0.35,
    distanceWeight: number = 0.25,
    qualityWeight: number = 0.40
  ) =>
    api.get(`/api/recommendation/alternatives/${supplierId}`, {
      params: {
        top_n: topN,
        capacity_weight: capacityWeight,
        distance_weight: distanceWeight,
        quality_weight: qualityWeight
      }
    }).then(r => r.data),

  analyzeImpact: (failedSupplierId: string, alternatives: string[]) =>
    api.post('/api/recommendation/impact-analysis', null, {
      params: {
        failed_supplier_id: failedSupplierId,
        alternatives
      }
    }).then(r => r.data),
};

export default api;
