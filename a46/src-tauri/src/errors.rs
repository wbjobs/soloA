use thiserror::Error;

#[derive(Debug, Error)]
pub enum AnalyzerError {
    #[error("Pcap error: {0}")]
    Pcap(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("No capture in progress")]
    NoCaptureInProgress,

    #[error("Capture already in progress")]
    CaptureInProgress,

    #[error("Invalid interface: {0}")]
    InvalidInterface(String),

    #[error("BPF filter error: {0}")]
    BpfFilter(String),

    #[error("IO error: {0}")]
    Io(String),

    #[error("Channel error: {0}")]
    Channel(String),

    #[error("Other error: {0}")]
    Other(String),
}

impl From<pcap::Error> for AnalyzerError {
    fn from(err: pcap::Error) -> Self {
        AnalyzerError::Pcap(err.to_string())
    }
}

impl From<rusqlite::Error> for AnalyzerError {
    fn from(err: rusqlite::Error) -> Self {
        AnalyzerError::Database(err.to_string())
    }
}

impl From<std::io::Error> for AnalyzerError {
    fn from(err: std::io::Error) -> Self {
        AnalyzerError::Io(err.to_string())
    }
}

impl<T> From<std::sync::mpsc::SendError<T>> for AnalyzerError {
    fn from(err: std::sync::mpsc::SendError<T>) -> Self {
        AnalyzerError::Channel(err.to_string())
    }
}

pub type Result<T> = std::result::Result<T, AnalyzerError>;
