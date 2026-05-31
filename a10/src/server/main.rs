#[macro_use]
extern crate log;

use std::env;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Mutex, mpsc};
use tokio_tungstenite::{accept_async, tungstenite::protocol::Message};
use futures_util::{SinkExt, StreamExt};
use uuid::Uuid;
use serde_json;
use chrono::Utc;

mod mod_imports {
    pub use crate::protocol::{ClientMessage, ServerMessage, UserInfo, UserAction, ControlAction, ChatMessage};
    pub use crate::server::simulation::{ServerSimulation, ServerSimulationConfig};
    pub use crate::server::connection::{Connection, ConnectionManager, ConnectionTx, ConnectionRx};
    pub use crate::server::history::HistoryManager;
}

use mod_imports::*;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::init();
    
    let addr = env::args()
        .nth(1)
        .unwrap_or_else(|| "127.0.0.1:8080".to_string());

    info!("Starting particle simulation server on {}", addr);

    let try_socket = TcpListener::bind(&addr).await;
    let listener = try_socket.expect("Failed to bind");
    info!("Server listening on: {}", addr);

    let connection_manager = ConnectionManager::new();
    let simulation = Arc::new(Mutex::new(ServerSimulation::new(ServerSimulationConfig::default())));
    let history_manager = Arc::new(Mutex::new(HistoryManager::default()));

    let (broadcast_tx, mut broadcast_rx) = mpsc::unbounded_channel::<(ServerMessage, Option<Uuid>)>();

    {
        let connection_manager = connection_manager.clone();
        tokio::spawn(async move {
            while let Some((message, exclude_id)) = broadcast_rx.recv().await {
                connection_manager.broadcast(&message, exclude_id).await;
            }
        });
    }

    {
        let simulation = simulation.clone();
        let history_manager = history_manager.clone();
        let connection_manager = connection_manager.clone();
        
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_millis(16));
            
            loop {
                interval.tick().await;
                
                let mut sim = simulation.lock().await;
                let updates = sim.update();
                
                let history = history_manager.lock().await;
                if history.should_save_full() {
                    let snapshot = sim.create_snapshot(true);
                    drop(sim);
                    let mut history = history_manager.lock().await;
                    history.add_snapshot(snapshot);
                } else {
                    drop(sim);
                    let snapshot = {
                        let sim = simulation.lock().await;
                        sim.create_snapshot(false)
                    };
                    let mut history = history_manager.lock().await;
                    history.add_snapshot(snapshot);
                }
                
                if let Some(updates) = updates {
                    if !updates.is_empty() {
                        let sim = simulation.lock().await;
                        let msg = ServerMessage::StateDelta {
                            added_particles: Vec::new(),
                            removed_particle_indices: Vec::new(),
                            particle_updates: updates,
                            config_update: None,
                            is_running: None,
                            timestamp: Utc::now(),
                        };
                        drop(sim);
                        connection_manager.broadcast(&msg, None).await;
                    }
                }
            }
        });
    }

    while let Ok((stream, addr)) = listener.accept().await {
        info!("New connection from: {}", addr);
        
        let connection_manager = connection_manager.clone();
        let simulation = simulation.clone();
        let history_manager = history_manager.clone();
        
        tokio::spawn(handle_connection(
            stream,
            connection_manager,
            simulation,
            history_manager,
        ));
    }

    Ok(())
}

