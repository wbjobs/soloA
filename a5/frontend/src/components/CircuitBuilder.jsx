import React, { useState } from 'react';

const GATE_INFO = {
  'H': { name: 'Hadamard', requiresTargets: 1, description: '创建叠加态' },
  'X': { name: 'Pauli-X', requiresTargets: 1, description: '量子 NOT 门' },
  'Y': { name: 'Pauli-Y', requiresTargets: 1, description: 'Y 泡利门' },
  'Z': { name: 'Pauli-Z', requiresTargets: 1, description: 'Z 泡利门（相位翻转）' },
  'S': { name: 'S Gate', requiresTargets: 1, description: 'π/2 相位门' },
  'T': { name: 'T Gate', requiresTargets: 1, description: 'π/4 相位门' },
  'I': { name: 'Identity', requiresTargets: 1, description: '恒等门（无操作）' },
  'Rx': { name: 'Rotation X', requiresTargets: 1, requiresAngle: true, description: '绕 X 轴旋转' },
  'Ry': { name: 'Rotation Y', requiresTargets: 1, requiresAngle: true, description: '绕 Y 轴旋转' },
  'Rz': { name: 'Rotation Z', requiresTargets: 1, requiresAngle: true, description: '绕 Z 轴旋转' },
  'CNOT': { name: 'CNOT', requiresTargets: 2, description: '受控 NOT 门（控制位、目标位）' },
  'TOFFOLI': { name: 'Toffoli', requiresTargets: 3, description: '双控 NOT 门（控制位1、控制位2、目标位）' },
};

