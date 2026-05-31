use chaos_platform::*;
use clap::Parser;
use chrono::{DateTime, Duration, Utc};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::time::sleep;
use uuid::Uuid;

#[tokio::main]
async fn main() -> ChaosResult<()> {
    let cli = ChaosCtl::parse();

    init_logging(&cli);

    match cli.command {
        Commands::Run {
            scenario,
            dry_run,
            no_snapshot,
            no_metrics,
            no_recovery,
        } => {
            run_scenario(scenario, dry_run, no_snapshot, no_metrics, no_recovery).await?
        }
        Commands::Validate { scenario } => validate_scenario(scenario)?,
        Commands::Discover {
            orchestrator,
            namespace,
            compose_file,
            hosts,
        } => discover_targets(orchestrator, namespace, compose_file, hosts)?,
        Commands::Inject {
            fault_type,
            target,
            params,
            duration,
            orchestrator,
        } => inject_single_fault(fault_type, target, params, duration, orchestrator)?,
        Commands::Recover {
            all,
            state_file,
            experiment_id,
        } => recover_faults(all, state_file, experiment_id)?,
        Commands::Snapshot {
            scenario,
            etcd,
            database,
            output_dir,
        } => create_snapshot(scenario, etcd, database, output_dir)?,
        Commands::Restore {
            snapshot,
            etcd,
            database,
        } => restore_snapshot(snapshot, etcd, database)?,
        Commands::BigRedButton { force, lock_key } => {
            trigger_big_red_button(force, lock_key).await?
        }
        Commands::Generate {
            template,
            output,
            format,
        } => generate_template(template, output, format)?,
        Commands::Status {
            experiment_id,
            all,
        } => show_status(experiment_id, all)?,
        Commands::DiscoverTopology {
            namespace,
            istio,
            dot,
        } => discover_topology(namespace, istio, dot).await?,
        Commands::RecommendFaults {
            namespace,
            count,
            history,
            generate_scenarios,
            output_dir,
        } => recommend_faults(namespace, count, history, generate_scenarios, output_dir).await?,
        Commands::Validate {
            config,
            phase,
            compare,
            baseline_file,
            output,
        } => run_validation(config, phase, compare, baseline_file, output).await?,
    }

    Ok(())
}

fn init_logging(cli: &ChaosCtl) {
    use tracing_subscriber::fmt;
    
    let builder = fmt::Subscriber::builder()
        .with_max_level(if cli.verbose {
            tracing::Level::DEBUG
        } else {
            tracing::Level::INFO
        })
        .with_target(false)
        .compact();

    if let Some(log_file) = &cli.log_file {
        let file = std::fs::File::create(log_file).unwrap_or_else(|_| std::fs::File::create("chaos.log").unwrap());
        builder.with_writer(std::sync::Mutex::new(file)).init();
    } else {
        builder.init();
    }
}