async fn handle_connection(
    stream: TcpStream,
    connection_manager: ConnectionManager,
    simulation: Arc<Mutex<ServerSimulation>>,
    history_manager: Arc<Mutex<HistoryManager>>,
) {
    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            error!("Error during WebSocket handshake: {}", e);
            return;
        }
    };

    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();
    let user_id = Uuid::new_v4();
    let mut user_name: Option<String> = None;

    {
        let tx = tx.clone();
        tokio::spawn(async move {
            while let Some(msg) = rx.recv().await {
                if ws_sender.send(msg).await.is_err() {
                    break;
                }
            }
        });
    }

    while let Some(msg) = ws_receiver.next().await {
        let msg = match msg {
            Ok(msg) => msg,
            Err(e) => {
                error!("Error receiving message: {}", e);
                break;
            }
        };

        match msg {
            Message::Text(text) => {
                let client_msg: Result<ClientMessage, _> = serde_json::from_str(&text);
                
                match client_msg {
                    Ok(msg) => {
                        handle_client_message(
                            msg,
                            user_id,
                            &mut user_name,
                            &tx,
                            &connection_manager,
                            &simulation,
                            &history_manager,
                        ).await;
                    }
                    Err(e) => {
                        error!("Error parsing message: {}", e);
                        let error_msg = ServerMessage::Error {
                            message: format!("Invalid message format: {}", e),
                        };
                        let _ = tx.send(Message::Text(serde_json::to_string(&error_msg).unwrap()));
                    }
                }
            }
            Message::Binary(_) => {
                info!("Received binary message (not supported)");
            }
            Message::Ping(_) => {
                let _ = tx.send(Message::Pong(vec![]));
            }
            Message::Close(_) => {
                info!("Client requested close");
                break;
            }
            _ => {}
        }
    }

    if let Some(name) = user_name {
        info!("User {} disconnected", name);
        connection_manager.remove_connection(user_id).await;
        
        let msg = ServerMessage::UserLeft {
            user_id,
        };
        connection_manager.broadcast(&msg, Some(user_id)).await;
    }
}

