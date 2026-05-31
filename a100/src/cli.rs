use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser, Debug)]
#[command(
    name = "chaosctl",
    version = "0.1.0",
    author = "Chaos Engineering Team",
    about = "Distributed Systems Chaos Engineering Platform CLI",
    long_about = "A comprehensive chaos engineering tool for distributed systems that supports fault injection, \
                 observability integration, and automatic recovery across Kubernetes, Docker, and bare-metal environments."
)]
pub struct ChaosCtl {
    #[command(subcommand)]
    pub command: Commands,

    #[arg(
        short,
        long,
        global = true,
        help = "Enable verbose output",
        default_value = "false"
    )]
    pub verbose: bool,

    #[arg(
        short,
        long,
        global = true,
        help = "Output format: json, yaml, or text",
        default_value = "text",
        value_parser = ["json", "yaml", "text"]
    )]
    pub output: String,

    #[arg(
        long,
        global = true,
        help = "Path to log file"
    )]
    pub log_file: Option<PathBuf>,
}

#[derive(Subcommand, Debug)]
pub enum Commands {
    #[command(
        about = "Run a chaos engineering scenario",
        long_about = "Execute a complete chaos engineering experiment from a YAML/JSON scenario definition. \
                     This includes: snapshot creation, baseline metric collection, fault injection, \
                     impact assessment, and automatic recovery."
    )]
    Run {
        #[arg(
            short,
            long,
            help = "Path to the scenario file (YAML or JSON)",
            value_name = "SCENARIO_FILE"
        )]
        scenario: PathBuf,

        #[arg(
            short,
            long,
            help = "Dry-run mode - validate scenario but don't execute",
            default_value = "false"
        )]
        dry_run: bool,

        #[arg(
            long,
            help = "Skip the pre-experiment snapshot",
            default_value = "false"
        )]
        no_snapshot: bool,

        #[arg(
            long,
            help = "Skip metric collection",
            default_value = "false"
        )]
        no_metrics: bool,

        #[arg(
            long,
            help = "Skip automatic recovery (manual cleanup required)",
            default_value = "false"
        )]
        no_recovery: bool,
    },

    #[command(
        about = "Validate a chaos scenario file",
        long_about = "Validate the syntax and semantic correctness of a scenario definition without executing it."
    )]
    Validate {
        #[arg(
            short,
            long,
            help = "Path to the scenario file",
            value_name = "SCENARIO_FILE"
        )]
        scenario: PathBuf,
    },

    #[command(
        about = "Discover available targets",
        long_about = "Discover and list available targets in the configured orchestrator environment."
    )]
    Discover {
        #[arg(
            short,
            long,
            help = "Orchestrator type: kubernetes, docker-compose, or ssh",
            value_parser = ["kubernetes", "docker-compose", "ssh"]
        )]
        orchestrator: String,

        #[arg(
            long,
            help = "Kubernetes namespace",
            value_name = "NAMESPACE"
        )]
        namespace: Option<String>,

        #[arg(
            long,
            help = "Docker Compose file path",
            value_name = "COMPOSE_FILE"
        )]
        compose_file: Option<PathBuf>,

        #[arg(
            long,
            help = "SSH hosts (comma-separated: user@host:port)",
            value_name = "HOSTS"
        )]
        hosts: Option<String>,
    },

    #[command(
        about = "Inject a specific fault",
        long_about = "Manually inject a single fault type without a full scenario definition."
    )]
    Inject {
        #[arg(
            short,
            long,
            help = "Fault type to inject",
            value_parser = [
                "network-partition",
                "network-latency",
                "cpu-stress",
                "memory-stress",
                "disk-io",
                "service-fault"
            ]
        )]
        fault_type: String,

        #[arg(
            short,
            long,
            help = "Target selector (format depends on orchestrator)",
            value_name = "TARGET"
        )]
        target: String,

        #[arg(
            short,
            long,
            help = "Fault parameters as JSON string",
            value_name = "PARAMS"
        )]
        params: Option<String>,

        #[arg(
            long,
            help = "Duration of the fault injection in seconds",
            value_name = "SECONDS"
        )]
        duration: Option<u64>,

        #[arg(
            long,
            help = "Orchestrator type",
            default_value = "kubernetes",
            value_parser = ["kubernetes", "docker-compose", "ssh"]
        )]
        orchestrator: String,
    },

    #[command(
        about = "Recover from injected faults",
        long_about = "Manually trigger recovery of previously injected faults. Use this if auto-recovery failed."
    )]
    Recover {
        #[arg(
            short,
            long,
            help = "Recover all active faults",
            default_value = "false"
        )]
        all: bool,

        #[arg(
            long,
            help = "Path to state file for recovery",
            value_name = "STATE_FILE"
        )]
        state_file: Option<PathBuf>,

        #[arg(
            long,
            help = "Experiment ID to recover",
            value_name = "EXP_ID"
        )]
        experiment_id: Option<String>,
    },

    #[command(
        about = "Create system snapshot",
        long_about = "Create a snapshot of system state including etcd, database, or filesystem backups."
    )]
    Snapshot {
        #[arg(
            short,
            long,
            help = "Path to the scenario file with snapshot config",
            value_name = "SCENARIO_FILE"
        )]
        scenario: PathBuf,

        #[arg(
            long,
            help = "Snapshot etcd",
            default_value = "false"
        )]
        etcd: bool,

        #[arg(
            long,
            help = "Snapshot database",
            default_value = "false"
        )]
        database: bool,

        #[arg(
            long,
            help = "Output directory for snapshots",
            value_name = "OUTPUT_DIR"
        )]
        output_dir: Option<PathBuf>,
    },

    #[command(
        about = "Restore from snapshot",
        long_about = "Restore system state from a previously created snapshot."
    )]
    Restore {
        #[arg(
            short,
            long,
            help = "Path to snapshot file",
            value_name = "SNAPSHOT_FILE"
        )]
        snapshot: PathBuf,

        #[arg(
            long,
            help = "Restore etcd",
            default_value = "false"
        )]
        etcd: bool,

        #[arg(
            long,
            help = "Restore database",
            default_value = "false"
        )]
        database: bool,
    },

    #[command(
        about = "Activate the Big Red Button",
        long_about = "Emergency stop - trigger immediate recovery of all active faults across the entire platform."
    )]
    BigRedButton {
        #[arg(
            short,
            long,
            help = "Force stop even if safety checks fail",
            default_value = "false"
        )]
        force: bool,

        #[arg(
            long,
            help = "Distributed lock key",
            value_name = "LOCK_KEY"
        )]
        lock_key: Option<String>,
    },

    #[command(
        about = "Generate scenario templates",
        long_about = "Generate example scenario templates for different fault types and orchestrators."
    )]
    Generate {
        #[arg(
            short,
            long,
            help = "Template type",
            value_parser = [
                "kubernetes",
                "docker-compose",
                "ssh",
                "network-partition",
                "network-latency",
                "cpu-stress",
                "memory-stress",
                "disk-io",
                "service-fault",
                "composite"
            ]
        )]
        template: String,

        #[arg(
            short,
            long,
            help = "Output file path",
            value_name = "OUTPUT_FILE"
        )]
        output: PathBuf,

        #[arg(
            long,
            help = "Output format: yaml or json",
            default_value = "yaml",
            value_parser = ["yaml", "json"]
        )]
        format: String,
    },

    #[command(
        about = "List or query running experiments",
        long_about = "View information about currently running or recently completed chaos experiments."
    )]
    Status {
        #[arg(
            short,
            long,
            help = "Experiment ID to query",
            value_name = "EXP_ID"
        )]
        experiment_id: Option<String>,

        #[arg(
            long,
            help = "Show all experiments including completed ones",
            default_value = "false"
        )]
        all: bool,
    },

    #[command(
        about = "Discover system architecture topology",
        long_about = "Auto-discover system architecture topology from Kubernetes Services/Deployments \
                     and Istio traffic routing rules. Builds a dependency graph for fault analysis."
    )]
    DiscoverTopology {
        #[arg(
            short,
            long,
            help = "Kubernetes namespace to discover",
            default_value = "default",
            value_name = "NAMESPACE"
        )]
        namespace: String,

        #[arg(
            long,
            help = "Discover Istio VirtualService/DestinationRule rules",
            default_value = "false"
        )]
        istio: bool,

        #[arg(
            long,
            help = "Output the topology graph as DOT format",
            default_value = "false"
        )]
        dot: bool,
    },

    #[command(
        about = "Generate intelligent fault recommendations",
        long_about = "Use graph neural networks (GNN) and historical fault data to recommend \
                     high-value fault scenarios based on system topology and single points of failure."
    )]
    RecommendFaults {
        #[arg(
            short,
            long,
            help = "Kubernetes namespace",
            default_value = "default",
            value_name = "NAMESPACE"
        )]
        namespace: String,

        #[arg(
            short,
            long,
            help = "Number of recommendations to generate",
            default_value = "5",
            value_name = "COUNT"
        )]
        count: usize,

        #[arg(
            long,
            help = "Path to historical fault data JSON file",
            value_name = "HISTORY_FILE"
        )]
        history: Option<std::path::PathBuf>,

        #[arg(
            long,
            help = "Generate scenario YAML files from recommendations",
            default_value = "false"
        )]
        generate_scenarios: bool,

        #[arg(
            long,
            help = "Output directory for generated scenarios",
            value_name = "OUTPUT_DIR"
        )]
        output_dir: Option<std::path::PathBuf>,
    },

    #[command(
        about = "Run validation tests",
        long_about = "Execute predefined validation tests (HTTP health checks, database read/write, \
                     message queue operations, circuit breaker tests) and generate validation reports."
    )]
    Validate {
        #[arg(
            short,
            long,
            help = "Path to validation config file (YAML/JSON)",
            value_name = "CONFIG_FILE"
        )]
        config: Option<std::path::PathBuf>,

        #[arg(
            long,
            help = "Validation phase: baseline, during, or post",
            default_value = "baseline",
            value_parser = ["baseline", "during", "post"]
        )]
        phase: String,

        #[arg(
            long,
            help = "Compare with previous phase results",
            default_value = "false"
        )]
        compare: bool,

        #[arg(
            long,
            help = "Path to baseline results for comparison",
            value_name = "BASELINE_FILE"
        )]
        baseline_file: Option<std::path::PathBuf>,

        #[arg(
            long,
            help = "Save validation report to file",
            value_name = "OUTPUT_FILE"
        )]
        output: Option<std::path::PathBuf>,
    },
}
