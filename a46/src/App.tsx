import React, { useState, useEffect, useCallback, useRef } from "react";
import { UnlistenFn } from "@tauri-apps/api/event";
import {
  NetworkInterface,
  PacketInfo,
  CaptureSession,
  ProtocolStats,
  TrafficStats,
  TopTalker,
  FilterConfig,
  SecurityAlert,
  SecurityStats,
  TlsSession,
  X509Certificate,
} from "./types";
import { tauriApi } from "./tauriApi";
import { Toolbar } from "./components/Toolbar";
import { FilterBar } from "./components/FilterBar";
import { PacketList } from "./components/PacketList";
import { ProtocolTree } from "./components/ProtocolTree";
import { HexDump } from "./components/HexDump";
import { Charts } from "./components/Charts";
import { SecurityAlerts } from "./components/SecurityAlerts";
import { CertificateViewer } from "./components/CertificateViewer";

type TabType = "analysis" | "security" | "charts";

function App() {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [selectedInterface, setSelectedInterface] = useState<NetworkInterface | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [promiscuous, setPromiscuous] = useState(true);
  const [bpfFilter, setBpfFilter] = useState("");
  const [packets, setPackets] = useState<PacketInfo[]>([]);
  const [filteredPackets, setFilteredPackets] = useState<PacketInfo[]>([]);
  const [selectedPacket, setSelectedPacket] = useState<PacketInfo | null>(null);
  const [filterConfig, setFilterConfig] = useState<FilterConfig>({});
  const [showInterfaceSelector, setShowInterfaceSelector] = useState(false);
  const [currentSession, setCurrentSession] = useState<CaptureSession | null>(null);
  const [protocolStats, setProtocolStats] = useState<ProtocolStats[]>([]);
  const [trafficStats, setTrafficStats] = useState<TrafficStats[]>([]);
  const [topTalkers, setTopTalkers] = useState<TopTalker[]>([]);
  const [packetCount, setPacketCount] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [activeTab, setActiveTab] = useState<TabType>("analysis");

  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>([]);
  const [securityStats, setSecurityStats] = useState<SecurityStats | null>(null);
  const [tlsSessions, setTlsSessions] = useState<TlsSession[]>([]);
  const [showCertificateViewer, setShowCertificateViewer] = useState(false);
  const [viewerCertificate, setViewerCertificate] = useState<X509Certificate | null>(null);
  const [viewerCertificates, setViewerCertificates] = useState<X509Certificate[] | null>(null);
  const [viewerTlsSession, setViewerTlsSession] = useState<TlsSession | null>(null);
  const [unacknowledgedCount, setUnacknowledgedCount] = useState(0);

  const listenersRef = useRef<UnlistenFn[]>([]);
  const packetsRef = useRef<PacketInfo[]>([]);
  const protocolStatsRef = useRef<Map<string, { count: number; bytes: number }>>(new Map());
  const trafficBucketsRef = useRef<Map<number, { bytes: number; packets: number }>>(new Map());
  const talkerStatsRef = useRef<Map<string, { packets: number; bytes: number }>>(new Map());

  useEffect(() => {
    loadInterfaces();
    loadInitialSecurityData();
    return () => {
      cleanupListeners();
    };
  }, []);

  const loadInitialSecurityData = async () => {
    try {
      const [alerts, stats, sessions] = await Promise.all([
        tauriApi.getSecurityAlerts(),
        tauriApi.getSecurityStats(),
        tauriApi.getTlsSessions(),
      ]);
      setSecurityAlerts(alerts);
      setSecurityStats(stats);
      setTlsSessions(sessions);
      setUnacknowledgedCount(alerts.filter((a) => !a.acknowledged).length);
    } catch (err) {
      console.error("Failed to load security data:", err);
    }
  };

  const cleanupListeners = () => {
    listenersRef.current.forEach((unlisten) => unlisten());
    listenersRef.current = [];
  };

  const loadInterfaces = async () => {
    try {
      const ifaces = await tauriApi.getInterfaces();
      setInterfaces(ifaces);
      if (ifaces.length > 0 && !selectedInterface) {
        setSelectedInterface(ifaces[0]);
      }
    } catch (err) {
      console.error("Failed to load interfaces:", err);
    }
  };

  const setupEventListeners = useCallback(async () => {
    cleanupListeners();

    const packetListener = await tauriApi.onPacketReceived((packet) => {
      packetsRef.current = [...packetsRef.current, packet];
      setPackets(packetsRef.current);
      setPacketCount((prev) => prev + 1);
      setTotalBytes((prev) => prev + packet.length);

      updateStats(packet);

      if (matchesFilter(packet, filterConfig)) {
        setFilteredPackets((prev) => [...prev, packet]);
      }
    });
    listenersRef.current.push(packetListener);

    const securityAlertListener = await tauriApi.onSecurityAlert((alert) => {
      setSecurityAlerts((prev) => [alert, ...prev]);
      setUnacknowledgedCount((prev) => prev + 1);
      refreshSecurityStats();
    });
    listenersRef.current.push(securityAlertListener);

    const statsListener = await tauriApi.onStatsUpdated(() => {
      refreshStats();
    });
    listenersRef.current.push(statsListener);

    const startListener = await tauriApi.onCaptureStarted((session) => {
      setCurrentSession(session);
    });
    listenersRef.current.push(startListener);

    const stopListener = await tauriApi.onCaptureStopped((session) => {
      setCurrentSession(session);
      refreshStats();
    });
    listenersRef.current.push(stopListener);
  }, [filterConfig]);

  const refreshSecurityStats = async () => {
    try {
      const stats = await tauriApi.getSecurityStats();
      setSecurityStats(stats);
    } catch (err) {
      console.error("Failed to get security stats:", err);
    }
  };

  const updateStats = (packet: PacketInfo) => {
    const proto = packet.protocol.toUpperCase();
    const stats = protocolStatsRef.current.get(proto) || { count: 0, bytes: 0 };
    stats.count += 1;
    stats.bytes += packet.length;
    protocolStatsRef.current.set(proto, stats);

    const bucketSize = 1000;
    const bucketKey = Math.floor(packet.timestamp / bucketSize) * bucketSize;
    const bucket = trafficBucketsRef.current.get(bucketKey) || { bytes: 0, packets: 0 };
    bucket.bytes += packet.length;
    bucket.packets += 1;
    trafficBucketsRef.current.set(bucketKey, bucket);

    [packet.src_address, packet.dst_address].forEach((addr) => {
      if (addr && addr !== "00:00:00:00:00:00" && addr !== "ff:ff:ff:ff:ff:ff") {
        const talker = talkerStatsRef.current.get(addr) || { packets: 0, bytes: 0 };
        talker.packets += 1;
        talker.bytes += packet.length;
        talkerStatsRef.current.set(addr, talker);
      }
    });
  };

  const refreshStats = () => {
    const protoStats: ProtocolStats[] = [];
    protocolStatsRef.current.forEach((v, k) => {
      protoStats.push({ protocol: k, count: v.count, bytes: v.bytes });
    });
    setProtocolStats(protoStats.sort((a, b) => b.count - a.count));

    const traffic: TrafficStats[] = [];
    trafficBucketsRef.current.forEach((v, k) => {
      traffic.push({ timestamp: k, bytes: v.bytes, packets: v.packets });
    });
    setTrafficStats(traffic.sort((a, b) => a.timestamp - b.timestamp).slice(-100));

    const talkers: TopTalker[] = [];
    talkerStatsRef.current.forEach((v, k) => {
      talkers.push({ address: k, packets: v.packets, bytes: v.bytes });
    });
    setTopTalkers(talkers.sort((a, b) => b.packets - a.packets).slice(0, 20));
  };

  const matchesFilter = (packet: PacketInfo, filter: FilterConfig): boolean => {
    if (filter.protocol && !packet.protocol.toUpperCase().includes(filter.protocol.toUpperCase())) {
      return false;
    }
    if (filter.src_ip && packet.src_address !== filter.src_ip) {
      return false;
    }
    if (filter.dst_ip && packet.dst_address !== filter.dst_ip) {
      return false;
    }
    if (filter.src_port && packet.src_port !== filter.src_port) {
      return false;
    }
    if (filter.dst_port && packet.dst_port !== filter.dst_port) {
      return false;
    }
    if (filter.search_text && !packet.info.toLowerCase().includes(filter.search_text.toLowerCase())) {
      return false;
    }
    return true;
  };

  const startCapture = async () => {
    if (!selectedInterface) return;

    packetsRef.current = [];
    setPackets([]);
    setFilteredPackets([]);
    setSelectedPacket(null);
    setPacketCount(0);
    setTotalBytes(0);
    protocolStatsRef.current.clear();
    trafficBucketsRef.current.clear();
    talkerStatsRef.current.clear();
    setProtocolStats([]);
    setTrafficStats([]);
    setTopTalkers([]);

    await setupEventListeners();

    try {
      await tauriApi.startCapture(
        selectedInterface.name,
        promiscuous,
        bpfFilter.trim() || undefined
      );
      setIsCapturing(true);
    } catch (err) {
      console.error("Failed to start capture:", err);
      alert(`无法启动抓包: ${err}`);
    }
  };

  const stopCapture = async () => {
    try {
      const session = await tauriApi.stopCapture();
      setIsCapturing(false);
      setCurrentSession(session);
      cleanupListeners();
    } catch (err) {
      console.error("Failed to stop capture:", err);
    }
  };

  const applyFilter = () => {
    const filtered = packetsRef.current.filter((p) => matchesFilter(p, filterConfig));
    setFilteredPackets(filtered);
  };

  const clearFilter = () => {
    setFilterConfig({});
    setFilteredPackets(packetsRef.current);
  };

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      await tauriApi.acknowledgeAlert(alertId);
      setSecurityAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, acknowledged: true } : a))
      );
      setUnacknowledgedCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to acknowledge alert:", err);
    }
  };

  const handleClearAlerts = async () => {
    try {
      await tauriApi.clearSecurityAlerts();
      setSecurityAlerts([]);
      setUnacknowledgedCount(0);
      refreshSecurityStats();
    } catch (err) {
      console.error("Failed to clear alerts:", err);
    }
  };

  const handleViewCertificate = async (certData: number[]) => {
    try {
      const cert = await tauriApi.parseCertificateDer(certData, 0);
      setViewerCertificate(cert);
      setViewerCertificates(null);
      setViewerTlsSession(null);
      setShowCertificateViewer(true);
    } catch (err) {
      console.error("Failed to parse certificate:", err);
    }
  };

  const handleViewTlsSession = async (session: TlsSession) => {
    if (session.certificate_chain && session.certificate_chain.length > 0) {
      setViewerCertificate(null);
      setViewerCertificates(session.certificate_chain);
      setViewerTlsSession(session);
      setShowCertificateViewer(true);
    }
  };

  return (
    <div className="app-container">
      <Toolbar
        interfaces={interfaces}
        selectedInterface={selectedInterface}
        isCapturing={isCapturing}
        promiscuous={promiscuous}
        bpfFilter={bpfFilter}
        onSelectInterface={setSelectedInterface}
        onStartCapture={startCapture}
        onStopCapture={stopCapture}
        onTogglePromiscuous={() => setPromiscuous(!promiscuous)}
        onBpfFilterChange={setBpfFilter}
        onShowInterfaceSelector={() => setShowInterfaceSelector(true)}
      />

      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === "analysis" ? "active" : ""}`}
          onClick={() => setActiveTab("analysis")}
        >
          协议分析
        </button>
        <button
          className={`tab-btn ${activeTab === "security" ? "active" : ""}`}
          onClick={() => setActiveTab("security")}
        >
          安全告警
          {unacknowledgedCount > 0 && (
            <span className="tab-badge">{unacknowledgedCount}</span>
          )}
        </button>
        <button
          className={`tab-btn ${activeTab === "charts" ? "active" : ""}`}
          onClick={() => setActiveTab("charts")}
        >
          流量统计
        </button>
      </div>

      {activeTab !== "charts" && (
        <FilterBar
          filterConfig={filterConfig}
          onFilterChange={setFilterConfig}
          onApplyFilter={applyFilter}
          onClearFilter={clearFilter}
        />
      )}

      {activeTab === "analysis" && (
        <div className="main-content">
          <PacketList
            packets={filteredPackets}
            selectedPacket={selectedPacket}
            onSelectPacket={setSelectedPacket}
          />

          <div className="detail-panel">
            <ProtocolTree tree={selectedPacket?.tree || null} />
            <HexDump bytes={selectedPacket?.raw_bytes || null} />
          </div>
        </div>
      )}

      {activeTab === "security" && (
        <div className="security-main">
          <div className="security-panel-left">
            <SecurityAlerts
              alerts={securityAlerts}
              stats={securityStats}
              onAcknowledge={handleAcknowledgeAlert}
              onClear={handleClearAlerts}
              onViewCertificate={handleViewCertificate}
            />
          </div>

          {tlsSessions.length > 0 && (
            <div className="security-panel-right">
              <div className="section-header">TLS 会话</div>
              <div className="tls-sessions-list">
                {tlsSessions.slice(0, 50).map((session) => (
                  <div
                    key={session.id}
                    className="tls-session-item"
                    onClick={() => handleViewTlsSession(session)}
                  >
                    <div className="tls-session-header">
                      <span className="tls-session-server">
                        {session.server_name || session.server_address}
                      </span>
                      {session.negotiated_version && (
                        <span className="tls-session-version">
                          {session.negotiated_version}
                        </span>
                      )}
                    </div>
                    <div className="tls-session-details">
                      <span>{session.client_address}:{session.client_port}</span>
                      <span>→</span>
                      <span>{session.server_address}:{session.server_port}</span>
                    </div>
                    {session.cipher_suite && (
                      <div className="tls-session-cipher">
                        {session.cipher_suite.name}
                      </div>
                    )}
                    <div className="tls-session-certs">
                      证书链: {session.certificate_chain.length} 个证书
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "charts" && (
        <div className="charts-only">
          <Charts
            protocolStats={protocolStats}
            trafficStats={trafficStats}
            topTalkers={topTalkers}
          />
        </div>
      )}

      <div className={`status-bar ${isCapturing ? "status-running" : "status-stopped"}`}>
        <span>
          状态: {isCapturing ? "正在抓包" : "已停止"} |
          网卡: {selectedInterface?.description || selectedInterface?.name || "未选择"} |
          混杂模式: {promiscuous ? "开启" : "关闭"}
        </span>
        <span>
          包数: {packetCount} |
          总字节: {formatBytes(totalBytes)} |
          {currentSession ? `会话: ${currentSession.name}` : ""}
        </span>
      </div>

      {showInterfaceSelector && (
        <InterfaceSelectorModal
          interfaces={interfaces}
          selectedInterface={selectedInterface}
          onSelect={(iface) => {
            setSelectedInterface(iface);
            setShowInterfaceSelector(false);
          }}
          onClose={() => setShowInterfaceSelector(false)}
        />
      )}

      {showCertificateViewer && (
        <CertificateViewer
          certificate={viewerCertificate || undefined}
          certificates={viewerCertificates || undefined}
          tlsSession={viewerTlsSession || undefined}
          onClose={() => {
            setShowCertificateViewer(false);
            setViewerCertificate(null);
            setViewerCertificates(null);
            setViewerTlsSession(null);
          }}
        />
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface InterfaceSelectorModalProps {
  interfaces: NetworkInterface[];
  selectedInterface: NetworkInterface | null;
  onSelect: (iface: NetworkInterface) => void;
  onClose: () => void;
}

const InterfaceSelectorModal: React.FC<InterfaceSelectorModalProps> = ({
  interfaces,
  selectedInterface,
  onSelect,
  onClose,
}) => {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">选择网络接口</div>
        <div className="modal-body">
          <ul className="interface-list">
            {interfaces.map((iface) => (
              <li
                key={iface.name}
                className={`interface-item ${selectedInterface?.name === iface.name ? "selected" : ""}`}
                onClick={() => onSelect(iface)}
              >
                <div className="interface-name">
                  {iface.name}
                  {iface.is_up && <span style={{ color: "#4ec9b0", marginLeft: 8 }}>(运行中)</span>}
                </div>
                <div className="interface-description">{iface.description}</div>
                {iface.addresses.length > 0 && (
                  <div className="interface-description">
                    IP: {iface.addresses.map((a) => a.ip).join(", ")}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="modal-footer">
          <button className="btn-default" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;
