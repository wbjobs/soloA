export interface SupplierNode {
  id: string;
  name: string;
  tier: number;
  category: string;
  latitude: number | null;
  longitude: number | null;
  capacity: number;
  quality_score: number;
  risk_score: number;
  country: string;
}

export interface SupplyEdge {
  source: string;
  target: string;
  volume: number;
  lead_time: number;
  dependency_ratio: number;
}

export interface GraphData {
  nodes: SupplierNode[];
  edges: SupplyEdge[];
}

export interface CentralityMetrics {
  betweenness: number;
  pagerank: number;
  in_degree: number;
  out_degree: number;
  total_degree: number;
  closeness: number;
}

export interface CascadeResult {
  failed_nodes: string[];
  propagation_path: string[][];
  propagation_depth: number;
  affected_edges: string[][];
  total_impact: number;
}

export interface MonteCarloResult {
  failure_probability: Record<string, number>;
  expected_impact: number;
  risk_distribution: Record<string, number>;
  simulation_count: number;
  confidence_interval?: Record<string, number>;
}

export interface RecommendationResponse {
  id: string;
  name: string;
  category: string;
  tier: number;
  country: string;
  weighted_score: number;
  scores: {
    capacity_match: number;
    distance_score: number;
    quality_score: number;
  };
  distance_km: number;
  capacity: number;
  historical_quality: number;
}

export interface RiskHeatmapNode {
  node_id: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_value: number;
  name: string;
  tier: number;
  category: string;
  latitude: number | null;
  longitude: number | null;
}

export interface NTierRisk {
  tier: number;
  total_nodes: number;
  failed_nodes: number;
  failure_ratio: number;
  risk_exposure: number;
}

export interface DashboardMetrics {
  total_nodes: number;
  total_edges: number;
  max_tier: number;
  critical_path_length: number;
  top_betweenness_nodes: Array<{
    id: string;
    name: string;
    tier: number;
    category: string;
    value: number;
  }>;
  top_pagerank_nodes: Array<{
    id: string;
    name: string;
    tier: number;
    category: string;
    value: number;
  }>;
}
