export interface NetworkInterface {
  name: string;
  description: string;
  addresses: InterfaceAddress[];
  is_up: boolean;
  is_running: boolean;
}

export interface InterfaceAddress {
  ip: string;
  netmask?: string;
  broadcast?: string;
}

export interface PacketInfo {
  number: number;
  timestamp: number;
  timestamp_str: string;
  src_address: string;
  dst_address: string;
  src_port?: number;
  dst_port?: number;
  protocol: string;
  length: number;
  info: string;
  raw_bytes: number[];
  tree: ProtocolTreeNode;
}

export interface ProtocolTreeNode {
  name: string;
  description: string;
  raw_value?: number[];
  fields?: ProtocolField[];
  children?: ProtocolTreeNode[];
}

export interface ProtocolField {
  name: string;
  value: string;
  raw_value?: string;
  description?: string;
}

export interface CaptureSession {
  id: string;
  name: string;
  interface_name: string;
  start_time: number;
  end_time?: number;
  packet_count: number;
  promiscuous: boolean;
  bpf_filter?: string;
}

export interface ProtocolStats {
  protocol: string;
  count: number;
  bytes: number;
}

export interface TrafficStats {
  timestamp: number;
  bytes: number;
  packets: number;
}

export interface TopTalker {
  address: string;
  packets: number;
  bytes: number;
}

export interface TcpStreamData {
  stream_id: string;
  client_address: string;
  client_port: number;
  server_address: string;
  server_port: number;
  client_data: string;
  server_data: string;
}

export interface FilterConfig {
  protocol?: string;
  src_ip?: string;
  dst_ip?: string;
  src_port?: number;
  dst_port?: number;
  search_text?: string;
}

export type AlertSeverity = "Info" | "Warning" | "High" | "Critical";

export type AlertType = 
  | "PortScan"
  | "DnsTunnel"
  | "AbnormalTraffic"
  | "ExpiredCertificate"
  | "SelfSignedCertificate"
  | "UncommonPort"
  | "LargeOutboundTransfer"
  | "Unknown";

export interface SecurityAlert {
  id: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  timestamp: number;
  source_address?: string;
  destination_address?: string;
  source_port?: number;
  destination_port?: number;
  title: string;
  description: string;
  details: any;
  acknowledged: boolean;
  packet_reference?: number;
}

export interface SecurityStats {
  total_alerts: number;
  critical_alerts: number;
  high_alerts: number;
  warning_alerts: number;
  info_alerts: number;
  port_scan_attempts: number;
  dns_tunnel_attempts: number;
  tls_sessions: number;
  expired_certificates: number;
  self_signed_certificates: number;
}

export interface DetectionConfig {
  port_scan_enabled: boolean;
  port_scan_threshold: number;
  port_scan_time_window_ms: number;
  dns_tunnel_enabled: boolean;
  dns_tunnel_threshold: number;
  traffic_threshold_enabled: boolean;
  max_bytes_per_second: number;
  max_packets_per_second: number;
  certificate_validation_enabled: boolean;
}

export interface TlsCipherSuite {
  code: number;
  name: string;
}

export type TlsHandshakeType = 
  | "ClientHello"
  | "ServerHello"
  | "Certificate"
  | "ServerKeyExchange"
  | "ServerHelloDone"
  | "ClientKeyExchange"
  | "Finished"
  | { Unknown: number };

export interface TlsHandshakeMessage {
  handshake_type: TlsHandshakeType;
  version?: string;
  random: number[];
  session_id?: number[];
  cipher_suites: TlsCipherSuite[];
  server_name?: string;
  compression_methods?: number[];
  extensions: [number, string][];
  selected_cipher_suite?: TlsCipherSuite;
  raw_bytes: number[];
}

export interface CertificateName {
  common_name?: string;
  organization?: string;
  organizational_unit?: string;
  locality?: string;
  state?: string;
  country?: string;
  email?: string;
  raw_string: string;
}

export interface X509Certificate {
  index: number;
  raw_der: number[];
  pem_string: string;
  version: number;
  serial_number: string;
  signature_algorithm: string;
  issuer: CertificateName;
  subject: CertificateName;
  not_before: number;
  not_after: number;
  public_key_algorithm: string;
  public_key_bytes: number[];
  sans: string[];
  key_usage?: string[];
  extended_key_usage?: string[];
  is_valid_now: boolean;
  is_self_signed: boolean;
  fingerprint_sha256: string;
}

export interface TlsSession {
  id: string;
  client_address: string;
  client_port: number;
  server_address: string;
  server_port: number;
  server_name?: string;
  negotiated_version?: string;
  cipher_suite?: TlsCipherSuite;
  certificate_chain: X509Certificate[];
  start_time: number;
  end_time?: number;
  client_hello?: TlsHandshakeMessage;
  server_hello?: TlsHandshakeMessage;
}
