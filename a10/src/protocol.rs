use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use crate::particle::{Particle, ParticleType, InteractionRules};
use crate::simulation::{SimulationConfig, BoundaryType};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ClientMessage {
    Join {
        user_name: String,
    },
    
    RequestFullState,
    
    AddParticle {
        x: f32,
        y: f32,
        particle_type: ParticleType,
    },
    
    RemoveParticles {
        x: f32,
        y: f32,
        radius: f32,
    },
    
    UpdateConfig {
        config: SimulationConfig,
    },
    
    ChatMessage {
        content: String,
    },
    
    ControlAction {
        action: ControlAction,
    },
    
    RequestHistory {
        start_time: Option<DateTime<Utc>>,
        end_time: Option<DateTime<Utc>>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ServerMessage {
    Welcome {
        user_id: Uuid,
        server_time: DateTime<Utc>,
        users: Vec<UserInfo>,
    },
    
    UserJoined {
        user: UserInfo,
    },
    
    UserLeft {
        user_id: Uuid,
    },
    
    FullState {
        particles: Vec<Particle>,
        config: SimulationConfig,
        is_running: bool,
        population_counts: [usize; 3],
        timestamp: DateTime<Utc>,
    },
    
    StateDelta {
        added_particles: Vec<Particle>,
        removed_particle_indices: Vec<usize>,
        particle_updates: Vec<ParticleUpdate>,
        config_update: Option<SimulationConfig>,
        is_running: Option<bool>,
        timestamp: DateTime<Utc>,
    },
    
    ChatMessage {
        user_id: Uuid,
        user_name: String,
        content: String,
        timestamp: DateTime<Utc>,
    },
    
    UserAction {
        user_id: Uuid,
        user_name: String,
        action: UserAction,
        timestamp: DateTime<Utc>,
    },
    
    HistoryResponse {
        snapshots: Vec<HistorySnapshot>,
    },
    
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParticleUpdate {
    pub index: usize,
    pub x: Option<f32>,
    pub y: Option<f32>,
    pub vx: Option<f32>,
    pub vy: Option<f32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ControlAction {
    Start,
    Pause,
    Reset,
    SetSpeed(f64),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum UserAction {
    AddedParticle { x: f32, y: f32, particle_type: ParticleType },
    RemovedParticles { x: f32, y: f32, radius: f32, count: usize },
    ChangedConfig,
    StartedSimulation,
    PausedSimulation,
    ResetSimulation,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub id: Uuid,
    pub name: String,
    pub join_time: DateTime<Utc>,
    pub is_host: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HistorySnapshot {
    pub timestamp: DateTime<Utc>,
    pub particles: Option<Vec<Particle>>,
    pub population_counts: [usize; 3],
    config: Option<SimulationConfig>,
}

impl HistorySnapshot {
    pub fn new(
        timestamp: DateTime<Utc>,
        particles: Option<Vec<Particle>>,
        population_counts: [usize; 3],
        config: Option<SimulationConfig>,
    ) -> Self {
        Self {
            timestamp,
            particles,
            population_counts,
            config,
        }
    }
}

#[derive(Debug, Clone)]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Error(String),
}

impl Default for ConnectionState {
    fn default() -> Self {
        ConnectionState::Disconnected
    }
}
