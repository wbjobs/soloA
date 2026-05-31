use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInterface {
    pub name: String,
    pub description: String,
    pub addresses: Vec<InterfaceAddress>,
    pub is_up: bool,
    pub is_running: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InterfaceAddress {
    pub ip: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub netmask: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub broadcast: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PacketInfo {
    pub number: u64,
    pub timestamp: i64,
    pub timestamp_str: String,
    pub src_address: String,
    pub dst_address: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub src_port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dst_port: Option<u16>,
    pub protocol: String,
    pub length: u32,
    pub info: String,
    pub raw_bytes: Vec<u8>,
    pub tree: ProtocolTreeNode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtocolTreeNode {
    pub name: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_value: Option<Vec<u8>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<Vec<ProtocolField>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<ProtocolTreeNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtocolField {
    pub name: String,
    pub value: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureSession {
    pub id: String,
    pub name: String,
    pub interface_name: String,
    pub start_time: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_time: Option<i64>,
    pub packet_count: u64,
    pub promiscuous: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bpf_filter: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProtocolStats {
    pub protocol: String,
    pub count: u64,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrafficStats {
    pub timestamp: i64,
    pub bytes: u64,
    pub packets: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopTalker {
    pub address: String,
    pub packets: u64,
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TcpStreamData {
    pub stream_id: String,
    pub client_address: String,
    pub client_port: u16,
    pub server_address: String,
    pub server_port: u16,
    pub client_data: String,
    pub server_data: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct TcpStreamKey {
    pub src_ip: IpAddr,
    pub dst_ip: IpAddr,
    pub src_port: u16,
    pub dst_port: u16,
}

impl TcpStreamKey {
    pub fn new(src_ip: IpAddr, dst_ip: IpAddr, src_port: u16, dst_port: u16) -> Self {
        Self {
            src_ip,
            dst_ip,
            src_port,
            dst_port,
        }
    }

    pub fn canonical(&self) -> Self {
        if (self.src_ip, self.src_port) > (self.dst_ip, self.dst_port) {
            Self {
                src_ip: self.dst_ip,
                dst_ip: self.src_ip,
                src_port: self.dst_port,
                dst_port: self.src_port,
            }
        } else {
            self.clone()
        }
    }

    pub fn to_string(&self) -> String {
        format!("{}:{} <-> {}:{}", self.src_ip, self.src_port, self.dst_ip, self.dst_port)
    }
}

#[derive(Debug, Clone)]
pub struct ParsedPacket {
    pub eth_frame: Option<EthernetFrame>,
    pub ipv4_packet: Option<Ipv4Packet>,
    pub ipv6_packet: Option<Ipv6Packet>,
    pub tcp_segment: Option<TcpSegment>,
    pub udp_datagram: Option<UdpDatagram>,
    pub arp_packet: Option<ArpPacket>,
    pub icmp_packet: Option<IcmpPacket>,
    pub http_message: Option<HttpMessage>,
    pub dns_message: Option<DnsMessage>,
    pub info: String,
    pub top_protocol: String,
    pub src_addr: String,
    pub dst_addr: String,
    pub src_port: Option<u16>,
    pub dst_port: Option<u16>,
}

#[derive(Debug, Clone)]
pub struct EthernetFrame {
    pub dst_mac: [u8; 6],
    pub src_mac: [u8; 6],
    pub ether_type: u16,
    pub payload: Vec<u8>,
    pub raw_bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct ArpPacket {
    pub hardware_type: u16,
    pub protocol_type: u16,
    pub hw_addr_len: u8,
    pub proto_addr_len: u8,
    pub operation: u16,
    pub sender_mac: [u8; 6],
    pub sender_ip: Ipv4Addr,
    pub target_mac: [u8; 6],
    pub target_ip: Ipv4Addr,
    pub raw_bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct Ipv4Packet {
    pub version: u8,
    pub ihl: u8,
    pub tos: u8,
    pub total_length: u16,
    pub identification: u16,
    pub flags: u8,
    pub frag_offset: u16,
    pub ttl: u8,
    pub protocol: u8,
    pub checksum: u16,
    pub src_ip: Ipv4Addr,
    pub dst_ip: Ipv4Addr,
    pub options: Vec<u8>,
    pub payload: Vec<u8>,
    pub raw_bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct Ipv6Packet {
    pub version: u8,
    pub traffic_class: u8,
    pub flow_label: u32,
    pub payload_length: u16,
    pub next_header: u8,
    pub hop_limit: u8,
    pub src_ip: Ipv6Addr,
    pub dst_ip: Ipv6Addr,
    pub payload: Vec<u8>,
    pub raw_bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct TcpSegment {
    pub src_port: u16,
    pub dst_port: u16,
    pub seq_number: u32,
    pub ack_number: u32,
    pub data_offset: u8,
    pub flags: TcpFlags,
    pub window_size: u16,
    pub checksum: u16,
    pub urgent_ptr: u16,
    pub options: Vec<u8>,
    pub payload: Vec<u8>,
    pub raw_bytes: Vec<u8>,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct TcpFlags {
    pub urg: bool,
    pub ack: bool,
    pub psh: bool,
    pub rst: bool,
    pub syn: bool,
    pub fin: bool,
}

impl TcpFlags {
    pub fn from_u8(byte: u8) -> Self {
        Self {
            urg: (byte & 0x20) != 0,
            ack: (byte & 0x10) != 0,
            psh: (byte & 0x08) != 0,
            rst: (byte & 0x04) != 0,
            syn: (byte & 0x02) != 0,
            fin: (byte & 0x01) != 0,
        }
    }

    pub fn to_u8(self) -> u8 {
        let mut byte = 0;
        if self.urg { byte |= 0x20; }
        if self.ack { byte |= 0x10; }
        if self.psh { byte |= 0x08; }
        if self.rst { byte |= 0x04; }
        if self.syn { byte |= 0x02; }
        if self.fin { byte |= 0x01; }
        byte
    }

    pub fn to_string(self) -> String {
        let mut s = String::new();
        if self.urg { s.push_str("URG "); }
        if self.ack { s.push_str("ACK "); }
        if self.psh { s.push_str("PSH "); }
        if self.rst { s.push_str("RST "); }
        if self.syn { s.push_str("SYN "); }
        if self.fin { s.push_str("FIN "); }
        s.trim().to_string()
    }
}

#[derive(Debug, Clone)]
pub struct UdpDatagram {
    pub src_port: u16,
    pub dst_port: u16,
    pub length: u16,
    pub checksum: u16,
    pub payload: Vec<u8>,
    pub raw_bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct IcmpPacket {
    pub message_type: u8,
    pub code: u8,
    pub checksum: u16,
    pub data: Vec<u8>,
    pub raw_bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct HttpMessage {
    pub is_request: bool,
    pub method: Option<String>,
    pub uri: Option<String>,
    pub version: String,
    pub status_code: Option<u16>,
    pub status_text: Option<String>,
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
    pub raw_bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct DnsMessage {
    pub id: u16,
    pub flags: u16,
    pub qr: bool,
    pub opcode: u8,
    pub aa: bool,
    pub tc: bool,
    pub rd: bool,
    pub ra: bool,
    pub rcode: u8,
    pub questions: Vec<DnsQuestion>,
    pub answers: Vec<DnsResourceRecord>,
    pub authorities: Vec<DnsResourceRecord>,
    pub additionals: Vec<DnsResourceRecord>,
    pub raw_bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
pub struct DnsQuestion {
    pub name: String,
    pub qtype: u16,
    pub qclass: u16,
}

#[derive(Debug, Clone)]
pub struct DnsResourceRecord {
    pub name: String,
    pub rtype: u16,
    pub rclass: u16,
    pub ttl: u32,
    pub rdata: Vec<u8>,
}

pub const ETHERTYPE_IP: u16 = 0x0800;
pub const ETHERTYPE_IPV6: u16 = 0x86DD;
pub const ETHERTYPE_ARP: u16 = 0x0806;

pub const IPPROTO_TCP: u8 = 6;
pub const IPPROTO_UDP: u8 = 17;
pub const IPPROTO_ICMP: u8 = 1;

pub const DNS_PORT: u16 = 53;
pub const HTTP_PORTS: &[u16] = &[80, 8080, 3000, 8000, 443];
pub const HTTPS_PORT: u16 = 443;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TlsHandshakeType {
    ClientHello,
    ServerHello,
    Certificate,
    ServerKeyExchange,
    ServerHelloDone,
    ClientKeyExchange,
    Finished,
    Unknown(u8),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TlsCipherSuite {
    pub code: u16,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TlsHandshakeMessage {
    pub handshake_type: TlsHandshakeType,
    pub version: Option<String>,
    pub random: Vec<u8>,
    pub session_id: Option<Vec<u8>>,
    pub cipher_suites: Vec<TlsCipherSuite>,
    pub server_name: Option<String>,
    pub compression_methods: Option<Vec<u8>>,
    pub extensions: Vec<(u16, String)>,
    pub selected_cipher_suite: Option<TlsCipherSuite>,
    pub raw_bytes: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct X509Certificate {
    pub index: usize,
    pub raw_der: Vec<u8>,
    pub pem_string: String,
    pub version: u32,
    pub serial_number: String,
    pub signature_algorithm: String,
    pub issuer: CertificateName,
    pub subject: CertificateName,
    pub not_before: i64,
    pub not_after: i64,
    pub public_key_algorithm: String,
    pub public_key_bytes: Vec<u8>,
    pub sans: Vec<String>,
    pub key_usage: Option<Vec<String>>,
    pub extended_key_usage: Option<Vec<String>>,
    pub is_valid_now: bool,
    pub is_self_signed: bool,
    pub fingerprint_sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CertificateName {
    pub common_name: Option<String>,
    pub organization: Option<String>,
    pub organizational_unit: Option<String>,
    pub locality: Option<String>,
    pub state: Option<String>,
    pub country: Option<String>,
    pub email: Option<String>,
    pub raw_string: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TlsSession {
    pub id: String,
    pub client_address: String,
    pub client_port: u16,
    pub server_address: String,
    pub server_port: u16,
    pub server_name: Option<String>,
    pub negotiated_version: Option<String>,
    pub cipher_suite: Option<TlsCipherSuite>,
    pub certificate_chain: Vec<X509Certificate>,
    pub start_time: i64,
    pub end_time: Option<i64>,
    pub client_hello: Option<TlsHandshakeMessage>,
    pub server_hello: Option<TlsHandshakeMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AlertSeverity {
    Info,
    Warning,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AlertType {
    PortScan,
    DnsTunnel,
    AbnormalTraffic,
    ExpiredCertificate,
    SelfSignedCertificate,
    UncommonPort,
    LargeOutboundTransfer,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityAlert {
    pub id: String,
    pub alert_type: AlertType,
    pub severity: AlertSeverity,
    pub timestamp: i64,
    pub source_address: Option<String>,
    pub destination_address: Option<String>,
    pub source_port: Option<u16>,
    pub destination_port: Option<u16>,
    pub title: String,
    pub description: String,
    pub details: serde_json::Value,
    pub acknowledged: bool,
    pub packet_reference: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectionConfig {
    pub port_scan_enabled: bool,
    pub port_scan_threshold: u16,
    pub port_scan_time_window_ms: u64,
    
    pub dns_tunnel_enabled: bool,
    pub dns_tunnel_threshold: u32,
    
    pub traffic_threshold_enabled: bool,
    pub max_bytes_per_second: u64,
    pub max_packets_per_second: u64,
    
    pub certificate_validation_enabled: bool,
}

impl Default for DetectionConfig {
    fn default() -> Self {
        DetectionConfig {
            port_scan_enabled: true,
            port_scan_threshold: 20,
            port_scan_time_window_ms: 5000,
            
            dns_tunnel_enabled: true,
            dns_tunnel_threshold: 1000,
            
            traffic_threshold_enabled: true,
            max_bytes_per_second: 100 * 1024 * 1024,
            max_packets_per_second: 10000,
            
            certificate_validation_enabled: true,
        }
    }
}

#[derive(Debug, Clone)]
pub struct TlsMessage {
    pub content_type: u8,
    pub version: u16,
    pub length: u16,
    pub payload: Vec<u8>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecurityStats {
    pub total_alerts: u64,
    pub critical_alerts: u64,
    pub high_alerts: u64,
    pub warning_alerts: u64,
    pub info_alerts: u64,
    pub port_scan_attempts: u64,
    pub dns_tunnel_attempts: u64,
    pub tls_sessions: u64,
    pub expired_certificates: u64,
    pub self_signed_certificates: u64,
}
