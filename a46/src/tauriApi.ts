import { invoke } from "@tauri-apps/api/tauri";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  NetworkInterface,
  PacketInfo,
  CaptureSession,
  ProtocolStats,
  TrafficStats,
  TopTalker,
  TcpStreamData,
  SecurityAlert,
  SecurityStats,
  DetectionConfig,
  TlsSession,
  TlsHandshakeMessage,
  X509Certificate,
} from "./types";

export const tauriApi = {
  async getInterfaces(): Promise<NetworkInterface[]> {
    return invoke("get_interfaces");
  },

  async startCapture(
    interfaceName: string,
    promiscuous: boolean,
    bpfFilter?: string
  ): Promise<string> {
    return invoke("start_capture", {
      interfaceName,
      promiscuous,
      bpfFilter,
    });
  },

  async stopCapture(): Promise<CaptureSession> {
    return invoke("stop_capture");
  },

  async getPackets(sessionId?: string): Promise<PacketInfo[]> {
    return invoke("get_packets", { sessionId });
  },

  async getPacket(packetNumber: number): Promise<PacketInfo | null> {
    return invoke("get_packet", { packetNumber });
  },

  async getProtocolStats(): Promise<ProtocolStats[]> {
    return invoke("get_protocol_stats");
  },

  async getTrafficStats(): Promise<TrafficStats[]> {
    return invoke("get_traffic_stats");
  },

  async getTopTalkers(): Promise<TopTalker[]> {
    return invoke("get_top_talkers");
  },

  async getTcpStreams(): Promise<TcpStreamData[]> {
    return invoke("get_tcp_streams");
  },

  async getTcpStream(streamId: string): Promise<TcpStreamData | null> {
    return invoke("get_tcp_stream", { streamId });
  },

  async clearPackets(): Promise<void> {
    return invoke("clear_packets");
  },

  async compileBpfFilter(filter: string): Promise<{ valid: boolean; error?: string }> {
    return invoke("compile_bpf_filter", { filter });
  },

  async setDisplayFilter(filter: string): Promise<void> {
    return invoke("set_display_filter", { filter });
  },

  async getSecurityAlerts(count?: number): Promise<SecurityAlert[]> {
    return invoke("get_security_alerts", { count });
  },

  async getSecurityStats(): Promise<SecurityStats> {
    return invoke("get_security_stats");
  },

  async acknowledgeAlert(alertId: string): Promise<boolean> {
    return invoke("acknowledge_alert", { alertId });
  },

  async clearSecurityAlerts(): Promise<void> {
    return invoke("clear_security_alerts");
  },

  async getTlsSessions(): Promise<TlsSession[]> {
    return invoke("get_tls_sessions");
  },

  async parseTlsHandshake(data: number[]): Promise<TlsHandshakeMessage> {
    return invoke("parse_tls_handshake", { data });
  },

  async parseCertificateDer(data: number[], index?: number): Promise<X509Certificate> {
    return invoke("parse_certificate_der", { data, index });
  },

  async parseCertificateChain(data: number[]): Promise<X509Certificate[]> {
    return invoke("parse_certificate_chain", { data });
  },

  async exportCertificatePem(data: number[]): Promise<string> {
    return invoke("export_certificate_pem", { data });
  },

  async validateCertificate(data: number[]): Promise<{ cert: X509Certificate; issues: string[] }> {
    const result: [X509Certificate, string[]] = await invoke("validate_certificate", { data });
    return { cert: result[0], issues: result[1] };
  },

  async updateDetectionConfig(config: DetectionConfig): Promise<void> {
    return invoke("update_detection_config", { config });
  },

  async getDetectionConfig(): Promise<DetectionConfig> {
    return invoke("get_detection_config");
  },

  onPacketReceived(callback: (packet: PacketInfo) => void): Promise<UnlistenFn> {
    return listen<PacketInfo>("packet_received", (event) => {
      callback(event.payload);
    });
  },

  onSecurityAlert(callback: (alert: SecurityAlert) => void): Promise<UnlistenFn> {
    return listen<SecurityAlert>("security_alert", (event) => {
      callback(event.payload);
    });
  },

  onStatsUpdated(callback: () => void): Promise<UnlistenFn> {
    return listen<void>("stats_updated", () => {
      callback();
    });
  },

  onCaptureStarted(callback: (session: CaptureSession) => void): Promise<UnlistenFn> {
    return listen<CaptureSession>("capture_started", (event) => {
      callback(event.payload);
    });
  },

  onCaptureStopped(callback: (session: CaptureSession) => void): Promise<UnlistenFn> {
    return listen<CaptureSession>("capture_stopped", (event) => {
      callback(event.payload);
    });
  },
};
