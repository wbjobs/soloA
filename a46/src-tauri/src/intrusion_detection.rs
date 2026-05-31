use crate::types::*;
use crate::errors::*;
use std::collections::{HashMap, HashSet};
use std::time::{Instant, Duration};
use uuid::Uuid;
use chrono::Utc;

pub struct IntrusionDetectionEngine {
    config: DetectionConfig,
    
    port_scan_trackers: HashMap<String, PortScanTracker>,
    dns_queries: HashMap<String, DnsQueryTracker>,
    
    traffic_bytes_last_sec: u64,
    traffic_packets_last_sec: u64,
    traffic_window_start: Instant,
    
    alerts: Vec<SecurityAlert>,
    seen_alerts: HashSet<String>,
    
    tls_sessions: HashMap<String, TlsSession>,
    known_certs: HashSet<String>,
}

struct PortScanTracker {
    ports: HashSet<u16>,
    first_seen: Instant,
    last_activity: Instant,
    target_ip: String,
}

struct DnsQueryTracker {
    query_count: u32,
    total_length: u32,
    subdomains: HashSet<String>,
    first_seen: Instant,
    last_activity: Instant,
}

impl IntrusionDetectionEngine {
    pub fn new() -> Self {
        IntrusionDetectionEngine {
            config: DetectionConfig::default(),
            port_scan_trackers: HashMap::new(),
            dns_queries: HashMap::new(),
            traffic_bytes_last_sec: 0,
            traffic_packets_last_sec: 0,
            traffic_window_start: Instant::now(),
            alerts: Vec::new(),
            seen_alerts: HashSet::new(),
            tls_sessions: HashMap::new(),
            known_certs: HashSet::new(),
        }
    }

    pub fn with_config(config: DetectionConfig) -> Self {
        IntrusionDetectionEngine {
            config,
            ..Default::default()
        }
    }

    pub fn process_packet(&mut self, packet: &PacketInfo) -> Vec<SecurityAlert> {
        let mut new_alerts = Vec::new();

        self.update_traffic_stats(packet.length as u64);

        if self.config.port_scan_enabled {
            if let Some(alert) = self.check_port_scan(packet) {
                if self.add_alert_if_new(&alert) {
                    new_alerts.push(alert);
                }
            }
        }

        if packet.protocol.to_uppercase() == "DNS" {
            if self.config.dns_tunnel_enabled {
                if let Some(alert) = self.check_dns_tunnel(packet) {
                    if self.add_alert_if_new(&alert) {
                        new_alerts.push(alert);
                    }
                }
            }
        }

        if self.config.traffic_threshold_enabled {
            if let Some(alert) = self.check_traffic_threshold() {
                if self.add_alert_if_new(&alert) {
                    new_alerts.push(alert);
                }
            }
        }

        new_alerts
    }

    fn update_traffic_stats(&mut self, bytes: u64) {
        let now = Instant::now();
        if now.duration_since(self.traffic_window_start) > Duration::from_secs(1) {
            self.traffic_bytes_last_sec = 0;
            self.traffic_packets_last_sec = 0;
            self.traffic_window_start = now;
        }
        self.traffic_bytes_last_sec += bytes;
        self.traffic_packets_last_sec += 1;
    }

    fn check_port_scan(&mut self, packet: &PacketInfo) -> Option<SecurityAlert> {
        if packet.dst_port.is_none() {
            return None;
        }

        let src_ip = &packet.src_address;
        let target_ip = &packet.dst_address;
        let dst_port = packet.dst_port.unwrap();

        let tracker_key = format!("{}->{}", src_ip, target_ip);
        let now = Instant::now();

        let tracker = self.port_scan_trackers
            .entry(tracker_key.clone())
            .or_insert_with(|| PortScanTracker {
                ports: HashSet::new(),
                first_seen: now,
                last_activity: now,
                target_ip: target_ip.clone(),
            });

        if now.duration_since(tracker.first_seen) > Duration::from_millis(self.config.port_scan_time_window_ms) {
            tracker.ports.clear();
            tracker.first_seen = now;
        }

        tracker.ports.insert(dst_port);
        tracker.last_activity = now;

        if tracker.ports.len() >= self.config.port_scan_threshold as usize {
            let ports: Vec<String> = tracker.ports.iter().map(|p| p.to_string()).collect();
            
            let alert = SecurityAlert {
                id: Uuid::new_v4().to_string(),
                alert_type: AlertType::PortScan,
                severity: AlertSeverity::High,
                timestamp: Utc::now().timestamp_millis(),
                source_address: Some(src_ip.clone()),
                destination_address: Some(target_ip.clone()),
                source_port: packet.src_port,
                destination_port: packet.dst_port,
                title: "Port Scan Detected".to_string(),
                description: format!(
                    "Detected port scan from {} targeting {}. Scanned {} ports: {}",
                    src_ip, target_ip, tracker.ports.len(), ports.join(", ")
                ),
                details: serde_json::json!({
                    "scanner_ip": src_ip,
                    "target_ip": target_ip,
                    "scanned_ports": ports,
                    "ports_count": tracker.ports.len(),
                    "time_window_ms": self.config.port_scan_time_window_ms,
                }),
                acknowledged: false,
                packet_reference: Some(packet.number),
            };

            tracker.ports.clear();
            tracker.first_seen = now;

            return Some(alert);
        }

        None
    }

