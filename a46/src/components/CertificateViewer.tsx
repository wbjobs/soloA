import React, { useState, useEffect } from "react";
import { X509Certificate, TlsSession } from "../types";

interface CertificateViewerProps {
  certificate?: X509Certificate;
  certificates?: X509Certificate[];
  tlsSession?: TlsSession;
  onClose: () => void;
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

function formatFingerprint(fp: string): string {
  return fp
    .match(/.{2}/g)
    ?.join(":")
    .toUpperCase() || fp;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch((err) => {
    console.error("Failed to copy:", err);
  });
}

export const CertificateViewer: React.FC<CertificateViewerProps> = ({
  certificate,
  certificates: certList,
  tlsSession,
  onClose,
}) => {
  const [certificates, setCertificates] = useState<X509Certificate[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showPem, setShowPem] = useState(false);

  useEffect(() => {
    if (certList && certList.length > 0) {
      setCertificates(certList);
    } else if (certificate) {
      setCertificates([certificate]);
    }
  }, [certificate, certList]);

  const currentCert = certificates[selectedIndex];

  const handleExportPem = (cert: X509Certificate) => {
    const blob = new Blob([cert.pem_string], { type: "application/x-pem-file" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${cert.subject.common_name || "certificate"}.pem`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderName = (title: string, name: {
    common_name?: string;
    organization?: string;
    organizational_unit?: string;
    locality?: string;
    state?: string;
    country?: string;
    email?: string;
    raw_string: string;
  }) => (
    <div className="cert-section">
      <div className="cert-section-title">{title}</div>
      <div className="cert-section-content">
        {name.common_name && (
          <div className="cert-field">
            <span className="cert-field-name">CN (Common Name):</span>
            <span className="cert-field-value">{name.common_name}</span>
          </div>
        )}
        {name.organization && (
          <div className="cert-field">
            <span className="cert-field-name">O (Organization):</span>
            <span className="cert-field-value">{name.organization}</span>
          </div>
        )}
        {name.organizational_unit && (
          <div className="cert-field">
            <span className="cert-field-name">OU (Org Unit):</span>
            <span className="cert-field-value">{name.organizational_unit}</span>
          </div>
        )}
        {name.locality && (
          <div className="cert-field">
            <span className="cert-field-name">L (Locality):</span>
            <span className="cert-field-value">{name.locality}</span>
          </div>
        )}
        {name.state && (
          <div className="cert-field">
            <span className="cert-field-name">ST (State):</span>
            <span className="cert-field-value">{name.state}</span>
          </div>
        )}
        {name.country && (
          <div className="cert-field">
            <span className="cert-field-name">C (Country):</span>
            <span className="cert-field-value">{name.country}</span>
          </div>
        )}
        <div className="cert-field">
          <span className="cert-field-name">原始字符串:</span>
          <span
            className="cert-field-value cert-raw-string"
            title={name.raw_string}
          >
            {name.raw_string}
          </span>
        </div>
      </div>
    </div>
  );

  const renderValidity = (cert: X509Certificate) => {
    const now = Date.now();
    const isExpired = cert.not_after < now;
    const notYetValid = cert.not_before > now;

    return (
      <div className="cert-section">
        <div className="cert-section-title">有效期</div>
        <div className="cert-section-content">
          <div className="cert-field">
            <span className="cert-field-name">生效时间:</span>
            <span className="cert-field-value">{formatDate(cert.not_before)}</span>
          </div>
          <div className="cert-field">
            <span className="cert-field-name">过期时间:</span>
            <span
              className={`cert-field-value ${isExpired ? "cert-invalid" : ""}`}
            >
              {formatDate(cert.not_after)}
            </span>
          </div>
          <div className="cert-field">
            <span className="cert-field-name">当前状态:</span>
            <span
              className={`cert-field-value ${
                isExpired ? "cert-invalid" : notYetValid ? "cert-warning" : "cert-valid"
              }`}
            >
              {isExpired ? "已过期" : notYetValid ? "尚未生效" : "有效"}
            </span>
          </div>
        </div>
      </div>
    );
  };

  if (!currentCert) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div
          className="modal-content cert-viewer-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">证书查看器</div>
          <div className="modal-body">
            <div className="no-alerts">没有可用的证书数据</div>
          </div>
          <div className="modal-footer">
            <button className="btn-default" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content cert-viewer-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="cert-header-row">
            <span>证书查看器</span>
            {certificates.length > 1 && (
              <div className="cert-chain-nav">
                {certificates.map((_, i) => (
                  <button
                    key={i}
                    className={`btn-default cert-chain-btn ${
                      i === selectedIndex ? "active" : ""
                    }`}
                    onClick={() => setSelectedIndex(i)}
                  >
                    {i === 0 ? "服务端证书" : `中间CA #${i}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="modal-body cert-body">
          <div className="cert-status-bar">
            <div className="cert-status-item">
              <span className={`cert-badge ${
                currentCert.is_valid_now ? "cert-valid" : "cert-invalid"
              }`}>
                {currentCert.is_valid_now ? "✓ 有效" : "✗ 无效"}
              </span>
              {currentCert.is_self_signed && (
                <span className="cert-badge cert-warning">⚠ 自签名</span>
              )}
              {selectedIndex === 0 && (
                <span className="cert-badge cert-info">终端实体</span>
              )}
              {selectedIndex > 0 && (
                <span className="cert-badge cert-info">CA 证书</span>
              )}
            </div>
          </div>

          {tlsSession && selectedIndex === 0 && (
            <div className="cert-section">
              <div className="cert-section-title">TLS 会话信息</div>
              <div className="cert-section-content">
                <div className="cert-field">
                  <span className="cert-field-name">客户端:</span>
                  <span className="cert-field-value">
                    {tlsSession.client_address}:{tlsSession.client_port}
                  </span>
                </div>
                <div className="cert-field">
                  <span className="cert-field-name">服务端:</span>
                  <span className="cert-field-value">
                    {tlsSession.server_address}:{tlsSession.server_port}
                  </span>
                </div>
                {tlsSession.server_name && (
                  <div className="cert-field">
                    <span className="cert-field-name">SNI:</span>
                    <span className="cert-field-value">{tlsSession.server_name}</span>
                  </div>
                )}
                {tlsSession.negotiated_version && (
                  <div className="cert-field">
                    <span className="cert-field-name">TLS 版本:</span>
                    <span className="cert-field-value">
                      {tlsSession.negotiated_version}
                    </span>
                  </div>
                )}
                {tlsSession.cipher_suite && (
                  <div className="cert-field">
                    <span className="cert-field-name">密码套件:</span>
                    <span className="cert-field-value">
                      {tlsSession.cipher_suite.name}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {renderName("主题 (Subject)", currentCert.subject)}
          {renderName("颁发者 (Issuer)", currentCert.issuer)}
          {renderValidity(currentCert)}

          <div className="cert-section">
            <div className="cert-section-title">证书信息</div>
            <div className="cert-section-content">
              <div className="cert-field">
                <span className="cert-field-name">版本:</span>
                <span className="cert-field-value">
                  {currentCert.version > 0 ? `v${currentCert.version + 1}` : "v1"}
                </span>
              </div>
              <div className="cert-field">
                <span className="cert-field-name">序列号:</span>
                <span className="cert-field-value cert-serial">
                  {currentCert.serial_number}
                </span>
              </div>
              <div className="cert-field">
                <span className="cert-field-name">签名算法:</span>
                <span className="cert-field-value">
                  {currentCert.signature_algorithm}
                </span>
              </div>
              <div className="cert-field">
                <span className="cert-field-name">公钥算法:</span>
                <span className="cert-field-value">
                  {currentCert.public_key_algorithm}
                </span>
              </div>
            </div>
          </div>

          {currentCert.sans.length > 0 && (
            <div className="cert-section">
              <div className="cert-section-title">
                使用者备用名称 (SANs)
              </div>
              <div className="cert-section-content">
                <div className="cert-sans-list">
                  {currentCert.sans.map((san, i) => (
                    <div key={i} className="cert-san-item">
                      {san}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentCert.key_usage && currentCert.key_usage.length > 0 && (
            <div className="cert-section">
              <div className="cert-section-title">密钥用法 (Key Usage)</div>
              <div className="cert-section-content">
                <div className="cert-usage-list">
                  {currentCert.key_usage.map((usage, i) => (
                    <span key={i} className="cert-usage-tag">
                      {usage}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentCert.extended_key_usage &&
            currentCert.extended_key_usage.length > 0 && (
              <div className="cert-section">
                <div className="cert-section-title">
                  扩展密钥用法 (Extended Key Usage)
                </div>
                <div className="cert-section-content">
                  <div className="cert-usage-list">
                    {currentCert.extended_key_usage.map((usage, i) => (
                      <span key={i} className="cert-usage-tag">
                        {usage}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

          <div className="cert-section">
            <div className="cert-section-title">指纹</div>
            <div className="cert-section-content">
              <div className="cert-field">
                <span className="cert-field-name">SHA-256:</span>
                <span
                  className="cert-field-value cert-fingerprint"
                  title="点击复制"
                  onClick={() =>
                    copyToClipboard(formatFingerprint(currentCert.fingerprint_sha256))
                  }
                >
                  {formatFingerprint(currentCert.fingerprint_sha256)}
                </span>
              </div>
            </div>
          </div>

          <div className="cert-section">
            <div
              className="cert-section-title clickable"
              onClick={() => setShowPem(!showPem)}
            >
              PEM 格式 {showPem ? "▲" : "▼"}
            </div>
            {showPem && (
              <div className="cert-section-content">
                <pre className="cert-pem">{currentCert.pem_string}</pre>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="btn-default"
            onClick={() => handleExportPem(currentCert)}
          >
            导出 PEM
          </button>
          <button
            className="btn-default"
            onClick={() => copyToClipboard(currentCert.pem_string)}
          >
            复制 PEM
          </button>
          <button className="btn-default" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
