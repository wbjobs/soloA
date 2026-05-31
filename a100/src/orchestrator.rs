use crate::errors::{ChaosError, ChaosResult};
use crate::scenario::{
    OrchestratorType, SSHHost, TargetConfig, TargetConfiguration, TargetSelector,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredTarget {
    pub id: String,
    pub name: String,
    pub orchestrator: OrchestratorType,
    pub status: TargetStatus,
    pub metadata: HashMap<String, String>,
    pub labels: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TargetStatus {
    Running,
    Stopped,
    Unknown,
}

pub trait Orchestrator: Send + Sync {
    fn discover(&self, config: &TargetConfiguration) -> ChaosResult<Vec<DiscoveredTarget>>;
    fn execute_command(&self, target: &DiscoveredTarget, command: &str) -> ChaosResult<String>;
    fn name(&self) -> &'static str;
}

pub struct OrchestratorManager {
    orchestrators: HashMap<String, Box<dyn Orchestrator>>,
}

impl OrchestratorManager {
    pub fn new() -> Self {
        let mut manager = OrchestratorManager {
            orchestrators: HashMap::new(),
        };
        
        manager.register("kubernetes", Box::new(KubernetesOrchestrator::new()));
        manager.register("docker-compose", Box::new(DockerComposeOrchestrator::new()));
        manager.register("ssh", Box::new(SSHOrchestrator::new()));
        
        manager
    }

    pub fn register(&mut self, name: &str, orchestrator: Box<dyn Orchestrator>) {
        self.orchestrators.insert(name.to_string(), orchestrator);
    }

    pub fn get(&self, orchestrator_type: &OrchestratorType) -> ChaosResult<&dyn Orchestrator> {
        let name = match orchestrator_type {
            OrchestratorType::Kubernetes => "kubernetes",
            OrchestratorType::DockerCompose => "docker-compose",
            OrchestratorType::BareMetalSSH => "ssh",
        };
        
        self.orchestrators
            .get(name)
            .map(|o| o.as_ref())
            .ok_or_else(|| ChaosError::OrchestrationError(format!("Orchestrator '{}' not found", name)))
    }

    pub fn discover_targets(
        &self,
        config: &TargetConfiguration,
        selector: Option<&TargetSelector>,
    ) -> ChaosResult<Vec<DiscoveredTarget>> {
        let orchestrator = self.get(&config.get_orchestrator_type())?;
        let mut targets = orchestrator.discover(config)?;
        
        if let Some(sel) = selector {
            targets = self.filter_targets(targets, sel)?;
        }
        
        if let Some(filters) = &config.filters {
            targets = self.apply_filters(targets, filters)?;
        }
        
        Ok(targets)
    }

    fn filter_targets(
        &self,
        targets: Vec<DiscoveredTarget>,
        selector: &TargetSelector,
    ) -> ChaosResult<Vec<DiscoveredTarget>> {
        let mut filtered = targets;
        
        if let Some(names) = &selector.names {
            filtered = filtered
                .into_iter()
                .filter(|t| names.contains(&t.name))
                .collect();
        }
        
        if let Some(labels) = &selector.labels {
            filtered = filtered
                .into_iter()
                .filter(|t| {
                    labels.iter().all(|(k, v)| {
                        t.labels.get(k).map(|val| val == v).unwrap_or(false)
                    })
                })
                .collect();
        }
        
        if let Some(percentage) = selector.percentage {
            if percentage < 100 {
                let count = (filtered.len() as f64 * percentage as f64 / 100.0).ceil() as usize;
                filtered.truncate(count);
            }
        }
        
        Ok(filtered)
    }

    fn apply_filters(
        &self,
        targets: Vec<DiscoveredTarget>,
        filters: &crate::scenario::FilterConfig,
    ) -> ChaosResult<Vec<DiscoveredTarget>> {
        let mut filtered = targets;
        
        if let Some(include) = &filters.include {
            filtered = filtered
                .into_iter()
                .filter(|t| include.contains(&t.name))
                .collect();
        }
        
        if let Some(exclude) = &filters.exclude {
            filtered = filtered
                .into_iter()
                .filter(|t| !exclude.contains(&t.name))
                .collect();
        }
        
        if let Some(percentage) = filters.percentage {
            if percentage < 100 {
                let count = (filtered.len() as f64 * percentage as f64 / 100.0).ceil() as usize;
                filtered.truncate(count);
            }
        }
        
        Ok(filtered)
    }
}

impl Default for OrchestratorManager {
    fn default() -> Self {
        Self::new()
    }
}

pub struct KubernetesOrchestrator {
    client: Option<kube::Client>,
}

impl KubernetesOrchestrator {
    pub fn new() -> Self {
        KubernetesOrchestrator { client: None }
    }

    async fn get_client(&self, kubeconfig: Option<&str>) -> ChaosResult<kube::Client> {
        if let Some(path) = kubeconfig {
            std::env::set_var("KUBECONFIG", path);
        }
        
        kube::Client::try_default()
            .await
            .map_err(|e| ChaosError::OrchestrationError(format!("Failed to create Kubernetes client: {}", e)))
    }
}

impl Default for KubernetesOrchestrator {
    fn default() -> Self {
        Self::new()
    }
}

impl Orchestrator for KubernetesOrchestrator {
    fn name(&self) -> &'static str {
        "kubernetes"
    }

    fn discover(&self, config: &TargetConfiguration) -> ChaosResult<Vec<DiscoveredTarget>> {
        let mut targets = Vec::new();
        
        if let TargetConfig::Kubernetes {
            namespace,
            label_selector,
            field_selector,
            kubeconfig,
        } = &config.config
        {
            let ns = namespace.clone().unwrap_or_else(|| "default".to_string());
            
            let rt = tokio::runtime::Runtime::new()
                .map_err(|e| ChaosError::OrchestrationError(format!("Tokio runtime error: {}", e)))?;
            
            let client = rt.block_on(self.get_client(kubeconfig.as_deref()))?;
            
            let pods_api: kube::Api<k8s_openapi::api::core::v1::Pod> = 
                kube::Api::namespaced(client, &ns);
            
            let lp = kube::api::ListParams::default()
                .labels(label_selector.as_deref().unwrap_or(""))
                .fields(field_selector.as_deref().unwrap_or(""));
            
            let pods = rt.block_on(pods_api.list(&lp))
                .map_err(|e| ChaosError::DiscoveryError(format!("Failed to list pods: {}", e)))?;
            
            for pod in pods.items {
                let status = pod.status.as_ref()
                    .and_then(|s| s.phase.as_ref())
                    .map(|p| {
                        if p == "Running" {
                            TargetStatus::Running
                        } else {
                            TargetStatus::Stopped
                        }
                    })
                    .unwrap_or(TargetStatus::Unknown);
                
                let metadata = HashMap::new();
                let labels = pod.metadata.labels.clone().unwrap_or_default();
                
                targets.push(DiscoveredTarget {
                    id: pod.metadata.uid.clone().unwrap_or_default(),
                    name: pod.metadata.name.clone().unwrap_or_default(),
                    orchestrator: OrchestratorType::Kubernetes,
                    status,
                    metadata,
                    labels,
                });
            }
        }
        
        Ok(targets)
    }

    fn execute_command(&self, target: &DiscoveredTarget, command: &str) -> ChaosResult<String> {
        let rt = tokio::runtime::Runtime::new()
            .map_err(|e| ChaosError::OrchestrationError(format!("Tokio runtime error: {}", e)))?;
        
        let client = rt.block_on(self.get_client(None))?;
        
        let pods_api: kube::Api<k8s_openapi::api::core::v1::Pod> = 
            kube::Api::default(client);
        
        let exec_result = rt.block_on(kube::api::Exec::new(
            &pods_api,
            &target.name,
            kube::api::ExecParams {
                command: vec!["sh".to_string(), "-c".to_string(), command.to_string()],
                container: None,
                stdin: false,
                stdout: true,
                stderr: true,
                tty: false,
            },
        )).map_err(|e| ChaosError::OrchestrationError(format!("Exec failed: {}", e)))?;
        
        Ok(format!("Command executed: {}", command))
    }
}

pub struct DockerComposeOrchestrator {}

impl DockerComposeOrchestrator {
    pub fn new() -> Self {
        DockerComposeOrchestrator {}
    }
}

impl Default for DockerComposeOrchestrator {
    fn default() -> Self {
        Self::new()
    }
}

impl Orchestrator for DockerComposeOrchestrator {
    fn name(&self) -> &'static str {
        "docker-compose"
    }

    fn discover(&self, config: &TargetConfiguration) -> ChaosResult<Vec<DiscoveredTarget>> {
        let mut targets = Vec::new();
        
        if let TargetConfig::DockerCompose {
            compose_file,
            project_name,
            services,
        } = &config.config
        {
            let mut cmd = format!("docker-compose -f {} ps", compose_file);
            if let Some(pn) = project_name {
                cmd = format!("docker-compose -f {} -p {} ps", compose_file, pn);
            }
            
            let output = std::process::Command::new("sh")
                .args(&["-c", &cmd])
                .output()
                .map_err(|e| ChaosError::DiscoveryError(format!("Docker Compose command failed: {}", e)))?;
            
            let output_str = String::from_utf8_lossy(&output.stdout);
            
            for line in output_str.lines().skip(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    let name = parts[0].to_string();
                    let status = if line.contains("Up") {
                        TargetStatus::Running
                    } else {
                        TargetStatus::Stopped
                    };
                    
                    if let Some(svc_list) = services {
                        if !svc_list.iter().any(|s| name.contains(s)) {
                            continue;
                        }
                    }
                    
                    targets.push(DiscoveredTarget {
                        id: name.clone(),
                        name,
                        orchestrator: OrchestratorType::DockerCompose,
                        status,
                        metadata: HashMap::new(),
                        labels: HashMap::new(),
                    });
                }
            }
        }
        
        Ok(targets)
    }

    fn execute_command(&self, target: &DiscoveredTarget, command: &str) -> ChaosResult<String> {
        let cmd = format!("docker exec {} sh -c '{}'", target.id, command);
        
        let output = std::process::Command::new("sh")
            .args(&["-c", &cmd])
            .output()
            .map_err(|e| ChaosError::OrchestrationError(format!("Docker exec failed: {}", e)))?;
        
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}

