use crate::errors::{ChaosError, ChaosResult};
use crate::scenario::FaultType;
use crate::topology::{NodeType, SinglePointOfFailure, SystemTopology, TopologyGraph, TopologyNode};
use chrono::{DateTime, Utc};
use ndarray::{Array1, Array2, Axis};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FaultHistory {
    pub experiments: Vec<HistoricalExperiment>,
    pub node_impact_scores: HashMap<String, NodeImpactScore>,
    pub fault_type_success_rates: HashMap<String, f64>,
    pub last_updated: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistoricalExperiment {
    pub id: String,
    pub name: String,
    pub fault_type: String,
    pub target_node_id: String,
    pub target_node_name: String,
    pub target_node_type: NodeType,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub duration_seconds: i64,
    pub impact: ExperimentImpact,
    pub system_tolerated: bool,
    pub recovery_time_ms: Option<u64>,
    pub validation_results: Vec<ValidationResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExperimentImpact {
    pub error_rate_increase: f64,
    pub latency_increase_ms: f64,
    pub throughput_decrease: f64,
    pub downtime_seconds: Option<i64>,
    pub affected_services: Vec<String>,
    pub severity: ImpactSeverity,
    pub overall_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ImpactSeverity {
    None,
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeImpactScore {
    pub node_id: String,
    pub node_name: String,
    pub node_type: NodeType,
    pub total_experiments: usize,
    pub average_impact_score: f64,
    pub highest_impact_score: f64,
    pub failure_count: usize,
    pub success_count: usize,
    pub recommended_priority: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationResult {
    pub test_name: String,
    pub passed: bool,
    pub duration_ms: u64,
    pub error_message: Option<String>,
    pub metrics: HashMap<String, f64>,
}

#[derive(Debug, Clone)]
pub struct GNNModel {
    pub node_features: Array2<f64>,
    pub adjacency_matrix: Array2<f64>,
    pub weights_layer1: Array2<f64>,
    pub weights_layer2: Array2<f64>,
    pub bias_layer1: Array1<f64>,
    pub bias_layer2: Array1<f64>,
    pub node_indices: HashMap<String, usize>,
}

impl GNNModel {
    pub fn new(num_nodes: usize, num_features: usize) -> Self {
        use rand::Rng;
        let mut rng = rand::thread_rng();
        
        GNNModel {
            node_features: Array2::zeros((num_nodes, num_features)),
            adjacency_matrix: Array2::zeros((num_nodes, num_nodes)),
            weights_layer1: Array2::from_shape_fn((num_features, 32), |_| rng.gen_range(-0.1..0.1)),
            weights_layer2: Array2::from_shape_fn((32, 1), |_| rng.gen_range(-0.1..0.1)),
            bias_layer1: Array1::zeros(32),
            bias_layer2: Array1::zeros(1),
            node_indices: HashMap::new(),
        }
    }

    pub fn from_topology(topology: &SystemTopology) -> ChaosResult<Self> {
        let num_nodes = topology.nodes.len();
        let num_features = 8;
        
        let mut model = GNNModel::new(num_nodes, num_features);
        
        for (i, node) in topology.nodes.iter().enumerate() {
            model.node_indices.insert(node.id.clone(), i);
            model.node_features.row_mut(i).assign(&node_to_features(node));
        }
        
        for edge in &topology.edges {
            if let (Some(&src_idx), Some(&tgt_idx)) = (
                model.node_indices.get(&edge.source_id),
                model.node_indices.get(&edge.target_id),
            ) {
                model.adjacency_matrix[[src_idx, tgt_idx]] = edge.weight;
                model.adjacency_matrix[[tgt_idx, src_idx]] = edge.weight * 0.5;
            }
        }
        
        let degree: Array1<f64> = model.adjacency_matrix.sum_axis(Axis(1));
        for i in 0..num_nodes {
            if degree[i] > 0.0 {
                for j in 0..num_nodes {
                    model.adjacency_matrix[[i, j]] /= degree[i].sqrt();
                    model.adjacency_matrix[[j, i]] /= degree[i].sqrt();
                }
            }
        }
        
        Ok(model)
    }

    pub fn train(&mut self, iterations: usize) {
        for _ in 0..iterations {
            let _ = self.forward();
        }
    }

    fn forward(&self) -> Array1<f64> {
        let aggregated = self.adjacency_matrix.dot(&self.node_features);
        
        let hidden = aggregated.dot(&self.weights_layer1) + &self.bias_layer1;
        let hidden = hidden.mapv(relu);
        
        let output = hidden.dot(&self.weights_layer2) + &self.bias_layer2;
        let output = output.mapv(sigmoid);
        
        output.column(0).to_owned()
    }

    pub fn predict_risk_scores(&self) -> HashMap<String, f64> {
        let scores = self.forward();
        
        let mut result = HashMap::new();
        for (node_id, &idx) in &self.node_indices {
            result.insert(node_id.clone(), scores[idx]);
        }
        
        result
    }
}

fn relu(x: f64) -> f64 {
    x.max(0.0)
}

fn sigmoid(x: f64) -> f64 {
    1.0 / (1.0 + (-x).exp())
}

fn node_to_features(node: &TopologyNode) -> Array1<f64> {
    let mut features = Array1::zeros(8);
    
    let node_type_score = match node.node_type {
        NodeType::Database => 1.0,
        NodeType::MessageQueue => 0.9,
        NodeType::Cache => 0.7,
        NodeType::Gateway => 0.8,
        NodeType::Service => 0.5,
        NodeType::Deployment => 0.4,
        NodeType::Pod => 0.3,
        _ => 0.2,
    };
    features[0] = node_type_score;
    
    let replicas = node.properties.replicas.unwrap_or(1) as f64;
    let available = node.properties.available_replicas.unwrap_or(replicas as i32) as f64;
    features[1] = 1.0 - (available / replicas.max(1.0));
    
    features[2] = if node.status == NodeType::Database as NodeType { 1.0 } else { 0.0 };
    features[3] = if node.status == NodeType::MessageQueue as NodeType { 1.0 } else { 0.0 };
    features[4] = if replicas == 1.0 { 1.0 } else { 0.0 };
    
    let port_count = node.properties.ports.len() as f64;
    features[5] = port_count / 10.0;
    
    features[6] = match node.status {
        crate::topology::NodeStatus::Healthy => 0.0,
        crate::topology::NodeStatus::Degraded => 0.5,
        crate::topology::NodeStatus::Unhealthy => 1.0,
        crate::topology::NodeStatus::Unknown => 0.3,
    };
    
    features[7] = 0.5;
    
    features
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecommendedScenario {
    pub id: String,
    pub name: String,
    pub description: String,
    pub priority: u8,
    pub confidence: f64,
    pub target_node_id: String,
    pub target_node_name: String,
    pub target_node_type: NodeType,
    pub fault_type: String,
    pub fault_parameters: FaultRecommendationParams,
    pub expected_impact: String,
    risk_score: f64,
    pub validation_tests: Vec<String>,
    pub reasoning: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FaultRecommendationParams {
    pub duration_seconds: u64,
    pub intensity: f64,
    pub specific_params: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone)]
pub struct RecommendationEngine {
    pub history: FaultHistory,
    pub gnn_model: Option<GNNModel>,
}

impl RecommendationEngine {
    pub fn new() -> Self {
        RecommendationEngine {
            history: FaultHistory {
                experiments: Vec::new(),
                node_impact_scores: HashMap::new(),
                fault_type_success_rates: HashMap::new(),
                last_updated: Utc::now(),
            },
            gnn_model: None,
        }
    }

    pub fn load_history<P: AsRef<Path>>(&mut self, path: P) -> ChaosResult<()> {
        let content = fs::read_to_string(path)?;
        self.history = serde_json::from_str(&content)?;
        Ok(())
    }

    pub fn save_history<P: AsRef<Path>>(&self, path: P) -> ChaosResult<()> {
        let content = serde_json::to_string_pretty(&self.history)?;
        fs::write(path, content)?;
        Ok(())
    }

    pub fn train_with_topology(&mut self, topology: &SystemTopology) -> ChaosResult<()> {
        let mut model = GNNModel::from_topology(topology)?;
        model.train(100);
        self.gnn_model = Some(model);
        Ok(())
    }

    pub fn generate_recommendations(
        &mut self,
        topology: &SystemTopology,
        max_recommendations: usize,
    ) -> ChaosResult<Vec<RecommendedScenario>> {
        if self.gnn_model.is_none() {
            self.train_with_topology(topology)?;
        }

        let graph = topology.to_graph()?;
        let spofs = graph.find_single_points_of_failure();
        
        let gnn_scores = self.gnn_model
            .as_ref()
            .map(|m| m.predict_risk_scores())
            .unwrap_or_default();

        let mut recommendations = Vec::new();

        for spof in &spofs {
            let gnn_score = gnn_scores.get(&spof.node_id).copied().unwrap_or(0.5);
            let historical_score = self.history
                .node_impact_scores
                .get(&spof.node_id)
                .map(|s| s.average_impact_score / 100.0)
                .unwrap_or(0.5);
            
            let combined_score = spof.risk_score * 0.5 + gnn_score * 100.0 * 0.3 + historical_score * 100.0 * 0.2;

            for (idx, rec_fault) in spof.recommended_faults.iter().enumerate() {
                let confidence = match idx {
                    0 => 0.9,
                    1 => 0.7,
                    _ => 0.5,
                };
                
                let node = graph.get_node(&spof.node_id);
                let node_type = node.map(|n| n.node_type.clone()).unwrap_or_else(|| spof.node_type.clone());
                
                let scenario = RecommendedScenario {
                    id: Uuid::new_v4().to_string(),
                    name: format!("{}-{}-recommendation", spof.node_name, rec_fault.fault_type),
                    description: rec_fault.description.clone(),
                    priority: rec_fault.priority,
                    confidence: confidence * (combined_score / 100.0),
                    target_node_id: spof.node_id.clone(),
                    target_node_name: spof.node_name.clone(),
                    target_node_type: node_type,
                    fault_type: rec_fault.fault_type.clone(),
                    fault_parameters: Self::generate_fault_params(&rec_fault.fault_type, combined_score),
                    expected_impact: rec_fault.expected_impact.clone(),
                    risk_score: combined_score,
                    validation_tests: rec_fault.validation_tests.clone(),
                    reasoning: Self::generate_reasoning(spof, &rec_fault.fault_type, combined_score),
                };
                
                recommendations.push(scenario);
            }
        }

        if recommendations.len() < max_recommendations {
            let additional = self.generate_coverage_recommendations(topology, &graph, max_recommendations - recommendations.len());
            recommendations.extend(additional);
        }

        recommendations.sort_by(|a, b| {
            let score_a = a.priority as f64 * 100.0 + a.confidence * 10.0 + a.risk_score;
            let score_b = b.priority as f64 * 100.0 + b.confidence * 10.0 + b.risk_score;
            score_b.partial_cmp(&score_a).unwrap_or(std::cmp::Ordering::Equal)
        });

        recommendations.truncate(max_recommendations);
        Ok(recommendations)
    }

    fn generate_fault_params(fault_type: &str, risk_score: f64) -> FaultRecommendationParams {
        let intensity = (risk_score / 100.0).min(1.0).max(0.1);
        
        let mut specific_params = HashMap::new();
        
        match fault_type {
            "network-partition" => {
                specific_params.insert("direction".to_string(), serde_json::json!("both"));
                specific_params.insert("duration".to_string(), serde_json::json!(60));
            }
            "network-latency" => {
                let latency = (intensity * 500.0) as u32;
                specific_params.insert("latency_ms".to_string(), serde_json::json!(latency));
                specific_params.insert("jitter_ms".to_string(), serde_json::json!(latency / 2));
            }
            "cpu-stress" => {
                let cpu_percent = (intensity * 90.0) as u8;
                specific_params.insert("cpu_percent".to_string(), serde_json::json!(cpu_percent));
            }
            "memory-stress" => {
                let memory_percent = (intensity * 80.0) as u8;
                specific_params.insert("memory_percent".to_string(), serde_json::json!(memory_percent));
            }
            "disk-io" => {
                let delay_ms = (intensity * 500.0) as u32;
                specific_params.insert("read_delay_ms".to_string(), serde_json::json!(delay_ms));
                specific_params.insert("write_delay_ms".to_string(), serde_json::json!(delay_ms));
            }
            "service-fault" => {
                specific_params.insert("error_code".to_string(), serde_json::json!(503));
                specific_params.insert("error_percent".to_string(), serde_json::json!((intensity * 100.0) as u8));
            }
            _ => {}
        }

        FaultRecommendationParams {
            duration_seconds: (intensity * 180.0) as u64 + 60,
            intensity,
            specific_params,
        }
    }

    fn generate_reasoning(spof: &SinglePointOfFailure, fault_type: &str, risk_score: f64) -> String {
        let mut reasons = Vec::new();
        
        if spof.replicas == 1 {
            reasons.push("该节点为单实例部署，存在单点故障风险".to_string());
        }
        
        if spof.available_replicas < spof.replicas {
            reasons.push(format!(
                "副本数不足: {}/{}",
                spof.available_replicas, spof.replicas
            ));
        }
        
        if spof.incoming_connections > 3 {
            reasons.push(format!(
                "被{}个上游服务依赖",
                spof.incoming_connections
            ));
        }
        
        if spof.outgoing_connections > 2 {
            reasons.push(format!(
                "依赖{}个下游服务",
                spof.outgoing_connections
            ));
        }
        
        reasons.push(format!(
            "综合风险评分: {:.1}/100",
            risk_score
        ));
        
        match fault_type {
            "network-partition" => reasons.push("测试网络分区下的容错能力".to_string()),
            "network-latency" => reasons.push("测试高延迟场景下的系统表现".to_string()),
            "cpu-stress" => reasons.push("验证CPU资源耗尽时的服务降级".to_string()),
            "memory-stress" => reasons.push("验证内存压力下的OOM处理".to_string()),
            "disk-io" => reasons.push("测试存储延迟对系统的影响".to_string()),
            "service-fault" => reasons.push("验证服务调用失败时的熔断机制".to_string()),
            _ => {}
        }
        
        reasons.join("；")
    }

    fn generate_coverage_recommendations(
        &self,
        topology: &SystemTopology,
        _graph: &TopologyGraph,
        count: usize,
    ) -> Vec<RecommendedScenario> {
        let mut recommendations = Vec::new();
        let fault_types = ["network-latency", "cpu-stress", "memory-stress"];
        
        for (i, node) in topology.nodes.iter().enumerate() {
            if recommendations.len() >= count {
                break;
            }
            
            let fault_idx = i % fault_types.len();
            let fault_type = fault_types[fault_idx].to_string();
            
            recommendations.push(RecommendedScenario {
                id: Uuid::new_v4().to_string(),
                name: format!("coverage-{}-{}", node.name, fault_type),
                description: format!("{}覆盖率测试: {}", node.name, fault_type),
                priority: 3,
                confidence: 0.3,
                target_node_id: node.id.clone(),
                target_node_name: node.name.clone(),
                target_node_type: node.node_type.clone(),
                fault_type: fault_type.clone(),
                fault_parameters: FaultRecommendationParams {
                    duration_seconds: 60,
                    intensity: 0.3,
                    specific_params: HashMap::new(),
                },
                expected_impact: "低强度测试，验证基本容错能力".to_string(),
                risk_score: 30.0,
                validation_tests: vec!["http_health_check".to_string()],
                reasoning: format!("覆盖率测试，确保{}经过混沌验证", node.name),
            });
        }
        
        recommendations
    }

    pub fn record_experiment(&mut self, experiment: HistoricalExperiment) {
        if let Some(score) = self.history.node_impact_scores.get_mut(&experiment.target_node_id) {
            score.total_experiments += 1;
            let total_impact = score.average_impact_score * (score.total_experiments - 1) as f64;
            score.average_impact_score = (total_impact + experiment.impact.overall_score) / score.total_experiments as f64;
            score.highest_impact_score = score.highest_impact_score.max(experiment.impact.overall_score);
            
            if experiment.system_tolerated {
                score.success_count += 1;
            } else {
                score.failure_count += 1;
            }
        } else {
            self.history.node_impact_scores.insert(
                experiment.target_node_id.clone(),
                NodeImpactScore {
                    node_id: experiment.target_node_id.clone(),
                    node_name: experiment.target_node_name.clone(),
                    node_type: experiment.target_node_type.clone(),
                    total_experiments: 1,
                    average_impact_score: experiment.impact.overall_score,
                    highest_impact_score: experiment.impact.overall_score,
                    failure_count: if experiment.system_tolerated { 0 } else { 1 },
                    success_count: if experiment.system_tolerated { 1 } else { 0 },
                    recommended_priority: if experiment.system_tolerated { 2 } else { 1 },
                },
            );
        }
        
        let success_rate = self.history.fault_type_success_rates
            .entry(experiment.fault_type.clone())
            .or_insert(0.5);
        
        let experiments = self.history.experiments
            .iter()
            .filter(|e| e.fault_type == experiment.fault_type)
            .count() as f64;
        
        if experiment.system_tolerated {
            *success_rate = (*success_rate * experiments + 1.0) / (experiments + 1.0);
        }
        
        self.history.experiments.push(experiment);
        self.history.last_updated = Utc::now();
    }

    pub fn generate_scenario_yaml(&self, recommendation: &RecommendedScenario) -> ChaosResult<String> {
        let scenario = format!(
            r#"metadata:
  name: "{}"
  version: "1.0.0"
  description: "{}"
  duration: {}
  author: "chaos-recommendation-engine"

targets:
  orchestrator: kubernetes
  namespace: "default"
  label_selector: "app={}"

experiments:
  - name: "{}-injection"
    fault_type: {}
    parameters:
      type: {}
{}
    duration: {}
    phase: main

observability:
  prometheus:
    url: "http://prometheus:9090"
  metrics:
    - name: "error_rate"
      query: "rate(http_requests_total{{status=~\"5..\"}}[5m])"
      threshold: 0.1

security:
  pre_snapshot: true
  timeout: 300
  big_red_button:
    enabled: true
    lock_type: redis
  auto_recover: true
"#,
            recommendation.name,
            recommendation.description,
            recommendation.fault_parameters.duration_seconds * 2,
            recommendation.target_node_name,
            recommendation.name,
            recommendation.fault_type,
            fault_type_to_enum_name(&recommendation.fault_type),
            self.params_to_yaml(&recommendation.fault_parameters),
            recommendation.fault_parameters.duration_seconds,
        );

        Ok(scenario)
    }

    fn params_to_yaml(&self, params: &FaultRecommendationParams) -> String {
        let mut yaml = String::new();
        for (key, value) in &params.specific_params {
            yaml.push_str(&format!("      {}: {}\n", key, value));
        }
        yaml
    }
}

fn fault_type_to_enum_name(fault_type: &str) -> &'static str {
    match fault_type {
        "network-partition" => "NetworkPartition",
        "network-latency" => "NetworkLatency",
        "cpu-stress" => "CPUStress",
        "memory-stress" => "MemoryStress",
        "disk-io" => "DiskIO",
        "service-fault" => "ServiceFault",
        _ => fault_type,
    }
}

impl Default for RecommendationEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl Default for FaultHistory {
    fn default() -> Self {
        FaultHistory {
            experiments: Vec::new(),
            node_impact_scores: HashMap::new(),
            fault_type_success_rates: HashMap::new(),
            last_updated: Utc::now(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gnn_model_creation() {
        let topology = SystemTopology::generate_mock_topology();
        let model = GNNModel::from_topology(&topology);
        assert!(model.is_ok());
    }

    #[test]
    fn test_recommendation_generation() {
        let mut engine = RecommendationEngine::new();
        let topology = SystemTopology::generate_mock_topology();
        
        let recommendations = engine.generate_recommendations(&topology, 5);
        assert!(recommendations.is_ok());
        assert!(!recommendations.unwrap().is_empty());
    }
}
