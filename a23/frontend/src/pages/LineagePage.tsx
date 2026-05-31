import React, { useState, useEffect } from 'react';
import { Card, Select, Spin, Empty, Tag, Space, Typography, Table, Tabs, message } from 'antd';
import { DatabaseOutlined, ShareAltOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  Handle,
  Position,
  MarkerType,
  Connection,
  Edge,
  Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useAppStore } from '../store';
import { lineageApi } from '../api';
import { LineageGraph, LineageNodeType } from '../types';

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

const nodeColors: Record<LineageNodeType, string> = {
  datasource: '#52c41a',
  node: '#1890ff',
  flow: '#722ed1',
  table: '#faad14',
  field: '#eb2f96',
};

const nodeLabels: Record<LineageNodeType, string> = {
  datasource: '数据源',
  node: '流程节点',
  flow: '流程',
  table: '数据表',
  field: '字段',
};

const CustomLineageNode: React.FC<{ data: { label: string; type: LineageNodeType; nodeType?: string; datasourceType?: string } }> = ({ data }) => {
  return (
    <div
      style={{
        padding: '10px 20px',
        background: nodeColors[data.type],
        color: 'white',
        borderRadius: '12px',
        border: '2px solid rgba(255,255,255,0.3)',
        minWidth: '140px',
        textAlign: 'center',
        fontWeight: 500,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#fff', border: '2px solid #333', width: 10, height: 10 }}
      />
      <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: 4 }}>
        {nodeLabels[data.type]}
      </div>
      <div style={{ fontSize: '14px', fontWeight: 600 }}>{data.label}</div>
      {(data.nodeType || data.datasourceType) && (
        <div style={{ fontSize: '11px', opacity: 0.7, marginTop: 4 }}>
          {data.datasourceType || data.nodeType}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#fff', border: '2px solid #333', width: 10, height: 10 }}
      />
    </div>
  );
};

const nodeTypes = {
  custom: CustomLineageNode,
};

const layoutGraph = (graph: LineageGraph): { nodes: Node[]; edges: Edge[] } => {
  if (!graph || graph.nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  const incomingEdges = new Map<string, string[]>();
  const outgoingEdges = new Map<string, string[]>();

  for (const edge of graph.edges) {
    if (!incomingEdges.has(edge.target)) {
      incomingEdges.set(edge.target, []);
    }
    incomingEdges.get(edge.target)!.push(edge.source);

    if (!outgoingEdges.has(edge.source)) {
      outgoingEdges.set(edge.source, []);
    }
    outgoingEdges.get(edge.source)!.push(edge.target);
  }

  const levels: Map<number, string[]> = new Map();
  const visited = new Set<string>();
  const nodeLevel = new Map<string, number>();

  const queue: { id: string; level: number }[] = [];
  for (const node of graph.nodes) {
    const inCount = incomingEdges.get(node.id)?.length || 0;
    if (inCount === 0) {
      queue.push({ id: node.id, level: 0 });
    }
  }

  while (queue.length > 0) {
    const { id, level } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    nodeLevel.set(id, level);

    if (!levels.has(level)) {
      levels.set(level, []);
    }
    levels.get(level)!.push(id);

    const nextNodes = outgoingEdges.get(id) || [];
    for (const nextId of nextNodes) {
      queue.push({ id: nextId, level: level + 1 });
    }
  }

  for (const node of graph.nodes) {
    if (!nodeLevel.has(node.id)) {
      nodeLevel.set(node.id, 0);
      if (!levels.has(0)) {
        levels.set(0, []);
      }
      levels.get(0)!.push(node.id);
    }
  }

  const nodes: Node[] = [];
  const levelWidth = 250;
  const levelHeight = 120;

  for (const [level, nodeIds] of levels.entries()) {
    const totalNodes = nodeIds.length;
    const startY = (totalNodes - 1) * levelHeight / 2;

    nodeIds.forEach((nodeId, index) => {
      const node = nodeMap.get(nodeId);
      if (!node) return;

      nodes.push({
        id: nodeId,
        type: 'custom',
        position: {
          x: level * levelWidth + 50,
          y: 200 + index * levelHeight - startY,
        },
        data: {
          label: node.label,
          type: node.type,
          nodeType: node.nodeType,
          datasourceType: node.datasourceType,
        },
      });
    });
  }

  const edges: Edge[] = graph.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: true,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: '#1890ff',
    },
    style: {
      stroke: '#1890ff',
      strokeWidth: 2,
    },
    data: edge.metadata,
  }));

  return { nodes, edges };
};

