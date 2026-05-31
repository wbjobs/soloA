use crate::errors::{ChaosError, ChaosResult};
use chrono::{DateTime, Utc};
use petgraph::graph::{DiGraph, NodeIndex};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemTopology {
    pub id: String,
    pub discovered_at: DateTime<Utc>,
    pub nodes: Vec<TopologyNode>,
    pub edges: Vec<TopologyEdge>,
    pub metadata: TopologyMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopologyNode {
    pub id: String,
    pub name: String,
    pub node_type: NodeType,
    pub status: NodeStatus,
    pub properties: NodeProperties,
    pub labels: HashMap<String, String>,
    pub annotations: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum NodeType {
    Service,
    Deployment,
    Pod,
    Database,
    Cache,
    MessageQueue,
    Gateway,
    ConfigMap,
    Secret,
    ExternalDependency,
    VirtualService,
    DestinationRule,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum NodeStatus {
    Healthy,
    Degraded,
    Unhealthy,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeProperties {
    pub replicas: Option<i32>,
    pub available_replicas: Option<i32>,
    pub image: Option<String>,
    pub ports: Vec<u16>,
    pub resources: Option<ResourceRequirements>,
    pub endpoints: Vec<String>,
    pub namespace: String,
    pub ip_address: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceRequirements {
    pub cpu_request: Option<String>,
    pub memory_request: Option<String>,
    pub cpu_limit: Option<String>,
    pub memory_limit: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopologyEdge {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    pub edge_type: EdgeType,
    pub weight: f64,
    pub metadata: EdgeMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum EdgeType {
    ServiceToDeployment,
    DeploymentToPod,
    ServiceToPod,
    TrafficRoute,
    Dependency,
    CircuitBreaker,
    RetryPolicy,
    LoadBalancer,
    DatabaseConnection,
    CacheHit,
    MessageProducer,
    MessageConsumer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeMetadata {
    pub protocol: Option<String>,
    pub port: Option<u16>,
    pub traffic_weight: Option<u32>,
    pub timeout_ms: Option<u64>,
    pub retries: Option<u32>,
    pub circuit_breaker: Option<CircuitBreakerConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CircuitBreakerConfig {
    pub max_connections: u32,
    pub http_pending_requests: u32,
    pub http_max_requests: u32,
    pub http_max_retries: u32,
    pub consecutive_5xx_errors: u32,
    pub ejection_percentage: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopologyMetadata {
    pub cluster_name: Option<String>,
    pub kubernetes_version: Option<String>,
    pub istio_version: Option<String>,
    pub namespaces: Vec<String>,
    pub total_nodes: usize,
    pub total_edges: usize,
}

#[derive(Debug, Clone)]
pub struct TopologyGraph {
    pub graph: DiGraph<TopologyNode, TopologyEdge>,
    pub node_indices: HashMap<String, NodeIndex>,
}

impl TopologyGraph {
    pub fn new() -> Self {
        TopologyGraph {
            graph: DiGraph::new(),
            node_indices: HashMap::new(),
        }
    }

    pub fn add_node(&mut self, node: TopologyNode) -> NodeIndex {
        let idx = self.graph.add_node(node.clone());
        self.node_indices.insert(node.id.clone(), idx);
        idx
    }

    pub fn add_edge(
        &mut self,
        source_id: &str,
        target_id: &str,
        edge: TopologyEdge,
    ) -> ChaosResult<()> {
        let source_idx = *self
            .node_indices
            .get(source_id)
            .ok_or_else(|| ChaosError::OrchestrationError(format!("Source node not found: {}", source_id)))?;
        let target_idx = *self
            .node_indices
            .get(target_id)
            .ok_or_else(|| ChaosError::OrchestrationError(format!("Target node not found: {}", target_id)))?;
        
        self.graph.add_edge(source_idx, target_idx, edge);
        Ok(())
    }

    pub fn get_node(&self, node_id: &str) -> Option<&TopologyNode> {
        self.node_indices
            .get(node_id)
            .and_then(|&idx| self.graph.node_weight(idx))
    }

    pub fn get_adjacent_nodes(&self, node_id: &str) -> Vec<&TopologyNode> {
        let mut adjacent = Vec::new();
        
        if let Some(&idx) = self.node_indices.get(node_id) {
            for neighbor in self.graph.neighbors(idx) {
                if let Some(node) = self.graph.node_weight(neighbor) {
                    adjacent.push(node);
                }
            }
        }
        
        adjacent
    }

    pub fn get_incoming_edges(&self, node_id: &str) -> Vec<&TopologyEdge> {
        let mut edges = Vec::new();
        
        if let Some(&idx) = self.node_indices.get(node_id) {
            for edge_ref in self.graph.edges_directed(idx, petgraph::Direction::Incoming) {
                edges.push(edge_ref.weight());
            }
        }
        
        edges
    }

    pub fn get_outgoing_edges(&self, node_id: &str) -> Vec<&TopologyEdge> {
        let mut edges = Vec::new();
        
        if let Some(&idx) = self.node_indices.get(node_id) {
            for edge_ref in self.graph.edges_directed(idx, petgraph::Direction::Outgoing) {
                edges.push(edge_ref.weight());
            }
        }
        
        edges
    }

    pub fn find_single_points_of_failure(&self) -> Vec<SinglePointOfFailure> {
        let mut spofs = Vec::new();
        
        for (node_id, &idx) in &self.node_indices {
            let incoming = self.graph.edges_directed(idx, petgraph::Direction::Incoming).count();
            let outgoing = self.graph.edges_directed(idx, petgraph::Direction::Outgoing).count();
            
            let node = self.graph.node_weight(idx).unwrap();
            
            if incoming == 0 && outgoing > 0 {
                continue;
            }
            
            if incoming > 0 && outgoing > 0 {
                let is_critical = match node.node_type {
                    NodeType::Database => true,
                    NodeType::MessageQueue => true,
                    NodeType::Cache => incoming > 2,
                    NodeType::Service => {
                        node.properties.replicas.unwrap_or(1) == 1
                    }
                    _ => false,
                };
                
                if is_critical {
                    let replicas = node.properties.replicas.unwrap_or(1);
                    let available = node.properties.available_replicas.unwrap_or(replicas);
                    
                    let spof = SinglePointOfFailure {
                        node_id: node_id.clone(),
                        node_name: node.name.clone(),
                        node_type: node.node_type.clone(),
                        replicas,
                        available_replicas: available,
                        incoming_connections: incoming,
                        outgoing_connections: outgoing,
                        risk_score: calculate_spof_risk(node, incoming, outgoing),
                        recommended_faults: recommend_faults_for_node(node),
                    };
                    
                    spofs.push(spof);
                }
            }
        }
        
        spofs.sort_by(|a, b| b.risk_score.partial_cmp(&a.risk_score).unwrap());
        spofs
    }

    pub fn find_critical_paths(&self, start_node_id: &str, end_node_id: &str) -> Vec<Vec<String>> {
        let mut paths = Vec::new();
        
        if let (Some(&start_idx), Some(&end_idx)) = (
            self.node_indices.get(start_node_id),
            self.node_indices.get(end_node_id),
        ) {
            let mut visited = HashMap::new();
            let mut current_path = Vec::new();
            
            self.dfs_find_paths(
                start_idx,
                end_idx,
                &mut visited,
                &mut current_path,
                &mut paths,
            );
        }
        
        paths
    }

    fn dfs_find_paths(
        &self,
        current: NodeIndex,
        end: NodeIndex,
        visited: &mut HashMap<NodeIndex, bool>,
        current_path: &mut Vec<String>,
        paths: &mut Vec<Vec<String>>,
    ) {
        visited.insert(current, true);
        
        if let Some(node) = self.graph.node_weight(current) {
            current_path.push(node.id.clone());
        }
        
        if current == end {
            paths.push(current_path.clone());
        } else {
            for neighbor in self.graph.neighbors(current) {
                if !visited.get(&neighbor).copied().unwrap_or(false) {
                    self.dfs_find_paths(neighbor, end, visited, current_path, paths);
                }
            }
        }
        
        current_path.pop();
        visited.insert(current, false);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SinglePointOfFailure {
    pub node_id: String,
    pub node_name: String,
    pub node_type: NodeType,
    pub replicas: i32,
    pub available_replicas: i32,
    pub incoming_connections: usize,
    pub outgoing_connections: usize,
    pub risk_score: f64,
    pub recommended_faults: Vec<RecommendedFault>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecommendedFault {
    pub fault_type: String,
    pub description: String,
    pub priority: u8,
    pub expected_impact: String,
    pub validation_tests: Vec<String>,
}

fn calculate_spof_risk(node: &TopologyNode, incoming: usize, outgoing: usize) -> f64 {
    let mut score = 0.0;
    
    let replicas = node.properties.replicas.unwrap_or(1);
    let available = node.properties.available_replicas.unwrap_or(replicas);
    
    if replicas == 1 {
        score += 40.0;
    } else if replicas == 2 {
        score += 20.0;
    }
    
    if available < replicas {
        score += 25.0;
    }
    
    match node.node_type {
        NodeType::Database => score += 35.0,
        NodeType::MessageQueue => score += 30.0,
        NodeType::Cache => score += 15.0,
        NodeType::Gateway => score += 25.0,
        _ => score += 10.0,
    }
    
    score += incoming as f64 * 2.0;
    score += outgoing as f64 * 1.5;
    
    score.min(100.0)
}

fn recommend_faults_for_node(node: &TopologyNode) -> Vec<RecommendedFault> {
    let mut faults = Vec::new();
    
    match node.node_type {
        NodeType::Database => {
            faults.push(RecommendedFault {
                fault_type: "disk-io".to_string(),
                description: "数据库磁盘I/O延迟注入".to_string(),
                priority: 1,
                expected_impact: "查询延迟增加，可能触发连接超时".to_string(),
                validation_tests: vec![
                    "database_read_test".to_string(),
                    "database_write_test".to_string(),
                    "connection_pool_test".to_string(),
                ],
            });
            faults.push(RecommendedFault {
                fault_type: "network-latency".to_string(),
                description: "数据库网络延迟注入".to_string(),
                priority: 2,
                expected_impact: "事务延迟增加，连接池耗尽风险".to_string(),
                validation_tests: vec![
                    "latency_impact_test".to_string(),
                    "transaction_test".to_string(),
                ],
            });
        }
        NodeType::Service => {
            faults.push(RecommendedFault {
                fault_type: "cpu-stress".to_string(),
                description: "服务CPU压力注入".to_string(),
                priority: 1,
                expected_impact: "响应延迟增加，可能触发超时".to_string(),
                validation_tests: vec![
                    "http_health_check".to_string(),
                    "response_time_test".to_string(),
                    "throughput_test".to_string(),
                ],
            });
            faults.push(RecommendedFault {
                fault_type: "memory-stress".to_string(),
                description: "服务内存压力注入".to_string(),
                priority: 2,
                expected_impact: "可能触发OOM，服务重启".to_string(),
                validation_tests: vec![
                    "http_health_check".to_string(),
                    "memory_usage_test".to_string(),
                ],
            });
            if node.properties.replicas.unwrap_or(1) == 1 {
                faults.push(RecommendedFault {
                    fault_type: "network-partition".to_string(),
                    description: "单实例服务网络分区".to_string(),
                    priority: 1,
                    expected_impact: "服务完全不可用".to_string(),
                    validation_tests: vec![
                        "failover_test".to_string(),
                        "circuit_breaker_test".to_string(),
                    ],
                });
            }
        }
        NodeType::MessageQueue => {
            faults.push(RecommendedFault {
                fault_type: "network-partition".to_string(),
                description: "消息队列网络分区".to_string(),
                priority: 1,
                expected_impact: "消息无法投递，可能导致数据丢失或重复".to_string(),
                validation_tests: vec![
                    "message_produce_test".to_string(),
                    "message_consume_test".to_string(),
                    "consumer_group_test".to_string(),
                ],
            });
            faults.push(RecommendedFault {
                fault_type: "disk-io".to_string(),
                description: "消息队列磁盘I/O延迟".to_string(),
                priority: 2,
                expected_impact: "消息延迟增加，堆积风险".to_string(),
                validation_tests: vec![
                    "message_latency_test".to_string(),
                    "backlog_test".to_string(),
                ],
            });
        }
        NodeType::Cache => {
            faults.push(RecommendedFault {
                fault_type: "network-partition".to_string(),
                description: "缓存服务网络分区".to_string(),
                priority: 1,
                expected_impact: "缓存击穿，数据库压力增加".to_string(),
                validation_tests: vec![
                    "cache_hit_rate_test".to_string(),
                    "database_load_test".to_string(),
                    "fallback_test".to_string(),
                ],
            });
        }
        _ => {
            faults.push(RecommendedFault {
                fault_type: "network-latency".to_string(),
                description: "网络延迟注入".to_string(),
                priority: 3,
                expected_impact: "响应延迟增加".to_string(),
                validation_tests: vec![
                    "latency_test".to_string(),
                ],
            });
        }
    }
    
    faults
}

impl Default for TopologyGraph {
    fn default() -> Self {
        Self::new()
    }
}

impl SystemTopology {
    pub fn to_graph(&self) -> ChaosResult<TopologyGraph> {
        let mut graph = TopologyGraph::new();
        
        for node in &self.nodes {
            graph.add_node(node.clone());
        }
        
        for edge in &self.edges {
            graph.add_edge(&edge.source_id, &edge.target_id, edge.clone())?;
        }
        
        Ok(graph)
    }

    pub fn discover() -> ChaosResult<Self> {
        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| ChaosError::OrchestrationError(format!("Tokio runtime error: {}", e)))?;
        
        rt.block_on(Self::discover_async())
    }

    async fn discover_async() -> ChaosResult<Self> {
        let client = match kube::Client::try_default().await {
            Ok(c) => c,
            Err(_) => {
                return Ok(Self::generate_mock_topology());
            }
        };

        let mut nodes = Vec::new();
        let mut edges = Vec::new();
        let mut namespaces = Vec::new();

        let namespaces_api: kube::Api<k8s_openapi::api::core::v1::Namespace> = 
            kube::Api::all(client.clone());
        
        let ns_list = namespaces_api.list(&kube::api::ListParams::default()).await;
        
        if let Ok(ns_list) = ns_list {
            for ns in ns_list.items {
                let ns_name = ns.metadata.name.clone().unwrap_or_default();
                namespaces.push(ns_name.clone());
            }
        }

        let services_api: kube::Api<k8s_openapi::api::core::v1::Service> = 
            kube::Api::all(client.clone());
        
        if let Ok(services) = services_api.list(&kube::api::ListParams::default()).await {
            for svc in services.items {
                let name = svc.metadata.name.clone().unwrap_or_default();
                let ns = svc.metadata.namespace.clone().unwrap_or_else(|| "default".to_string());
                
                let node = TopologyNode {
                    id: format!("service-{}-{}", ns, name),
                    name,
                    node_type: NodeType::Service,
                    status: NodeStatus::Healthy,
                    properties: NodeProperties {
                        replicas: None,
                        available_replicas: None,
                        image: None,
                        ports: svc.spec.as_ref()
                            .map(|s| s.ports.as_ref()
                                .map(|p| p.iter().filter_map(|p| p.port.map(|p| p as u16)).collect())
                                .unwrap_or_default())
                            .unwrap_or_default(),
                        resources: None,
                        endpoints: Vec::new(),
                        namespace: ns,
                        ip_address: svc.spec.as_ref().and_then(|s| s.cluster_ip.clone()),
                    },
                    labels: svc.metadata.labels.clone().unwrap_or_default(),
                    annotations: svc.metadata.annotations.clone().unwrap_or_default(),
                };
                nodes.push(node);
            }
        }

        let deployments_api: kube::Api<k8s_openapi::api::apps::v1::Deployment> = 
            kube::Api::all(client.clone());
        
        if let Ok(deployments) = deployments_api.list(&kube::api::ListParams::default()).await {
            for deploy in deployments.items {
                let name = deploy.metadata.name.clone().unwrap_or_default();
                let ns = deploy.metadata.namespace.clone().unwrap_or_else(|| "default".to_string());
                let replicas = deploy.spec.as_ref().and_then(|s| s.replicas).unwrap_or(1);
                let available = deploy.status.as_ref().and_then(|s| s.available_replicas).unwrap_or(0);
                
                let node = TopologyNode {
                    id: format!("deployment-{}-{}", ns, name),
                    name,
                    node_type: NodeType::Deployment,
                    status: if available >= replicas { NodeStatus::Healthy } else { NodeStatus::Degraded },
                    properties: NodeProperties {
                        replicas: Some(replicas),
                        available_replicas: Some(available),
                        image: deploy.spec.as_ref()
                            .and_then(|s| s.template.spec.as_ref())
                            .and_then(|t| t.containers.first().map(|c| c.image.clone().unwrap_or_default())),
                        ports: Vec::new(),
                        resources: None,
                        endpoints: Vec::new(),
                        namespace: ns,
                        ip_address: None,
                    },
                    labels: deploy.metadata.labels.clone().unwrap_or_default(),
                    annotations: deploy.metadata.annotations.clone().unwrap_or_default(),
                };
                nodes.push(node);
            }
        }

        Ok(SystemTopology {
            id: Uuid::new_v4().to_string(),
            discovered_at: Utc::now(),
            nodes,
            edges,
            metadata: TopologyMetadata {
                cluster_name: None,
                kubernetes_version: None,
                istio_version: None,
                namespaces,
                total_nodes: nodes.len(),
                total_edges: edges.len(),
            },
        })
    }

    fn generate_mock_topology() -> Self {
        let mut nodes = Vec::new();
        let mut edges = Vec::new();

        nodes.push(TopologyNode {
            id: "gateway-1".to_string(),
            name: "api-gateway".to_string(),
            node_type: NodeType::Gateway,
            status: NodeStatus::Healthy,
            properties: NodeProperties {
                replicas: Some(3),
                available_replicas: Some(3),
                image: Some("nginx:latest".to_string()),
                ports: vec![80, 443],
                resources: None,
                endpoints: vec!["http://api.example.com".to_string()],
                namespace: "default".to_string(),
                ip_address: Some("10.0.0.1".to_string()),
            },
            labels: HashMap::new(),
            annotations: HashMap::new(),
        });

        nodes.push(TopologyNode {
            id: "service-1".to_string(),
            name: "order-service".to_string(),
            node_type: NodeType::Service,
            status: NodeStatus::Healthy,
            properties: NodeProperties {
                replicas: Some(3),
                available_replicas: Some(3),
                image: Some("order-service:v1".to_string()),
                ports: vec![8080],
                resources: None,
                endpoints: Vec::new(),
                namespace: "default".to_string(),
                ip_address: Some("10.0.0.2".to_string()),
            },
            labels: HashMap::new(),
            annotations: HashMap::new(),
        });

        nodes.push(TopologyNode {
            id: "service-2".to_string(),
            name: "user-service".to_string(),
            node_type: NodeType::Service,
            status: NodeStatus::Healthy,
            properties: NodeProperties {
                replicas: Some(2),
                available_replicas: Some(2),
                image: Some("user-service:v1".to_string()),
                ports: vec![8080],
                resources: None,
                endpoints: Vec::new(),
                namespace: "default".to_string(),
                ip_address: Some("10.0.0.3".to_string()),
            },
            labels: HashMap::new(),
            annotations: HashMap::new(),
        });

        nodes.push(TopologyNode {
            id: "database-1".to_string(),
            name: "postgres-master".to_string(),
            node_type: NodeType::Database,
            status: NodeStatus::Healthy,
            properties: NodeProperties {
                replicas: Some(1),
                available_replicas: Some(1),
                image: Some("postgres:13".to_string()),
                ports: vec![5432],
                resources: None,
                endpoints: Vec::new(),
                namespace: "default".to_string(),
                ip_address: Some("10.0.0.10".to_string()),
            },
            labels: HashMap::new(),
            annotations: HashMap::new(),
        });

        nodes.push(TopologyNode {
            id: "cache-1".to_string(),
            name: "redis-master".to_string(),
            node_type: NodeType::Cache,
            status: NodeStatus::Healthy,
            properties: NodeProperties {
                replicas: Some(1),
                available_replicas: Some(1),
                image: Some("redis:6".to_string()),
                ports: vec![6379],
                resources: None,
                endpoints: Vec::new(),
                namespace: "default".to_string(),
                ip_address: Some("10.0.0.11".to_string()),
            },
            labels: HashMap::new(),
            annotations: HashMap::new(),
        });

        nodes.push(TopologyNode {
            id: "mq-1".to_string(),
            name: "kafka-cluster".to_string(),
            node_type: NodeType::MessageQueue,
            status: NodeStatus::Healthy,
            properties: NodeProperties {
                replicas: Some(3),
                available_replicas: Some(3),
                image: Some("kafka:2.8".to_string()),
                ports: vec![9092],
                resources: None,
                endpoints: Vec::new(),
                namespace: "default".to_string(),
                ip_address: Some("10.0.0.20".to_string()),
            },
            labels: HashMap::new(),
            annotations: HashMap::new(),
        });

        edges.push(TopologyEdge {
            id: "edge-1".to_string(),
            source_id: "gateway-1".to_string(),
            target_id: "service-1".to_string(),
            edge_type: EdgeType::TrafficRoute,
            weight: 1.0,
            metadata: EdgeMetadata {
                protocol: Some("HTTP".to_string()),
                port: Some(8080),
                traffic_weight: Some(100),
                timeout_ms: Some(30000),
                retries: Some(3),
                circuit_breaker: None,
            },
        });

        edges.push(TopologyEdge {
            id: "edge-2".to_string(),
            source_id: "gateway-1".to_string(),
            target_id: "service-2".to_string(),
            edge_type: EdgeType::TrafficRoute,
            weight: 1.0,
            metadata: EdgeMetadata {
                protocol: Some("HTTP".to_string()),
                port: Some(8080),
                traffic_weight: Some(100),
                timeout_ms: Some(30000),
                retries: Some(3),
                circuit_breaker: None,
            },
        });

        edges.push(TopologyEdge {
            id: "edge-3".to_string(),
            source_id: "service-1".to_string(),
            target_id: "database-1".to_string(),
            edge_type: EdgeType::DatabaseConnection,
            weight: 1.5,
            metadata: EdgeMetadata {
                protocol: Some("PostgreSQL".to_string()),
                port: Some(5432),
                traffic_weight: None,
                timeout_ms: Some(5000),
                retries: None,
                circuit_breaker: None,
            },
        });

        edges.push(TopologyEdge {
            id: "edge-4".to_string(),
            source_id: "service-1".to_string(),
            target_id: "cache-1".to_string(),
            edge_type: EdgeType::Dependency,
            weight: 0.8,
            metadata: EdgeMetadata {
                protocol: Some("Redis".to_string()),
                port: Some(6379),
                traffic_weight: None,
                timeout_ms: Some(1000),
                retries: None,
                circuit_breaker: None,
            },
        });

        edges.push(TopologyEdge {
            id: "edge-5".to_string(),
            source_id: "service-2".to_string(),
            target_id: "database-1".to_string(),
            edge_type: EdgeType::DatabaseConnection,
            weight: 1.2,
            metadata: EdgeMetadata {
                protocol: Some("PostgreSQL".to_string()),
                port: Some(5432),
                traffic_weight: None,
                timeout_ms: Some(5000),
                retries: None,
                circuit_breaker: None,
            },
        });

        edges.push(TopologyEdge {
            id: "edge-6".to_string(),
            source_id: "service-1".to_string(),
            target_id: "mq-1".to_string(),
            edge_type: EdgeType::MessageProducer,
            weight: 1.0,
            metadata: EdgeMetadata {
                protocol: Some("Kafka".to_string()),
                port: Some(9092),
                traffic_weight: None,
                timeout_ms: Some(10000),
                retries: None,
                circuit_breaker: None,
            },
        });

        SystemTopology {
            id: Uuid::new_v4().to_string(),
            discovered_at: Utc::now(),
            nodes,
            edges,
            metadata: TopologyMetadata {
                cluster_name: Some("mock-cluster".to_string()),
                kubernetes_version: Some("1.29.0".to_string()),
                istio_version: None,
                namespaces: vec!["default".to_string()],
                total_nodes: 6,
                total_edges: 6,
            },
        }
    }
}