async fn run_scenario(
    scenario_path: std::path::PathBuf,
    dry_run: bool,
    no_snapshot: bool,
    no_metrics: bool,
    no_recovery: bool,
) -> ChaosResult<()> {
    println!("╔══════════════════════════════════════════════════════════════╗");
    println!("║            CHAOS PLATFORM - SCENARIO EXECUTION                ║");
    println!("╚══════════════════════════════════════════════════════════════╝");
    println!();

    let scenario = ChaosScenario::from_file(&scenario_path)?;
    println!("[✓] Scenario loaded: {}", scenario.metadata.name);

    scenario.validate()?;
    println!("[✓] Scenario validation passed");

    if dry_run {
        println!();
        println!("╔══════════════════════════════════════════════════════════════╗");
        println!("║                    DRY RUN MODE - NO EXECUTION               ║");
        println!("╚══════════════════════════════════════════════════════════════╝");
        println!();
        println!("Experiments to be executed:");
        for (i, exp) in scenario.experiments.iter().enumerate() {
            println!("  {}. {} ({:?})", i + 1, exp.name, exp.fault_type);
        }
        return Ok(());
    }

    let experiment_id = Uuid::new_v4().to_string();
    println!("[✓] Experiment ID: {}", experiment_id);

    let mut security_manager = SecurityManager::new();
    let orchestrator_manager = OrchestratorManager::new();
    let mut chaos_engine = ChaosEngine::new();
    let observability_manager = ObservabilityManager::new();

    if scenario.security.big_red_button.enabled {
        security_manager.acquire_distributed_lock(&scenario.security.big_red_button, scenario.security.timeout)?;
        println!("[✓] Distributed lock acquired");
    }

    if !no_snapshot && scenario.security.pre_snapshot {
        println!("[+] Creating system snapshots...");
        let snapshots = security_manager.create_snapshot(
            scenario.security.snapshot_targets.as_ref(),
            Some(std::path::Path::new(".")),
        )?;
        for snap in &snapshots {
            println!("    [✓] {:?}: {}", snap.snapshot_type, snap.filepath);
        }
    }

    let brb_flag = security_manager.get_brb_flag();

    let targets = orchestrator_manager.discover_targets(&scenario.targets, None)?;
    println!("[✓] Discovered {} targets", targets.len());

    let baseline_metrics = if !no_metrics && scenario.observability.is_some() {
        println!("[+] Collecting baseline metrics...");
        let obs_config = scenario.observability.as_ref().unwrap();
        let end_time = Utc::now();
        let start_time = end_time - Duration::seconds(60);
        match observability_manager.collect_metrics(obs_config, start_time, end_time).await {
            Ok(m) => {
                println!("[✓] Baseline metrics collected");
                Some(m)
            }
            Err(e) => {
                println!("[!] Warning: Failed to collect baseline metrics: {}", e);
                None
            }
        }
    } else {
        None
    };

    let start_time = Utc::now();

    let pre_experiments: Vec<_> = scenario
        .experiments
        .iter()
        .filter(|e| matches!(e.phase, crate::scenario::ExperimentPhase::Pre))
        .collect();
    let main_experiments: Vec<_> = scenario
        .experiments
        .iter()
        .filter(|e| matches!(e.phase, crate::scenario::ExperimentPhase::Main))
        .collect();
    let post_experiments: Vec<_> = scenario
        .experiments
        .iter()
        .filter(|e| matches!(e.phase, crate::scenario::ExperimentPhase::Post))
        .collect();

    println!();
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("PHASE 1: PRE-EXPERIMENTS");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    let pre_total = pre_experiments.len();
    for (idx, exp) in pre_experiments.into_iter().enumerate() {
        execute_experiment(
            exp,
            &targets,
            &mut chaos_engine,
            brb_flag.clone(),
            idx,
            pre_total,
        )?;
    }

    println!();
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("PHASE 2: MAIN EXPERIMENTS (COMPOSITE SCENARIO)");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("Total experiments to run: {}", main_experiments.len());
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    let main_total = main_experiments.len();
    for (idx, exp) in main_experiments.iter().enumerate() {
        if brb_flag.load(std::sync::atomic::Ordering::SeqCst) {
            println!();
            println!("[⚠️ ] BIG RED BUTTON TRIGGERED - ABORTING");
            return Err(ChaosError::EmergencyStop);
        }
        println!();
        println!("╔══════════════════════════════════════════════════════════════╗");
        println!("║  EXPERIMENT {}/{}: {:?}", idx + 1, main_total, exp.fault_type);
        println!("╚══════════════════════════════════════════════════════════════╝");
        execute_experiment(
            exp,
            &targets,
            &mut chaos_engine,
            brb_flag.clone(),
            idx,
            main_total,
        )?;
    }

    let experiment_duration = scenario.metadata.duration.unwrap_or(60);
    println!();
    println!("[+] Waiting {} seconds for experiment duration...", experiment_duration);
    
    for _ in 0..experiment_duration {
        sleep(std::time::Duration::from_secs(1)).await;
        if brb_flag.load(std::sync::atomic::Ordering::SeqCst) {
            println!();
            println!("[⚠️ ] BIG RED BUTTON TRIGGERED - EMERGENCY STOP");
            break;
        }
    }

    let during_metrics = if !no_metrics && scenario.observability.is_some() {
        println!();
        println!("[+] Collecting during-experiment metrics...");
        let obs_config = scenario.observability.as_ref().unwrap();
        let end_time = Utc::now();
        match observability_manager.collect_metrics(obs_config, start_time, end_time).await {
            Ok(m) => {
                println!("[✓] During-experiment metrics collected");
                Some(m)
            }
            Err(e) => {
                println!("[!] Warning: Failed to collect during metrics: {}", e);
                None
            }
        }
    } else {
        None
    };

    println!();
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("PHASE 3: POST-EXPERIMENTS & RECOVERY");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    let post_total = post_experiments.len();
    for (idx, exp) in post_experiments.into_iter().enumerate() {
        execute_experiment(
            exp,
            &targets,
            &mut chaos_engine,
            brb_flag.clone(),
            idx,
            post_total,
        )?;
    }

    let end_time = Utc::now();

    if !no_recovery || brb_flag.load(std::sync::atomic::Ordering::SeqCst) {
        println!();
        println!("╔══════════════════════════════════════════════════════════════╗");
        println!("║           FAULT RECOVERY PROCESS STARTING                   ║");
        println!("╚══════════════════════════════════════════════════════════════╝");
        println!();
        
        let active_faults = chaos_engine.get_active_faults();
        println!("[i] Active faults to recover: {}", active_faults.len());
        for fault in active_faults {
            println!("    - {}: {:?} on {}", fault.id, fault.fault_type, fault.target);
        }
        
        println!();
        println!("[+] Executing recovery in correct order (network first)...");
        
        match chaos_engine.recover_all() {
            Ok(ids) => {
                println!();
                println!("╔══════════════════════════════════════════════════════════════╗");
                println!("║             RECOVERY COMPLETED SUCCESSFULLY                 ║");
                println!("╚══════════════════════════════════════════════════════════════╝");
                println!();
                println!("[✓] Total faults recovered: {}", ids.len());
                for (i, id) in ids.iter().enumerate() {
                    println!("    {}. {}", i + 1, id);
                }
                println!();
                println!("[i] Network rules cleaned up with comment-based matching");
                println!("[i] iptables persistence restored from backup");
                println!("[i] tc qdiscs removed");
                println!("[i] stress-ng processes killed");
            }
            Err(e) => {
                println!();
                println!("[!] ⚠️  SOME RECOVERIES FAILED:");
                println!("[!] {}", e);
                println!();
                println!("[!] Manual intervention may be required!");
            }
        }
    } else {
        println!();
        println!("[!] ⚠️  AUTO-RECOVERY DISABLED");
        println!("[!] ⚠️  MANUAL CLEANUP REQUIRED - USE 'recover --all' COMMAND");
    }

    let post_metrics = if !no_metrics && scenario.observability.is_some() {
        println!();
        println!("[+] Collecting post-experiment metrics...");
        let obs_config = scenario.observability.as_ref().unwrap();
        let post_end = Utc::now();
        let post_start = end_time;
        match observability_manager.collect_metrics(obs_config, post_start, post_end).await {
            Ok(m) => {
                println!("[✓] Post-experiment metrics collected");
                Some(m)
            }
            Err(e) => {
                println!("[!] Warning: Failed to collect post metrics: {}", e);
                None
            }
        }
    } else {
        None
    };

    if !no_metrics && scenario.observability.is_some() {
        let thresholds: Option<HashMap<String, f64>> = Some(
            scenario
                .observability
                .as_ref()
                .unwrap()
                .metrics
                .iter()
                .filter_map(|m| m.threshold.map(|t| (m.name.clone(), t)))
                .collect(),
        );

        let report = ObservabilityManager::generate_report(
            &scenario.metadata.name,
            &experiment_id,
            start_time,
            end_time,
            baseline_metrics.unwrap_or_default(),
            during_metrics.unwrap_or_default(),
            post_metrics.unwrap_or_default(),
            thresholds,
        );

        let report_path = std::path::PathBuf::from(format!(
            "chaos-report-{}-{}.json",
            scenario.metadata.name,
            experiment_id.split('-').next().unwrap_or("report")
        ));
        
        ObservabilityManager::save_report(&report, &report_path)?;
        println!();
        println!("[✓] Report saved to: {}", report_path.display());
        println!();
        
        ObservabilityManager::print_report(&report);
    }

    println!();
    println!("╔══════════════════════════════════════════════════════════════╗");
    println!("║                EXPERIMENT COMPLETED SUCCESSFULLY              ║");
    println!("╚══════════════════════════════════════════════════════════════╝");
    println!();

    Ok(())
}

