use std::sync::{Arc, Mutex};
use std::collections::VecDeque;
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use futures_util::{SinkExt, StreamExt};
use serde_json;
use uuid::Uuid;

use crate::protocol::{ClientMessage, ServerMessage, ConnectionState, UserInfo};

pub type NetworkTx = mpsc::UnboundedSender<ClientMessage>;
pub type NetworkRx = mpsc::UnboundedReceiver<ServerMessage>;

pub struct NetworkClient {
    pub connection_state: Arc<Mutex<ConnectionState>>,
    pub current_user_id: Arc<Mutex<Option<Uuid>>>,
    pub users: Arc<Mutex<Vec<UserInfo>>>,
    pub incoming_messages: Arc<Mutex<VecDeque<ServerMessage>>>,
    tx: Option<NetworkTx>,
    handle: Option<std::thread::JoinHandle<()>>,
}

impl NetworkClient {
    pub fn new() -> Self {
        Self {
            connection_state: Arc::new(Mutex::new(ConnectionState::Disconnected)),
            current_user_id: Arc::new(Mutex::new(None)),
            users: Arc::new(Mutex::new(Vec::new())),
            incoming_messages: Arc::new(Mutex::new(VecDeque::new())),
            tx: None,
            handle: None,
        }
    }

    pub fn connect(&mut self, url: &str, user_name: String) {
        *self.connection_state.lock().unwrap() = ConnectionState::Connecting;
        
        let url = url.to_string();
        let connection_state = Arc::clone(&self.connection_state);
        let current_user_id = Arc::clone(&self.current_user_id);
        let users = Arc::clone(&self.users);
        let incoming_messages = Arc::clone(&self.incoming_messages);
        
        let (tx, rx) = mpsc::unbounded_channel::<ClientMessage>();
        self.tx = Some(tx);
        
        let handle = std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async move {
                Self::run_connection(
                    url,
                    user_name,
                    connection_state,
                    current_user_id,
                    users,
                    incoming_messages,
                    rx,
                ).await;
            });
        });
        
        self.handle = Some(handle);
    }

    pub fn disconnect(&mut self) {
        *self.connection_state.lock().unwrap() = ConnectionState::Disconnected;
        self.tx = None;
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }

    pub fn send(&self, message: ClientMessage) {
        if let Some(tx) = &self.tx {
            let _ = tx.send(message);
        }
    }

    pub fn poll_messages(&self) -> Vec<ServerMessage> {
        let mut messages = self.incoming_messages.lock().unwrap();
        let result: Vec<_> = messages.drain(..).collect();
        result
    }

    pub fn is_connected(&self) -> bool {
        matches!(*self.connection_state.lock().unwrap(), ConnectionState::Connected)
    }

    async fn run_connection(
        url: String,
        user_name: String,
        connection_state: Arc<Mutex<ConnectionState>>,
        current_user_id: Arc<Mutex<Option<Uuid>>>,
        users: Arc<Mutex<Vec<UserInfo>>>,
        incoming_messages: Arc<Mutex<VecDeque<ServerMessage>>>,
        mut rx: mpsc::UnboundedReceiver<ClientMessage>,
    ) {
        let ws_stream = match connect_async(&url).await {
            Ok((ws, _)) => {
                *connection_state.lock().unwrap() = ConnectionState::Connected;
                ws
            }
            Err(e) => {
                *connection_state.lock().unwrap() = ConnectionState::Error(format!("Connection failed: {}", e));
                return;
            }
        };

        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        let join_msg = ClientMessage::Join { user_name: user_name.clone() };
        if let Ok(json) = serde_json::to_string(&join_msg) {
            let _ = ws_sender.send(Message::Text(json)).await;
        }

        loop {
            tokio::select! {
                Some(msg) = rx.recv() => {
                    if let Ok(json) = serde_json::to_string(&msg) {
                        if ws_sender.send(Message::Text(json)).await.is_err() {
                            break;
                        }
                    }
                }
                
                Some(msg) = ws_receiver.next() => {
                    match msg {
                        Ok(Message::Text(text)) => {
                            if let Ok(server_msg) = serde_json::from_str::<ServerMessage>(&text) {
                                Self::handle_server_message(
                                    &server_msg,
                                    &current_user_id,
                                    &users,
                                );
                                incoming_messages.lock().unwrap().push_back(server_msg);
                            }
                        }
                        Ok(Message::Ping(_)) => {
                            let _ = ws_sender.send(Message::Pong(vec![])).await;
                        }
                        Ok(Message::Close(_)) => {
                            break;
                        }
                        Err(_) => {
                            break;
                        }
                        _ => {}
                    }
                }
                
                else => {
                    break;
                }
            }
        }

        *connection_state.lock().unwrap() = ConnectionState::Disconnected;
    }

    fn handle_server_message(
        msg: &ServerMessage,
        current_user_id: &Arc<Mutex<Option<Uuid>>>,
        users: &Arc<Mutex<Vec<UserInfo>>>,
    ) {
        match msg {
            ServerMessage::Welcome { user_id, users: user_list, .. } => {
                *current_user_id.lock().unwrap() = Some(*user_id);
                *users.lock().unwrap() = user_list.clone();
            }
            ServerMessage::UserJoined { user } => {
                users.lock().unwrap().push(user.clone());
            }
            ServerMessage::UserLeft { user_id } => {
                users.lock().unwrap().retain(|u| u.id != *user_id);
            }
            _ => {}
        }
    }
}

impl Default for NetworkClient {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for NetworkClient {
    fn drop(&mut self) {
        self.disconnect();
    }
}
