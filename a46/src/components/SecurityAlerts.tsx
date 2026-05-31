import React, { useState, useMemo } from "react";
import { SecurityAlert, AlertSeverity, AlertType, SecurityStats } from "../types";
import { tauriApi } from "../tauriApi";

interface SecurityAlertsProps {
  alerts: SecurityAlert[];
  stats: SecurityStats | null;
  onAcknowledge: (alertId: string) => void;
  onClear: () => void;
  onViewCertificate?: (certData: number[]) => void;
}

const severityColors: Record<AlertSeverity, string> = {
  Critical: "#f44336",
  High: "#ff9800",
  Warning: "#ffc107",
  Info: "#2196f3",
};

const severityLabels: Record<AlertSeverity, string> = {
  Critical: "严重",
  High: "高危",
  Warning: "警告",
  Info: "信息",
};

const alertTypeLabels: Record<AlertType, string> = {
  PortScan: "端口扫描",
  DnsTunnel: "DNS 隧道",
  AbnormalTraffic: "异常流量",
  ExpiredCertificate: "过期证书",
  SelfSignedCertificate: "自签名证书",
  UncommonPort: "异常端口",
  LargeOutboundTransfer: "大量出站传输",
  Unknown: "未知",
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${(d.getMonth() + 1)
    .toString()
    .padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")} ${d
    .getHours()
    .toString()
    .padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d
    .getSeconds()
    .toString()
    .padStart(2, "0")}`;
}

type FilterOption = "all" | "unacknowledged" | AlertSeverity;

export const SecurityAlerts: React.FC<SecurityAlertsProps> = ({
  alerts,
  stats,
  onAcknowledge,
  onClear,
  onViewCertificate,
}) => {
  const [filter, setFilter] = useState<FilterOption>("all");
  const [selectedAlert, setSelectedAlert] = useState<SecurityAlert | null>(null);
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);

  const filteredAlerts = useMemo(() => {
    return alerts
      .filter((a) => {
        if (filter === "all") return true;
        if (filter === "unacknowledged") return !a.acknowledged;
        return a.severity === filter;
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [alerts, filter]);

  const handleExportCertificate = (certData: number[]) => {
    tauriApi
      .exportCertificatePem(certData)
      .then((pem) => {
        const blob = new Blob([pem], { type: "application/x-pem-file" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `certificate.pem`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((err) => {
        console.error("Failed to export certificate:", err);
      });
  };

  const renderAlertDetails = (alert: SecurityAlert) => {
    const details = alert.details;
    if (!details) return null;

    return (
      <div className="alert-details">
        <div className="alert-detail-section">
          <div className="alert-detail-label">类型:</div>
          <div className="alert-detail-value">{alertTypeLabels[alert.alert_type]}</div>
        </div>

        {alert.source_address && (
          <div className="alert-detail-section">
            <div className="alert-detail-label">源地址:</div>
            <div className="alert-detail-value">{alert.source_address}</div>
          </div>
        )}

        {alert.destination_address && (
          <div className="alert-detail-section">
            <div className="alert-detail-label">目标地址:</div>
            <div className="alert-detail-value">{alert.destination_address}</div>
          </div>
        )}

        {alert.source_port !== undefined && (
          <div className="alert-detail-section">
            <div className="alert-detail-label">源端口:</div>
            <div className="alert-detail-value">{alert.source_port}</div>
          </div>
        )}

        {alert.destination_port !== undefined && (
          <div className="alert-detail-section">
            <div className="alert-detail-label">目标端口:</div>
            <div className="alert-detail-value">{alert.destination_port}</div>
          </div>
        )}

        {alert.packet_reference !== undefined && (
          <div className="alert-detail-section">
            <div className="alert-detail-label">关联包号:</div>
            <div className="alert-detail-value">#{alert.packet_reference}</div>
          </div>
        )}

        <div className="alert-detail-section">
          <div className="alert-detail-label">时间:</div>
          <div className="alert-detail-value">{formatDate(alert.timestamp)}</div>
        </div>

        {details && Object.keys(details).length > 0 && (
          <div className="alert-detail-section">
            <div className="alert-detail-label">详细信息:</div>
            <pre className="alert-detail-json">
              {JSON.stringify(details, null, 2)}
            </pre>
          </div>
        )}

        <div className="alert-actions">
          {!alert.acknowledged && (
            <button
              className="btn-default"
              onClick={() => {
                onAcknowledge(alert.id);
              }}
            >
              确认告警
            </button>
          )}

          {details && details.certificate_der && onViewCertificate && (
            <>
              <button
                className="btn-default"
                onClick={() => onViewCertificate(details.certificate_der)}
              >
                查看证书
              </button>
              <button
                className="btn-default"
                onClick={() => handleExportCertificate(details.certificate_der)}
              >
                导出 PEM
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="security-alerts-panel">
      <div className="alerts-header">
        <div className="alerts-title">安全告警</div>
        <div className="alerts-stats">
          {stats && (
            <>
              <span
                className="stat-badge stat-critical"
                title="严重告警"
              >
                {stats.critical_alerts}
              </span>
              <span
                className="stat-badge stat-high"
                title="高危告警"
              >
                {stats.high_alerts}
              </span>
              <span
                className="stat-badge stat-warning"
                title="警告"
              >
                {stats.warning_alerts}
              </span>
              <span
                className="stat-badge stat-info"
                title="信息"
              >
                {stats.info_alerts}
              </span>
            </>
          )}
        </div>
        <div className="alerts-controls">
          <select
            className="alert-filter-select"
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterOption)}
          >
            <option value="all">全部 ({alerts.length})</option>
            <option value="unacknowledged">
              未确认 ({alerts.filter((a) => !a.acknowledged).length})
            </option>
            <option value="Critical">严重</option>
            <option value="High">高危</option>
            <option value="Warning">警告</option>
            <option value="Info">信息</option>
          </select>
          <button className="btn-default" onClick={onClear}>
            清除全部
          </button>
        </div>
      </div>

      <div className="alerts-list">
        {filteredAlerts.length === 0 ? (
          <div className="no-alerts">暂无安全告警</div>
        ) : (
          filteredAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`alert-item ${alert.acknowledged ? "acknowledged" : ""} ${
                expandedAlert === alert.id ? "expanded" : ""
              }`}
              onClick={() =>
                setExpandedAlert(expandedAlert === alert.id ? null : alert.id)
              }
            >
              <div className="alert-header-row">
                <span
                  className="alert-severity-indicator"
                  style={{ backgroundColor: severityColors[alert.severity] }}
                />
                <span className="alert-time">{formatTimestamp(alert.timestamp)}</span>
                <span className="alert-type">{alertTypeLabels[alert.alert_type]}</span>
                <span className="alert-title">{alert.title}</span>
                {alert.acknowledged && (
                  <span className="alert-ack-badge">已确认</span>
                )}
                <span className="alert-expand-icon">
                  {expandedAlert === alert.id ? "▼" : "▶"}
                </span>
              </div>
              {expandedAlert === alert.id && (
                <div className="alert-expand-content">
                  <div className="alert-description">{alert.description}</div>
                  {renderAlertDetails(alert)}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {selectedAlert && (
        <div
          className="modal-overlay"
          onClick={() => setSelectedAlert(null)}
        >
          <div
            className="modal-content alert-detail-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              告警详情 - {selectedAlert.title}
            </div>
            <div className="modal-body">{renderAlertDetails(selectedAlert)}</div>
            <div className="modal-footer">
              <button
                className="btn-default"
                onClick={() => setSelectedAlert(null)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
