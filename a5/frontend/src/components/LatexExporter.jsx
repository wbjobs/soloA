import React, { useState } from 'react';
import { exportLatex } from '../services/api';

function LatexExporter({ circuit, onClose }) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState(null);
  const [selectedFormat, setSelectedFormat] = useState('qcircuit');
  const [showSnippet, setShowSnippet] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleExport = async () => {
    if (!circuit || circuit.gates.length === 0) {
      setError('电路为空，无法导出');
      return;
    }

    setIsExporting(true);
    setError(null);
    setCopied(false);

    try {
      const response = await exportLatex(circuit);
      if (response.success) {
        setExportResult(response.data);
      }
    } catch (err) {
      setError(err.message || '导出失败');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopy = async () => {
    if (!exportResult) return;
    
    const key = showSnippet ? `${selectedFormat}_snippet` : selectedFormat;
    const code = exportResult[key];
    
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError('复制失败，请手动复制');
    }
  };

  const handleDownload = () => {
    if (!exportResult) return;
    
    const key = showSnippet ? `${selectedFormat}_snippet` : selectedFormat;
    const code = exportResult[key];
    const extension = selectedFormat === 'qcircuit' ? 'tex' : 'tex';
    const filename = `quantum_circuit.${extension}`;
    
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getCurrentCode = () => {
    if (!exportResult) return '';
    const key = showSnippet ? `${selectedFormat}_snippet` : selectedFormat;
    return exportResult[key];
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: '600px', maxHeight: '85vh', overflowY: 'auto' }}>
        <h3 className="modal-title">📄 导出 LaTeX 电路图</h3>

        <div className="btn-group" style={{ marginBottom: '20px' }}>
          <button
            className="btn btn-primary"
            onClick={handleExport}
            disabled={isExporting || !circuit || circuit.gates.length === 0}
          >
            {isExporting ? '生成中...' : '生成 LaTeX 代码'}
          </button>
          {exportResult && (
            <>
              <button
                className="btn btn-secondary"
                onClick={handleCopy}
              >
                {copied ? '✓ 已复制' : '复制代码'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleDownload}
              >
                下载文件
              </button>
            </>
          )}
          <button
            className="btn btn-secondary"
            onClick={onClose}
          >
            关闭
          </button>
        </div>

        {exportResult && (
          <div style={{ marginBottom: '15px' }}>
            <div className="control-group" style={{ marginBottom: '10px' }}>
              <label>选择 LaTeX 包:</label>
              <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                <div
                  className={`qubit-option ${selectedFormat === 'qcircuit' ? 'selected' : ''}`}
                  onClick={() => setSelectedFormat('qcircuit')}
                >
                  Qcircuit
                </div>
                <div
                  className={`qubit-option ${selectedFormat === 'quantikz' ? 'selected' : ''}`}
                  onClick={() => setSelectedFormat('quantikz')}
                >
                  quantikz
                </div>
              </div>
            </div>

            <div className="control-group">
              <label>导出类型:</label>
              <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                <div
                  className={`qubit-option ${!showSnippet ? 'selected' : ''}`}
                  onClick={() => setShowSnippet(false)}
                >
                  完整文档
                </div>
                <div
                  className={`qubit-option ${showSnippet ? 'selected' : ''}`}
                  onClick={() => setShowSnippet(true)}
                >
                  仅电路图片段
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {exportResult ? (
          <div>
            <div className="info-panel" style={{ marginBottom: '15px' }}>
              <h4>{selectedFormat === 'qcircuit' ? 'Qcircuit' : 'quantikz'} 说明</h4>
              <p style={{ marginTop: '10px', fontSize: '0.9rem' }}>
                {selectedFormat === 'qcircuit' ? (
                  <>
                    <strong>Qcircuit</strong> 是经典的量子电路图绘制包。<br />
                    在你的 LaTeX 文档中使用：<br />
                    <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '3px' }}>
                      \usepackage[braket, qm]&#123;qcircuit&#125;
                    </code>
                  </>
                ) : (
                  <>
                    <strong>quantikz</strong> 是基于 TikZ 的现代量子电路图绘制包。<br />
                    在你的 LaTeX 文档中使用：<br />
                    <code style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '3px' }}>
                      \usepackage&#123;quantikz&#125;
                    </code>
                  </>
                )}
              </p>
            </div>

            <div style={{ 
              background: '#1a1a2e', 
              borderRadius: '8px', 
              padding: '15px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <div style={{ 
                fontSize: '0.85rem', 
                color: '#888', 
                marginBottom: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>LaTeX 代码 ({showSnippet ? '片段' : '完整文档'})</span>
                <span>{getCurrentCode().split('\n').length} 行</span>
              </div>
              <pre style={{ 
                margin: 0, 
                whiteSpace: 'pre-wrap', 
                wordBreak: 'break-word',
                fontSize: '0.8rem',
                color: '#00d4ff',
                maxHeight: '300px',
                overflowY: 'auto',
                fontFamily: 'Consolas, Monaco, monospace',
                lineHeight: '1.5'
              }}>
                {getCurrentCode()}
              </pre>
            </div>
          </div>
        ) : (
          !error && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
              <p>点击"生成 LaTeX 代码"来导出电路图</p>
              <div style={{ marginTop: '20px', textAlign: 'left' }}>
                <h4 style={{ color: '#aaa', marginBottom: '10px' }}>支持的 LaTeX 包:</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                  <div style={{ 
                    background: 'rgba(0, 212, 255, 0.1)', 
                    padding: '15px', 
                    borderRadius: '8px',
                    border: '1px solid rgba(0, 212, 255, 0.2)'
                  }}>
                    <h5 style={{ color: '#00d4ff', marginBottom: '8px' }}>Qcircuit</h5>
                    <p style={{ fontSize: '0.85rem', color: '#aaa' }}>
                      经典的量子电路图宏包，兼容大多数 LaTeX 编译器。
                    </p>
                  </div>
                  <div style={{ 
                    background: 'rgba(123, 44, 191, 0.1)', 
                    padding: '15px', 
                    borderRadius: '8px',
                    border: '1px solid rgba(123, 44, 191, 0.2)'
                  }}>
                    <h5 style={{ color: '#7b2cbf', marginBottom: '8px' }}>quantikz</h5>
                    <p style={{ fontSize: '0.85rem', color: '#aaa' }}>
                      基于 TikZ 的现代宏包，支持更多自定义功能。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default LatexExporter;