    fn check_dns_tunnel(&mut self, packet: &PacketInfo) -> Option<SecurityAlert> {
        let src_ip = &packet.src_address;
        let tracker_key = src_ip.clone();
        let now = Instant::now();

        let tracker = self.dns_queries
            .entry(tracker_key.clone())
            .or_insert_with(|| DnsQueryTracker {
                query_count: 0,
                total_length: 0,
                subdomains: HashSet::new(),
                first_seen: now,
                last_activity: now,
            });

        if now.duration_since(tracker.first_seen) > Duration::from_secs(60) {
            tracker.query_count = 0;
            tracker.total_length = 0;
            tracker.subdomains.clear();
            tracker.first_seen = now;
        }

        tracker.query_count += 1;
        tracker.total_length += packet.length as u32;
        tracker.last_activity = now;

        let avg_length = if tracker.query_count > 0 {
            tracker.total_length / tracker.query_count
        } else {
            0
        };

        if tracker.query_count >= 100 || avg_length > self.config.dns_tunnel_threshold {
            let alert = SecurityAlert {
                id: Uuid::new_v4().to_string(),
                alert_type: AlertType::DnsTunnel,
                severity: AlertSeverity::High,
                timestamp: Utc::now().timestamp_millis(),
                source_address: Some(src_ip.clone()),
                destination_address: packet.dst_port.map(|_| "DNS Server".to_string()),
                source_port: packet.src_port,
                destination_port: Some(53),
                title: "Potential DNS Tunnel".to_string(),
                description: format!(
                    "Suspicious DNS activity from {}. {} queries, avg length: {} bytes",
                    src_ip, tracker.query_count, avg_length
                ),
                details: serde_json::json!({
                    "source_ip": src_ip,
                    "query_count": tracker.query_count,
                    "avg_length": avg_length,
                    "total_length": tracker.total_length,
                }),
                acknowledged: false,
                packet_reference: Some(packet.number),
            };

            tracker.query_count = 0;
            tracker.total_length = 0;

            return Some(alert);
        }

        None
    }

    fn check_traffic_threshold(&mut self) -> Option<SecurityAlert> {
        let now = Instant::now();
        if now.duration_since(self.traffic_window_start) < Duration::from_millis(900) {
            return None;
        }

        if self.traffic_bytes_last_sec > self.config.max_bytes_per_second {
            let alert = SecurityAlert {
                id: Uuid::new_v4().to_string(),
                alert_type: AlertType::AbnormalTraffic,
                severity: AlertSeverity::Warning,
                timestamp: Utc::now().timestamp_millis(),
                source_address: None,
                destination_address: None,
                source_port: None,
                destination_port: None,
                title: "Abnormal Traffic Volume".to_string(),
                description: format!(
                    "Traffic volume exceeds threshold: {} bytes/sec (threshold: {})",
                    self.traffic_bytes_last_sec, self.config.max_bytes_per_second
                ),
                details: serde_json::json!({
                    "bytes_per_sec": self.traffic_bytes_last_sec,
                    "packets_per_sec": self.traffic_packets_last_sec,
                    "bytes_threshold": self.config.max_bytes_per_second,
                    "packets_threshold": self.config.max_packets_per_second,
                }),
                acknowledged: false,
                packet_reference: None,
            };

            self.traffic_bytes_last_sec = 0;
            self.traffic_packets_last_sec = 0;
            self.traffic_window_start = now;

            return Some(alert);
        }

        if self.traffic_packets_last_sec > self.config.max_packets_per_second {
            let alert = SecurityAlert {
                id: Uuid::new_v4().to_string(),
                alert_type: AlertType::AbnormalTraffic,
                severity: AlertSeverity::Warning,
                timestamp: Utc::now().timestamp_millis(),
                source_address: None,
                destination_address: None,
                source_port: None,
                destination_port: None,
                title: "Abnormal Packet Rate".to_string(),
                description: format!(
                    "Packet rate exceeds threshold: {} pkts/sec (threshold: {})",
                    self.traffic_packets_last_sec, self.config.max_packets_per_second
                ),
                details: serde_json::json!({
                    "bytes_per_sec": self.traffic_bytes_last_sec,
                    "packets_per_sec": self.traffic_packets_last_sec,
                    "packets_threshold": self.config.max_packets_per_second,
                }),
                acknowledged: false,
                packet_reference: None,
            };

            return Some(alert);
        }

        None
    }

