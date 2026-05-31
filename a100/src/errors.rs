use thiserror::Error;

#[derive(Error, Debug)]
pub enum ChaosError {
    #[error("Configuration error: {0}")]
    ConfigError(String),
    
    #[error("Target discovery error: {0}")]
    DiscoveryError(String),
    
    #[error("Fault injection error: {0}")]
    InjectionError(String),
    
    #[error("Recovery error: {0}")]
    RecoveryError(String),
    
    #[error("Security error: {0}")]
    SecurityError(String),
    
    #[error("Orchestration error: {0}")]
    OrchestrationError(String),
    
    #[error("Observability error: {0}")]
    ObservabilityError(String),
    
    #[error("Execution timeout: {0}")]
    TimeoutError(String),
    
    #[error("Big Red Button triggered")]
    EmergencyStop,
    
    #[error("Invalid scenario: {0}")]
    InvalidScenario(String),
    
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    
    #[error("Serialization error: {0}")]
    SerializationError(String),
    
    #[error("Command execution failed: {0}")]
    CommandError(String),
}

impl From<serde_json::Error> for ChaosError {
    fn from(e: serde_json::Error) -> Self {
        ChaosError::SerializationError(e.to_string())
    }
}

impl From<serde_yaml::Error> for ChaosError {
    fn from(e: serde_yaml::Error) -> Self {
        ChaosError::SerializationError(e.to_string())
    }
}

impl From<reqwest::Error> for ChaosError {
    fn from(e: reqwest::Error) -> Self {
        ChaosError::ObservabilityError(e.to_string())
    }
}

pub type ChaosResult<T> = Result<T, ChaosError>;