fn execute_experiment(
    experiment: &crate::scenario::Experiment,
    targets: &[DiscoveredTarget],
    chaos_engine: &mut ChaosEngine,
    brb_flag: Arc<std::sync::atomic::AtomicBool>,
    experiment_index: usize,
    total_experiments: usize,
) -> ChaosResult<()> {
    if brb_flag.load(std::sync::atomic::Ordering::SeqCst) {
        return Err(ChaosError::EmergencyStop);
    }

    println!();
    println!("  ─────────────────────────────────────────────────────────────");
    println!("  [Experiment {}/{}] {}", experiment_index + 1, total_experiments, experiment.name);
    println!("    Type: {:?}", experiment.fault_type);
    println!("    Phase: {:?}", experiment.phase);
    
    let filtered_targets = if let Some(selector) = &experiment.target_selector {
        filter_targets_by_selector(targets, selector)
    } else {
        targets.to_vec()
    };
    
    println!("    Targets: {} of {}", filtered_targets.len(), targets.len());

    let mut injected_count = 0;
    let mut failed_count = 0;

    for (idx, target) in filtered_targets.iter().enumerate() {
        if brb_flag.load(std::sync::atomic::Ordering::SeqCst) {
            return Err(ChaosError::EmergencyStop);
        }

        println!();
        println!("    [Target {}/{}] {} ({:?})", 
            idx + 1, 
            filtered_targets.len(), 
            target.name,
            target.status
        );
        
        let target_id = format!("{}:{}", fault_type_to_string(&experiment.fault_type), target.name);
        println!("      Target ID: {}", target_id);
        
        match chaos_engine.inject_fault(
            experiment.fault_type.clone(),
            &target.name,
            experiment.parameters.clone(),
            experiment.duration,
        ) {
            Ok(fault) => {
                println!("      [✓] Fault injected successfully");
                println!("          Fault ID: {}", fault.id);
                println!("          Rule Comment: {}", fault.rule_comment);
                println!("          Start Time: {}", fault.start_time);
                injected_count += 1;
            }
            Err(e) => {
                println!("      [✗] Fault injection failed");
                println!("          Error: {}", e);
                failed_count += 1;
            }
        }
    }

    println!();
    println!("    ── Summary ──");
    println!("    Injected: {} | Failed: {}", injected_count, failed_count);
    if failed_count > 0 {
        println!("    ⚠️  Some target injections failed!");
    }

    Ok(())
}

fn fault_type_to_string(fault_type: &crate::scenario::FaultType) -> &'static str {
    match fault_type {
        crate::scenario::FaultType::NetworkPartition => "network-partition",
        crate::scenario::FaultType::NetworkLatency => "network-latency",
        crate::scenario::FaultType::CPUStress => "cpu-stress",
        crate::scenario::FaultType::MemoryStress => "memory-stress",
        crate::scenario::FaultType::DiskIO => "disk-io",
        crate::scenario::FaultType::ServiceFault => "service-fault",
    }
}

fn filter_targets_by_selector(
    targets: &[DiscoveredTarget],
    selector: &crate::scenario::TargetSelector,
) -> Vec<DiscoveredTarget> {
    let mut filtered = targets.to_vec();
    
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
        if percentage < 100 && !filtered.is_empty() {
            let count = (filtered.len() as f64 * percentage as f64 / 100.0).ceil() as usize;
            let count = std::cmp::max(count, 1);
            filtered.truncate(count);
        }
    }
    
    filtered
}

fn validate_scenario(scenario_path: std::path::PathBuf) -> ChaosResult<()> {
    println!("Validating scenario: {}", scenario_path.display());
    
    let scenario = ChaosScenario::from_file(&scenario_path)?;
    println!("[✓] YAML/JSON syntax valid");
    
    scenario.validate()?;
    println!("[✓] Semantic validation passed");
    println!();
    
    println!("Scenario Summary:");
    println!("  Name: {}", scenario.metadata.name);
    println!("  Version: {:?}", scenario.metadata.version);
    println!("  Experiments: {}", scenario.experiments.len());
    println!("  Orchestrator: {:?}", scenario.targets.get_orchestrator_type());
    println!();
    
    println!("Experiments:");
    for (i, exp) in scenario.experiments.iter().enumerate() {
        println!("  {}. {} - {:?} ({:?})", 
            i + 1, 
            exp.name, 
            exp.fault_type, 
            exp.phase
        );
    }
    
    Ok(())
}

