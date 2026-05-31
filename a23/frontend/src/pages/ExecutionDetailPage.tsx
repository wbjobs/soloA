import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Tag,
  Spin,
  Table,
  Space,
  Button,
  Tabs,
  Progress,
  Empty,
  Typography,
} from 'antd';
import { ReloadOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { executionApi, flowApi } from '../api';
import { Execution, ExecutionLog, ExecutionStatus } from '../types';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

const statusLabels: Record<ExecutionStatus, string> = {
  pending: '等待中',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

const statusColors: Record<ExecutionStatus, string> = {
  pending: 'default',
  running: 'processing',
  completed: 'success',
  failed: 'error',
  cancelled: 'warning',
};

const ExecutionDetailPage: React.FC = () => {
  const { executionId } = useParams<{ executionId: string }>();
  const navigate = useNavigate();
  
  const [execution, setExecution] = useState<Execution | null>(null);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [flowName, setFlowName] = useState('');
  
  const socketRef = useRef<Socket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (executionId) {
      loadExecution();
      connectSocket();
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [executionId]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const loadExecution = async () => {
    if (!executionId) return;

    setLoading(true);
    try {
      const [executionData, logsData, previewDataData, flowsData] = await Promise.all([
        executionApi.getById(executionId),
        executionApi.getLogs(executionId),
        executionApi.getPreviewData(executionId),
        flowApi.getAll(),
      ]);

      setExecution(executionData);
      setLogs(logsData);
      setPreviewData(previewDataData);

      const flow = flowsData.find((f) => f.id === executionData.flowId);
      if (flow) {
        setFlowName(flow.name);
      }
    } catch (error) {
      console.error('Failed to load execution:', error);
    } finally {
      setLoading(false);
    }
  };

  const connectSocket = () => {
    if (!executionId) return;

    const socket = io('http://localhost:3000/etl', {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
      socket.emit('subscribe_execution', { executionId });
    });

    socket.on('execution_status', (data: any) => {
      console.log('Received status update:', data);
      setExecution((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: data.status as ExecutionStatus,
          nodeProgress: data.nodeProgress,
        };
      });
    });

    socket.on('execution_log', (data: any) => {
      const log: ExecutionLog = {
        id: data.log.id,
        executionId: data.executionId,
        level: data.log.level,
        message: data.log.message,
        data: data.log.data,
        timestamp: data.log.timestamp,
        nodeId: data.log.nodeId,
      };
      setLogs((prev) => [...prev, log]);
    });

    socket.on('execution_preview', (data: any) => {
      setPreviewData(data.previewData);
    });

    socketRef.current = socket;
  };

  const getProgress = () => {
    if (!execution) return 0;
    if (execution.status === 'completed') return 100;
    if (execution.status === 'failed') return 100;
    if (execution.status === 'running') return 50;
    return 0;
  };

  const renderNodeProgress = () => {
    if (!execution?.nodeProgress) return null;

    const nodeList = Object.entries(execution.nodeProgress).map(([nodeId, progress]) => ({
      nodeId,
      ...progress,
    }));

    return (
      <div style={{ marginTop: 16 }}>
        <Text strong style={{ marginBottom: 8, display: 'block' }}>节点执行进度</Text>
        <Space direction="vertical" style={{ width: '100%' }}>
          {nodeList.map((node) => (
            <div key={node.nodeId} style={{ marginBottom: 8 }}>
              <Space>
                <Tag color={statusColors[node.status as ExecutionStatus]}>
                  {statusLabels[node.status as ExecutionStatus]}
                </Tag>
                <Text>{node.nodeId.substring(0, 8)}...</Text>
                {node.rowsProcessed !== undefined && (
                  <Text type="secondary">处理 {node.rowsProcessed} 行</Text>
                )}
              </Space>
            </div>
          ))}
        </Space>
      </div>
    );
  };

  const renderLogs = () => {
    if (logs.length === 0) {
      return <Empty description="暂无日志" />;
    }

    return (
      <div
        style={{
          height: 400,
          overflow: 'auto',
          background: '#1a1a2e',
          borderRadius: 8,
          padding: 16,
          fontFamily: 'monospace',
          fontSize: 12,
        }}
      >
        {logs.map((log, idx) => (
          <div key={log.id || idx} style={{ marginBottom: 4 }}>
            <span style={{ color: '#888' }}>
              [{new Date(log.timestamp).toLocaleTimeString()}]
            </span>
            <span className={`log-${log.level}`} style={{ marginLeft: 8, fontWeight: 'bold' }}>
              [{log.level.toUpperCase()}]
            </span>
            <span style={{ color: '#fff', marginLeft: 8 }}>{log.message}</span>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>
    );
  };

  const renderPreviewData = () => {
    if (previewData.length === 0) {
      return <Empty description="暂无预览数据" />;
    }

    const columns = previewData[0]
      ? Object.keys(previewData[0]).map((key) => ({
          title: key,
          dataIndex: key,
          key,
          ellipsis: true,
        }))
      : [];

    return (
      <div>
        <div style={{ marginBottom: 8 }}>
          <Tag color="blue">显示前 100 条数据</Tag>
          <Tag color="green">共 {previewData.length} 条</Tag>
        </div>
        <Table
          columns={columns}
          dataSource={previewData.map((row, idx) => ({ ...row, key: idx }))}
          pagination={{ pageSize: 10 }}
          size="small"
          scroll={{ x: 1000 }}
        />
      </div>
    );
  };

  if (loading && !execution) {
    return (
      <div style={{ padding: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!execution) {
    return (
      <div style={{ padding: 24 }}>
        <Empty description="执行记录不存在" />
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
          style={{ marginBottom: 16 }}
        >
          返回
        </Button>
        <Space style={{ marginRight: 16 }}>
          <Title level={4} style={{ margin: 0 }}>
            执行详情
          </Title>
          <Tag color={statusColors[execution.status]}>
            {statusLabels[execution.status]}
          </Tag>
        </Space>
      </div>

      <Card
        style={{ marginBottom: 24 }}
        extra={
          <Button icon={<ReloadOutlined />} onClick={loadExecution}>
            刷新
          </Button>
        }
      >
        <Descriptions bordered column={2}>
          <Descriptions.Item label="执行 ID">
            <Text code>{execution.id}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="流程">
            {flowName || execution.flowId}
          </Descriptions.Item>
          <Descriptions.Item label="版本">
            v{execution.versionNumber}
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={statusColors[execution.status]}>
              {statusLabels[execution.status]}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="开始时间">
            {execution.startedAt
              ? new Date(execution.startedAt).toLocaleString()
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="完成时间">
            {execution.completedAt
              ? new Date(execution.completedAt).toLocaleString()
              : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="执行进度" span={2}>
            <Progress
              percent={getProgress()}
              status={
                execution.status === 'failed'
                  ? 'exception'
                  : execution.status === 'completed'
                  ? 'success'
                  : execution.status === 'running'
                  ? 'active'
                  : 'normal'
              }
            />
          </Descriptions.Item>
          {execution.errorMessage && (
            <Descriptions.Item label="错误信息" span={2}>
              <Text type="danger">{execution.errorMessage}</Text>
            </Descriptions.Item>
          )}
        </Descriptions>
        {renderNodeProgress()}
      </Card>

      <Card>
        <Tabs defaultActiveKey="logs">
          <TabPane tab="执行日志" key="logs">
            {renderLogs()}
          </TabPane>
          <TabPane tab="数据预览" key="preview">
            {renderPreviewData()}
          </TabPane>
        </Tabs>
      </Card>
    </div>
  );
};

export default ExecutionDetailPage;