pub struct SSHOrchestrator {}

impl SSHOrchestrator {
    pub fn new() -> Self {
        SSHOrchestrator {}
    }

    fn connect_ssh(&self, host: &SSHHost) -> ChaosResult<ssh2::Session> {
        let port = host.port.unwrap_or(22);
        let addr = format!("{}:{}", host.hostname, port);
        
        let tcp = std::net::TcpStream::connect(&addr)
            .map_err(|e| ChaosError::OrchestrationError(format!("TCP connection failed: {}", e)))?;
        
        let mut sess = ssh2::Session::new()
            .map_err(|e| ChaosError::OrchestrationError(format!("SSH session failed: {}", e)))?;
        sess.set_tcp_stream(tcp);
        sess.handshake()
            .map_err(|e| ChaosError::OrchestrationError(format!("SSH handshake failed: {}", e)))?;
        
        if let Some(priv_key) = &host.private_key {
            sess.userauth_pubkey_file(&host.username, None, std::path::Path::new(priv_key), None)
                .map_err(|e| ChaosError::OrchestrationError(format!("SSH auth failed: {}", e)))?;
        } else if let Some(password) = &host.password {
            sess.userauth_password(&host.username, password)
                .map_err(|e| ChaosError::OrchestrationError(format!("SSH auth failed: {}", e)))?;
        } else {
            return Err(ChaosError::OrchestrationError("No SSH authentication method provided".into()));
        }
        
        Ok(sess)
    }
}