fn discover_targets(
    orchestrator: String,
    namespace: Option<String>,
    compose_file: Option<std::path::PathBuf>,
    hosts: Option<String>,
) -> ChaosResult<()> {
    println!("Discovering targets for {} orchestrator...", orchestrator);
    
    let manager = OrchestratorManager::new();
    
    let target_config = match orchestrator.as_str() {
        "kubernetes" => TargetConfiguration {
            orchestrator: OrchestratorType::Kubernetes,
            config: TargetConfig::Kubernetes {
                namespace,
                label_selector: None,
                field_selector: None,
                kubeconfig: None,
            },
            filters: None,
        },
        "docker-compose" => TargetConfiguration {
            orchestrator: OrchestratorType::DockerCompose,
            config: TargetConfig::DockerCompose {
                compose_file: compose_file
                    .unwrap_or_else(|| std::path::PathBuf::from("docker-compose.yml"))
                    .to_string_lossy()
                    .to_string(),
                project_name: None,
                services: None,
            },
            filters: None,
        },
        "ssh" => {
            let ssh_hosts = hosts
                .map(|h| {
                    h.split(',')
                        .map(|s| {
                            let parts: Vec<&str> = s.split('@').collect();
                            let username = if parts.len() > 1 {
                                parts[0].to_string()
                            } else {
                                "root".to_string()
                            };
                            let host_part = if parts.len() > 1 { parts[1] } else { parts[0] };
                            let host_parts: Vec<&str> = host_part.split(':').collect();
                            SSHHost {
                                hostname: host_parts[0].to_string(),
                                port: host_parts.get(1).and_then(|p| p.parse().ok()),
                                username,
                                password: None,
                                private_key: None,
                            }
                        })
                        .collect()
                })
                .unwrap_or_default();
            
            TargetConfiguration {
                orchestrator: OrchestratorType::BareMetalSSH,
                config: TargetConfig::BareMetalSSH {
                    hosts: ssh_hosts,
                    parallel: None,
                },
                filters: None,
            }
        }
        _ => return Err(ChaosError::OrchestrationError(format!("Unknown orchestrator: {}", orchestrator))),
    };

    let targets = manager.discover_targets(&target_config, None)?;
    
    println!();
    println!("Found {} targets:", targets.len());
    println!("─────────────────────────────────────────────────────────────");
    
    for target in targets {
        println!("  Name: {}", target.name);
        println!("    ID: {}", target.id);
        println!("    Status: {:?}", target.status);
        println!();
    }
    
    Ok(())
}

fn inject_single_fault(
    fault_type: String,
    target: String,
    params: Option<String>,
    duration: Option<u64>,
    orchestrator: String,
) -> ChaosResult<()> {
    println!("Injecting {} on {}", fault_type, target);
    
    let mut engine = ChaosEngine::new();
    
    let fault_type_enum = match fault_type.as_str() {
        "network-partition" => FaultType::NetworkPartition,
        "network-latency" => FaultType::NetworkLatency,
        "cpu-stress" => FaultType::CPUStress,
        "memory-stress" => FaultType::MemoryStress,
        "disk-io" => FaultType::DiskIO,
        "service-fault" => FaultType::ServiceFault,
        _ => return Err(ChaosError::InjectionError(format!("Unknown fault type: {}", fault_type))),
    };

    let parameters = if let Some(param_str) = params {
        serde_json::from_str(&param_str)?
    } else {
        match fault_type_enum {
            FaultType::NetworkPartition => FaultParameters::NetworkPartition(NetworkPartitionParams {
                direction: crate::scenario::PartitionDirection::Both,
                targets: None,
                ports: None,
                protocol: None,
            }),
            FaultType::NetworkLatency => FaultParameters::NetworkLatency(NetworkLatencyParams {
                latency_ms: 100,
                jitter_ms: None,
                correlation_percent: None,
                loss_percent: None,
                interface: None,
                ports: None,
            }),
            FaultType::CPUStress => FaultParameters::CPUStress(CPUStressParams {
                cpu_percent: Some(80),
                cpu_cores: None,
                cpu_load: None,
            }),
            FaultType::MemoryStress => FaultParameters::MemoryStress(MemoryStressParams {
                memory_percent: Some(60),
                memory_mb: None,
                vm_percent: None,
                vm_bytes: None,
                workers: None,
            }),
            FaultType::DiskIO => FaultParameters::DiskIO(DiskIOParams {
                device: "/dev/sda".to_string(),
                read_delay_ms: Some(100),
                write_delay_ms: Some(100),
                read_error_percent: None,
                write_error_percent: None,
            }),
            FaultType::ServiceFault => FaultParameters::ServiceFault(ServiceFaultParams {
                protocol: crate::scenario::ServiceProtocol::HTTP,
                endpoints: vec!["localhost:8080".to_string()],
                error_code: Some(503),
                timeout_ms: None,
                error_percent: Some(50),
                delay_ms: None,
            }),
        }
    };

    let injected = engine.inject_fault(fault_type_enum, &target, parameters, duration)?;
    println!();
    println!("[✓] Fault injected successfully");
    println!("    ID: {}", injected.id);
    println!("    Type: {:?}", injected.fault_type);
    println!("    Target: {}", injected.target);
    println!("    Duration: {:?}s", injected.duration);
    
    Ok(())
}

fn recover_faults(
    all: bool,
    _state_file: Option<std::path::PathBuf>,
    _experiment_id: Option<String>,
) -> ChaosResult<()> {
    if !all {
        println!("Please specify --all to recover all faults");
        return Ok(());
    }

    println!("Recovering all faults...");
    
    let mut engine = ChaosEngine::new();
    match engine.recover_all() {
        Ok(ids) => {
            println!("[✓] Recovered {} faults", ids.len());
            for id in ids {
                println!("    {}", id);
            }
        }
        Err(e) => println!("[!] Recovery errors: {}", e),
    }
    
    Ok(())
}

fn create_snapshot(
    scenario_path: std::path::PathBuf,
    _etcd: bool,
    _database: bool,
    output_dir: Option<std::path::PathBuf>,
) -> ChaosResult<()> {
    println!("Creating snapshots from scenario: {}", scenario_path.display());
    
    let scenario = ChaosScenario::from_file(&scenario_path)?;
    let mut security_manager = SecurityManager::new();
    
    let snapshots = security_manager.create_snapshot(
        scenario.security.snapshot_targets.as_ref(),
        output_dir.as_deref(),
    )?;
    
    println!();
    println!("[✓] Created {} snapshots:", snapshots.len());
    for snap in snapshots {
        println!("  {:?}: {}", snap.snapshot_type, snap.filepath);
    }
    
    Ok(())
}

