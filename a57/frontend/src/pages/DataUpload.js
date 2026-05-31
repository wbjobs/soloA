import React, { useState, useEffect } from 'react';
import {
  Row,
  Col,
  Card,
  Upload,
  Button,
  Select,
  Input,
  InputNumber,
  Space,
  Table,
  Tag,
  message,
  Statistic,
  Modal,
  Descriptions,
  DatePicker,
  Progress
} from 'antd';
import {
  UploadOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { dataApi, statsApi } from '../services/api';
import { SensorColors } from '../types';

const { Dragger } = Upload;
const { Option } = Select;
const { TextArea } = Input;

function DataUpload() {
  const [devices, setDevices] = useState([]);
  const [sensorTypes, setSensorTypes] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(undefined);
  const [selectedSensor, setSelectedSensor] = useState(undefined);
  
  const [uploadLoading, setUploadLoading] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  
  const [analyzeResult, setAnalyzeResult] = useState(null);
  const [resultModalVisible, setResultModalVisible] = useState(false);

  useEffect(() => {
    loadDevicesAndSensors();
  }, []);

  const loadDevicesAndSensors = async () => {
    try {
      const [devicesRes, sensorsRes] = await Promise.all([
        dataApi.getDevices(),
        dataApi.getSensors()
      ]);
      
      setDevices(devicesRes.devices || []);
      setSensorTypes(sensorsRes.sensor_types || []);
    } catch (error) {
      console.error('Error loading devices and sensors:', error);
    }
  };

  const uploadProps = {
    name: 'file',
    multiple: false,
    accept: '.csv',
    showUploadList: {
      showRemoveIcon: true,
      showDownloadIcon: false
    },
    beforeUpload: (file) => {
      const isCSV = file.type === 'text/csv' || file.name.endsWith('.csv');
      if (!isCSV) {
        message.error('只能上传CSV文件!');
        return Upload.LIST_IGNORE;
      }
      return false;
    },
    customRequest: async ({ file, onSuccess, onError }) => {
      setUploadLoading(true);
      try {
        const result = await dataApi.uploadCSV(
          file,
          selectedDevice,
          selectedSensor
        );
        
        message.success(`成功上传 ${result.count} 条数据!`);
        onSuccess?.(result);
        loadDevicesAndSensors();
      } catch (error) {
        message.error('文件上传失败');
        onError?.(error);
      } finally {
        setUploadLoading(false);
      }
    }
  };

  const handleBatchAnalyze = async () => {
    if (devices.length === 0) {
      message.warning('没有可用的设备数据进行分析');
      return;
    }

    setAnalyzeLoading(true);
    try {
      const result = await dataApi.batchAnalyze({});
      
      setAnalyzeResult(result);
      setResultModalVisible(true);
      
      if (result.anomalies_found > 0) {
        message.success(`分析完成! 发现 ${result.anomalies_found} 个异常点, 生成 ${result.alerts_generated} 条告警`);
      } else {
        message.info('分析完成! 未发现异常点');
      }
    } catch (error) {
      message.error('批量分析失败');
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const deviceColumns = [
    {
      title: '设备ID',
      dataIndex: 'device_id',
      key: 'device_id'
    },
    {
      title: '数据点数',
      dataIndex: 'total_points',
      key: 'total_points',
      sorter: (a, b) => a.total_points - b.total_points
    },
    {
      title: '异常数',
      dataIndex: 'anomalies',
      key: 'anomalies',
      sorter: (a, b) => a.anomalies - b.anomalies
    },
    {
      title: '告警数',
      dataIndex: 'alerts',
      key: 'alerts',
      sorter: (a, b) => a.alerts - b.alerts
    },
    {
      title: '异常率',
      dataIndex: 'anomaly_rate',
      key: 'anomaly_rate',
      render: (rate) => rate + '%'
    }
  ];

  const getDeviceStats = async () => {
    const stats = [];
    for (const device of devices) {
      try {
        const deviceStat = await statsApi.getDeviceStats(device, 7);
        stats.push({
          key: device,
          ...deviceStat
        });
      } catch (e) {
        console.error(`Error loading stats for device ${device}:`, e);
      }
    }
    return stats;
  };

  const [deviceStats, setDeviceStats] = useState([]);

  useEffect(() => {
    const loadStats = async () => {
      if (devices.length > 0) {
        const stats = await getDeviceStats();
        setDeviceStats(stats);
      }
    };
    loadStats();
  }, [devices]);

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card title="上传CSV数据">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Row gutter={16}>
                <Col span={12}>
                  <div style={{ marginBottom: 8, fontWeight: 'bold' }}>默认设备 (可选)</div>
                  <Select
                    placeholder="选择设备"
                    value={selectedDevice}
                    onChange={setSelectedDevice}
                    style={{ width: '100%' }}
                    allowClear
                  >
                    {devices.map(d => (
                      <Option key={d} value={d}>{d}</Option>
                    ))}
                    <Option value="device_001">device_001 (新设备)</Option>
                    <Option value="device_002">device_002 (新设备)</Option>
                  </Select>
                </Col>
                <Col span={12}>
                  <div style={{ marginBottom: 8, fontWeight: 'bold' }}>默认传感器类型 (可选)</div>
                  <Select
                    placeholder="选择传感器"
                    value={selectedSensor}
                    onChange={setSelectedSensor}
                    style={{ width: '100%' }}
                    allowClear
                  >
                    {sensorTypes.map(s => (
                      <Option key={s} value={s}>
                        <Tag color={SensorColors[s]}>{s}</Tag>
                      </Option>
                    ))}
                    <Option value="temperature"><Tag color="#ff7875">temperature</Tag></Option>
                    <Option value="pressure"><Tag color="#40a9ff">pressure</Tag></Option>
                    <Option value="vibration"><Tag color="#73d13d">vibration</Tag></Option>
                  </Select>
                </Col>
              </Row>
              
              <Dragger {...uploadProps}>
                <p className="ant-upload-drag-icon">
                  <UploadOutlined />
                </p>
                <p className="ant-upload-text">点击或拖拽CSV文件到此区域上传</p>
                <p className="ant-upload-hint">
                  CSV文件需包含列: timestamp, value<br/>
                  可选列: device_id, sensor_type
                </p>
              </Dragger>
              
              <div style={{ marginTop: 16 }}>
                <InfoCircleOutlined style={{ color: '#1890ff' }} />
                <span style={{ marginLeft: 8, color: '#666' }}>
                  如果CSV中不包含 device_id 或 sensor_type，请在上方选择默认值
                </span>
              </div>
            </Space>
          </Card>
        </Col>
        
        <Col span={12}>
          <Card title="批量分析">
            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ padding: 16, background: '#f9f9f9', borderRadius: 8 }}>
                <h4 style={{ marginTop: 0 }}>分析功能说明</h4>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  <li>对历史数据进行异常检测（3σ原则 + 孤立森林）</li>
                  <li>自动生成告警记录</li>
                  <li>挖掘异常关联规则</li>
                  <li>分析时间范围：最近7天的数据</li>
                </ul>
              </div>
              
              <Row gutter={16}>
                <Col span={12}>
                  <Statistic
                    title="可用设备数"
                    value={devices.length}
                    valueStyle={{ color: '#1890ff' }}
                  />
                </Col>
                <Col span={12}>
                  <Statistic
                    title="传感器类型数"
                    value={sensorTypes.length}
                    valueStyle={{ color: '#722ed1' }}
                  />
                </Col>
              </Row>
              
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleBatchAnalyze}
                loading={analyzeLoading}
                size="large"
                block
              >
                开始批量分析
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={24}>
          <Card title="设备数据概览">
            {deviceStats.length > 0 ? (
              <Table
                columns={deviceColumns}
                dataSource={deviceStats}
                pagination={false}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                暂无设备数据，请先上传数据
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title="批量分析结果"
        open={resultModalVisible}
        onCancel={() => setResultModalVisible(false)}
        footer={null}
        width={800}
      >
        {analyzeResult && (
          <div>
            <Descriptions bordered column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="数据点总数">
                {analyzeResult.total_data_points}
              </Descriptions.Item>
              <Descriptions.Item label="异常点数量">
                <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>
                  {analyzeResult.anomalies_found}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="告警数">
                <span style={{ color: '#fa8c16', fontWeight: 'bold' }}>
                  {analyzeResult.alerts_generated}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="关联规则数">
                <span style={{ color: '#722ed1', fontWeight: 'bold' }}>
                  {analyzeResult.rules_mined}
                </span>
              </Descriptions.Item>
            </Descriptions>

            {analyzeResult.anomalies && analyzeResult.anomalies.length > 0 && (
              <Card title="异常点详情 (前10条)" size="small">
                <Table
                  size="small"
                  pagination={{ pageSize: 5 }}
                  dataSource={analyzeResult.anomalies.slice(0, 10).map((a, i) => ({ ...a, key: i }))}
                  columns={[
                    { title: '时间', dataIndex: 'timestamp', render: t => dayjs(t).format('HH:mm:ss') },
                    { title: '设备', dataIndex: 'device_id' },
                    { title: '传感器', dataIndex: 'sensor_type' },
                    { title: '值', dataIndex: 'value', render: v => v?.toFixed(2) },
                    { 
                      title: '方法', 
                      dataIndex: 'method', 
                      render: m => <Tag color={m === '3sigma' ? '#1890ff' : '#722ed1'}>
                        {m === '3sigma' ? '3σ' : '孤立森林'}
                      </Tag>
                    }
                  ]}
                />
              </Card>
            )}

            {analyzeResult.rules && analyzeResult.rules.length > 0 && (
              <Card title="关联规则 (前5条)" size="small" style={{ marginTop: 16 }}>
                <Table
                  size="small"
                  pagination={false}
                  dataSource={analyzeResult.rules.slice(0, 5).map((r, i) => ({ ...r, key: i }))}
                  columns={[
                    { title: '前提', dataIndex: 'antecedents', render: items => items.join(', ') },
                    { title: '结论', dataIndex: 'consequents', render: items => items.join(', ') },
                    { title: '置信度', dataIndex: 'confidence', render: c => (c * 100).toFixed(1) + '%' },
                    { title: '提升度', dataIndex: 'lift', render: l => l?.toFixed(2) }
                  ]}
                />
              </Card>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default DataUpload;
