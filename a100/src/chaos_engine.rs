use crate::errors::{ChaosError, ChaosResult};
use crate::scenario::{
    CPUStressParams, DiskIOParams, FaultParameters, FaultType, MemoryStressParams,
    NetworkLatencyParams, NetworkPartitionParams, ServiceFaultParams,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Command;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InjectedFault {
    pub id: String,
    pub fault_type: FaultType,
    pub target: String,
    pub parameters: FaultParameters,
    pub start_time: DateTime<Utc>,
    pub duration: Option<u64>,
    pub status: FaultStatus,
    pub cleanup_info: CleanupInfo,
    pub rule_comment: String,
    pub target_identifier: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FaultStatus {
    Pending,
    Running,
    Recovering,
    Recovered,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupInfo {
    pub commands: Vec<String>,
    pub network_rules: Vec<String>,
    pub processes: Vec<u32>,
    pub tc_qdiscs: Vec<String>,
    pub dmsetup_devices: Vec<String>,
    pub iptables_chains: Vec<IptablesChainRule>,
    pub persistence_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IptablesChainRule {
    pub chain: String,
    pub table: String,
    pub comment: String,
}

pub struct ChaosEngine {
    injected_faults: HashMap<String, InjectedFault>,
}

impl ChaosEngine {
    pub fn new() -> Self {
        ChaosEngine {
            injected_faults: HashMap::new(),
        }
    }

    pub fn inject_fault(
        &mut self,
        fault_type: FaultType,
        target: &str,
        params: FaultParameters,
        duration: Option<u64>,
    ) -> ChaosResult<InjectedFault> {
        let fault_id = Uuid::new_v4().to_string();
        let rule_comment = format!("chaos-platform:{}", fault_id);
        let target_identifier = format!("{}:{}", fault_type_to_str(&fault_type), target);
        
        let (cleanup_info, success) = match &params {
            FaultParameters::NetworkPartition(p) => 
                self.inject_network_partition(p, &fault_id, &rule_comment)?,
            FaultParameters::NetworkLatency(p) => 
                self.inject_network_latency(p, &fault_id, &rule_comment)?,
            FaultParameters::CPUStress(p) => 
                self.inject_cpu_stress(p, &fault_id, &rule_comment)?,
            FaultParameters::MemoryStress(p) => 
                self.inject_memory_stress(p, &fault_id, &rule_comment)?,
            FaultParameters::DiskIO(p) => 
                self.inject_disk_io(p, &fault_id, &rule_comment)?,
            FaultParameters::ServiceFault(p) => 
                self.inject_service_fault(p, &fault_id, &rule_comment)?,
        };

        if !success {
            return Err(ChaosError::InjectionError(format!(
                "Failed to inject fault: {:?} on {}",
                fault_type, target
            )));
        }

        let injected_fault = InjectedFault {
            id: fault_id.clone(),
            fault_type: fault_type.clone(),
            target: target.to_string(),
            parameters: params,
            start_time: Utc::now(),
            duration,
            status: FaultStatus::Running,
            cleanup_info,
            rule_comment,
            target_identifier,
        };

        self.injected_faults
            .insert(fault_id.clone(), injected_fault.clone());

        Ok(injected_fault)
    }

    pub fn recover_fault(&mut self, fault_id: &str) -> ChaosResult<()> {
        let fault = self
            .injected_faults
            .get(fault_id)
            .ok_or_else(|| ChaosError::RecoveryError(format!("Fault {} not found", fault_id)))?;

        let mut updated_fault = fault.clone();
        updated_fault.status = FaultStatus::Recovering;
        self.injected_faults.insert(fault_id.to_string(), updated_fault);

        let success = self.cleanup_fault(fault)?;

        let mut updated_fault = self.injected_faults.get(fault_id).unwrap().clone();
        updated_fault.status = if success {
            FaultStatus::Recovered
        } else {
            FaultStatus::Failed
        };
        self.injected_faults.insert(fault_id.to_string(), updated_fault);

        if !success {
            return Err(ChaosError::RecoveryError(format!(
                "Failed to recover fault: {}",
                fault_id
            )));
        }

        Ok(())
    }

    pub fn recover_all(&mut self) -> ChaosResult<Vec<String>> {
        let mut fault_ids: Vec<String> = self.injected_faults.keys().cloned().collect();
        fault_ids.sort_by(|a, b| {
            let fa = self.injected_faults.get(a).unwrap();
            let fb = self.injected_faults.get(b).unwrap();
            match (&fa.fault_type, &fb.fault_type) {
                (FaultType::NetworkPartition, _) => std::cmp::Ordering::Less,
                (_, FaultType::NetworkPartition) => std::cmp::Ordering::Greater,
                (FaultType::NetworkLatency, _) => std::cmp::Ordering::Less,
                (_, FaultType::NetworkLatency) => std::cmp::Ordering::Greater,
                (FaultType::ServiceFault, _) => std::cmp::Ordering::Less,
                (_, FaultType::ServiceFault) => std::cmp::Ordering::Greater,
                _ => std::cmp::Ordering::Equal,
            }
        });
        
        let mut errors = Vec::new();
        let mut recovered = Vec::new();

        for fault_id in fault_ids {
            match self.recover_fault(&fault_id) {
                Ok(_) => recovered.push(fault_id),
                Err(e) => errors.push(format!("{}: {}", fault_id, e)),
            }
        }

        if errors.is_empty() {
            Ok(recovered)
        } else {
            Err(ChaosError::RecoveryError(format!(
                "Some recoveries failed: {}",
                errors.join(", ")
            )))
        }
    }

    pub fn get_active_faults(&self) -> Vec<&InjectedFault> {
        self.injected_faults
            .values()
            .filter(|f| matches!(f.status, FaultStatus::Running))
            .collect()
    }

    pub fn get_fault(&self, fault_id: &str) -> Option<&InjectedFault> {
        self.injected_faults.get(fault_id)
    }

    fn generate_comment_tag(&self, fault_id: &str, suffix: &str) -> String {
        format!("chaos-platform:{}:{}", fault_id, suffix)
    }

    fn inject_network_partition(
        &self,
        params: &NetworkPartitionParams,
        fault_id: &str,
        rule_comment: &str,
    ) -> ChaosResult<(CleanupInfo, bool)> {
        let mut cleanup_commands = Vec::new();
        let mut network_rules = Vec::new();
        let mut iptables_chains = Vec::new();
        
        let protocol = match params.protocol {
            Some(ref p) => match p {
                crate::scenario::ProtocolType::TCP => "-p tcp",
                crate::scenario::ProtocolType::UDP => "-p udp",
                crate::scenario::ProtocolType::ICMP => "-p icmp",
                crate::scenario::ProtocolType::All => "",
            },
            None => "",
        };

        let ports_str = match &params.ports {
            Some(ports) => ports
                .iter()
                .map(|p| format!("--dport {}", p))
                .collect::<Vec<_>>()
                .join(" "),
            None => String::new(),
        };

        let comment_flag = format!("-m comment --comment \"{}\"", rule_comment);

        let inject_and_track = |chain: &str, rule_base: &str| {
            let inject_cmd = format!(
                "iptables -I {} {} {} -j DROP",
                chain, comment_flag, rule_base
            );
            let _ = self.execute_command(&inject_cmd);
            network_rules.push(inject_cmd.clone());
            
            let delete_cmd = format!(
                "iptables -D {} {} {} -j DROP",
                chain, comment_flag, rule_base
            );
            cleanup_commands.push(delete_cmd);
            
            iptables_chains.push(IptablesChainRule {
                chain: chain.to_string(),
                table: "filter".to_string(),
                comment: rule_comment.to_string(),
            });
        };

        let rule_without_comment = format!("{} {}", protocol, ports_str).trim().to_string();

        match params.direction {
            crate::scenario::PartitionDirection::Inbound => {
                inject_and_track("INPUT", &rule_without_comment);
            }
            crate::scenario::PartitionDirection::Outbound => {
                inject_and_track("OUTPUT", &rule_without_comment);
            }
            crate::scenario::PartitionDirection::Both => {
                inject_and_track("INPUT", &rule_without_comment);
                inject_and_track("OUTPUT", &rule_without_comment);
            }
        }

        if let Some(targets) = &params.targets {
            for target in targets {
                let target_comment = self.generate_comment_tag(fault_id, &format!("target:{}", target));
                let target_comment_flag = format!("-m comment --comment \"{}\"", target_comment);
                
                let inject_cmd = format!(
                    "iptables -I INPUT {} -s {} -j DROP",
                    target_comment_flag, target
                );
                let _ = self.execute_command(&inject_cmd);
                network_rules.push(inject_cmd.clone());
                
                let delete_cmd = format!(
                    "iptables -D INPUT {} -s {} -j DROP",
                    target_comment_flag, target
                );
                cleanup_commands.push(delete_cmd);
                
                iptables_chains.push(IptablesChainRule {
                    chain: "INPUT".to_string(),
                    table: "filter".to_string(),
                    comment: target_comment,
                });
            }
        }

        let persistent_files = self.save_iptables_persistence()?;

        let cleanup_info = CleanupInfo {
            commands: cleanup_commands,
            network_rules,
            processes: Vec::new(),
            tc_qdiscs: Vec::new(),
            dmsetup_devices: Vec::new(),
            iptables_chains,
            persistence_files: persistent_files,
        };

        Ok((cleanup_info, true))
    }

    fn inject_network_latency(
        &self,
        params: &NetworkLatencyParams,
        fault_id: &str,
        _rule_comment: &str,
    ) -> ChaosResult<(CleanupInfo, bool)> {
        let interface = params.interface.as_deref().unwrap_or("eth0");
        
        let handle = format!("10:{}", &fault_id[..4]);
        
        let mut netem_cmd = format!(
            "tc qdisc add dev {} root handle {} netem delay {}ms",
            interface, handle, params.latency_ms
        );
        
        if let Some(jitter) = params.jitter_ms {
            netem_cmd.push_str(&format!(" {}ms", jitter));
            if let Some(corr) = params.correlation_percent {
                netem_cmd.push_str(&format!(" {}%", corr));
            }
        }
        
        if let Some(loss) = params.loss_percent {
            netem_cmd.push_str(&format!(" loss {}%", loss));
        }

        let _ = self.execute_command(&netem_cmd);

        let cleanup_info = CleanupInfo {
            commands: vec![format!("tc qdisc del dev {} handle {} root 2>/dev/null || true", interface, handle)],
            network_rules: vec![netem_cmd],
            processes: Vec::new(),
            tc_qdiscs: vec![format!("{}:{}", interface, handle)],
            dmsetup_devices: Vec::new(),
            iptables_chains: Vec::new(),
            persistence_files: Vec::new(),
        };

        Ok((cleanup_info, true))
    }

    fn inject_cpu_stress(
        &self,
        params: &CPUStressParams,
        fault_id: &str,
        rule_comment: &str,
    ) -> ChaosResult<(CleanupInfo, bool)> {
        let mut cmd = "stress-ng ".to_string();
        
        if let Some(cores) = params.cpu_cores {
            cmd.push_str(&format!("--cpu {} ", cores));
        } else if let Some(load) = params.cpu_load {
            cmd.push_str(&format!("--cpu-load {} ", load));
        } else {
            cmd.push_str("--cpu 4 ");
        }
        
        if let Some(percent) = params.cpu_percent {
            cmd.push_str(&format!("--cpu-method all --cpu-load {} ", percent));
        }
        
        cmd.push_str(&format!("--timeout 3600 --name \"{}\"", rule_comment));

        let child = Command::new("nohup")
            .args(&["sh", "-c", &cmd])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();

        let pid = match child {
            Ok(mut c) => {
                let id = c.id();
                std::mem::forget(c);
                id
            }
            Err(_) => return Ok((CleanupInfo::default(), false)),
        };

        let cleanup_info = CleanupInfo {
            commands: vec![
                format!("pkill -f \"{}\" 2>/dev/null || true", rule_comment),
                format!("kill -9 {} 2>/dev/null || true", pid),
            ],
            network_rules: Vec::new(),
            processes: vec![pid],
            tc_qdiscs: Vec::new(),
            dmsetup_devices: Vec::new(),
            iptables_chains: Vec::new(),
            persistence_files: Vec::new(),
        };

        Ok((cleanup_info, true))
    }

    fn inject_memory_stress(
        &self,
        params: &MemoryStressParams,
        fault_id: &str,
        rule_comment: &str,
    ) -> ChaosResult<(CleanupInfo, bool)> {
        let mut cmd = "stress-ng ".to_string();
        
        if let Some(mb) = params.memory_mb {
            cmd.push_str(&format!("--vm-bytes {}M ", mb));
        } else if let Some(bytes) = params.vm_bytes {
            cmd.push_str(&format!("--vm-bytes {} ", bytes));
        } else {
            cmd.push_str("--vm-bytes 256M ");
        }
        
        let workers = params.workers.unwrap_or(2);
        cmd.push_str(&format!("--vm {} --vm-hang 0 ", workers));
        cmd.push_str(&format!("--timeout 3600 --name \"{}\"", rule_comment));

        let child = Command::new("nohup")
            .args(&["sh", "-c", &cmd])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();

        let pid = match child {
            Ok(mut c) => {
                let id = c.id();
                std::mem::forget(c);
                id
            }
            Err(_) => return Ok((CleanupInfo::default(), false)),
        };

        let cleanup_info = CleanupInfo {
            commands: vec![
                format!("pkill -f \"{}\" 2>/dev/null || true", rule_comment),
                format!("kill -9 {} 2>/dev/null || true", pid),
            ],
            network_rules: Vec::new(),
            processes: vec![pid],
            tc_qdiscs: Vec::new(),
            dmsetup_devices: Vec::new(),
            iptables_chains: Vec::new(),
            persistence_files: Vec::new(),
        };

        Ok((cleanup_info, true))
    }

    fn inject_disk_io(
        &self,
        params: &DiskIOParams,
        fault_id: &str,
        _rule_comment: &str,
    ) -> ChaosResult<(CleanupInfo, bool)> {
        let device = &params.device;
        let device_name = device.replace("/dev/", "");
        let dm_name = format!("chaos-{}", &fault_id[..8]);
        
        let mut dmsetup_devices = Vec::new();
        
        if params.read_delay_ms.is_some() || params.write_delay_ms.is_some() {
            let table = format!(
                "0 0 delay {} {} {}",
                device,
                params.read_delay_ms.unwrap_or(0),
                params.write_delay_ms.unwrap_or(0)
            );
            let delay_cmd = format!("echo '{}' | dmsetup create {}", table, dm_name);
            let _ = self.execute_command(&delay_cmd);
            dmsetup_devices.push(dm_name.clone());
        }

        if params.read_error_percent.is_some() || params.write_error_percent.is_some() {
            let error_dev = format!("chaos-error-{}", &fault_id[..8]);
            let error_cmd = format!("dmsetup create {} --table '0 0 error'", error_dev);
            let _ = self.execute_command(&error_cmd);
            dmsetup_devices.push(error_dev);
        }

        let mut cleanup_cmds = Vec::new();
        for dev in &dmsetup_devices {
            cleanup_cmds.push(format!("dmsetup remove {} 2>/dev/null || true", dev));
        }

        let cleanup_info = CleanupInfo {
            commands: cleanup_cmds,
            network_rules: Vec::new(),
            processes: Vec::new(),
            tc_qdiscs: Vec::new(),
            dmsetup_devices,
            iptables_chains: Vec::new(),
            persistence_files: Vec::new(),
        };

        Ok((cleanup_info, true))
    }

    fn inject_service_fault(
        &self,
        params: &ServiceFaultParams,
        fault_id: &str,
        rule_comment: &str,
    ) -> ChaosResult<(CleanupInfo, bool)> {
        let mut cleanup_commands = Vec::new();
        let mut network_rules = Vec::new();
        let mut iptables_chains = Vec::new();

        for (i, endpoint) in params.endpoints.iter().enumerate() {
            let endpoint_comment = self.generate_comment_tag(fault_id, &format!("endpoint:{}", i));
            let comment_flag = format!("-m comment --comment \"{}\"", endpoint_comment);
            
            let rule = match params.protocol {
                crate::scenario::ServiceProtocol::HTTP => {
                    format!(
                        "iptables -I OUTPUT {} -p tcp -d {} --dport 80 -j REJECT --reject-with tcp-reset",
                        comment_flag, endpoint
                    )
                }
                crate::scenario::ServiceProtocol::GRPC => {
                    format!(
                        "iptables -I OUTPUT {} -p tcp -d {} --dport 50051 -j REJECT",
                        comment_flag, endpoint
                    )
                }
            };
            
            let _ = self.execute_command(&rule);
            network_rules.push(rule.clone());
            
            let delete_rule = match params.protocol {
                crate::scenario::ServiceProtocol::HTTP => {
                    format!(
                        "iptables -D OUTPUT {} -p tcp -d {} --dport 80 -j REJECT --reject-with tcp-reset",
                        comment_flag, endpoint
                    )
                }
                crate::scenario::ServiceProtocol::GRPC => {
                    format!(
                        "iptables -D OUTPUT {} -p tcp -d {} --dport 50051 -j REJECT",
                        comment_flag, endpoint
                    )
                }
            };
            cleanup_commands.push(delete_rule);
            
            iptables_chains.push(IptablesChainRule {
                chain: "OUTPUT".to_string(),
                table: "filter".to_string(),
                comment: endpoint_comment,
            });
        }

        if let Some(timeout) = params.timeout_ms {
            let tc_comment = self.generate_comment_tag(fault_id, "tc-delay");
            let handle = format!("20:{}", &fault_id[..4]);
            let delay_cmd = format!(
                "tc qdisc add dev eth0 handle {} root netem delay {}ms",
                handle, timeout
            );
            let _ = self.execute_command(&delay_cmd);
            network_rules.push(delay_cmd.clone());
            cleanup_commands.push(format!(
                "tc qdisc del dev eth0 handle {} root 2>/dev/null || true",
                handle
            ));
        }

        let persistent_files = self.save_iptables_persistence()?;

        let cleanup_info = CleanupInfo {
            commands: cleanup_commands,
            network_rules,
            processes: Vec::new(),
            tc_qdiscs: Vec::new(),
            dmsetup_devices: Vec::new(),
            iptables_chains,
            persistence_files: persistent_files,
        };

        Ok((cleanup_info, true))
    }

    fn save_iptables_persistence(&self) -> ChaosResult<Vec<String>> {
        let mut saved_files = Vec::new();
        
        let persistence_locations = [
            "/etc/iptables/rules.v4",
            "/etc/sysconfig/iptables",
            "/var/lib/iptables/rules-save",
        ];
        
        let save_commands = [
            ("iptables-save", "/tmp/chaos-iptables-backup.v4"),
            ("ip6tables-save", "/tmp/chaos-iptables-backup.v6"),
        ];
        
        for (cmd, backup_path) in save_commands {
            let backup_cmd = format!("{} > {}", cmd, backup_path);
            if self.execute_command(&backup_cmd).unwrap_or(false) {
                saved_files.push(backup_path.to_string());
            }
        }
        
        for location in persistence_locations {
            if std::path::Path::new(location).exists() {
                let backup_cmd = format!("cp {} {}.chaos-backup", location, location);
                let _ = self.execute_command(&backup_cmd);
                saved_files.push(format!("{}.chaos-backup", location));
            }
        }
        
        Ok(saved_files)
    }

    fn cleanup_fault(&self, fault: &InjectedFault) -> ChaosResult<bool> {
        let mut all_successful = true;
        
        for cmd in &fault.cleanup_info.commands {
            match self.execute_command(cmd) {
                Ok(success) => {
                    if !success {
                        all_successful = false;
                    }
                }
                Err(_) => all_successful = false,
            }
        }
        
        for chain_rule in &fault.cleanup_info.iptables_chains {
            let success = self.delete_all_iptables_rules_with_comment(
                &chain_rule.chain,
                &chain_rule.table,
                &chain_rule.comment,
            );
            if !success {
                all_successful = false;
            }
        }
        
        for pid in &fault.cleanup_info.processes {
            let _ = self.execute_command(&format!("kill -9 {} 2>/dev/null || true", pid));
        }
        
        for qdisc in &fault.cleanup_info.tc_qdiscs {
            let parts: Vec<&str> = qdisc.split(':').collect();
            if parts.len() >= 2 {
                let _ = self.execute_command(&format!(
                    "tc qdisc del dev {} root 2>/dev/null || true",
                    parts[0]
                ));
            }
        }
        
        let verification = self.verify_iptables_cleanup(&fault.cleanup_info.iptables_chains);
        if !verification {
            all_successful = false;
        }
        
        self.cleanup_iptables_persistence()?;
        
        Ok(all_successful)
    }

    fn delete_all_iptables_rules_with_comment(
        &self,
        chain: &str,
        table: &str,
        comment: &str,
    ) -> bool {
        let mut all_deleted = true;
        let mut attempts = 0;
        let max_attempts = 10;
        
        while attempts < max_attempts {
            let list_cmd = format!(
                "iptables -t {} -L {} -n --line-numbers 2>/dev/null | grep -F '{}'",
                table, chain, comment
            );
            
            let output = if cfg!(target_os = "windows") {
                Command::new("cmd").args(&["/C", &list_cmd]).output()
            } else {
                Command::new("sh").args(&["-c", &list_cmd]).output()
            };
            
            match output {
                Ok(o) if !o.stdout.is_empty() => {
                    let lines = String::from_utf8_lossy(&o.stdout);
                    let line_numbers: Vec<&str> = lines
                        .lines()
                        .filter_map(|line| line.split_whitespace().next())
                        .collect();
                    
                    for line_num in line_numbers.iter().rev() {
                        let delete_cmd = format!(
                            "iptables -t {} -D {} {}",
                            table, chain, line_num
                        );
                        let _ = self.execute_command(&delete_cmd);
                    }
                    
                    attempts += 1;
                }
                _ => {
                    break;
                }
            }
            
            attempts += 1;
        }
        
        all_deleted
    }

    fn verify_iptables_cleanup(&self, rules: &[IptablesChainRule]) -> bool {
        for rule in rules {
            let check_cmd = format!(
                "iptables -t {} -L {} -n 2>/dev/null | grep -F '{}' | wc -l",
                rule.table, rule.chain, rule.comment
            );
            
            let output = if cfg!(target_os = "windows") {
                Command::new("cmd").args(&["/C", &check_cmd]).output()
            } else {
                Command::new("sh").args(&["-c", &check_cmd]).output()
            };
            
            if let Ok(o) = output {
                let count: usize = String::from_utf8_lossy(&o.stdout)
                    .trim()
                    .parse()
                    .unwrap_or(1);
                if count > 0 {
                    return false;
                }
            }
        }
        
        true
    }

    fn cleanup_iptables_persistence(&self) -> ChaosResult<()> {
        let persistence_locations = [
            "/etc/iptables/rules.v4",
            "/etc/sysconfig/iptables",
        ];
        
        for location in persistence_locations {
            let backup_path = format!("{}.chaos-backup", location);
            if std::path::Path::new(&backup_path).exists() {
                let restore_cmd = format!("cp {} {}", backup_path, location);
                let _ = self.execute_command(&restore_cmd);
                let _ = self.execute_command(&format!("rm -f {}", backup_path));
            }
        }
        
        let restore_commands = [
            ("iptables-restore", "/tmp/chaos-iptables-backup.v4"),
            ("ip6tables-restore", "/tmp/chaos-iptables-backup.v6"),
        ];
        
        for (cmd, backup_path) in restore_commands {
            if std::path::Path::new(backup_path).exists() {
                let restore_cmd = format!("{} < {}", cmd, backup_path);
                let _ = self.execute_command(&restore_cmd);
                let _ = self.execute_command(&format!("rm -f {}", backup_path));
            }
        }
        
        Ok(())
    }

    fn execute_command(&self, cmd: &str) -> ChaosResult<bool> {
        let output = if cfg!(target_os = "windows") {
            Command::new("cmd").args(&["/C", cmd]).output()
        } else {
            Command::new("sh").args(&["-c", cmd]).output()
        };

        match output {
            Ok(output) => {
                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    eprintln!("[WARN] Command failed: {} - {}", cmd, stderr);
                }
                Ok(output.status.success())
            }
            Err(e) => {
                eprintln!("[ERROR] Command execution error: {} - {}", cmd, e);
                Ok(false)
            }
        }
    }
}

fn fault_type_to_str(fault_type: &FaultType) -> &'static str {
    match fault_type {
        FaultType::NetworkPartition => "network-partition",
        FaultType::NetworkLatency => "network-latency",
        FaultType::CPUStress => "cpu-stress",
        FaultType::MemoryStress => "memory-stress",
        FaultType::DiskIO => "disk-io",
        FaultType::ServiceFault => "service-fault",
    }
}

impl Default for CleanupInfo {
    fn default() -> Self {
        CleanupInfo {
            commands: Vec::new(),
            network_rules: Vec::new(),
            processes: Vec::new(),
            tc_qdiscs: Vec::new(),
            dmsetup_devices: Vec::new(),
            iptables_chains: Vec::new(),
            persistence_files: Vec::new(),
        }
    }
}

impl Default for ChaosEngine {
    fn default() -> Self {
        Self::new()
    }
}