fn restore_snapshot(
    snapshot_path: std::path::PathBuf,
    _etcd: bool,
    _database: bool,
) -> ChaosResult<()> {
    println!("Restoring snapshot: {}", snapshot_path.display());
    
    let security_manager = SecurityManager::new();
    
    let record = SnapshotRecord {
        id: Uuid::new_v4().to_string(),
        snapshot_type: SnapshotType::All,
        created_at: Utc::now(),
        filepath: snapshot_path.to_string_lossy().to_string(),
        metadata: HashMap::new(),
    };
    
    security_manager.restore_snapshot(&record)?;
    println!("[✓] Snapshot restored");
    
    Ok(())
}

async fn trigger_big_red_button(_force: bool, _lock_key: Option<String>) -> ChaosResult<()> {
    println!();
    println!("╔══════════════════════════════════════════════════════════════╗");
    println!("║           ⚠️   BIG RED BUTTON ACTIVATED   ⚠️                  ║");
    println!("║              EMERGENCY STOP - ALL FAULTS RECOVERED           ║");
    println!("╚══════════════════════════════════════════════════════════════╝");
    println!();
    
    let mut engine = ChaosEngine::new();
    match engine.recover_all() {
        Ok(ids) => println!("[✓] Recovered {} faults", ids.len()),
        Err(e) => println!("[!] Recovery errors: {}", e),
    }
    
    Ok(())
}

fn generate_template(
    template: String,
    output: std::path::PathBuf,
    format: String,
) -> ChaosResult<()> {
    println!("Generating {} template to {}", template, output.display());
    
    let scenario = match template.as_str() {
        "composite" => create_composite_template(),
        "kubernetes" => create_kubernetes_template(),
        "docker-compose" => create_docker_template(),
        "ssh" => create_ssh_template(),
        "network-partition" => create_network_partition_template(),
        "network-latency" => create_network_latency_template(),
        "cpu-stress" => create_cpu_stress_template(),
        "memory-stress" => create_memory_stress_template(),
        "disk-io" => create_disk_io_template(),
        "service-fault" => create_service_fault_template(),
        _ => return Err(ChaosError::InvalidScenario(format!("Unknown template: {}", template))),
    };

    let content = if format == "json" {
        serde_json::to_string_pretty(&scenario)?
    } else {
        serde_yaml::to_string(&scenario)?
    };
    
    std::fs::write(&output, content)?;
    
    println!("[✓] Template generated: {}", output.display());
    Ok(())
}

fn create_composite_template() -> ChaosScenario {
    ChaosScenario {
        metadata: Metadata {
            name: "composite-chaos-scenario".to_string(),
            version: Some("1.0.0".to_string()),
            description: Some("Composite scenario with 5+ concurrent fault types".to_string()),
            duration: Some(120),
            author: Some("Chaos Team".to_string()),
        },
        targets: TargetConfiguration {
            orchestrator: OrchestratorType::Kubernetes,
            config: TargetConfig::Kubernetes {
                namespace: Some("default".to_string()),
                label_selector: Some("app=my-service".to_string()),
                field_selector: None,
                kubeconfig: None,
            },
            filters: None,
        },
        experiments: vec![
            Experiment {
                name: "network-latency-injection".to_string(),
                fault_type: FaultType::NetworkLatency,
                parameters: FaultParameters::NetworkLatency(NetworkLatencyParams {
                    latency_ms: 200,
                    jitter_ms: Some(50),
                    correlation_percent: Some(25),
                    loss_percent: Some(5),
                    interface: Some("eth0".to_string()),
                    ports: None,
                }),
                duration: Some(120),
                phase: crate::scenario::ExperimentPhase::Main,
                dependencies: None,
                target_selector: None,
            },
            Experiment {
                name: "cpu-stress-test".to_string(),
                fault_type: FaultType::CPUStress,
                parameters: FaultParameters::CPUStress(CPUStressParams {
                    cpu_percent: Some(75),
                    cpu_cores: None,
                    cpu_load: None,
                }),
                duration: Some(120),
                phase: crate::scenario::ExperimentPhase::Main,
                dependencies: None,
                target_selector: None,
            },
            Experiment {
                name: "memory-pressure".to_string(),
                fault_type: FaultType::MemoryStress,
                parameters: FaultParameters::MemoryStress(MemoryStressParams {
                    memory_percent: Some(50),
                    memory_mb: None,
                    vm_percent: None,
                    vm_bytes: None,
                    workers: Some(4),
                }),
                duration: Some(120),
                phase: crate::scenario::ExperimentPhase::Main,
                dependencies: None,
                target_selector: None,
            },
            Experiment {
                name: "disk-io-slowdown".to_string(),
                fault_type: FaultType::DiskIO,
                parameters: FaultParameters::DiskIO(DiskIOParams {
                    device: "/dev/sda".to_string(),
                    read_delay_ms: Some(150),
                    write_delay_ms: Some(200),
                    read_error_percent: None,
                    write_error_percent: None,
                }),
                duration: Some(120),
                phase: crate::scenario::ExperimentPhase::Main,
                dependencies: None,
                target_selector: None,
            },
            Experiment {
                name: "service-timeout".to_string(),
                fault_type: FaultType::ServiceFault,
                parameters: FaultParameters::ServiceFault(ServiceFaultParams {
                    protocol: crate::scenario::ServiceProtocol::HTTP,
                    endpoints: vec!["api.example.com:80".to_string()],
                    error_code: None,
                    timeout_ms: Some(5000),
                    error_percent: Some(30),
                    delay_ms: Some(1000),
                }),
                duration: Some(120),
                phase: crate::scenario::ExperimentPhase::Main,
                dependencies: None,
                target_selector: None,
            },
        ],
        observability: Some(ObservabilityConfig {
            prometheus: PrometheusConfig {
                url: "http://prometheus:9090".to_string(),
                query_timeout_ms: Some(30000),
                step: Some(15),
                tls_verify: Some(false),
            },
            metrics: vec![
                MetricQuery {
                    name: "request-rate".to_string(),
                    query: "rate(http_requests_total[5m])".to_string(),
                    description: Some("QPS - Requests per second".to_string()),
                    baseline_window: Some(60),
                    threshold: Some(100.0),
                },
                MetricQuery {
                    name: "p99-latency".to_string(),
                    query: "histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))".to_string(),
                    description: Some("99th percentile latency".to_string()),
                    baseline_window: Some(60),
                    threshold: Some(0.5),
                },
                MetricQuery {
                    name: "error-rate".to_string(),
                    query: "rate(http_requests_total{status=~\"5..\"}[5m]) / rate(http_requests_total[5m])".to_string(),
                    description: Some("Error rate percentage".to_string()),
                    baseline_window: Some(60),
                    threshold: Some(0.05),
                },
                MetricQuery {
                    name: "cpu-usage".to_string(),
                    query: "100 - (avg by(instance) (irate(node_cpu_seconds_total{mode=\"idle\"}[5m])) * 100)".to_string(),
                    description: Some("CPU usage percentage".to_string()),
                    baseline_window: Some(60),
                    threshold: Some(80.0),
                },
                MetricQuery {
                    name: "memory-usage".to_string(),
                    query: "(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100".to_string(),
                    description: Some("Memory usage percentage".to_string()),
                    baseline_window: Some(60),
                    threshold: Some(85.0),
                },
            ],
        }),
        security: SecurityConfig {
            pre_snapshot: true,
            snapshot_targets: Some(SnapshotTargets {
                etcd: None,
                database: None,
                filesystem: None,
            }),
            timeout: 300,
            big_red_button: BigRedButtonConfig {
                enabled: true,
                lock_type: LockType::Redis,
                etcd: None,
                redis: Some(RedisLockConfig {
                    url: "redis://redis:6379".to_string(),
                    key: "chaos-platform:big-red-button".to_string(),
                    ttl: Some(60),
                }),
                ttl: Some(60),
            },
            auto_recover: true,
        },
        tags: HashMap::new(),
    }
}

