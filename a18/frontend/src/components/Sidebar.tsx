import { useState } from 'react';
import type { Layer, PipelineNode, Pipeline } from '../types';
import { getNodeTypeLabel, getMaterialLabel, getStatusLabel } from '../utils/sampleData';

interface SidebarProps {
  layers: Layer[];
  selectedEntity: any | null;
  onToggleLayerVisibility: (layerId: string) => void;
  onAnalysisAction: (action: string, params?: any) => void;
  onSimulationAction: (action: string, params?: any) => void;
  nodes: PipelineNode[];
  pipelines: Pipeline[];
}

const Sidebar = ({ 
  layers, 
  selectedEntity, 
  onToggleLayerVisibility,
  onAnalysisAction,
  onSimulationAction,
  nodes,
  pipelines
}: SidebarProps) => {
  const [activeTab, setActiveTab] = useState<'layers' | 'analysis' | 'simulation'>('layers');
  const [analysisType, setAnalysisType] = useState('connectivity');
  const [selectedStartNode, setSelectedStartNode] = useState('');
  const [selectedEndNode, setSelectedEndNode] = useState('');
  const [maxDepth, setMaxDepth] = useState(10);
  const [leakNodeId, setLeakNodeId] = useState('');
  const [leakRate, setLeakRate] = useState(10);

  const renderEntityInfo = () => {
    if (!selectedEntity) {
      return (
        <div style={{ padding: '10px', color: '#888', textAlign: 'center' }}>
          点击场景中的元素查看详细信息
        </div>
      );
    }

    const properties = selectedEntity.properties?.getValue?.();
    const data = properties?.data;
    const type = properties?.type;

    if (type === 'node' && data) {
      return (
        <div style={{ padding: '12px' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#3498db' }}>
            节点信息
          </h3>
          <div style={{ fontSize: '12px', lineHeight: '1.8' }}>
            <p><strong>名称：</strong>{data.name}</p>
            <p><strong>类型：</strong>{getNodeTypeLabel(data.nodeType)}</p>
            <p><strong>坐标 X：</strong>{data.x?.toFixed(6)}</p>
            <p><strong>坐标 Y：</strong>{data.y?.toFixed(6)}</p>
            <p><strong>高程 Z：</strong>{data.z?.toFixed(2)} m</p>
            <p><strong>地面高程：</strong>{data.elevation?.toFixed(2)} m</p>
            <p><strong>压力：</strong>{data.pressure?.toFixed(2)} m</p>
            <p><strong>需水量：</strong>{data.demand?.toFixed(2)} L/s</p>
            {data.properties && Object.keys(data.properties).length > 0 && (
              <>
                <hr style={{ border: 'none', borderTop: '1px solid #ddd', margin: '10px 0' }} />
                <p><strong>属性信息：</strong></p>
                {Object.entries(data.properties).map(([key, value]) => (
                  <p key={key} style={{ marginLeft: '10px' }}>
                    <strong>{key}：</strong>{String(value)}
                  </p>
                ))}
              </>
            )}
          </div>
        </div>
      );
    }

    if (type === 'pipeline' && data) {
      return (
        <div style={{ padding: '12px' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', color: '#e67e22' }}>
            管道信息
          </h3>
          <div style={{ fontSize: '12px', lineHeight: '1.8' }}>
            <p><strong>名称：</strong>{data.name}</p>
            <p><strong>材质：</strong>{getMaterialLabel(data.material)}</p>
            <p><strong>直径：</strong>{data.diameter} mm</p>
            <p><strong>长度：</strong>{data.length?.toFixed(2)} m</p>
            <p><strong>埋深：</strong>{data.depth?.toFixed(2)} m</p>
            <p><strong>流量：</strong>{data.flowRate?.toFixed(2)} L/s</p>
            <p><strong>流速：</strong>{data.velocity?.toFixed(2)} m/s</p>
            <p><strong>糙率：</strong>{data.roughness?.toFixed(3)}</p>
            <p><strong>状态：</strong>{getStatusLabel(data.status)}</p>
            {data.properties && Object.keys(data.properties).length > 0 && (
              <>
                <hr style={{ border: 'none', borderTop: '1px solid #ddd', margin: '10px 0' }} />
                <p><strong>属性信息：</strong></p>
                {Object.entries(data.properties).map(([key, value]) => (
                  <p key={key} style={{ marginLeft: '10px' }}>
                    <strong>{key}：</strong>{String(value)}
                  </p>
                ))}
              </>
            )}
          </div>
        </div>
      );
    }

    return (
      <div style={{ padding: '10px', color: '#888' }}>
        未知对象类型
      </div>
    );
  };

  return (
    <div style={{
      width: '320px',
      height: '100%',
      background: 'white',
      borderRight: '1px solid #ddd',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '2px 0 5px rgba(0,0,0,0.1)'
    }}>
      <div style={{
        padding: '15px',
        background: 'linear-gradient(135deg, #1e3a5f 0%, #2c5282 100%)',
        color: 'white',
        fontSize: '16px',
        fontWeight: 'bold'
      }}>
        城市管网三维可视化管理系统
      </div>

      <div style={{
        display: 'flex',
        borderBottom: '1px solid #ddd'
      }}>
        {[
          { key: 'layers', label: '图层管理' },
          { key: 'analysis', label: '拓扑分析' },
          { key: 'simulation', label: '模拟仿真' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            style={{
              flex: 1,
              padding: '10px',
              border: 'none',
              background: activeTab === tab.key ? '#e8f4fc' : 'transparent',
              color: activeTab === tab.key ? '#2c5282' : '#666',
              cursor: 'pointer',
              fontSize: '12px',
              borderBottom: activeTab === tab.key ? '2px solid #2c5282' : '2px solid transparent'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '10px'
      }}>
        {activeTab === 'layers' && (
          <div>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#333' }}>
              图层列表
            </h4>
            {layers.map(layer => (
              <div
                key={layer.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 10px',
                  background: '#f8f9fa',
                  borderRadius: '4px',
                  marginBottom: '6px'
                }}
              >
                <input
                  type="checkbox"
                  checked={layer.visible}
                  onChange={() => onToggleLayerVisibility(layer.id)}
                  style={{ marginRight: '8px' }}
                />
                <span style={{ flex: 1, fontSize: '13px' }}>{layer.name}</span>
                <span style={{
                  fontSize: '10px',
                  color: '#888',
                  background: '#eee',
                  padding: '2px 6px',
                  borderRadius: '10px'
                }}>
                  {layer.type}
                </span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'analysis' && (
          <div>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#333' }}>
              拓扑分析
            </h4>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#555' }}>
                分析类型
              </label>
              <select
                value={analysisType}
                onChange={(e) => setAnalysisType(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px',
                  fontSize: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              >
                <option value="connectivity">连通性分析</option>
                <option value="upstream">上游查询</option>
                <option value="downstream">下游查询</option>
                <option value="loops">环路检测</option>
                <option value="shortestPath">最短路径</option>
              </select>
            </div>

            {analysisType !== 'loops' && (
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#555' }}>
                  起始节点
                </label>
                <select
                  value={selectedStartNode}
                  onChange={(e) => setSelectedStartNode(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px',
                    fontSize: '12px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                >
                  <option value="">选择节点...</option>
                  {nodes.map(node => (
                    <option key={node.id} value={node.id}>
                      {node.name} ({getNodeTypeLabel(node.nodeType)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(analysisType === 'connectivity' || analysisType === 'shortestPath') && (
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#555' }}>
                  目标节点
                </label>
                <select
                  value={selectedEndNode}
                  onChange={(e) => setSelectedEndNode(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px',
                    fontSize: '12px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                >
                  <option value="">选择节点...</option>
                  {nodes.map(node => (
                    <option key={node.id} value={node.id}>
                      {node.name} ({getNodeTypeLabel(node.nodeType)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(analysisType === 'upstream' || analysisType === 'downstream') && (
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#555' }}>
                  最大深度：{maxDepth}
                </label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={maxDepth}
                  onChange={(e) => setMaxDepth(parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
            )}

            <button
              onClick={() => {
                const params: any = {};
                if (analysisType !== 'loops') params.nodeId = selectedStartNode;
                if (analysisType === 'connectivity' || analysisType === 'shortestPath') {
                  params.targetNodeId = selectedEndNode;
                }
                if (analysisType === 'upstream' || analysisType === 'downstream') {
                  params.maxDepth = maxDepth;
                }
                onAnalysisAction(analysisType, params);
              }}
              style={{
                width: '100%',
                padding: '10px',
                background: '#2c5282',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              执行分析
            </button>
          </div>
        )}

        {activeTab === 'simulation' && (
          <div>
            <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#333' }}>
              模拟仿真
            </h4>

            <button
              onClick={() => onSimulationAction('flow')}
              style={{
                width: '100%',
                padding: '10px',
                background: '#27ae60',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                marginBottom: '10px'
              }}
            >
              运行水力模拟
            </button>

            <button
              onClick={() => onSimulationAction('pressure')}
              style={{
                width: '100%',
                padding: '10px',
                background: '#3498db',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                marginBottom: '15px'
              }}
            >
              压力分布分析
            </button>

            <hr style={{ border: 'none', borderTop: '1px solid #ddd', margin: '15px 0' }} />

            <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#333' }}>
              泄漏模拟
            </h4>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#555' }}>
                泄漏节点
              </label>
              <select
                value={leakNodeId}
                onChange={(e) => setLeakNodeId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px',
                  fontSize: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              >
                <option value="">选择泄漏节点...</option>
                {nodes.map(node => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '12px', color: '#555' }}>
                泄漏速率：{leakRate} L/s
              </label>
              <input
                type="range"
                min="1"
                max="50"
                value={leakRate}
                onChange={(e) => setLeakRate(parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>

            <button
              onClick={() => onSimulationAction('leak', { leakNodeId, leakRate })}
              style={{
                width: '100%',
                padding: '10px',
                background: '#e74c3c',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              模拟泄漏
            </button>
          </div>
        )}
      </div>

      <div style={{
        borderTop: '1px solid #ddd',
        maxHeight: '40%',
        overflowY: 'auto'
      }}>
        <div style={{
          padding: '10px',
          background: '#f8f9fa',
          borderBottom: '1px solid #ddd',
          fontSize: '13px',
          fontWeight: 'bold',
          color: '#333'
        }}>
          属性信息
        </div>
        {renderEntityInfo()}
      </div>
    </div>
  );
};

export default Sidebar;
