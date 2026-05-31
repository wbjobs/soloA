use crate::errors::{ChaosError, ChaosResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChaosScenario {
    pub metadata: Metadata,
    pub targets: TargetConfiguration,
    pub experiments: Vec<Experiment>,
    pub observability: Option<ObservabilityConfig>,
    pub security: SecurityConfig,
    pub validation: Option<ValidationScenarioConfig>,
    #[serde(default)]
    pub tags: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ValidationScenarioConfig {
    pub enabled: bool,
    pub tests: Vec<ValidationTestDefinition>,
    pub baseline_duration_seconds: u64,
    pub during_duration_seconds: u64,
    pub post_duration_seconds: u64,
    pub timeout_ms: u64,
    pub retry_count: u32,
    pub failure_threshold: f64,
    pub tolerance_score_threshold: Option<f64>,
    pub auto_generate_tests: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationTestDefinition {
    pub name: String,
    pub test_type: ValidationTestType,
    pub description: Option<String>,
    pub target: String,
    pub parameters: std::collections::HashMap<String, serde_json::Value>,
    pub assertions: Vec<Assertion>,
    pub interval_ms: Option<u64>,
    pub timeout_ms: Option<u64>,
    pub priority: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ValidationTestType {
    #[serde(rename = "http-health-check")]
    HTTPHealthCheck,
    #[serde(rename = "http-load-test")]
    HTTPLoadTest,
    #[serde(rename = "database-read")]
    DatabaseRead,
    #[serde(rename = "database-write")]
    DatabaseWrite,
    #[serde(rename = "database-transaction")]
    DatabaseTransaction,
    #[serde(rename = "message-produce")]
    MessageProduce,
    #[serde(rename = "message-consume")]
    MessageConsume,
    #[serde(rename = "circuit-breaker")]
    CircuitBreaker,
    #[serde(rename = "connection-pool")]
    ConnectionPool,
    #[serde(rename = "custom")]
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Assertion {
    #[serde(rename = "type")]
    pub type_: AssertionType,
    pub metric: String,
    pub operator: AssertionOperator,
    pub expected_value: f64,
    pub tolerance: Option<f64>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AssertionType {
    #[serde(rename = "response-time")]
    ResponseTime,
    #[serde(rename = "error-rate")]
    ErrorRate,
    #[serde(rename = "throughput")]
    Throughput,
    #[serde(rename = "availability")]
    Availability,
    #[serde(rename = "circuit-breaker-state")]
    CircuitBreakerState,
    #[serde(rename = "custom")]
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AssertionOperator {
    #[serde(rename = "lt")]
    LessThan,
    #[serde(rename = "lte")]
    LessThanOrEqual,
    #[serde(rename = "gt")]
    GreaterThan,
    #[serde(rename = "gte")]
    GreaterThanOrEqual,
    #[serde(rename = "eq")]
    Equal,
    #[serde(rename = "ne")]
    NotEqual,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Metadata {
    pub name: String,
    pub version: Option<String>,
    pub description: Option<String>,
    pub duration: Option<u64>,
    #[serde(default)]
    pub author: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TargetConfiguration {
    #[serde(flatten)]
    pub config: TargetConfig,
    pub filters: Option<FilterConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OrchestratorType {
    #[serde(rename = "kubernetes")]
    Kubernetes,
    #[serde(rename = "docker-compose")]
    DockerCompose,
    #[serde(rename = "ssh")]
    BareMetalSSH,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "orchestrator")]
pub enum TargetConfig {
    #[serde(rename = "kubernetes")]
    Kubernetes {
        namespace: Option<String>,
        label_selector: Option<String>,
        field_selector: Option<String>,
        kubeconfig: Option<String>,
    },
    #[serde(rename = "docker-compose")]
    DockerCompose {
        compose_file: String,
        project_name: Option<String>,
        services: Option<Vec<String>>,
    },
    #[serde(rename = "ssh")]
    BareMetalSSH {
        hosts: Vec<SSHHost>,
        parallel: Option<bool>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SSHHost {
    pub hostname: String,
    pub port: Option<u16>,
    pub username: String,
    pub password: Option<String>,
    pub private_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterConfig {
    pub include: Option<Vec<String>>,
    pub exclude: Option<Vec<String>>,
    #[serde(default)]
    pub percentage: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Experiment {
    pub name: String,
    pub fault_type: FaultType,
    pub parameters: FaultParameters,
    #[serde(default)]
    pub duration: Option<u64>,
    pub phase: ExperimentPhase,
    #[serde(default)]
    pub dependencies: Option<Vec<String>>,
    #[serde(default)]
    pub target_selector: Option<TargetSelector>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ExperimentPhase {
    #[serde(rename = "pre")]
    Pre,
    #[serde(rename = "main")]
    Main,
    #[serde(rename = "post")]
    Post,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FaultType {
    #[serde(rename = "network-partition")]
    NetworkPartition,
    #[serde(rename = "network-latency")]
    NetworkLatency,
    #[serde(rename = "cpu-stress")]
    CPUStress,
    #[serde(rename = "memory-stress")]
    MemoryStress,
    #[serde(rename = "disk-io")]
    DiskIO,
    #[serde(rename = "service-fault")]
    ServiceFault,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum FaultParameters {
    NetworkPartition(NetworkPartitionParams),
    NetworkLatency(NetworkLatencyParams),
    CPUStress(CPUStressParams),
    MemoryStress(MemoryStressParams),
    DiskIO(DiskIOParams),
    ServiceFault(ServiceFaultParams),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkPartitionParams {
    pub direction: PartitionDirection,
    pub targets: Option<Vec<String>>,
    pub ports: Option<Vec<u16>>,
    pub protocol: Option<ProtocolType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PartitionDirection {
    #[serde(rename = "inbound")]
    Inbound,
    #[serde(rename = "outbound")]
    Outbound,
    #[serde(rename = "both")]
    Both,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProtocolType {
    #[serde(rename = "tcp")]
    TCP,
    #[serde(rename = "udp")]
    UDP,
    #[serde(rename = "icmp")]
    ICMP,
    #[serde(rename = "all")]
    All,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkLatencyParams {
    pub latency_ms: u32,
    pub jitter_ms: Option<u32>,
    pub correlation_percent: Option<u32>,
    pub loss_percent: Option<u32>,
    pub interface: Option<String>,
    pub ports: Option<Vec<u16>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CPUStressParams {
    pub cpu_percent: Option<u8>,
    pub cpu_cores: Option<u32>,
    pub cpu_load: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryStressParams {
    pub memory_percent: Option<u8>,
    pub memory_mb: Option<u32>,
    pub vm_percent: Option<u8>,
    pub vm_bytes: Option<u64>,
    pub workers: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskIOParams {
    pub device: String,
    pub read_delay_ms: Option<u32>,
    pub write_delay_ms: Option<u32>,
    pub read_error_percent: Option<u8>,
    pub write_error_percent: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceFaultParams {
    pub protocol: ServiceProtocol,
    pub endpoints: Vec<String>,
    pub error_code: Option<u16>,
    pub timeout_ms: Option<u64>,
    pub error_percent: Option<u8>,
    pub delay_ms: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ServiceProtocol {
    #[serde(rename = "http")]
    HTTP,
    #[serde(rename = "grpc")]
    GRPC,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TargetSelector {
    pub labels: Option<HashMap<String, String>>,
    pub names: Option<Vec<String>>,
    #[serde(default)]
    pub percentage: Option<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ObservabilityConfig {
    pub prometheus: PrometheusConfig,
    pub metrics: Vec<MetricQuery>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrometheusConfig {
    pub url: String,
    pub query_timeout_ms: Option<u64>,
    pub step: Option<u64>,
    pub tls_verify: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricQuery {
    pub name: String,
    pub query: String,
    pub description: Option<String>,
    #[serde(default)]
    pub baseline_window: Option<u64>,
    #[serde(default)]
    pub threshold: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityConfig {
    #[serde(default)]
    pub pre_snapshot: bool,
    #[serde(default)]
    pub snapshot_targets: Option<SnapshotTargets>,
    pub timeout: u64,
    pub big_red_button: BigRedButtonConfig,
    #[serde(default)]
    pub auto_recover: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotTargets {
    pub etcd: Option<EtcdSnapshotConfig>,
    pub database: Option<DatabaseDumpConfig>,
    #[serde(default)]
    pub filesystem: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EtcdSnapshotConfig {
    pub endpoints: Vec<String>,
    pub ca_cert: Option<String>,
    pub cert: Option<String>,
    pub key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseDumpConfig {
    pub db_type: DatabaseType,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: Option<String>,
    pub database: String,
    pub output_file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DatabaseType {
    #[serde(rename = "postgresql")]
    PostgreSQL,
    #[serde(rename = "mysql")]
    MySQL,
    #[serde(rename = "mongodb")]
    MongoDB,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BigRedButtonConfig {
    pub enabled: bool,
    pub lock_type: LockType,
    pub etcd: Option<EtcdLockConfig>,
    pub redis: Option<RedisLockConfig>,
    #[serde(default)]
    pub ttl: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum LockType {
    #[serde(rename = "etcd")]
    Etcd,
    #[serde(rename = "redis")]
    Redis,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EtcdLockConfig {
    pub endpoints: Vec<String>,
    pub key: String,
    pub ttl: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisLockConfig {
    pub url: String,
    pub key: String,
    pub ttl: Option<u64>,
}

impl ChaosScenario {
    pub fn from_file<P: AsRef<Path>>(path: P) -> ChaosResult<Self> {
        let path = path.as_ref();
        let mut file = File::open(path)?;
        let mut content = String::new();
        file.read_to_string(&mut content)?;

        match path.extension().and_then(|s| s.to_str()) {
            Some("yaml") | Some("yml") => {
                serde_yaml::from_str(&content).map_err(ChaosError::from)
            }
            Some("json") => {
                serde_json::from_str(&content).map_err(ChaosError::from)
            }
            _ => Err(ChaosError::InvalidScenario(
                "Unsupported file format. Use .yaml, .yml, or .json".into(),
            )),
        }
    }

    pub fn validate(&self) -> ChaosResult<()> {
        if self.experiments.is_empty() {
            return Err(ChaosError::InvalidScenario(
                "Scenario must contain at least one experiment".into(),
            ));
        }

        if self.security.timeout == 0 {
            return Err(ChaosError::InvalidScenario(
                "Timeout must be greater than 0".into(),
            ));
        }

        if self.security.big_red_button.enabled {
            match self.security.big_red_button.lock_type {
                LockType::Etcd => {
                    if self.security.big_red_button.etcd.is_none() {
                        return Err(ChaosError::InvalidScenario(
                            "etcd lock config required when using etcd as lock type".into(),
                        ));
                    }
                }
                LockType::Redis => {
                    if self.security.big_red_button.redis.is_none() {
                        return Err(ChaosError::InvalidScenario(
                            "redis lock config required when using redis as lock type".into(),
                        ));
                    }
                }
            }
        }

        Ok(())
    }
}

impl TargetConfig {
    pub fn get_orchestrator_type(&self) -> OrchestratorType {
        match self {
            TargetConfig::Kubernetes { .. } => OrchestratorType::Kubernetes,
            TargetConfig::DockerCompose { .. } => OrchestratorType::DockerCompose,
            TargetConfig::BareMetalSSH { .. } => OrchestratorType::BareMetalSSH,
        }
    }
}

impl TargetConfiguration {
    pub fn get_orchestrator_type(&self) -> OrchestratorType {
        self.config.get_orchestrator_type()
    }
}