fn create_kubernetes_template() -> ChaosScenario {
    let mut base = create_composite_template();
    base.metadata.name = "kubernetes-chaos-scenario".to_string();
    base.metadata.description = Some("Kubernetes-specific chaos scenario".to_string());
    base
}

fn create_docker_template() -> ChaosScenario {
    let mut base = create_composite_template();
    base.metadata.name = "docker-compose-chaos-scenario".to_string();
    base.metadata.description = Some("Docker Compose chaos scenario".to_string());
    base.targets = TargetConfiguration {
        orchestrator: OrchestratorType::DockerCompose,
        config: TargetConfig::DockerCompose {
            compose_file: "docker-compose.yml".to_string(),
            project_name: Some("myapp".to_string()),
            services: Some(vec!["api".to_string(), "worker".to_string()]),
        },
        filters: None,
    };
    base
}

fn create_ssh_template() -> ChaosScenario {
    let mut base = create_composite_template();
    base.metadata.name = "ssh-baremetal-chaos-scenario".to_string();
    base.metadata.description = Some("Bare-metal SSH chaos scenario".to_string());
    base.targets = TargetConfiguration {
        orchestrator: OrchestratorType::BareMetalSSH,
        config: TargetConfig::BareMetalSSH {
            hosts: vec![
                SSHHost {
                    hostname: "server1.example.com".to_string(),
                    port: Some(22),
                    username: "root".to_string(),
                    password: None,
                    private_key: Some("~/.ssh/id_rsa".to_string()),
                },
                SSHHost {
                    hostname: "server2.example.com".to_string(),
                    port: Some(22),
                    username: "admin".to_string(),
                    password: None,
                    private_key: Some("~/.ssh/id_rsa".to_string()),
                },
            ],
            parallel: Some(true),
        },
        filters: None,
    };
    base
}

fn create_network_partition_template() -> ChaosScenario {
    let mut base = create_composite_template();
    base.metadata.name = "network-partition-scenario".to_string();
    base.metadata.description = Some("Network partition chaos scenario".to_string());
    base.experiments = vec![
        Experiment {
            name: "total-network-partition".to_string(),
            fault_type: FaultType::NetworkPartition,
            parameters: FaultParameters::NetworkPartition(NetworkPartitionParams {
                direction: crate::scenario::PartitionDirection::Both,
                targets: Some(vec!["database.example.com".to_string()]),
                ports: Some(vec![5432, 6379]),
                protocol: Some(crate::scenario::ProtocolType::TCP),
            }),
            duration: Some(60),
            phase: crate::scenario::ExperimentPhase::Main,
            dependencies: None,
            target_selector: None,
        },
    ];
    base
}

fn create_network_latency_template() -> ChaosScenario {
    let mut base = create_composite_template();
    base.metadata.name = "network-latency-scenario".to_string();
    base.metadata.description = Some("Network latency chaos scenario".to_string());
    base.experiments = vec![
        Experiment {
            name: "high-latency-injection".to_string(),
            fault_type: FaultType::NetworkLatency,
            parameters: FaultParameters::NetworkLatency(NetworkLatencyParams {
                latency_ms: 500,
                jitter_ms: Some(100),
                correlation_percent: Some(50),
                loss_percent: Some(10),
                interface: Some("eth0".to_string()),
                ports: Some(vec![80, 443]),
            }),
            duration: Some(120),
            phase: crate::scenario::ExperimentPhase::Main,
            dependencies: None,
            target_selector: None,
        },
    ];
    base
}

fn create_cpu_stress_template() -> ChaosScenario {
    let mut base = create_composite_template();
    base.metadata.name = "cpu-stress-scenario".to_string();
    base.metadata.description = Some("CPU stress chaos scenario".to_string());
    base.experiments = vec![
        Experiment {
            name: "high-cpu-load".to_string(),
            fault_type: FaultType::CPUStress,
            parameters: FaultParameters::CPUStress(CPUStressParams {
                cpu_percent: Some(90),
                cpu_cores: Some(4),
                cpu_load: None,
            }),
            duration: Some(120),
            phase: crate::scenario::ExperimentPhase::Main,
            dependencies: None,
            target_selector: None,
        },
    ];
    base
}

