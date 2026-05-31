import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
} from 'reactflow';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  Input,
  Select,
  Form,
  Modal,
  message,
  Space,
  Tabs,
  Table,
  Tag,
  Popconfirm,
  InputNumber,
} from 'antd';
import {
  SaveOutlined,
  PlayCircleOutlined,
  UploadOutlined,
  HistoryOutlined,
  DatabaseOutlined,
  FilterOutlined,
  SwapOutlined,
  BarChartOutlined,
  CloudUploadOutlined,
  SafetyOutlined,
} from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import { flowApi, executionApi } from '../api';
import { useAppStore } from '../store';
import { Flow, FlowVersion, FlowNode, NodeType, FlowDefinition, FilterCondition, FieldMapping, Aggregation, QualityCheck } from '../types';

const { Option } = Select;
const { TabPane } = Tabs;

const nodeLabels: Record<NodeType, string> = {
  source: '数据源输入',
  filter: '数据过滤',
  mapping: '字段映射',
  aggregate: '数据聚合',
  sink: '数据输出',
  quality: '数据质量',
};

const nodeColors: Record<NodeType, string> = {
  source: '#52c41a',
  filter: '#faad14',
  mapping: '#1890ff',
  aggregate: '#722ed1',
  sink: '#f5222d',
  quality: '#13c2c2',
};