    pub fn process_tls_handshake(&mut self, tls_msg: &TlsHandshakeMessage, src_ip: &str, dst_ip: &str, src_port: u16, dst_port: u16) -> Vec<SecurityAlert> {
        let mut new_alerts = Vec::new();

        match tls_msg.handshake_type {
            TlsHandshakeType::ClientHello => {
                let sni = tls_msg.server_name.clone();
                let session_key = format!("{}:{}<->{}:{}", src_ip, src_port, dst_ip, dst_port);
                
                let session = self.tls_sessions
                    .entry(session_key.clone())
                    .or_insert_with(|| TlsSession {
                        id: Uuid::new_v4().to_string(),
                        client_address: src_ip.to_string(),
                        client_port: src_port,
                        server_address: dst_ip.to_string(),
                        server_port: dst_port,
                        server_name: sni.clone(),
                        negotiated_version: None,
                        cipher_suite: None,
                        certificate_chain: Vec::new(),
                        start_time: Utc::now().timestamp_millis(),
                        end_time: None,
                        client_hello: Some(tls_msg.clone()),
                        server_hello: None,
                    });
                session.client_hello = Some(tls_msg.clone());
            }
            TlsHandshakeType::ServerHello => {
                let session_key = format!("{}:{}<->{}:{}", dst_ip, dst_port, src_ip, src_port);
                if let Some(session) = self.tls_sessions.get_mut(&session_key) {
                    session.server_hello = Some(tls_msg.clone());
                    session.negotiated_version = tls_msg.version.clone();
                    session.cipher_suite = tls_msg.selected_cipher_suite.clone();
                }
            }
            _ => {}
        }

        new_alerts
    }

    pub fn process_certificates(&mut self, certs: &[X509Certificate], src_ip: &str, dst_ip: &str, packet_num: u64) -> Vec<SecurityAlert> {
        let mut new_alerts = Vec::new();

        if !self.config.certificate_validation_enabled {
            return new_alerts;
        }

        for cert in certs {
            let fingerprint = cert.fingerprint_sha256.clone();
            
            if !self.known_certs.contains(&fingerprint) {
                self.known_certs.insert(fingerprint.clone());

                let now = Utc::now().timestamp();
                
                if now > cert.not_after {
                    let alert = SecurityAlert {
                        id: Uuid::new_v4().to_string(),
                        alert_type: AlertType::ExpiredCertificate,
                        severity: AlertSeverity::High,
                        timestamp: Utc::now().timestamp_millis(),
                        source_address: Some(dst_ip.to_string()),
                        destination_address: Some(src_ip.to_string()),
                        source_port: Some(443),
                        destination_port: None,
                        title: "Expired TLS Certificate".to_string(),
                        description: format!(
                            "Expired certificate detected for {} (CN: {})",
                            cert.subject.common_name.as_deref().unwrap_or("unknown"),
                            cert.subject.common_name.as_deref().unwrap_or("unknown")
                        ),
                        details: serde_json::json!({
                            "cn": cert.subject.common_name,
                            "issuer": cert.issuer.raw_string,
                            "not_after": cert.not_after,
                            "fingerprint": cert.fingerprint_sha256,
                            "sans": cert.sans,
                        }),
                        acknowledged: false,
                        packet_reference: Some(packet_num),
                    };
                    if self.add_alert_if_new(&alert) {
                        new_alerts.push(alert);
                    }
                }

                if cert.is_self_signed {
                    let alert = SecurityAlert {
                        id: Uuid::new_v4().to_string(),
                        alert_type: AlertType::SelfSignedCertificate,
                        severity: AlertSeverity::Warning,
                        timestamp: Utc::now().timestamp_millis(),
                        source_address: Some(dst_ip.to_string()),
                        destination_address: Some(src_ip.to_string()),
                        source_port: Some(443),
                        destination_port: None,
                        title: "Self-Signed TLS Certificate".to_string(),
                        description: format!(
                            "Self-signed certificate detected for {} (CN: {})",
                            cert.subject.common_name.as_deref().unwrap_or("unknown"),
                            cert.subject.common_name.as_deref().unwrap_or("unknown")
                        ),
                        details: serde_json::json!({
                            "cn": cert.subject.common_name,
                            "issuer": cert.issuer.raw_string,
                            "subject": cert.subject.raw_string,
                            "fingerprint": cert.fingerprint_sha256,
                            "sans": cert.sans,
                        }),
                        acknowledged: false,
                        packet_reference: Some(packet_num),
                    };
                    if self.add_alert_if_new(&alert) {
                        new_alerts.push(alert);
                    }
                }
            }
        }

        new_alerts
    }

