pub mod types;
pub mod errors;
pub mod parser;
pub mod capture;
pub mod database;
pub mod tls_parser;
pub mod cert_parser;
pub mod intrusion_detection;

use std::sync::{mpsc, Mutex, Arc};
use std::collections::HashMap;
use tauri::{AppHandle, Manager};
use once_cell::sync::Lazy;

use crate::types::*;
use crate::errors::*;
use crate::capture::CaptureManager;
use crate::database::Database;
use crate::intrusion_detection::IntrusionDetectionEngine;

static CAPTURE_MANAGER: Lazy<Mutex<CaptureManager>> = Lazy::new(|| Mutex::new(CaptureManager::new()));
static DATABASE: Lazy<Mutex<Option<Database>>> = Lazy::new(|| Mutex::new(None));
static PACKET_CHANNEL: Lazy<Mutex<Option<mpsc::Receiver<PacketInfo>>>> = Lazy::new(|| Mutex::new(None));
static CURRENT_SESSION: Lazy<Mutex<Option<CaptureSession>>> = Lazy::new(|| Mutex::new(None));
static STATS: Lazy<Mutex<CaptureStats>> = Lazy::new(|| Mutex::new(CaptureStats::new()));
static IDS: Lazy<Mutex<IntrusionDetectionEngine>> = Lazy::new(|| Mutex::new(IntrusionDetectionEngine::new()));

pub struct CaptureStats {
    pub protocol_counts: HashMap<String, u64>,
    pub protocol_bytes: HashMap<String, u64>,
    pub traffic_samples: Vec<(i64, u64, u64)>,
    pub talker_packets: HashMap<String, u64>,
    pub talker_bytes: HashMap<String, u64>,
}

impl CaptureStats {
    fn new() -> Self {
        CaptureStats {
            protocol_counts: HashMap::new(),
            protocol_bytes: HashMap::new(),
            traffic_samples: Vec::new(),
            talker_packets: HashMap::new(),
            talker_bytes: HashMap::new(),
        }
    }

    fn clear(&mut self) {
        self.protocol_counts.clear();
        self.protocol_bytes.clear();
        self.traffic_samples.clear();
        self.talker_packets.clear();
        self.talker_bytes.clear();
    }

    fn record_packet(&mut self, packet: &PacketInfo) {
        let proto = packet.protocol.to_string();
        *self.protocol_counts.entry(proto.clone()).or_insert(0) += 1;
        *self.protocol_bytes.entry(proto).or_insert(0) += packet.length as u64;

        let bucket = (packet.timestamp / 1000) * 1000;
        let last = self.traffic_samples.last_mut();
        if let Some((last_bucket, bytes, pkts)) = last {
            if *last_bucket == bucket {
                *bytes += packet.length as u64;
                *pkts += 1;
                return;
            }
        }
        self.traffic_samples.push((bucket, packet.length as u64, 1));

        [&packet.src_address, &packet.dst_address].iter().for_each(|addr| {
            if !addr.is_empty() {
                *self.talker_packets.entry(addr.to_string()).or_insert(0) += 1;
                *self.talker_bytes.entry(addr.to_string()).or_insert(0) += packet.length as u64;
            }
        });
    }
}

pub fn init_database() -> Result<()> {
    let mut db_guard = DATABASE.lock().unwrap();
    *db_guard = Some(Database::in_memory()?);
    Ok(())
}