const CustomNode: React.FC<{ data: { label: string; type: NodeType } }> = ({ data }) => {
  return (
    <div
      style={{
        padding: '8px 16px',
        background: nodeColors[data.type],
        color: 'white',
        borderRadius: '8px',
        border: '2px solid rgba(0,0,0,0.2)',
        minWidth: '120px',
        textAlign: 'center',
        fontWeight: 500,
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#fff', border: '2px solid #333' }}
      />
      <div>{data.label}</div>
      <div style={{ fontSize: '10px', opacity: 0.8 }}>{nodeLabels[data.type]}</div>
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#fff', border: '2px solid #333' }}
      />
    </div>
  );
};

const nodeTypes = {
  custom: CustomNode,
};

const FlowEditorPage: React.FC = () => {
  const { flowId } = useParams<{ flowId: string }>();
  const navigate = useNavigate();
  const { datasources, setCurrentFlow, setCurrentDefinition } = useAppStore();

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [versions, setVersions] = useState<FlowVersion[]>([]);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [versionModalVisible, setVersionModalVisible] = useState(false);
  const [publishModalVisible, setPublishModalVisible] = useState(false);
  const [saveForm] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'smoothstep',
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          eds,
        ),
      ),
    [setEdges],
  );

  useEffect(() => {
    if (flowId) {
      loadFlow();
    }
  }, [flowId]);

  const loadFlow = async () => {
    if (!flowId) return;

    try {
      const [flowData, versionsData] = await Promise.all([
        flowApi.getById(flowId),
        flowApi.getVersions(flowId),
      ]);

      setFlow(flowData);
      setVersions(versionsData);
      setCurrentFlow(flowData);

      if (versionsData.length > 0) {
        const latestVersion = versionsData[0];
        loadDefinition(latestVersion.definition);
      }
    } catch (error: any) {
      message.error('加载流程失败: ' + error.message);
    }
  };

  const loadDefinition = (definition: FlowDefinition) => {
    const flowNodes: Node[] = definition.nodes.map((node) => ({
      id: node.id,
      type: 'custom',
      position: node.position,
      data: {
        label: node.data.label,
        type: node.type,
        config: node.data.config,
        datasourceId: node.data.datasourceId,
      },
    }));

    const flowEdges: Edge[] = definition.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed },
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);
    setCurrentDefinition(definition);
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow') as NodeType;

      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = {
        x: event.clientX - 100,
        y: event.clientY - 50,
      };

      const newNode: Node = {
        id: uuidv4(),
        type: 'custom',
        position,
        data: {
          label: nodeLabels[type],
          type,
          config: {},
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes],
  );

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  };

  const onPaneClick = () => {
    setSelectedNode(null);
  };

  const getCurrentDefinition = (): FlowDefinition => {
    return {
      nodes: nodes.map((node) => ({
        id: node.id,
        type: node.data.type as NodeType,
        position: node.position,
        data: {
          label: node.data.label,
          config: node.data.config || {},
          datasourceId: node.data.datasourceId,
        },
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      })),
    };
  };

  const handleSaveVersion = async (values: { changelog: string }) => {
    if (!flowId) return;

    setLoading(true);
    try {
      const definition = getCurrentDefinition();
      await flowApi.saveVersion(flowId, definition, values.changelog);
      message.success('保存成功');
      setSaveModalVisible(false);
      saveForm.resetFields();
      await loadFlow();
    } catch (error: any) {
      message.error('保存失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (values: { versionId: string; changelog: string }) => {
    if (!flowId) return;

    setLoading(true);
    try {
      await flowApi.publish(flowId, values.versionId, values.changelog);
      message.success('发布成功');
      setPublishModalVisible(false);
      await loadFlow();
    } catch (error: any) {
      message.error('发布失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRun = async () => {
    if (!flowId || !flow) return;

    if (flow.status !== 'published') {
      message.warning('请先发布流程');
      return;
    }

    try {
      const execution = await executionApi.runFlow(flowId);
      message.success('已提交执行，ID: ' + execution.id);
      navigate(`/executions/${execution.id}`);
    } catch (error: any) {
      message.error('执行失败: ' + error.message);
    }
  };

  const updateNodeData = (nodeId: string, data: any) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data: { ...node.data, ...data } };
        }
        return node;
      }),
    );
  };

  const NodePalette: React.FC = () => {
    const nodeTypes: NodeType[] = ['source', 'filter', 'mapping', 'quality', 'aggregate', 'sink'];
    const icons = {
      source: <DatabaseOutlined />,
      filter: <FilterOutlined />,
      mapping: <SwapOutlined />,
      quality: <SafetyOutlined />,
      aggregate: <BarChartOutlined />,
      sink: <CloudUploadOutlined />,
    };

    const onDragStart = (event: React.DragEvent, nodeType: NodeType) => {
      event.dataTransfer.setData('application/reactflow', nodeType);
      event.dataTransfer.effectAllowed = 'move';
    };

    return (
      <div className="node-palette">
        <h4 style={{ marginBottom: 16 }}>节点面板</h4>
        {nodeTypes.map((type) => (
          <div
            key={type}
            className={`node-palette-item node-palette-item-${type}`}
            draggable
            onDragStart={(e) => onDragStart(e, type)}
          >
            {icons[type]}
            <span>{nodeLabels[type]}</span>
          </div>
        ))}
      </div>
    );
  };

  const NodeConfigPanel: React.FC = () => {
    if (!selectedNode) {
      return (
        <div style={{ padding: 16, color: '#999' }}>
          点击节点以编辑配置
        </div>
      );
    }

    const nodeData = selectedNode.data;

    const renderConfigFields = () => {
      switch (nodeData.type) {
        case 'source':
        case 'sink':
          return (
            <>
              <Form.Item label="节点名称">
                <Input
                  value={nodeData.label}
                  onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                />
              </Form.Item>
              <Form.Item label="数据源">
                <Select
                  placeholder="选择数据源"
                  style={{ width: '100%' }}
                  value={nodeData.datasourceId}
                  onChange={(value) => updateNodeData(selectedNode.id, { datasourceId: value })}
                >
                  {datasources.map((ds) => (
                    <Option key={ds.id} value={ds.id}>
                      {ds.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </>
          );

        case 'filter':
          const conditions: FilterCondition[] = nodeData.config?.conditions || [];
          return (
            <>
              <Form.Item label="节点名称">
                <Input
                  value={nodeData.label}
                  onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                />
              </Form.Item>
              <div style={{ marginBottom: 16 }}>
                <Space style={{ marginBottom: 8 }}>
                  <Select
                    value={nodeData.config?.operator || 'AND'}
                    onChange={(val) =>
                      updateNodeData(selectedNode.id, {
                        config: { ...nodeData.config, operator: val },
                      })
                    }
                    style={{ width: 100 }}
                  >
                    <Option value="AND">AND</Option>
                    <Option value="OR">OR</Option>
                  </Select>
                  <Button
                    type="dashed"
                    icon={<DatabaseOutlined />}
                    onClick={() =>
                      updateNodeData(selectedNode.id, {
                        config: {
                          ...nodeData.config,
                          conditions: [
                            ...(conditions || []),
                            { field: '', operator: 'equals', value: '' },
                          ],
                        },
                      })
                    }
                  >
                    添加条件
                  </Button>
                </Space>
                {conditions.map((cond, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <Input
                      placeholder="字段名"
                      style={{ width: 120 }}
                      value={cond.field}
                      onChange={(e) => {
                        const newConditions = [...conditions];
                        newConditions[idx] = { ...cond, field: e.target.value };
                        updateNodeData(selectedNode.id, {
                          config: { ...nodeData.config, conditions: newConditions },
                        });
                      }}
                    />
                    <Select
                      value={cond.operator}
                      style={{ width: 140 }}
                      onChange={(val) => {
                        const newConditions = [...conditions];
                        newConditions[idx] = { ...cond, operator: val as any };
                        updateNodeData(selectedNode.id, {
                          config: { ...nodeData.config, conditions: newConditions },
                        });
                      }}
                    >
                      <Option value="equals">等于</Option>
                      <Option value="not_equals">不等于</Option>
                      <Option value="contains">包含</Option>
                      <Option value="not_contains">不包含</Option>
                      <Option value="greater_than">大于</Option>
                      <Option value="less_than">小于</Option>
                      <Option value="is_null">为空</Option>
                      <Option value="is_not_null">不为空</Option>
                    </Select>
                    <Input
                      placeholder="值"
                      style={{ flex: 1 }}
                      value={cond.value as string}
                      onChange={(e) => {
                        const newConditions = [...conditions];
                        newConditions[idx] = { ...cond, value: e.target.value };
                        updateNodeData(selectedNode.id, {
                          config: { ...nodeData.config, conditions: newConditions },
                        });
                      }}
                    />
                    <Button
                      type="text"
                      danger
                      onClick={() => {
                        const newConditions = conditions.filter((_, i) => i !== idx);
                        updateNodeData(selectedNode.id, {
                          config: { ...nodeData.config, conditions: newConditions },
                        });
                      }}
                    >
                      X
                    </Button>
                  </div>
                ))}
              </div>
            </>
          );

        case 'mapping':
          const mappings: FieldMapping[] = nodeData.config?.mappings || [];
          return (
            <>
              <Form.Item label="节点名称">
                <Input
                  value={nodeData.label}
                  onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                />
              </Form.Item>
              <div style={{ marginBottom: 16 }}>
                <Button
                  type="dashed"
                  block
                  onClick={() =>
                    updateNodeData(selectedNode.id, {
                      config: {
                        ...nodeData.config,
                        mappings: [
                          ...(mappings || []),
                          { sourceField: '', transform: 'none' },
                        ],
                      },
                    })
                  }
                >
                  添加映射
                </Button>
                {mappings.map((mapping, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, marginTop: 8 }}>
                    <Input
                      placeholder="源字段"
                      style={{ width: 100 }}
                      value={mapping.sourceField}
                      onChange={(e) => {
                        const newMappings = [...mappings];
                        newMappings[idx] = { ...mapping, sourceField: e.target.value };
                        updateNodeData(selectedNode.id, {
                          config: { ...nodeData.config, mappings: newMappings },
                        });
                      }}
                    />
                    <Select
                      value={mapping.transform}
                      style={{ width: 100 }}
                      onChange={(val) => {
                        const newMappings = [...mappings];
                        newMappings[idx] = { ...mapping, transform: val as any };
                        updateNodeData(selectedNode.id, {
                          config: { ...nodeData.config, mappings: newMappings },
                        });
                      }}
                    >
                      <Option value="none">无转换</Option>
                      <Option value="uppercase">大写</Option>
                      <Option value="lowercase">小写</Option>
                      <Option value="trim">去空格</Option>
                      <Option value="to_number">转数字</Option>
                      <Option value="to_string">转字符串</Option>
                    </Select>
                    <Input
                      placeholder="目标字段"
                      style={{ width: 100 }}
                      value={mapping.targetField}
                      onChange={(e) => {
                        const newMappings = [...mappings];
                        newMappings[idx] = { ...mapping, targetField: e.target.value };
                        updateNodeData(selectedNode.id, {
                          config: { ...nodeData.config, mappings: newMappings },
                        });
                      }}
                    />
                    <Button
                      type="text"
                      danger
                      onClick={() => {
                        const newMappings = mappings.filter((_, i) => i !== idx);
                        updateNodeData(selectedNode.id, {
                          config: { ...nodeData.config, mappings: newMappings },
                        });
                      }}
                    >
                      X
                    </Button>
                  </div>
                ))}
              </div>
            </>
          );

        case 'aggregate':
          const aggregations: Aggregation[] = nodeData.config?.aggregations || [];
          const groupBy: string[] = nodeData.config?.groupBy || [];
          return (
            <>
              <Form.Item label="节点名称">
                <Input
                  value={nodeData.label}
                  onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                />
              </Form.Item>
              <Form.Item label="分组字段 (逗号分隔)">
                <Input
                  placeholder="例如: category, region"
                  value={groupBy.join(',')}
                  onChange={(e) =>
                    updateNodeData(selectedNode.id, {
                      config: {
                        ...nodeData.config,
                        groupBy: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                      },
                    })
                  }
                />
              </Form.Item>
              <div style={{ marginBottom: 16 }}>
                <Button
                  type="dashed"
                  block
                  onClick={() =>
                    updateNodeData(selectedNode.id, {
                      config: {
                        ...nodeData.config,
                        aggregations: [
                          ...(aggregations || []),
                          { operation: 'count' },
                        ],
                      },
                    })
                  }
                >
                  添加聚合
                </Button>
                {aggregations.map((agg, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 8, marginTop: 8 }}>
                    <Select
                      value={agg.operation}
                      style={{ width: 100 }}
                      onChange={(val) => {
                        const newAggs = [...aggregations];
                        newAggs[idx] = { ...agg, operation: val as any };
                        updateNodeData(selectedNode.id, {
                          config: { ...nodeData.config, aggregations: newAggs },
                        });
                      }}
                    >
                      <Option value="count">计数</Option>
                      <Option value="sum">求和</Option>
                      <Option value="avg">平均</Option>
                      <Option value="min">最小值</Option>
                      <Option value="max">最大值</Option>
                    </Select>
                    <Input
                      placeholder="字段"
                      style={{ flex: 1 }}
                      value={agg.field}
                      onChange={(e) => {
                        const newAggs = [...aggregations];
                        newAggs[idx] = { ...agg, field: e.target.value };
                        updateNodeData(selectedNode.id, {
                          config: { ...nodeData.config, aggregations: newAggs },
                        });
                      }}
                    />
                    <Button
                      type="text"
                      danger
                      onClick={() => {
                        const newAggs = aggregations.filter((_, i) => i !== idx);
                        updateNodeData(selectedNode.id, {
                          config: { ...nodeData.config, aggregations: newAggs },
                        });
                      }}
                    >
                      X
                    </Button>
                  </div>
                ))}
              </div>
            </>
          );

        case 'quality':
          const checks: QualityCheck[] = nodeData.config?.checks || [];
          return (
            <>
              <Form.Item label="节点名称">
                <Input
                  value={nodeData.label}
                  onChange={(e) => updateNodeData(selectedNode.id, { label: e.target.value })}
                />
              </Form.Item>
              <div style={{ marginBottom: 16 }}>
                <Button
                  type="dashed"
                  block
                  onClick={() =>
                    updateNodeData(selectedNode.id, {
                      config: {
                        ...nodeData.config,
                        checks: [
                          ...(checks || []),
                          {
                            id: uuidv4(),
                            type: 'not_null',
                            field: '',
                            severity: 'error',
                            stopOnError: false,
                          },
                        ],
                      },
                    })
                  }
                >
                  添加校验规则
                </Button>
                {checks.map((check, idx) => (
                  <Card
                    key={check.id}
                    size="small"
                    style={{ marginTop: 12 }}
                    title={`规则 ${idx + 1}`}
                    extra={
                      <Button
                        type="text"
                        danger
                        onClick={() => {
                          const newChecks = checks.filter((_, i) => i !== idx);
                          updateNodeData(selectedNode.id, {
                            config: { ...nodeData.config, checks: newChecks },
                          });
                        }}
                      >
                        删除
                      </Button>
                    }
                  >
                    <Space direction="vertical" style={{ width: '100%' }} size="small">
                      <Space wrap>
                        <Select
                          value={check.type}
                          style={{ width: 120 }}
                          onChange={(val) => {
                            const newChecks = [...checks];
                            newChecks[idx] = { ...check, type: val as any };
                            updateNodeData(selectedNode.id, {
                              config: { ...nodeData.config, checks: newChecks },
                            });
                          }}
                        >
                          <Option value="not_null">非空校验</Option>
                          <Option value="regex">正则格式</Option>
                          <Option value="unique">唯一值</Option>
                          <Option value="range">范围校验</Option>
                          <Option value="min_length">最小长度</Option>
                          <Option value="max_length">最大长度</Option>
                          <Option value="in_list">值列表</Option>
                        </Select>
                        <Input
                          placeholder="字段名"
                          style={{ width: 120 }}
                          value={check.field}
                          onChange={(e) => {
                            const newChecks = [...checks];
                            newChecks[idx] = { ...check, field: e.target.value };
                            updateNodeData(selectedNode.id, {
                              config: { ...nodeData.config, checks: newChecks },
                            });
                          }}
                        />
                        <Select
                          value={check.severity}
                          style={{ width: 80 }}
                          onChange={(val) => {
                            const newChecks = [...checks];
                            newChecks[idx] = { ...check, severity: val as any };
                            updateNodeData(selectedNode.id, {
                              config: { ...nodeData.config, checks: newChecks },
                            });
                          }}
                        >
                          <Option value="error">错误</Option>
                          <Option value="warn">警告</Option>
                        </Select>
                      </Space>

                      {check.type === 'regex' && (
                        <Input
                          placeholder="正则表达式，例如: ^\d+$"
                          value={check.pattern}
                          onChange={(e) => {
                            const newChecks = [...checks];
                            newChecks[idx] = { ...check, pattern: e.target.value };
                            updateNodeData(selectedNode.id, {
                              config: { ...nodeData.config, checks: newChecks },
                            });
                          }}
                        />
                      )}

                      {check.type === 'range' && (
                        <Space>
                          <InputNumber
                            placeholder="最小值"
                            value={check.min}
                            onChange={(val) => {
                              const newChecks = [...checks];
                              newChecks[idx] = { ...check, min: val || undefined };
                              updateNodeData(selectedNode.id, {
                                config: { ...nodeData.config, checks: newChecks },
                              });
                            }}
                          />
                          <InputNumber
                            placeholder="最大值"
                            value={check.max}
                            onChange={(val) => {
                              const newChecks = [...checks];
                              newChecks[idx] = { ...check, max: val || undefined };
                              updateNodeData(selectedNode.id, {
                                config: { ...nodeData.config, checks: newChecks },
                              });
                            }}
                          />
                        </Space>
                      )}

                      {check.type === 'min_length' && (
                        <InputNumber
                          placeholder="最小长度"
                          value={check.minLength}
                          onChange={(val) => {
                            const newChecks = [...checks];
                            newChecks[idx] = { ...check, minLength: val || 0 };
                            updateNodeData(selectedNode.id, {
                              config: { ...nodeData.config, checks: newChecks },
                            });
                          }}
                        />
                      )}

                      {check.type === 'max_length' && (
                        <InputNumber
                          placeholder="最大长度"
                          value={check.maxLength}
                          onChange={(val) => {
                            const newChecks = [...checks];
                            newChecks[idx] = { ...check, maxLength: val || undefined };
                            updateNodeData(selectedNode.id, {
                              config: { ...nodeData.config, checks: newChecks },
                            });
                          }}
                        />
                      )}

                      {check.type === 'in_list' && (
                        <Input
                          placeholder="允许的值（逗号分隔）"
                          value={check.values?.join(',')}
                          onChange={(e) => {
                            const newChecks = [...checks];
                            newChecks[idx] = {
                              ...check,
                              values: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                            };
                            updateNodeData(selectedNode.id, {
                              config: { ...nodeData.config, checks: newChecks },
                            });
                          }}
                        />
                      )}

                      <Input
                        placeholder="自定义错误信息（可选）"
                        value={check.message}
                        onChange={(e) => {
                          const newChecks = [...checks];
                          newChecks[idx] = { ...check, message: e.target.value };
                          updateNodeData(selectedNode.id, {
                            config: { ...nodeData.config, checks: newChecks },
                          });
                        }}
                      />

                      <Select
                        value={check.stopOnError ? 'stop' : 'continue'}
                        style={{ width: 150 }}
                        onChange={(val) => {
                          const newChecks = [...checks];
                          newChecks[idx] = { ...check, stopOnError: val === 'stop' };
                          updateNodeData(selectedNode.id, {
                            config: { ...nodeData.config, checks: newChecks },
                          });
                        }}
                      >
                        <Option value="continue">警告，继续处理</Option>
                        <Option value="stop">错误，跳过该行</Option>
                      </Select>
                    </Space>
                  </Card>
                ))}
              </div>
            </>
          );

        default:
          return null;
      }
    };

    return (
      <div style={{ padding: 16 }}>
        <Space style={{ marginBottom: 16 }}>
          <Tag color={nodeColors[nodeData.type]}>{nodeLabels[nodeData.type]}</Tag>
          <Popconfirm
            title="确定删除此节点？"
            onConfirm={() => {
              setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
              setSelectedNode(null);
            }}
          >
            <Button type="text" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
        <Form layout="vertical">{renderConfigFields()}</Form>
      </div>
    );
  };

  const VersionList: React.FC = () => {
    return (
      <div style={{ padding: 16 }}>
        <Table
          size="small"
          dataSource={versions}
          rowKey="id"
          columns={[
            { title: '版本', dataIndex: 'version', key: 'version' },
            { title: '描述', dataIndex: 'changelog', key: 'changelog', ellipsis: true },
            {
              title: '创建时间',
              dataIndex: 'createdAt',
              key: 'createdAt',
              render: (date: string) => new Date(date).toLocaleString(),
            },
            {
              title: '操作',
              key: 'actions',
              render: (_, record) => (
                <Space>
                  <Button
                    type="link"
                    size="small"
                    onClick={() => loadDefinition(record.definition)}
                  >
                    预览
                  </Button>
                  <Popconfirm
                    title="确定回滚到此版本？"
                    onConfirm={async () => {
                      try {
                        const newVersion = await flowApi.rollback(flowId!, record.id);
                        message.success('已创建回滚版本: ' + newVersion.version);
                        await loadFlow();
                      } catch (error: any) {
                        message.error('回滚失败: ' + error.message);
                      }
                    }}
                  >
                    <Button type="link" size="small" danger>
                      回滚
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
          pagination={false}
        />
      </div>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="flow-editor-toolbar">
        <h3 style={{ margin: 0, marginRight: 24 }}>{flow?.name || '流程编辑器'}</h3>
        {flow && (
          <Tag color={flow.status === 'published' ? 'green' : 'orange'}>
            {flow.status === 'published' ? '已发布' : '草稿'}
          </Tag>
        )}
        <Space style={{ marginLeft: 'auto' }}>
          <Button
            icon={<SaveOutlined />}
            onClick={() => setSaveModalVisible(true)}
          >
            保存版本
          </Button>
          <Button
            icon={<UploadOutlined />}
            onClick={() => {
              if (versions.length === 0) {
                message.warning('请先保存版本');
                return;
              }
              setPublishModalVisible(true);
            }}
          >
            发布
          </Button>
          <Button
            icon={<HistoryOutlined />}
            onClick={() => setVersionModalVisible(true)}
          >
            版本历史
          </Button>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleRun}
          >
            执行
          </Button>
        </Space>
      </div>

      <div style={{ flex: 1, display: 'flex' }}>
        <div
          style={{ width: 200, background: '#fff', borderRight: '1px solid #f0f0f0' }}
        >
          <NodePalette />
        </div>

        <div style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        <div
          className="flow-sidebar"
          style={{
            background: '#fff',
            borderLeft: '1px solid #f0f0f0',
            width: 320,
            overflow: 'auto',
          }}
        >
          <Tabs defaultActiveKey="config">
            <TabPane tab="节点配置" key="config">
              <NodeConfigPanel />
            </TabPane>
          </Tabs>
        </div>
      </div>

      <Modal
        title="保存版本"
        open={saveModalVisible}
        onCancel={() => setSaveModalVisible(false)}
        onOk={() => saveForm.submit()}
        confirmLoading={loading}
      >
        <Form form={saveForm} layout="vertical" onFinish={handleSaveVersion}>
          <Form.Item
            name="changelog"
            label="版本描述"
          >
            <Input.TextArea rows={3} placeholder="请输入版本描述" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="版本历史"
        open={versionModalVisible}
        onCancel={() => setVersionModalVisible(false)}
        footer={null}
        width={700}
      >
        <VersionList />
      </Modal>

      <Modal
        title="发布流程"
        open={publishModalVisible}
        onCancel={() => setPublishModalVisible(false)}
        onOk={() => {
          const values = {
            versionId: versions[0]?.id,
            changelog: '',
          };
          handlePublish(values);
        }}
        confirmLoading={loading}
      >
        <Form layout="vertical">
          <Form.Item label="选择版本">
            <Select
              style={{ width: '100%' }}
              disabled
              defaultValue={versions[0]?.id}
            >
              {versions.map((v) => (
                <Option key={v.id} value={v.id}>
                  版本 {v.version} - {v.changelog || '无描述'}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default FlowEditorPage;