    fn add_alert_if_new(&mut self, alert: &SecurityAlert) -> bool {
        let dedup_key = format!(
            "{:?}:{:?}:{}",
            alert.alert_type,
            alert.source_address,
            alert.destination_address.as_deref().unwrap_or("")
        );

        if self.seen_alerts.insert(dedup_key) {
            self.alerts.push(alert.clone());
            true
        } else {
            false
        }
    }

    pub fn get_alerts(&self) -> &[SecurityAlert] {
        &self.alerts
    }

    pub fn get_recent_alerts(&self, count: usize) -> Vec<SecurityAlert> {
        self.alerts
            .iter()
            .rev()
            .take(count)
            .cloned()
            .collect()
    }

    pub fn get_alerts_by_type(&self, alert_type: &AlertType) -> Vec<SecurityAlert> {
        self.alerts
            .iter()
            .filter(|a| &a.alert_type == alert_type)
            .cloned()
            .collect()
    }

    pub fn get_stats(&self) -> SecurityStats {
        SecurityStats {
            total_alerts: self.alerts.len() as u64,
            critical_alerts: self.alerts.iter().filter(|a| a.severity == AlertSeverity::Critical).count() as u64,
            high_alerts: self.alerts.iter().filter(|a| a.severity == AlertSeverity::High).count() as u64,
            warning_alerts: self.alerts.iter().filter(|a| a.severity == AlertSeverity::Warning).count() as u64,
            info_alerts: self.alerts.iter().filter(|a| a.severity == AlertSeverity::Info).count() as u64,
            port_scan_attempts: self.alerts.iter().filter(|a| a.alert_type == AlertType::PortScan).count() as u64,
            dns_tunnel_attempts: self.alerts.iter().filter(|a| a.alert_type == AlertType::DnsTunnel).count() as u64,
            tls_sessions: self.tls_sessions.len() as u64,
            expired_certificates: self.alerts.iter().filter(|a| a.alert_type == AlertType::ExpiredCertificate).count() as u64,
            self_signed_certificates: self.alerts.iter().filter(|a| a.alert_type == AlertType::SelfSignedCertificate).count() as u64,
        }
    }

    pub fn acknowledge_alert(&mut self, alert_id: &str) -> bool {
        if let Some(alert) = self.alerts.iter_mut().find(|a| a.id == alert_id) {
            alert.acknowledged = true;
            true
        } else {
            false
        }
    }

    pub fn clear_alerts(&mut self) {
        self.alerts.clear();
        self.seen_alerts.clear();
    }

    pub fn reset(&mut self) {
        self.port_scan_trackers.clear();
        self.dns_queries.clear();
        self.traffic_bytes_last_sec = 0;
        self.traffic_packets_last_sec = 0;
        self.traffic_window_start = Instant::now();
        self.alerts.clear();
        self.seen_alerts.clear();
        self.tls_sessions.clear();
        self.known_certs.clear();
    }

    pub fn get_tls_sessions(&self) -> Vec<&TlsSession> {
        self.tls_sessions.values().collect()
    }

    pub fn get_tls_session(&self, session_id: &str) -> Option<&TlsSession> {
        self.tls_sessions.values().find(|s| s.id == session_id)
    }

    pub fn update_config(&mut self, config: DetectionConfig) {
        self.config = config;
    }
}

impl Default for IntrusionDetectionEngine {
    fn default() -> Self {
        Self::new()
    }
}
