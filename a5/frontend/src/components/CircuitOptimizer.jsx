import React, { useState } from 'react';
import { optimizeCircuit } from '../services/api';

function CircuitOptimizer({ circuit, onApplyOptimization, onClose }) {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationResult, setOptimizationResult] = useState(null);
  const [error, setError] = useState(null);

  const handleOptimize = async () => {
    if (!circuit || circuit.gates.length === 0) {
      setError('电路为空，无需优化');
      return;
    }

    setIsOptimizing(true);
    setError(null);

    try {
      const response = await optimizeCircuit(circuit);
      if (response.success) {
        setOptimizationResult(response.data);
      }
    } catch (err) {
      setError(err.message || '优化失败');
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleApply = () => {
    if (optimizationResult && optimizationResult.optimization_result) {
      onApplyOptimization(optimizationResult.optimization_result.optimized_gates);
      setOptimizationResult(null);
      setError(null);
    }
  };

  const getPriorityBadge = (priority) => {
    if (priority === 'high') {
      return <span style={{ 
        background: 'rgba(255, 71, 87, 0.3)', 
        color: '#ff4757', 
        padding: '2px 8px', 
        borderRadius: '4px', 
        fontSize: '0.75rem' 
      }}>高优先级</span>;
    }
    return <span style={{ 
      background: 'rgba(0, 212, 255, 0.3)', 
      color: '#00d4ff', 
      padding: '2px 8px', 
      borderRadius: '4px', 
      fontSize: '0.75rem' 
    }}>中优先级</span>;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: '500px', maxHeight: '80vh', overflowY: 'auto' }}>
        <h3 className="modal-title">⚡ 电路优化</h3>

        <div className="btn-group" style={{ marginBottom: '20px' }}>
          <button
            className="btn btn-primary"
            onClick={handleOptimize}
            disabled={isOptimizing || !circuit || circuit.gates.length === 0}
          >
            {isOptimizing ? '优化中...' : '分析优化建议'}
          </button>
          {optimizationResult && (
            <button
              className="btn btn-primary"
              onClick={handleApply}
              disabled={optimizationResult.summary.savings === 0}
            >
              应用优化
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={onClose}
          >
            关闭
          </button>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {optimizationResult && (
          <div>
            <div className="info-panel" style={{ marginBottom: '20px' }}>
              <h4>优化统计</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginTop: '10px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#888' }}>
                    {optimizationResult.summary.original_count}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#aaa' }}>原始门数</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#00d4ff' }}>
                    {optimizationResult.summary.optimized_count}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#aaa' }}>优化后门数</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#7b2cbf' }}>
                    -{optimizationResult.summary.savings_percent}%
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#aaa' }}>减少比例</div>
                </div>
              </div>
            </div>

            {optimizationResult.suggestions.length > 0 ? (
              <div>
                <h4 style={{ marginBottom: '15px', color: '#00d4ff' }}>优化建议</h4>
                <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {optimizationResult.suggestions.map((suggestion, index) => (
                    <div key={index} style={{ 
                      background: 'rgba(255, 255, 255, 0.05)', 
                      padding: '12px', 
                      borderRadius: '8px', 
                      marginBottom: '10px',
                      border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 'bold' }}>
                          建议 #{index + 1}
                        </span>
                        {getPriorityBadge(suggestion.priority)}
                      </div>
                      <p style={{ color: '#ccc', fontSize: '0.9rem', margin: 0 }}>
                        {suggestion.message}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="info-panel">
                <p style={{ textAlign: 'center', margin: 0 }}>
                  ✨ 电路已经是最优的！
                </p>
              </div>
            )}

            {optimizationResult.optimization_result.changes.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ marginBottom: '15px', color: '#00d4ff' }}>变更详情</h4>
                <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                  {optimizationResult.optimization_result.changes.map((change, index) => (
                    <div key={index} style={{ 
                      background: 'rgba(123, 44, 191, 0.1)', 
                      padding: '10px', 
                      borderRadius: '6px', 
                      marginBottom: '8px',
                      fontSize: '0.85rem',
                      color: '#ccc'
                    }}>
                      {change.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!optimizationResult && !error && (
          <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
            <p>点击"分析优化建议"来查看可优化的内容</p>
            <p style={{ marginTop: '10px', fontSize: '0.9rem' }}>
              优化器会检测：<br />
              • 恒等门 (I) 和零角度旋转门<br />
              • 自逆门对 (H*H, X*X, CNOT*CNOT 等)<br />
              • 可合并的旋转门
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default CircuitOptimizer;
