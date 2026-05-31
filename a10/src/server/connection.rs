use std::sync::Arc;
use tokio::sync::{Mutex, mpsc};
use tokio_tungstenite::tungstenite::protocol::Message;
use uuid::Uuid;
use chrono::{DateTime, Utc};
use serde_json;

use crate::protocol::{ClientMessage, ServerMessage, UserInfo, ChatMessage};
use crate::server::simulation::ServerSimulation;
use crate::server::history::HistoryManager;

pub type ConnectionTx = mpsc::UnboundedSender<Message>;
pub type ConnectionRx = mpsc::UnboundedReceiver<Message>;

pub struct Connection {
    pub id: Uuid,
    pub name: String,
    pub join_time: DateTime<Utc>,
    pub is_host: bool,
    pub tx: ConnectionTx,
}

impl Connection {
    pub fn new(id: Uuid, name: String, tx: ConnectionTx, is_host: bool) -> Self {
        Self {
            id,
            name,
            join_time: Utc::now(),
            is_host,
            tx,
        }
    }

    pub fn to_user_info(&self) -> UserInfo {
        UserInfo {
            id: self.id,
            name: self.name.clone(),
            join_time: self.join_time,
            is_host: self.is_host,
        }
    }
}

pub struct ConnectionManager {
    connections: Arc<Mutex<Vec<Connection>>>,
    next_host_id: Arc<Mutex<Option<Uuid>>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(Vec::new())),
            next_host_id: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn add_connection(&self, connection: Connection) {
        let mut connections = self.connections.lock().await;
        
        if connections.is_empty() {
            let mut host_id = self.next_host_id.lock().await;
            *host_id = Some(connection.id);
            drop(host_id);
            
            let conn = connections.iter_mut().find(|c| c.id == connection.id);
            if let Some(conn) = conn {
                conn.is_host = true;
            }
        }
        
        connections.push(connection);
    }

    pub async fn remove_connection(&self, id: Uuid) -> Option<Connection> {
        let mut connections = self.connections.lock().await;
        let index = connections.iter().position(|c| c.id == id);
        
        if let Some(index) = index {
            let removed = connections.remove(index);
            
            if removed.is_host && !connections.is_empty() {
                if let Some(first) = connections.first_mut() {
                    first.is_host = true;
                }
            }
            
            Some(removed)
        } else {
            None
        }
    }

    pub async fn get_user_list(&self) -> Vec<UserInfo> {
        let connections = self.connections.lock().await;
        connections.iter().map(|c| c.to_user_info()).collect()
    }

    pub async fn broadcast(&self, message: &ServerMessage, exclude_id: Option<Uuid>) {
        let connections = self.connections.lock().await;
        let json = serde_json::to_string(message).unwrap();
        let msg = Message::Text(json);
        
        for conn in connections.iter() {
            if Some(conn.id) != exclude_id {
                let _ = conn.tx.send(msg.clone());
            }
        }
    }

    pub async fn send_to(&self, id: Uuid, message: &ServerMessage) {
        let connections = self.connections.lock().await;
        if let Some(conn) = connections.iter().find(|c| c.id == id) {
            let json = serde_json::to_string(message).unwrap();
            let _ = conn.tx.send(Message::Text(json));
        }
    }

    pub async fn get_connection_count(&self) -> usize {
        let connections = self.connections.lock().await;
        connections.len()
    }

    pub async fn get_host(&self) -> Option<UserInfo> {
        let connections = self.connections.lock().await;
        connections.iter().find(|c| c.is_host).map(|c| c.to_user_info())
    }
}

impl Clone for ConnectionManager {
    fn clone(&self) -> Self {
        Self {
            connections: Arc::clone(&self.connections),
            next_host_id: Arc::clone(&self.next_host_id),
        }
    }
}
