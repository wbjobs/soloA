import React, { useState, useEffect } from 'react';
import { Table, Card, Tag, Button, Space, Input, Select } from 'antd';
import { useNavigate } from 'react-router-dom';
import { SearchOutlined, EyeOutlined } from '@ant-design/icons';
import { executionApi, flowApi } from '../api';
import { Execution, ExecutionStatus } from '../types';

const { Search } = Input;
const { Option } = Select;

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

const ExecutionsPage: React.FC = () => {
  const navigate = useNavigate();
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [flows, setFlows] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<ExecutionStatus | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [executionsData, flowsData] = await Promise.all([
        executionApi.getAll(),
        flowApi.getAll(),
      ]);

      setExecutions(executionsData);
      
      const flowMap: Record<string, string> = {};
      flowsData.forEach((flow) => {
        flowMap[flow.id] = flow.name;
      });
      setFlows(flowMap);
    } catch (error) {
      console.error('Failed to load executions:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredExecutions = filterStatus
    ? executions.filter((e) => e.status === filterStatus)
    : executions;

  const columns = [
    {
      title: '执行 ID',
      dataIndex: 'id',
      key: 'id',
      width: 280,
      render: (id: string) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {id.substring(0, 8)}...
        </span>
      ),
    },
    {
      title: '流程名称',
      dataIndex: 'flowId',
      key: 'flowId',
      render: (flowId: string) => flows[flowId] || flowId,
    },
    {
      title: '版本',
      dataIndex: 'versionNumber',
      key: 'versionNumber',
      width: 80,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: ExecutionStatus) => (
        <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>
      ),
    },
    {
      title: '开始时间',
      dataIndex: 'startedAt',
      key: 'startedAt',
      render: (date?: string) => (date ? new Date(date).toLocaleString() : '-'),
    },
    {
      title: '完成时间',
      dataIndex: 'completedAt',
      key: 'completedAt',
      render: (date?: string) => (date ? new Date(date).toLocaleString() : '-'),
    },
    {
      title: '耗时',
      key: 'duration',
      width: 120,
      render: (_: any, record: Execution) => {
        if (!record.startedAt) return '-';
        const endTime = record.completedAt ? new Date(record.completedAt) : new Date();
        const duration = endTime.getTime() - new Date(record.startedAt).getTime();
        const seconds = Math.floor(duration / 1000);
        const minutes = Math.floor(seconds / 60);
        if (minutes > 0) {
          return `${minutes}m ${seconds % 60}s`;
        }
        return `${seconds}s`;
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_: any, record: Execution) => (
        <Button
          type="link"
          icon={<EyeOutlined />}
          onClick={() => navigate(`/executions/${record.id}`)}
        >
          详情
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="执行记录"
        extra={
          <Space>
            <Select
              placeholder="全部状态"
              style={{ width: 120 }}
              allowClear
              onChange={(val) => setFilterStatus(val as ExecutionStatus)}
            >
              <Option value="pending">等待中</Option>
              <Option value="running">执行中</Option>
              <Option value="completed">已完成</Option>
              <Option value="failed">失败</Option>
            </Select>
            <Button onClick={loadData}>刷新</Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={filteredExecutions}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>
    </div>
  );
};

export default ExecutionsPage;