async fn handle_client_message(
    msg: ClientMessage,
    user_id: Uuid,
    user_name: &mut Option<String>,
    tx: &ConnectionTx,
    connection_manager: &ConnectionManager,
    simulation: &Arc<Mutex<ServerSimulation>>,
    history_manager: &Arc<Mutex<HistoryManager>>,
) {
    match msg {
        ClientMessage::Join { user_name: name } => {
            *user_name = Some(name.clone());
            info!("User {} joined with ID {}", name, user_id);
            
            let connection = Connection::new(
                user_id,
                name.clone(),
                tx.clone(),
                connection_manager.get_connection_count().await == 0,
            );
            
            connection_manager.add_connection(connection).await;
            
            let users = connection_manager.get_user_list().await;
            let welcome_msg = ServerMessage::Welcome {
                user_id,
                server_time: Utc::now(),
                users,
            };
            
            let _ = tx.send(Message::Text(serde_json::to_string(&welcome_msg).unwrap()));
            
            let sim = simulation.lock().await;
            let state_msg = ServerMessage::FullState {
                particles: sim.particles.clone(),
                config: sim.config.clone().into(),
                is_running: sim.is_running,
                population_counts: sim.get_population_counts(),
                timestamp: Utc::now(),
            };
            drop(sim);
            
            let _ = tx.send(Message::Text(serde_json::to_string(&state_msg).unwrap()));
            
            let joined_msg = ServerMessage::UserJoined {
                user: UserInfo {
                    id: user_id,
                    name,
                    join_time: Utc::now(),
                    is_host: false,
                },
            };
            connection_manager.broadcast(&joined_msg, Some(user_id)).await;
        }
        
        ClientMessage::RequestFullState => {
            let sim = simulation.lock().await;
            let msg = ServerMessage::FullState {
                particles: sim.particles.clone(),
                config: sim.config.clone().into(),
                is_running: sim.is_running,
                population_counts: sim.get_population_counts(),
                timestamp: Utc::now(),
            };
            drop(sim);
            
            let _ = tx.send(Message::Text(serde_json::to_string(&msg).unwrap()));
        }
        
        ClientMessage::AddParticle { x, y, particle_type } => {
            let mut sim = simulation.lock().await;
            let (index, particle) = sim.add_particle(x, y, particle_type);
            drop(sim);
            
            let delta_msg = ServerMessage::StateDelta {
                added_particles: vec![particle],
                removed_particle_indices: Vec::new(),
                particle_updates: Vec::new(),
                config_update: None,
                is_running: None,
                timestamp: Utc::now(),
            };
            connection_manager.broadcast(&delta_msg, None).await;
            
            if let Some(name) = user_name {
                let action_msg = ServerMessage::UserAction {
                    user_id,
                    user_name: name.clone(),
                    action: UserAction::AddedParticle { x, y, particle_type },
                    timestamp: Utc::now(),
                };
                connection_manager.broadcast(&action_msg, None).await;
            }
        }
        
        ClientMessage::RemoveParticles { x, y, radius } => {
            let mut sim = simulation.lock().await;
            let removed = sim.remove_particles_at(x, y, radius);
            let count = removed.len();
            drop(sim);
            
            if !removed.is_empty() {
                let delta_msg = ServerMessage::StateDelta {
                    added_particles: Vec::new(),
                    removed_particle_indices: removed,
                    particle_updates: Vec::new(),
                    config_update: None,
                    is_running: None,
                    timestamp: Utc::now(),
                };
                connection_manager.broadcast(&delta_msg, None).await;
            }
            
            if let Some(name) = user_name {
                let action_msg = ServerMessage::UserAction {
                    user_id,
                    user_name: name.clone(),
                    action: UserAction::RemovedParticles { x, y, radius, count },
                    timestamp: Utc::now(),
                };
                connection_manager.broadcast(&action_msg, None).await;
            }
        }
        
        ClientMessage::UpdateConfig { config } => {
            let mut sim = simulation.lock().await;
            sim.config = config.into();
            drop(sim);
            
            let delta_msg = ServerMessage::StateDelta {
                added_particles: Vec::new(),
                removed_particle_indices: Vec::new(),
                particle_updates: Vec::new(),
                config_update: Some(config),
                is_running: None,
                timestamp: Utc::now(),
            };
            connection_manager.broadcast(&delta_msg, None).await;
            
            if let Some(name) = user_name {
                let action_msg = ServerMessage::UserAction {
                    user_id,
                    user_name: name.clone(),
                    action: UserAction::ChangedConfig,
                    timestamp: Utc::now(),
                };
                connection_manager.broadcast(&action_msg, None).await;
            }
        }
        
        ClientMessage::ChatMessage { content } => {
            if let Some(name) = user_name {
                let chat_msg = ServerMessage::ChatMessage {
                    user_id,
                    user_name: name.clone(),
                    content,
                    timestamp: Utc::now(),
                };
                connection_manager.broadcast(&chat_msg, None).await;
            }
        }
        
        ClientMessage::ControlAction { action } => {
            let mut sim = simulation.lock().await;
            
            let user_action = match action {
                ControlAction::Start => {
                    sim.is_running = true;
                    UserAction::StartedSimulation
                }
                ControlAction::Pause => {
                    sim.is_running = false;
                    UserAction::PausedSimulation
                }
                ControlAction::Reset => {
                    sim.reset();
                    UserAction::ResetSimulation
                }
                ControlAction::SetSpeed(speed) => {
                    sim.evolution_speed = speed;
                    UserAction::ChangedConfig
                }
            };
            
            let is_running = sim.is_running;
            drop(sim);
            
            let delta_msg = ServerMessage::StateDelta {
                added_particles: Vec::new(),
                removed_particle_indices: Vec::new(),
                particle_updates: Vec::new(),
                config_update: None,
                is_running: Some(is_running),
                timestamp: Utc::now(),
            };
            connection_manager.broadcast(&delta_msg, None).await;
            
            if let Some(name) = user_name {
                let action_msg = ServerMessage::UserAction {
                    user_id,
                    user_name: name.clone(),
                    action: user_action,
                    timestamp: Utc::now(),
                };
                connection_manager.broadcast(&action_msg, None).await;
            }
        }
        
        ClientMessage::RequestHistory { start_time, end_time } => {
            let history = history_manager.lock().await;
            let snapshots = history.get_snapshots(start_time, end_time);
            drop(history);
            
            let msg = ServerMessage::HistoryResponse {
                snapshots,
            };
            let _ = tx.send(Message::Text(serde_json::to_string(&msg).unwrap()));
        }
    }
}