function CircuitBuilder({ nQubits, gates, onAddGate, onRemoveGate, onReset }) {
  const [selectedGate, setSelectedGate] = useState('H');
  const [selectedQubits, setSelectedQubits] = useState([]);
  const [rotationAngle, setRotationAngle] = useState(Math.PI / 2);

  const currentGateInfo = GATE_INFO[selectedGate];

  const handleQubitSelect = (qubitIndex) => {
    const requiredTargets = currentGateInfo.requiresTargets;
    
    if (selectedQubits.includes(qubitIndex)) {
      setSelectedQubits(selectedQubits.filter(q => q !== qubitIndex));
    } else {
      const newSelection = [...selectedQubits, qubitIndex];
      if (newSelection.length <= requiredTargets) {
        setSelectedQubits(newSelection);
      }
    }
  };

  const handleAddGate = () => {
    if (selectedQubits.length !== currentGateInfo.requiresTargets) {
      return;
    }

    const gateData = {
      type: selectedGate,
      targets: [...selectedQubits],
      params: {},
    };

    if (currentGateInfo.requiresAngle) {
      gateData.params.angle = parseFloat(rotationAngle);
    }

    onAddGate(gateData);
    setSelectedQubits([]);
  };

  const getGateForQubit = (qubitIndex, stepIndex) => {
    const gate = gates[stepIndex];
    if (!gate) return null;

    if (gate.targets.includes(qubitIndex)) {
      return gate;
    }
    return null;
  };

  const qubitLines = Array.from({ length: nQubits }, (_, i) => i);

  const maxSteps = gates.length > 0 ? gates.length : 0;

  return (
    <div>
      <div className="section">
        <h3 className="section-title">添加量子门</h3>
        
        <div className="control-group">
          <label>选择量子门:</label>
          <select 
            className="select"
            value={selectedGate}
            onChange={(e) => {
              setSelectedGate(e.target.value);
              setSelectedQubits([]);
            }}
          >
            <optgroup label="单量子比特门">
              <option value="H">H - Hadamard</option>
              <option value="X">X - Pauli-X (NOT)</option>
              <option value="Y">Y - Pauli-Y</option>
              <option value="Z">Z - Pauli-Z</option>
              <option value="S">S - Phase</option>
              <option value="T">T - π/8</option>
              <option value="I">I - Identity</option>
            </optgroup>
            <optgroup label="旋转门">
              <option value="Rx">Rx - 绕 X 轴旋转</option>
              <option value="Ry">Ry - 绕 Y 轴旋转</option>
              <option value="Rz">Rz - 绕 Z 轴旋转</option>
            </optgroup>
            <optgroup label="多量子比特门">
              <option value="CNOT">CNOT - 受控 NOT</option>
              <option value="TOFFOLI">TOFFOLI - 双控 NOT</option>
            </optgroup>
          </select>
        </div>

        <div className="info-panel">
          <h4>{currentGateInfo.name}</h4>
          <p>{currentGateInfo.description}</p>
          <p style={{ marginTop: '10px' }}>
            <strong>需要 {currentGateInfo.requiresTargets} 个量子比特</strong>
          </p>
        </div>

        {currentGateInfo.requiresAngle && (
          <div className="control-group">
            <label>旋转角度 (弧度):</label>
            <input
              type="number"
              className="input"
              value={rotationAngle}
              onChange={(e) => setRotationAngle(e.target.value)}
              step="0.1"
            />
            <p style={{ marginTop: '5px', color: '#888', fontSize: '0.8rem' }}>
              提示: π ≈ 3.1416, π/2 ≈ 1.5708
            </p>
          </div>
        )}

        <div className="control-group">
          <label>
            选择量子比特 ({selectedQubits.length}/{currentGateInfo.requiresTargets}):
          </label>
          <div className="qubit-selector">
            {qubitLines.map((qubit) => (
              <div
                key={qubit}
                className={`qubit-option ${selectedQubits.includes(qubit) ? 'selected' : ''}`}
                onClick={() => handleQubitSelect(qubit)}
              >
                q{qubit}
              </div>
            ))}
          </div>
          {selectedGate === 'CNOT' && selectedQubits.length === 2 && (
            <p style={{ marginTop: '10px', color: '#888', fontSize: '0.85rem' }}>
              第一个是控制位 (q{selectedQubits[0]})，第二个是目标位 (q{selectedQubits[1]})
            </p>
          )}
          {selectedGate === 'TOFFOLI' && selectedQubits.length === 3 && (
            <p style={{ marginTop: '10px', color: '#888', fontSize: '0.85rem' }}>
              前两个是控制位，第三个是目标位
            </p>
          )}
        </div>

        <div className="btn-group">
          <button
            className="btn btn-primary"
            onClick={handleAddGate}
            disabled={selectedQubits.length !== currentGateInfo.requiresTargets}
          >
            添加门
          </button>
          <button
            className="btn btn-secondary"
            onClick={onReset}
          >
            重置电路
          </button>
        </div>
      </div>

      <div className="section" style={{ marginTop: '20px' }}>
        <h3 className="section-title">量子电路</h3>
        <div className="circuit-container">
          {qubitLines.map((qubitIndex) => (
            <div key={qubitIndex} className="qubit-line">
              <div className="qubit-label">|0⟩ q{qubitIndex}</div>
              <div className="gate-sequence">
                {gates.map((gate, stepIndex) => {
                  const gateAtPosition = getGateForQubit(qubitIndex, stepIndex);
                  
                  if (gateAtPosition) {
                    let gateClass = 'gate-block';
                    if (gateAtPosition.type === 'CNOT') gateClass += ' cnot-gate';
                    if (gateAtPosition.type === 'TOFFOLI') gateClass += ' toffoli-gate';
                    if (['Rx', 'Ry', 'Rz'].includes(gateAtPosition.type)) gateClass += ' rotation-gate';

                    let gateLabel = gateAtPosition.type;
                    let gateInfo = '';

                    if (gateAtPosition.type === 'CNOT') {
                      const isControl = gateAtPosition.targets[0] === qubitIndex;
                      gateLabel = isControl ? '●' : '⊕';
                      gateInfo = isControl ? '控制' : '目标';
                    } else if (gateAtPosition.type === 'TOFFOLI') {
                      const isControl = gateAtPosition.targets.indexOf(qubitIndex) < 2;
                      gateLabel = isControl ? '●' : '⊕';
                      gateInfo = isControl ? '控制' : '目标';
                    } else if (gateAtPosition.params && gateAtPosition.params.angle !== undefined) {
                      gateInfo = `${gateAtPosition.params.angle.toFixed(2)} rad`;
                    }

                    return (
                      <div
                        key={stepIndex}
                        className={gateClass}
                        onClick={() => onRemoveGate(stepIndex)}
                        title="点击删除此门"
                      >
                        <span>{gateLabel}</span>
                        {gateInfo && <span className="gate-info">{gateInfo}</span>}
                      </div>
                    );
                  }
                  
                  return (
                    <div 
                      key={stepIndex}
                      style={{ 
                        minWidth: '50px', 
                        height: '50px',
                        opacity: 0.3
                      }}
                    />
                  );
                })}
                {gates.length === 0 && (
                  <span style={{ color: '#888' }}>电路为空，请添加量子门</span>
                )}
              </div>
            </div>
          ))}
        </div>
        {gates.length > 0 && (
          <p style={{ marginTop: '10px', color: '#888', fontSize: '0.85rem' }}>
            共 {gates.length} 个门 | 点击门可以删除
          </p>
        )}
      </div>
    </div>
  );
}

export default CircuitBuilder;
