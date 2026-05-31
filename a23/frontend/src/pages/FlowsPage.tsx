import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Card,
  Tag,
  Space,
  Popconfirm,
  message,
  InputNumber,
  DatePicker,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  ScheduleOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Flow, FlowStatus } from '../types';
import { flowApi, executionApi } from '../api';
import { useAppStore } from '../store';

const { TextArea } = Input;

const statusLabels: Record<FlowStatus, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
};

const statusColors: Record<FlowStatus, string> = {
  draft: 'orange',
  published: 'green',
  archived: 'default',
};

const FlowsPage: React.FC = () => {
  const navigate = useNavigate();
  const { flows, setFlows } = useAppStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [editingFlow, setEditingFlow] = useState<Flow | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<Flow | null>(null);
  const [form] = Form.useForm();
  const [scheduleForm] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const columns = [
    {
      title: '流程名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: FlowStatus) => (
        <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>
      ),
    },
    {
      title: '版本数',
      dataIndex: 'versions',
      key: 'versions',
      render: (versions: any[]) => versions?.length || 0,
    },
    {
      title: '调度状态',
      dataIndex: 'isScheduled',
      key: 'isScheduled',
      render: (scheduled: boolean) => (
        <Tag color={scheduled ? 'green' : 'default'}>
          {scheduled ? '已定时' : '未定时'}
        </Tag>
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: Flow) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => navigate(`/flows/editor/${record.id}`)}
          >
            编辑
          </Button>
          {record.status === 'published' && (
            <Button
              type="link"
              icon={<PlayCircleOutlined />}
              onClick={() => handleRun(record.id)}
            >
              执行
            </Button>
          )}
          <Button
            type="link"
            icon={<ScheduleOutlined />}
            onClick={() => {
              setSelectedFlow(record);
              scheduleForm.setFieldsValue({
                cronExpression: record.cronExpression || '0 0 * * *',
              });
              setScheduleModalVisible(true);
            }}
          >
            调度
          </Button>
          <Popconfirm
            title="确定要删除这个流程吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const handleDelete = async (id: string) => {
    try {
      await flowApi.delete(id);
      const updated = await flowApi.getAll();
      setFlows(updated);
      message.success('删除成功');
    } catch (error: any) {
      message.error('删除失败: ' + error.message);
    }
  };

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      if (editingFlow) {
        await flowApi.update(editingFlow.id, values);
        message.success('更新成功');
      } else {
        await flowApi.create(values);
        message.success('创建成功');
      }

      const updated = await flowApi.getAll();
      setFlows(updated);
      setModalVisible(false);
      form.resetFields();
      setEditingFlow(null);
    } catch (error: any) {
      message.error('操作失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRun = async (flowId: string) => {
    try {
      const execution = await executionApi.runFlow(flowId);
      message.success('已提交执行，ID: ' + execution.id);
      navigate(`/executions/${execution.id}`);
    } catch (error: any) {
      message.error('执行失败: ' + error.message);
    }
  };

  const handleSchedule = async (values: any) => {
    if (!selectedFlow) return;

    try {
      if (values.enabled) {
        await flowApi.updateSchedule(selectedFlow.id, values.cronExpression);
        message.success('调度设置成功');
      } else {
        await flowApi.disableSchedule(selectedFlow.id);
        message.success('调度已禁用');
      }

      const updated = await flowApi.getAll();
      setFlows(updated);
      setScheduleModalVisible(false);
    } catch (error: any) {
      message.error('调度设置失败: ' + error.message);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="流程管理"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingFlow(null);
              form.resetFields();
              setModalVisible(true);
            }}
          >
            新建流程
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={flows}
          rowKey="id"
          loading={loading}
        />
      </Card>

      <Modal
        title={editingFlow ? '编辑流程' : '新建流程'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingFlow(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={loading}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="name"
            label="流程名称"
            rules={[{ required: true, message: '请输入流程名称' }]}
          >
            <Input placeholder="请输入流程名称" />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea rows={3} placeholder="请输入流程描述" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="定时调度设置"
        open={scheduleModalVisible}
        onCancel={() => setScheduleModalVisible(false)}
        onOk={() => scheduleForm.submit()}
      >
        <Form
          form={scheduleForm}
          layout="vertical"
          onFinish={handleSchedule}
          initialValues={{ enabled: true }}
        >
          <Form.Item
            name="enabled"
            valuePropName="checked"
          >
            <Checkbox>启用定时调度</Checkbox>
          </Form.Item>
          <Form.Item
            name="cronExpression"
            label="Cron 表达式"
            rules={[{ required: true, message: '请输入 Cron 表达式' }]}
            help="例如: 0 0 * * * (每天0点执行)，0 */5 * * * (每5分钟执行)"
          >
            <Input placeholder="0 0 * * *" />
          </Form.Item>
          <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
            <p>Cron 表达式格式：分 时 日 月 周</p>
            <p>常用表达式：</p>
            <ul>
              <li>每小时：0 * * * *</li>
              <li>每天 0 点：0 0 * * *</li>
              <li>每周一 0 点：0 0 * * 1</li>
              <li>每月 1 号 0 点：0 0 1 * *</li>
            </ul>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

const Checkbox: React.FC<{ children: React.ReactNode; checked?: boolean; onChange?: (e: any) => void; valuePropName?: string }> = ({ children, checked, onChange }) => (
  <label>
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      style={{ marginRight: 8 }}
    />
    {children}
  </label>
);

export default FlowsPage;