const LineagePageContent: React.FC = () => {
  const navigate = useNavigate();
  const { flows, datasources } = useAppStore();

  const [viewType, setViewType] = useState<'flow' | 'datasource'>('flow');
  const [selectedFlowId, setSelectedFlowId] = useState<string>('');
  const [selectedDatasourceId, setSelectedDatasourceId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [graph, setGraph] = useState<LineageGraph | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'smoothstep',
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          eds,
        ),
      ),
    [setEdges],
  );

  useEffect(() => {
    loadLineage();
  }, [viewType, selectedFlowId, selectedDatasourceId]);

  const loadLineage = async () => {
    if (viewType === 'flow' && !selectedFlowId) return;
    if (viewType === 'datasource' && !selectedDatasourceId) return;

    setLoading(true);
    try {
      let data: LineageGraph;
      if (viewType === 'flow') {
        data = await lineageApi.getFlowLineage(selectedFlowId);
      } else {
        data = await lineageApi.getDatasourceLineage(selectedDatasourceId);
      }

      setGraph(data);

      if (data && data.nodes.length > 0) {
        const layout = layoutGraph(data);
        setNodes(layout.nodes);
        setEdges(layout.edges);
      } else {
        setNodes([]);
        setEdges([]);
      }
    } catch (error) {
      console.error('Failed to load lineage:', error);
      message.error('加载血缘关系失败');
    } finally {
      setLoading(false);
    }
  };

  const getStats = () => {
    if (!graph) return { nodes: 0, edges: 0, datasources: 0, nodes_process: 0 };
    return {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      datasources: graph.nodes.filter(n => n.type === 'datasource').length,
      nodes_process: graph.nodes.filter(n => n.type === 'node').length,
    };
  };

  const nodesTableColumns = [
    {
      title: '节点类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: LineageNodeType) => (
        <Tag color={nodeColors[type]}>{nodeLabels[type]}</Tag>
      ),
    },
    {
      title: '节点名称',
      dataIndex: 'label',
      key: 'label',
    },
    {
      title: '详细类型',
      dataIndex: 'nodeType',
      key: 'nodeType',
      render: (_: any, record: any) => record.datasourceType || record.nodeType || '-',
    },
  ];

  const edgesTableColumns = [
    {
      title: '源节点',
      dataIndex: 'source',
      key: 'source',
    },
    {
      title: '目标节点',
      dataIndex: 'target',
      key: 'target',
    },
    {
      title: '转换信息',
      dataIndex: 'metadata',
      key: 'metadata',
      render: (metadata: any) => {
        if (!metadata) return '-';
        if (metadata.filterCondition) return '数据过滤';
        if (metadata.mapping) return '字段映射';
        if (metadata.qualityChecks) return `质量校验 (${metadata.qualityChecks.length}条)`;
        if (metadata.transformation) return '数据聚合';
        return metadata.nodeType || '-';
      },
    },
  ];

  const stats = getStats();

  return (
    <div style={{ padding: 24 }}>
      <Title level={4} style={{ marginBottom: 24 }}>
        <ShareAltOutlined style={{ marginRight: 8 }} />
        数据血缘关系
      </Title>

      <Card style={{ marginBottom: 24 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <Space wrap size="large">
            <div>
              <Text strong style={{ marginRight: 8 }}>查看方式：</Text>
              <Select
                value={viewType}
                onChange={(v) => {
                  setViewType(v);
                  setSelectedFlowId('');
                  setSelectedDatasourceId('');
                }}
                style={{ width: 150 }}
              >
                <Option value="flow">按流程查看</Option>
                <Option value="datasource">按数据源查看</Option>
              </Select>
            </div>

            {viewType === 'flow' ? (
              <Select
                placeholder="选择流程"
                value={selectedFlowId || undefined}
                onChange={setSelectedFlowId}
                style={{ width: 300 }}
                showSearch
                filterOption={(input, option) =>
                  (option?.children as string)?.toLowerCase().includes(input.toLowerCase())
                }
              >
                {flows.map(flow => (
                  <Option key={flow.id} value={flow.id}>
                    {flow.name}
                    {flow.status === 'published' ? (
                      <Tag color="green" style={{ marginLeft: 8 }}>已发布</Tag>
                    ) : (
                      <Tag color="orange" style={{ marginLeft: 8 }}>草稿</Tag>
                    )}
                  </Option>
                ))}
              </Select>
            ) : (
              <Select
                placeholder="选择数据源"
                value={selectedDatasourceId || undefined}
                onChange={setSelectedDatasourceId}
                style={{ width: 300 }}
                showSearch
                filterOption={(input, option) =>
                  (option?.children as string)?.toLowerCase().includes(input.toLowerCase())
                }
              >
                {datasources.map(ds => (
                  <Option key={ds.id} value={ds.id}>
                    {ds.name}
                    <Tag color="blue" style={{ marginLeft: 8 }}>{ds.type}</Tag>
                  </Option>
                ))}
              </Select>
            )}
          </Space>

          {graph && (
            <Space wrap size="large">
              <Tag color="blue">节点总数: {stats.nodes}</Tag>
              <Tag color="green">连接数: {stats.edges}</Tag>
              <Tag color="cyan">数据源: {stats.datasources}</Tag>
              <Tag color="purple">处理节点: {stats.nodes_process}</Tag>
            </Space>
          )}
        </Space>
      </Card>

      {loading && (
        <div style={{ textAlign: 'center', padding: 100 }}>
          <Spin size="large" />
        </div>
      )}

      {!loading && (!graph || graph.nodes.length === 0) ? (
        <Card>
          <Empty
            description={
              <Space direction="vertical" style={{ width: '100%' }}>
                <span>暂无血缘数据</span>
                <Text type="secondary">请先发布流程以生成血缘关系</Text>
              </Space>
            }
          />
        </Card>
      ) : (
        <Card style={{ marginBottom: 24 }}>
          <Tabs defaultActiveKey="graph">
            <TabPane tab="图谱视图" key="graph">
              <div style={{ height: 600 }}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  nodeTypes={nodeTypes}
                  fitView
                  fitViewOptions={{ padding: 0.2 }}
                >
                  <Background color="#aaa" gap={16} />
                  <Controls />
                  <MiniMap
                    nodeColor={(node) => nodeColors[node.data.type] || '#1890ff'}
                  />
                </ReactFlow>
              </div>
            </TabPane>

            <TabPane tab="节点列表" key="nodes">
              <Table
                dataSource={graph?.nodes.map((n, i) => ({ ...n, key: i }))}
                columns={nodesTableColumns}
                pagination={{ pageSize: 10 }}
              />
            </TabPane>

            <TabPane tab="连接列表" key="edges">
              <Table
                dataSource={graph?.edges.map((e, i) => ({ ...e, key: i }))}
                columns={edgesTableColumns}
                pagination={{ pageSize: 10 }}
              />
            </TabPane>
          </Tabs>
        </Card>
      )}
    </div>
  );
};

const LineagePage: React.FC = () => {
  return (
    <ReactFlowProvider>
      <LineagePageContent />
    </ReactFlowProvider>
  );
};

export default LineagePage;
