import React, { useState, useEffect } from 'react';
import { saveCircuit, listCircuits, deleteCircuit } from '../services/api';

function CircuitStorage({ circuit, onLoadCircuit, onRefresh }) {
  const [savedCircuits, setSavedCircuits] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [circuitName, setCircuitName] = useState('');

  const refreshList = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listCircuits();
      if (response.success) {
        setSavedCircuits(response.data);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshList();
  }, [onRefresh]);

  const handleSave = async () => {
    if (!circuitName.trim()) {
      setError('请输入电路名称');
      return;
    }

    if (!circuit || circuit.gates.length === 0) {
      setError('电路为空，无法保存');
      return;
    }

    try {
      await saveCircuit({
        name: circuitName,
        n_qubits: circuit.nQubits,
        gates: circuit.gates,
      });
      setShowSaveModal(false);
      setCircuitName('');
      await refreshList();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (circuitId) => {
    if (!window.confirm('确定要删除此电路吗？')) {
      return;
    }

    try {
      await deleteCircuit(circuitId);
      await refreshList();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLoad = (savedCircuit) => {
    onLoadCircuit({
      nQubits: savedCircuit.n_qubits,
      gates: savedCircuit.gates,
    });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="section">
      <h3 className="section-title">保存的电路</h3>

      <div className="btn-group" style={{ marginBottom: '20px' }}>
        <button
          className="btn btn-primary"
          onClick={() => setShowSaveModal(true)}
          disabled={!circuit || circuit.gates.length === 0}
        >
          保存当前电路
        </button>
        <button
          className="btn btn-secondary"
          onClick={refreshList}
          disabled={isLoading}
        >
          {isLoading ? '加载中...' : '刷新列表'}
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <div className="saved-circuits">
        {savedCircuits.length === 0 ? (
          <p style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
            暂无保存的电路
          </p>
        ) : (
          savedCircuits.slice().reverse().map((savedCircuit) => (
            <div key={savedCircuit.id} className="circuit-item">
              <div className="circuit-item-info">
                <h4>{savedCircuit.name}</h4>
                <p>
                  {savedCircuit.n_qubits} 量子比特 | 
                  {savedCircuit.gates.length} 个门 | 
                  {formatDate(savedCircuit.created_at)}
                </p>
              </div>
              <div className="btn-group" style={{ gap: '5px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleLoad(savedCircuit)}
                  style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                >
                  加载
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => handleDelete(savedCircuit.id)}
                  style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                >
                  删除
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showSaveModal && (
        <div className="modal-overlay" onClick={() => setShowSaveModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">保存电路</h3>
            
            <div className="control-group">
              <label>电路名称:</label>
              <input
                type="text"
                className="input"
                value={circuitName}
                onChange={(e) => setCircuitName(e.target.value)}
                placeholder="例如：Bell State"
                autoFocus
              />
            </div>

            <div className="info-panel">
              <p>
                <strong>{circuit.nQubits} 量子比特</strong><br />
                <strong>{circuit.gates.length} 个门</strong>
              </p>
            </div>

            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowSaveModal(false)}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CircuitStorage;