pub fn start_packet_forwarder(app_handle: AppHandle) {
    std::thread::spawn(move || loop {
        let rx_guard = PACKET_CHANNEL.lock().unwrap();
        if let Some(rx) = &*rx_guard {
            match rx.try_recv() {
                Ok(packet) => {
                    if let Some(session) = CURRENT_SESSION.lock().unwrap().as_ref() {
                        if let Some(db) = DATABASE.lock().unwrap().as_ref() {
                            let _ = db.insert_packet(&packet, &session.id);
                        }
                    }

                    STATS.lock().unwrap().record_packet(&packet);

                    let mut ids_guard = IDS.lock().unwrap();
                    let new_alerts = ids_guard.process_packet(&packet);
                    for alert in new_alerts {
                        let _ = app_handle.emit_all("security_alert", &alert);
                    }

                    let _ = app_handle.emit_all("packet_received", &packet);
                }
                Err(mpsc::TryRecvError::Empty) => {
                    std::thread::sleep(std::time::Duration::from_millis(10));
                }
                Err(mpsc::TryRecvError::Disconnected) => {
                    break;
                }
            }
        } else {
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    });
}

#[tauri::command]
pub fn get_interfaces() -> Vec<NetworkInterface> {
    CaptureManager::list_interfaces()
}

#[tauri::command]
pub fn start_capture(
    app_handle: AppHandle,
    interface_name: String,
    promiscuous: bool,
    bpf_filter: Option<String>,
) -> Result<String, String> {
    let mut manager = CAPTURE_MANAGER.lock().unwrap();
    
    match manager.start_capture(&interface_name, promiscuous, bpf_filter.as_deref()) {
        Ok((session, rx)) => {
            STATS.lock().unwrap().clear();
            IDS.lock().unwrap().reset();

            if let Some(db) = DATABASE.lock().unwrap().as_ref() {
                let _ = db.create_session(&session);
            }

            *CURRENT_SESSION.lock().unwrap() = Some(session.clone());
            *PACKET_CHANNEL.lock().unwrap() = Some(rx);

            let _ = app_handle.emit_all("capture_started", &session);

            Ok(session.id)
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn stop_capture() -> Result<CaptureSession, String> {
    let mut manager = CAPTURE_MANAGER.lock().unwrap();
    match manager.stop_capture() {
        Ok(mut session) => {
            if let Some(db) = DATABASE.lock().unwrap().as_ref() {
                let count = manager
                    .current_session()
                    .map(|s| s.packet_count)
                    .unwrap_or(0);
                session.packet_count = count;
                let _ = db.update_session(&session);
            }
            *PACKET_CHANNEL.lock().unwrap() = None;
            Ok(session)
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn get_packets(session_id: Option<String>) -> Result<Vec<PacketInfo>, String> {
    let db_guard = DATABASE.lock().unwrap();
    if let Some(db) = db_guard.as_ref() {
        db.get_packets(session_id.as_deref()).map_err(|e| e.to_string())
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub fn get_packet(packet_number: u64) -> Result<Option<PacketInfo>, String> {
    let db_guard = DATABASE.lock().unwrap();
    if let Some(db) = db_guard.as_ref() {
        let packets = db.get_packets(None).map_err(|e| e.to_string())?;
        Ok(packets.into_iter().find(|p| p.number == packet_number))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn get_protocol_stats() -> Vec<ProtocolStats> {
    let stats = STATS.lock().unwrap();
    let mut result = Vec::new();
    for (proto, count) in &stats.protocol_counts {
        result.push(ProtocolStats {
            protocol: proto.clone(),
            count: *count,
            bytes: *stats.protocol_bytes.get(proto).unwrap_or(&0),
        });
    }
    result.sort_by(|a, b| b.count.cmp(&a.count));
    result
}

#[tauri::command]
pub fn get_traffic_stats() -> Vec<TrafficStats> {
    let stats = STATS.lock().unwrap();
    stats
        .traffic_samples
        .iter()
        .rev()
        .take(100)
        .rev()
        .map(|(ts, bytes, packets)| TrafficStats {
            timestamp: *ts,
            bytes: *bytes,
            packets: *packets,
        })
        .collect()
}

#[tauri::command]
pub fn get_top_talkers() -> Vec<TopTalker> {
    let stats = STATS.lock().unwrap();
    let mut result = Vec::new();
    for (addr, packets) in &stats.talker_packets {
        result.push(TopTalker {
            address: addr.clone(),
            packets: *packets,
            bytes: *stats.talker_bytes.get(addr).unwrap_or(&0),
        });
    }
    result.sort_by(|a, b| b.packets.cmp(&a.packets));
    result.truncate(20);
    result
}

#[tauri::command]
pub fn get_tcp_streams() -> Vec<TcpStreamData> {
    let manager = CAPTURE_MANAGER.lock().unwrap();
    manager.get_tcp_streams()
}

#[tauri::command]
pub fn get_tcp_stream(stream_id: String) -> Option<TcpStreamData> {
    let manager = CAPTURE_MANAGER.lock().unwrap();
    manager.get_tcp_stream(&stream_id)
}

#[tauri::command]
pub fn clear_packets() -> Result<(), String> {
    let db_guard = DATABASE.lock().unwrap();
    if let Some(db) = db_guard.as_ref() {
        db.clear_packets().map_err(|e| e.to_string())?;
    }
    STATS.lock().unwrap().clear();
    Ok(())
}

#[tauri::command]
pub fn compile_bpf_filter(filter: String) -> Result<(bool, Option<String>), String> {
    match CaptureManager::compile_bpf_filter(&filter) {
        Ok(_) => Ok((true, None)),
        Err(e) => Ok((false, Some(e.to_string()))),
    }
}

#[tauri::command]
pub fn set_display_filter(filter: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
pub fn get_security_alerts(count: Option<usize>) -> Vec<SecurityAlert> {
    let ids = IDS.lock().unwrap();
    if let Some(c) = count {
        ids.get_recent_alerts(c)
    } else {
        ids.get_alerts().to_vec()
    }
}

#[tauri::command]
pub fn get_security_stats() -> SecurityStats {
    IDS.lock().unwrap().get_stats()
}

#[tauri::command]
pub fn acknowledge_alert(alert_id: String) -> bool {
    IDS.lock().unwrap().acknowledge_alert(&alert_id)
}

#[tauri::command]
pub fn clear_security_alerts() -> Result<(), String> {
    IDS.lock().unwrap().clear_alerts();
    Ok(())
}

#[tauri::command]
pub fn get_tls_sessions() -> Vec<TlsSession> {
    let ids = IDS.lock().unwrap();
    ids.get_tls_sessions().iter().map(|s| (*s).clone()).collect()
}

#[tauri::command]
pub fn parse_tls_handshake(data: Vec<u8>) -> Result<TlsHandshakeMessage, String> {
    tls_parser::parse_tls_handshake(&data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn parse_certificate_der(data: Vec<u8>, index: Option<usize>) -> Result<X509Certificate, String> {
    cert_parser::parse_certificate_der(&data, index.unwrap_or(0)).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn parse_certificate_chain(data: Vec<u8>) -> Result<Vec<X509Certificate>, String> {
    let der_certs = tls_parser::parse_certificate_chain(&data).map_err(|e| e.to_string())?;
    cert_parser::parse_certificate_chain(&der_certs).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_certificate_pem(data: Vec<u8>) -> String {
    cert_parser::der_to_pem(&data)
}

#[tauri::command]
pub fn validate_certificate(data: Vec<u8>) -> Result<(X509Certificate, Vec<String>), String> {
    let cert = cert_parser::parse_certificate_der(&data, 0).map_err(|e| e.to_string())?;
    let issues = cert_parser::validate_certificate(&cert);
    Ok((cert, issues))
}

#[tauri::command]
pub fn update_detection_config(config: DetectionConfig) -> Result<(), String> {
    IDS.lock().unwrap().update_config(config);
    Ok(())
}

#[tauri::command]
pub fn get_detection_config() -> DetectionConfig {
    DetectionConfig::default()
}
