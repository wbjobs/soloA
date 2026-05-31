import React, { useState, useCallback } from 'react';
import { simulateCircuit } from './services/api';
import CircuitBuilder from './components/CircuitBuilder';
import ProbabilityChart from './components/ProbabilityChart';
import BlochSphere from './components/BlochSphere';
import CircuitStorage from './components/CircuitStorage';
import CircuitOptimizer from './components/CircuitOptimizer';
import LatexExporter from './components/LatexExporter';

function App() {
  const [nQubits, setNQubits] = useState(2);
  const [gates, setGates] = useState([]);
  const [simulationResults, setSimulationResults] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError] = useState(null);
  const [storageRefresh, setStorageRefresh] = useState(0);
  const [showOptimizer, setShowOptimizer] = useState(false);
  const [showLatexExport, setShowLatexExport] = useState(false);

  const handleAddGate = useCallback((gateData) => {
    setGates(prev => [...prev, gateData]);
    setError(null);
  }, []);

  const handleRemoveGate = useCallback((index) => {
    setGates(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleReset = useCallback(() => {
    setGates([]);
    setSimulationResults(null);
    setError(null);
  }, []);

  const handleQubitChange = useCallback((newCount) => {
    setNQubits(newCount);
    handleReset();
  }, [handleReset]);

  const handleSimulate = useCallback(async () => {
    if (gates.length === 0) {
      setError('电路为空，请先添加量子门');
      return;
    }

    setIsSimulating(true);
    setError(null);

    try {
      const response = await simulateCircuit({
        n_qubits: nQubits,
        gates: gates,
      });

      if (response.success) {
        setSimulationResults(response.data);
      }
    } catch (err) {
      setError(err.message || '模拟失败');
    } finally {
      setIsSimulating(false);
    }
  }, [nQubits, gates]);

  const handleLoadCircuit = useCallback((loadedCircuit) => {
    setNQubits(loadedCircuit.nQubits);
    setGates(loadedCircuit.gates);
    setSimulationResults(null);
    setError(null);
  }, []);

  const handleApplyOptimization = useCallback((optimizedGates) => {
    setGates(optimizedGates);
    setSimulationResults(null);
    setShowOptimizer(false);
  }, []);

  return (
    <div className="app-container">
      <header className="header">
        <h1>⚛️ 量子电路模拟器</h1>
        <p>支持 1-5 量子比特 | 可视化量子计算</p>
      </header>

      <div className="section" style={{ marginBottom: '20px' }}>
        <div className="control-group" style={{ marginBottom: 0 }}>
          <label>量子比特数量:</label>
          <div className="qubit-selector">
            {[1, 2, 3, 4, 5].map((count) => (
              <div
                key={count}
                className={`qubit-option ${nQubits === count ? 'selected' : ''}`}
                onClick={() => handleQubitChange(count)}
              >
                {count} 个
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="main-content">
        <div>
          <CircuitBuilder
            nQubits={nQubits}
            gates={gates}
            onAddGate={handleAddGate}
            onRemoveGate={handleRemoveGate}
            onReset={handleReset}
          />

          <div style={{ marginTop: '20px' }}>
            <div className="btn-group" style={{ marginBottom: '20px' }}>
              <button
                className="btn btn-primary"
                onClick={handleSimulate}
                disabled={isSimulating || gates.length === 0}
                style={{ fontSize: '1.1rem', padding: '15px 30px' }}
              >
                {isSimulating ? '运行中...' : '▶️ 运行电路'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowOptimizer(true)}
                disabled={gates.length === 0}
              >
                ⚡ 优化电路
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowLatexExport(true)}
                disabled={gates.length === 0}
              >
                📄 导出 LaTeX
              </button>
            </div>

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}
          </div>

          <CircuitStorage
            circuit={{ nQubits, gates }}
            onLoadCircuit={handleLoadCircuit}
            onRefresh={storageRefresh}
          />
        </div>

        <div>
          <div className="section">
            <h3 className="section-title">测量结果</h3>
            
            {simulationResults ? (
              <>
                <ProbabilityChart probabilities={simulationResults.probabilities} />
                
                <div className="info-panel" style={{ marginTop: '20px' }}>
                  <h4>概率幅详情</h4>
                  <div style={{ 
                    maxHeight: '150px', 
                    overflowY: 'auto',
                    marginTop: '10px'
                  }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ color: '#aaa', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                          <th style={{ padding: '8px', textAlign: 'left' }}>基态</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>实部</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>虚部</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>概率</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(simulationResults.amplitudes).map(([label, amp]) => (
                          <tr key={label} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <td style={{ padding: '8px', fontWeight: 'bold', color: '#00d4ff' }}>
                              |{label}⟩
                            </td>
                            <td style={{ padding: '8px' }}>
                              {amp.real.toFixed(4)}
                            </td>
                            <td style={{ padding: '8px' }}>
                              {amp.imag.toFixed(4)}
                            </td>
                            <td style={{ padding: '8px', color: '#7b2cbf', fontWeight: 'bold' }}>
                              {(amp.magnitude * 100).toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ 
                height: '300px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: '#888',
                textAlign: 'center'
              }}>
                <div>
                  <p style={{ fontSize: '1.2rem', marginBottom: '10px' }}>
                    🎯 构建并运行电路以查看结果
                  </p>
                  <p style={{ fontSize: '0.9rem' }}>
                    添加量子门 → 点击运行 → 查看概率分布
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="section" style={{ marginTop: '20px' }}>
            <h3 className="section-title">布洛赫球可视化</h3>
            <p style={{ color: '#888', marginBottom: '15px', fontSize: '0.9rem' }}>
              拖拽旋转视角 | 每个量子比特独立显示
            </p>
            
            <div className="bloch-container">
              {simulationResults ? (
                Object.entries(simulationResults.bloch_spheres).map(
                  ([qubitKey, coordinates], index) => (
                    <div key={qubitKey} className="bloch-sphere">
                      <BlochSphere 
                        coordinates={coordinates} 
                        qubitIndex={index}
                      />
                    </div>
                  )
                )
              ) : (
                <div style={{ 
                  width: '100%', 
                  height: '280px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  color: '#888'
                }}>
                  运行电路后显示各量子比特的布洛赫球
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="section" style={{ marginTop: '20px' }}>
        <h3 className="section-title">使用说明</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
          <div className="info-panel">
            <h4>基本操作</h4>
            <p>1. 选择量子比特数量（1-5）<br />
               2. 选择量子门类型<br />
               3. 选择作用的量子比特<br />
               4. 点击"添加门"添加到电路<br />
               5. 点击"运行电路"执行模拟</p>
          </div>
          <div className="info-panel">
            <h4>量子门说明</h4>
            <p><strong>H</strong>: Hadamard - 创建叠加态<br />
               <strong>X/Y/Z</strong>: 泡利门 - 量子比特翻转<br />
               <strong>CNOT</strong>: 受控NOT - 双量子比特纠缠<br />
               <strong>TOFFOLI</strong>: 双控NOT - 三量子比特操作<br />
               <strong>Rx/Ry/Rz</strong>: 旋转门 - 自定义角度旋转</p>
          </div>
          <div className="info-panel">
            <h4>可视化</h4>
            <p><strong>概率柱状图</strong>: 显示各基态测量概率<br />
               <strong>布洛赫球</strong>: 每个量子比特的状态表示<br />
               <strong>拖拽旋转</strong>: 鼠标拖动布洛赫球查看</p>
          </div>
          <div className="info-panel">
            <h4>高级功能</h4>
            <p><strong>电路优化</strong>: 自动检测无操作门并建议优化<br />
               <strong>LaTeX 导出</strong>: 导出 Qcircuit 或 quantikz 格式</p>
          </div>
        </div>
      </div>

      {showOptimizer && (
        <CircuitOptimizer
          circuit={{ n_qubits: nQubits, gates: gates }}
          onApplyOptimization={handleApplyOptimization}
          onClose={() => setShowOptimizer(false)}
        />
      )}

      {showLatexExport && (
        <LatexExporter
          circuit={{ n_qubits: nQubits, gates: gates }}
          onClose={() => setShowLatexExport(false)}
        />
      )}
    </div>
  );
}

export default App;