impl Default for SSHOrchestrator {
    fn default() -> Self {
        Self::new()
    }
}

impl Orchestrator for SSHOrchestrator {
    fn name(&self) -> &'static str {
        "ssh"
    }

    fn discover(&self, config: &TargetConfiguration) -> ChaosResult<Vec<DiscoveredTarget>> {
        let mut targets = Vec::new();
        
        if let TargetConfig::BareMetalSSH { hosts, .. } = &config.config
        {
            for host in hosts {
                targets.push(DiscoveredTarget {
                    id: host.hostname.clone(),
                    name: host.hostname.clone(),
                    orchestrator: OrchestratorType::BareMetalSSH,
                    status: TargetStatus::Running,
                    metadata: HashMap::new(),
                    labels: HashMap::new(),
                });
            }
        }
        
        Ok(targets)
    }

    fn execute_command(&self, target: &DiscoveredTarget, command: &str) -> ChaosResult<String> {
        let ssh_config = SSHHost {
            hostname: target.name.clone(),
            port: Some(22),
            username: "root".to_string(),
            password: None,
            private_key: None,
        };
        
        let sess = self.connect_ssh(&ssh_config)?;
        
        let mut channel = sess.channel_session()
            .map_err(|e| ChaosError::OrchestrationError(format!("SSH channel failed: {}", e)))?;
        
        channel.exec(command)
            .map_err(|e| ChaosError::OrchestrationError(format!("SSH exec failed: {}", e)))?;
        
        let mut output = String::new();
        channel.read_to_string(&mut output)
            .map_err(|e| ChaosError::OrchestrationError(format!("SSH read failed: {}", e)))?;
        
        channel.wait_close()
            .map_err(|e| ChaosError::OrchestrationError(format!("SSH close failed: {}", e)))?;
        
        Ok(output)
    }
}