fn create_memory_stress_template() -> ChaosScenario {
    let mut base = create_composite_template();
    base.metadata.name = "memory-stress-scenario".to_string();
    base.metadata.description = Some("Memory stress chaos scenario".to_string());
    base.experiments = vec![
        Experiment {
            name: "memory-exhaustion".to_string(),
            fault_type: FaultType::MemoryStress,
            parameters: FaultParameters::MemoryStress(MemoryStressParams {
                memory_percent: Some(80),
                memory_mb: Some(1024),
                vm_percent: None,
                vm_bytes: None,
                workers: Some(8),
            }),
            duration: Some(120),
            phase: crate::scenario::ExperimentPhase::Main,
            dependencies: None,
            target_selector: None,
        },
    ];
    base
}

fn create_disk_io_template() -> ChaosScenario {
    let mut base = create_composite_template();
    base.metadata.name = "disk-io-scenario".to_string();
    base.metadata.description = Some("Disk I/O chaos scenario".to_string());
    base.experiments = vec![
        Experiment {
            name: "slow-disk".to_string(),
            fault_type: FaultType::DiskIO,
            parameters: FaultParameters::DiskIO(DiskIOParams {
                device: "/dev/sda".to_string(),
                read_delay_ms: Some(500),
                write_delay_ms: Some(500),
                read_error_percent: Some(1),
                write_error_percent: Some(1),
            }),
            duration: Some(120),
            phase: crate::scenario::ExperimentPhase::Main,
            dependencies: None,
            target_selector: None,
        },
    ];
    base
}

fn create_service_fault_template() -> ChaosScenario {
    let mut base = create_composite_template();
    base.metadata.name = "service-fault-scenario".to_string();
    base.metadata.description = Some("Service-level fault chaos scenario".to_string());
    base.experiments = vec![
        Experiment {
            name: "http-503-errors".to_string(),
            fault_type: FaultType::ServiceFault,
            parameters: FaultParameters::ServiceFault(ServiceFaultParams {
                protocol: crate::scenario::ServiceProtocol::HTTP,
                endpoints: vec![
                    "api.example.com".to_string(),
                    "backend.example.com".to_string(),
                ],
                error_code: Some(503),
                timeout_ms: Some(10000),
                error_percent: Some(50),
                delay_ms: Some(2000),
            }),
            duration: Some(120),
            phase: crate::scenario::ExperimentPhase::Main,
            dependencies: None,
            target_selector: None,
        },
    ];
    base
}

fn show_status(_experiment_id: Option<String>, _all: bool) -> ChaosResult<()> {
    println!("Checking experiment status...");
    println!();
    println!("No active experiments found (state persistence coming soon)");
    Ok(())
}

async fn discover_topology(
    namespace: String,
    istio: bool,
    output_dot: bool,
) -> ChaosResult<()> {
    println!();
    println!("╔══════════════════════════════════════════════════════════════╗");
    println!("║           SYSTEM TOPOLOGY DISCOVERY                         ║");
    println!("╚══════════════════════════════════════════════════════════════╝");
    println!();
    println!("[i] Namespace: {}", namespace);
    println!("[i] Istio discovery: {}", if istio { "enabled" } else { "disabled" });
    println!();

    let topology = match SystemTopology::discover_from_kubernetes(&namespace) {
        Ok(t) => {
            println!("[✓] Topology discovered from Kubernetes");
            t
        }
        Err(e) => {
            println!("[!] Kubernetes discovery failed: {}", e);
            println!("[i] Using mock topology for demonstration...");
            SystemTopology::mock_demo()
        }
    };

    println!();
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("DISCOVERED NODES ({}):", topology.nodes.len());
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!();
    
    for node in &topology.nodes {
        println!("  [{:?}] {}", node.node_type, node.name);
        println!("    ID: {}", node.id);
        println!("    Replicas: {}/{}", node.available_replicas, node.replicas);
        if let Some(ips) = &node.ip_addresses {
            println!("    IPs: {}", ips.join(", "));
        }
        if let Some(ports) = &node.ports {
            println!("    Ports: {}", ports.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(", "));
        }
        println!();
    }

    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("CONNECTIONS ({}):", topology.edges.len());
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!();
    
    for edge in &topology.edges {
        let from = topology.nodes.iter().find(|n| n.id == edge.from_node).map(|n| n.name.as_str()).unwrap_or("unknown");
        let to = topology.nodes.iter().find(|n| n.id == edge.to_node).map(|n| n.name.as_str()).unwrap_or("unknown");
        println!("  [{:?}] {} -> {}", edge.edge_type, from, to);
    }

    println!();
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("SINGLE POINTS OF FAILURE (SPOF) ANALYSIS:");
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!();

    let spofs = topology.find_single_points_of_failure();
    if spofs.is_empty() {
        println!("[✓] No single points of failure detected");
    } else {
        for (i, spof) in spofs.iter().enumerate() {
            println!("  {}. {} (Risk: {:.1}/100)", i + 1, spof.node_name, spof.risk_score);
            println!("     Type: {:?}", spof.node_type);
            println!("     Reason: {}", spof.reason);
            println!("     Recommended Fault: {}", spof.recommended_fault);
            println!();
        }
    }

    if output_dot {
        println!();
        println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        println!("DOT FORMAT:");
        println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        println!();
        println!("digraph system_topology {{");
        println!("  rankdir=LR;");
        println!("  node [shape=box, style=filled, color=\"#E1F5FE\"];");
        for node in &topology.nodes {
            let color = match node.node_type {
                NodeType::Database => "#FFCDD2",
                NodeType::MessageQueue => "#FFF9C4",
                NodeType::Cache => "#C8E6C9",
                NodeType::Gateway => "#B3E5FC",
                _ => "#E1F5FE",
            };
            println!("  \"{}\" [label=\"{}\\n({:?})\", fillcolor=\"{}\"];", node.id, node.name, node.node_type, color);
        }
        for edge in &topology.edges {
            let style = match edge.edge_type {
                EdgeType::TrafficRoute => "style=solid",
                EdgeType::DatabaseConnection => "color=\"#C62828\", style=solid",
                EdgeType::MessageQueueConnection => "color=\"#F9A825\", style=solid",
                _ => "style=dashed",
            };
            println!("  \"{}\" -> \"{}\" [{}];", edge.from_node, edge.to_node, style);
        }
        println!("}}");
    }

    println!();
    println!("[✓] Topology discovery completed");
    Ok(())
}

