import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Card,
  Tag,
  Space,
  Popconfirm,
  message,
  Tabs,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, TestOutlined } from '@ant-design/icons';
import { Datasource, DatasourceType } from '../types';
import { datasourceApi } from '../api';
import { useAppStore } from '../store';

const { Option } = Select;
const { TextArea } = Input;

const typeLabels: Record<DatasourceType, string> = {
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  csv: 'CSV 文件',
  rest_api: 'REST API',
};

const typeColors: Record<DatasourceType, string> = {
  mysql: '#00758f',
  postgresql: '#336791',
  csv: '#23a559',
  rest_api: '#ff6b6b',
};

const DatasourcesPage: React.FC = () => {
  const { datasources, setDatasources } = useAppStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDatasource, setEditingDatasource] = useState<Datasource | null>(null);
  const [form] = Form.useForm();
  const [activeType, setActiveType] = useState<DatasourceType>('mysql');
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: DatasourceType) => (
        <Tag color={typeColors[type]}>{typeLabels[type]}</Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (active: boolean) => (
        <Tag color={active ? 'green' : 'red'}>{active ? '启用' : '禁用'}</Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleString(),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: any, record: Datasource) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个数据源吗？"
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

  const handleEdit = (datasource: Datasource) => {
    setEditingDatasource(datasource);
    setActiveType(datasource.type);
    form.setFieldsValue({
      name: datasource.name,
      description: datasource.description,
      type: datasource.type,
      ...datasource.config,
    });
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await datasourceApi.delete(id);
      const updated = await datasourceApi.getAll();
      setDatasources(updated);
      message.success('删除成功');
    } catch (error: any) {
      message.error('删除失败: ' + error.message);
    }
  };

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const { name, description, type, ...config } = values;
      
      const datasourceData = {
        name,
        description,
        type,
        config,
        isActive: true,
      };

      if (editingDatasource) {
        await datasourceApi.update(editingDatasource.id, datasourceData);
        message.success('更新成功');
      } else {
        await datasourceApi.create(datasourceData);
        message.success('创建成功');
      }

      const updated = await datasourceApi.getAll();
      setDatasources(updated);
      setModalVisible(false);
      form.resetFields();
      setEditingDatasource(null);
    } catch (error: any) {
      message.error('操作失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    const values = await form.validateFields();
    setTestingConnection(true);
    try {
      const { type, ...config } = values;
      delete config.name;
      delete config.description;
      
      const result = await datasourceApi.testConnection(type as DatasourceType, config);
      if (result.success) {
        message.success('连接成功！');
      } else {
        message.error('连接失败: ' + result.message);
      }
    } catch (error: any) {
      message.error('测试失败: ' + error.message);
    } finally {
      setTestingConnection(false);
    }
  };

  const renderFormByType = () => {
    switch (activeType) {
      case 'mysql':
      case 'postgresql':
        return (
          <>
            <Form.Item
              name="host"
              label="主机地址"
              rules={[{ required: true, message: '请输入主机地址' }]}
            >
              <Input placeholder="localhost" />
            </Form.Item>
            <Form.Item
              name="port"
              label="端口"
              rules={[{ required: true, message: '请输入端口' }]}
            >
              <InputNumber
                style={{ width: '100%' }}
                placeholder={activeType === 'mysql' ? '3306' : '5432'}
              />
            </Form.Item>
            <Form.Item
              name="username"
              label="用户名"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="password"
              label="密码"
            >
              <Input.Password />
            </Form.Item>
            <Form.Item
              name="database"
              label="数据库名"
              rules={[{ required: true, message: '请输入数据库名' }]}
            >
              <Input />
            </Form.Item>
          </>
        );
      case 'csv':
        return (
          <>
            <Form.Item
              name="filePath"
              label="文件路径"
              rules={[{ required: true, message: '请输入文件路径' }]}
            >
              <Input placeholder="/path/to/data.csv" />
            </Form.Item>
            <Form.Item
              name="delimiter"
              label="分隔符"
            >
              <Input placeholder="," />
            </Form.Item>
            <Form.Item
              name="encoding"
              label="编码"
            >
              <Input placeholder="utf-8" />
            </Form.Item>
          </>
        );
      case 'rest_api':
        return (
          <>
            <Form.Item
              name="url"
              label="API 地址"
              rules={[{ required: true, message: '请输入 API 地址' }]}
            >
              <Input placeholder="https://api.example.com/data" />
            </Form.Item>
            <Form.Item
              name="method"
              label="请求方法"
            >
              <Select>
                <Option value="GET">GET</Option>
                <Option value="POST">POST</Option>
              </Select>
            </Form.Item>
            <Form.Item
              name="dataPath"
              label="数据路径"
              tooltip="响应数据中数组所在的路径，如 data.items"
            >
              <Input placeholder="data" />
            </Form.Item>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Card
        title="数据源管理"
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingDatasource(null);
              setActiveType('mysql');
              form.resetFields();
              setModalVisible(true);
            }}
          >
            新建数据源
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={datasources}
          rowKey="id"
          loading={loading}
        />
      </Card>

      <Modal
        title={editingDatasource ? '编辑数据源' : '新建数据源'}
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingDatasource(null);
          form.resetFields();
        }}
        width={600}
        footer={
          <Space>
            <Button
              icon={<TestOutlined />}
              loading={testingConnection}
              onClick={handleTestConnection}
            >
              测试连接
            </Button>
            <Button onClick={() => setModalVisible(false)}>取消</Button>
            <Button type="primary" loading={loading} onClick={() => form.submit()}>
              确定
            </Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ type: 'mysql', method: 'GET' }}
        >
          <Form.Item
            name="name"
            label="数据源名称"
            rules={[{ required: true, message: '请输入数据源名称' }]}
          >
            <Input placeholder="请输入数据源名称" />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea rows={2} placeholder="请输入数据源描述" />
          </Form.Item>
          <Form.Item
            name="type"
            label="数据源类型"
            rules={[{ required: true, message: '请选择数据源类型' }]}
          >
            <Select onChange={(val) => setActiveType(val)}>
              <Option value="mysql">MySQL</Option>
              <Option value="postgresql">PostgreSQL</Option>
              <Option value="csv">CSV 文件</Option>
              <Option value="rest_api">REST API</Option>
            </Select>
          </Form.Item>
          {renderFormByType()}
        </Form>
      </Modal>
    </div>
  );
};

export default DatasourcesPage;