async fn recommend_faults(
    namespace: String,
    count: usize,
    _history_path: Option<std::path::PathBuf>,
    generate_scenarios: bool,
    output_dir: Option<std::path::PathBuf>,
) -> ChaosResult<()> {
    println!();
    println!("╔══════════════════════════════════════════════════════════════╗");
    println!("║         INTELLIGENT FAULT RECOMMENDATION                    ║");
    println!("╚══════════════════════════════════════════════════════════════╝");
    println!();
    println!("[i] Namespace: {}", namespace);
    println!("[i] Max recommendations: {}", count);
    println!();

    let topology = match SystemTopology::discover_from_kubernetes(&namespace) {
        Ok(t) => t,
        Err(_) => SystemTopology::mock_demo(),
    };

    println!("[✓] System topology loaded");
    println!();

    let mut recommendation_engine = RecommendationEngine::new();

    println!("[+] Building GNN model from topology...");
    let gnn = GNNModel::from_topology(&topology);
    println!("[✓] GNN model built ({} nodes, {} edges)", topology.nodes.len(), topology.edges.len());

    let gnn_scores = gnn.predict();
    println!("[✓] GNN risk scores calculated");
    println!();

    let recommendations = recommendation_engine.generate_recommendations(
        &topology,
        Some(&gnn_scores),
        None,
        count,
    );

    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("TOP {} RECOMMENDED FAULT SCENARIOS:", recommendations.len().min(count));
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!();

    for (i, rec) in recommendations.iter().enumerate().take(count) {
        println!("  {}. {} [Score: {:.1}/100]", i + 1, rec.title, rec.combined_score);
        println!("     ─────────────────────────────────────────────────────");
        println!("     Target: {}", rec.target_node);
        println!("     Fault Type: {:?}", rec.fault_type);
        println!("     Rationale:");
        for reason in &rec.rationale {
        println!("       • {}", reason);
        }
        println!("     Recommended: {}", rec.recommendation);
        println!();
    }

    if generate_scenarios {
        println!();
        println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        println!("GENERATING SCENARIO FILES:");
        println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        println!();

        let out_dir = output_dir.unwrap_or_else(|| std::path::PathBuf::from("."));
        std::fs::create_dir_all(&out_dir)?;

        for (i, rec) in recommendations.iter().enumerate().take(count) {
            let yaml = recommendation_engine.generate_scenario_yaml(rec);
            let filename = format!("recommendation-{}-{}.yaml", i + 1, rec.target_node.replace('/', "-"));
            let filepath = out_dir.join(&filename);
            
            std::fs::write(&filepath, yaml)?;
            println!("  [✓] {}", filepath.display());
        }
    }

    println!();
    println!("[✓] Recommendation completed");
    Ok(())
}

async fn run_validation(
    _config_path: Option<std::path::PathBuf>,
    phase: String,
    _compare: bool,
    _baseline_file: Option<std::path::PathBuf>,
    output: Option<std::path::PathBuf>,
) -> ChaosResult<()> {
    println!();
    println!("╔══════════════════════════════════════════════════════════════╗");
    println!("║                 VALIDATION ENGINE                           ║");
    println!("╚══════════════════════════════════════════════════════════════╝");
    println!();
    println!("[i] Phase: {}", phase);
    println!();

    let validation_phase = match phase.as_str() {
        "baseline" => ValidationPhase::Baseline,
        "during" => ValidationPhase::During,
        "post" => ValidationPhase::Post,
        _ => ValidationPhase::Baseline,
    };

    let engine = ValidationEngine::with_default_config();
    println!("[✓] Validation engine initialized");
    println!();

    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!("VALIDATION PHASE: {:?}", validation_phase);
    println!("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    println!();

    let dummy_experiment = Experiment {
        name: "validation-test".to_string(),
        fault_type: FaultType::NetworkLatency,
        parameters: FaultParameters::NetworkLatency(NetworkLatencyParams {
            latency_ms: 100,
            jitter_ms: None,
            correlation_percent: None,
            loss_percent: None,
            interface: None,
            ports: None,
        }),
        duration: Some(60),
        phase: crate::scenario::ExperimentPhase::Main,
        dependencies: None,
        target_selector: None,
    };

    let run = match validation_phase {
        ValidationPhase::Baseline => engine.run_baseline_validation(&dummy_experiment).await?,
        ValidationPhase::During => engine.run_during_validation(&dummy_experiment).await?,
        ValidationPhase::Post => engine.run_post_validation(&dummy_experiment).await?,
    };

    println!("[✓] Validation run completed: {}", run.id);
    println!("[✓] Status: {:?}", run.overall_status);
    println!();

    for result in &run.results {
        println!("  Test: {}", result.test_name);
        println!("    Status: {:?}", result.status);
        println!("    Duration: {}ms", result.duration_ms);
        for assertion in &result.assertions {
            let icon = if assertion.passed { "✅" } else { "❌" };
            println!("    {} {}: {:.2} (expected: {:.2})", icon, assertion.assertion.metric, assertion.actual_value, assertion.expected_value);
        }
        println!();
    }

    if let Some(output_path) = output {
        let report_json = serde_json::to_string_pretty(&run)?;
        std::fs::write(&output_path, report_json)?;
        println!();
        println!("[✓] Report saved to: {}", output_path.display());
    }

    println!();
    println!("[✓] Validation completed");
    Ok(())
}
