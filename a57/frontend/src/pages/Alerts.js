import React, { useState, useEffect } from 'react';
import {
  Row,
  Col,
  Card,
  Table,
  Tag,
  Button,
  Select,
  DatePicker,
  Space,
  Modal,
  Descriptions,
  message,
  Empty,
  Statistic,
  Tabs,
  Alert as AntAlert,
  Switch,
  List,
  Tooltip,
  Progress,
  Badge,
  Input
} from 'antd';
import {
  ReloadOutlined,
  CheckCircleOutlined,
  SearchOutlined,
  EyeOutlined,
  WarningOutlined,
  GlobalOutlined,
  ApiOutlined,
  ShareAltOutlined,
  ExperimentOutlined,
  MailOutlined,
  BellOutlined,
  LinkOutlined,
  RocketOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { alertsApi, statsApi, analysisApi } from '../services/api';
import { SeverityColors, SensorColors } from '../types';

const { RangePicker } = DatePicker;
const { Option } = Select;
const { TabPane } = Tabs;

function Alerts() {
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({});
  const [selectedStatus, setSelectedStatus] = useState(undefined);
  const [selectedDevice, setSelectedDevice] = useState(undefined);
  const [timeRange, setTimeRange] = useState(null);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [traceModalVisible, setTraceModalVisible] = useState(false);
  const [traceData, setTraceData] = useState(null);
  const [activeTraceTab, setActiveTraceTab] = useState('1');
  const [rootCauseModalVisible, setRootCauseModalVisible] = useState(false);
  const [rootCauseData, setRootCauseData] = useState(null);
  const [rootCauseLoading, setRootCauseLoading] = useState(false);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const [notificationResult, setNotificationResult] = useState(null);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [includeRootCause, setIncludeRootCause] = useState(true);
  const [selectedChannels, setSelectedChannels] = useState(['email', 'wechat']);
  const [notificationStatus, setNotificationStatus] = useState(null);

  useEffect(() => {
    loadStats();
    loadAlerts();
  }, []);

  const loadStats = async () => {
    try {
      const result = await alertsApi.getAlertStats();
      setStats(result);
    } catch (error) {
      console.error('Error loading alert stats:', error);
    }
  };

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const params = {};
      
      if (selectedStatus) {
        params.status = selectedStatus;
      }
      
      if (selectedDevice) {
        params.device_id = selectedDevice;
      }
      
      if (timeRange) {
        params.start_time = timeRange[0].toISOString();
        params.end_time = timeRange[1].toISOString();
      }

      const result = await alertsApi.getAlerts(params);
      setAlerts(result.alerts || []);
    } catch (error) {
      console.error('Error loading alerts:', error);
      message.error('加载告警数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (alertId) => {
    Modal.confirm({
      title: '确认处理',
      content: '确定要将此告警标记为已处理吗？',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await alertsApi.resolveAlert(alertId);
          message.success('告警已处理');
          loadAlerts();
          loadStats();
        } catch (error) {
          message.error('处理告警失败');
        }
      }
    });
  };

  const handleViewTrace = async (alertId) => {
    setLoading(true);
    try {
      const result = await alertsApi.getAlertTrace(alertId);
      setTraceData(result);
      setTraceModalVisible(true);
    } catch (error) {
      message.error('获取告警溯源数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRootCauseAnalysis = async (alertId) => {
    setRootCauseLoading(true);
    setRootCauseModalVisible(true);
    setRootCauseData(null);
    try {
      const result = await analysisApi.analyzeRootCause(alertId, {
        time_window_minutes: 30
      });
      setRootCauseData(result);
      message.success('根因分析完成');
    } catch (error) {
      console.error('Root cause analysis error:', error);
      message.error('根因分析失败');
    } finally {
      setRootCauseLoading(false);
    }
  };

  const handleSendNotification = async (alert) => {
    setSelectedAlert(alert);
    setNotificationResult(null);
    setNotificationModalVisible(true);
  };

  const executeSendNotification = async () => {
    if (!selectedAlert) return;
    
    setNotificationLoading(true);
    try {
      const params = {
        include_root_cause: includeRootCause,
        time_window_minutes: 30
      };
      
      if (selectedChannels && selectedChannels.length > 0) {
        params.channels = selectedChannels.join(',');
      }
      
      const result = await analysisApi.sendAlertNotification(selectedAlert.id, params);
      setNotificationResult(result);
      message.success('告警通知发送完成');
    } catch (error) {
      console.error('Notification error:', error);
      message.error('告警通知发送失败');
    } finally {
      setNotificationLoading(false);
    }
  };

  const handleCheckNotificationStatus = async () => {
    try {
      const status = await analysisApi.getNotificationStatus();
      setNotificationStatus(status);
      message.info('已获取通知服务状态');
    } catch (error) {
      message.error('获取通知状态失败');
    }
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.8) return '#52c41a';
    if (confidence >= 0.6) return '#faad14';
    if (confidence >= 0.4) return '#fa8c16';
    return '#ff4d4f';
  };

  const getEvidenceLabel = (evidence) => {
    const labels = {
      'association_rules': '关联规则',
      'topology_upstream': '拓扑上游',
      'topology_downstream': '拓扑下游',
      'historical_pattern': '历史模式',
      'frequency_pattern': '频率模式'
    };
    return labels[evidence] || evidence;
  };

  const getSeverityColor = (severity) => SeverityColors[severity] || '#52c41a';
  
  const getSeverityLabel = (severity) => {
    const labels = {
      critical: '严重',
      high: '高',
      medium: '中',
      low: '低'
    };
    return labels[severity] || severity;
  };

  const getStatusLabel = (status) => {
    return status === 'active' ? '活跃' : '已处理';
  };

  const columns = [
    {
      title: '告警ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
      render: (text) => text?.substring(0, 8)
    },
    {
      title: '设备ID',
      dataIndex: 'device_id',
      key: 'device_id'
    },
    {
      title: '传感器',
      dataIndex: 'sensor_type',
      key: 'sensor_type'
    },
    {
      title: '异常值',
      dataIndex: 'anomaly_value',
      key: 'anomaly_value',
      render: (val) => val?.toFixed(2)
    },
    {
      title: '严重程度',
      dataIndex: 'severity',
      key: 'severity',
      filters: [
        { text: '严重', value: 'critical' },
        { text: '高', value: 'high' },
        { text: '中', value: 'medium' },
        { text: '低', value: 'low' }
      ],
      onFilter: (value, record) => record.severity === value,
      render: (severity) => (
        <Tag color={getSeverityColor(severity)}>
          {getSeverityLabel(severity)}
        </Tag>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      filters: [
        { text: '活跃', value: 'active' },
        { text: '已处理', value: 'resolved' }
      ],
      onFilter: (value, record) => record.status === value,
      render: (status) => (
        <Tag color={status === 'active' ? '#ff4d4f' : '#52c41a'}>
          {getStatusLabel(status)}
        </Tag>
      )
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      sorter: (a, b) => dayjs(a.timestamp).unix() - dayjs(b.timestamp).unix(),
      render: (time) => dayjs(time).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '操作',
      key: 'action',
      width: 280,
      render: (_, record) => (
        <Space>
          <Tooltip title="告警溯源">
            <Button
              type="link"
              icon={<EyeOutlined />}
              onClick={() => handleViewTrace(record.id)}
            >
              溯源
            </Button>
          </Tooltip>
          <Tooltip title="根因分析">
            <Button
              type="link"
              icon={<ExperimentOutlined />}
              onClick={() => handleRootCauseAnalysis(record.id)}
            >
              根因
            </Button>
          </Tooltip>
          <Tooltip title="发送通知">
            <Button
              type="link"
              icon={<BellOutlined />}
              onClick={() => handleSendNotification(record)}
            >
              通知
            </Button>
          </Tooltip>
          {record.status === 'active' && (
            <Tooltip title="标记处理">
              <Button
                type="link"
                icon={<CheckCircleOutlined />}
                onClick={() => handleResolve(record.id)}
              >
                处理
              </Button>
            </Tooltip>
          )}
        </Space>
      )
    }
  ];

  const getSeverityChartOption = () => {
    const dist = stats.severity_distribution || {};
    return {
      tooltip: {
        trigger: 'item'
      },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2
        },
        data: [
          { value: dist.critical || 0, name: '严重', itemStyle: { color: '#ff4d4f' } },
          { value: dist.high || 0, name: '高', itemStyle: { color: '#fa8c16' } },
          { value: dist.medium || 0, name: '中', itemStyle: { color: '#faad14' } },
          { value: dist.low || 0, name: '低', itemStyle: { color: '#52c41a' } }
        ]
      }]
    };
  };

  const getTraceChartOption = () => {
    if (!traceData) return {};

    const primary = traceData.primary_device_data || {};
    const cross = traceData.cross_device_data || {};
    
    const primaryData = primary.historical_data || [];
    const primaryAnomalies = primary.anomalies || [];
    const crossAnomalies = cross.anomalies || [];
    const crossData = cross.sensor_data || [];

    const series = [];

    if (primaryData.length > 0) {
      series.push({
        name: `本设备数据 (${primary.device_id || 'unknown'})`,
        type: 'line',
        data: primaryData.map(d => [
          dayjs(d.timestamp).toDate().getTime(),
          d.value
        ]).sort((a, b) => a[0] - b[0]),
        smooth: true,
        lineStyle: { color: '#1890ff', width: 2 },
        itemStyle: { color: '#1890ff' },
        symbol: 'none'
      });
    }

    if (crossData.length > 0) {
      const groupedCross = {};
      crossData.forEach(d => {
        const key = `${d.device_id}_${d.sensor_type}`;
        if (!groupedCross[key]) {
          groupedCross[key] = [];
        }
        groupedCross[key].push(d);
      });

      const colors = ['#52c41a', '#722ed1', '#faad14', '#eb2f96', '#13c2c2'];
      let colorIndex = 0;

      Object.keys(groupedCross).forEach(key => {
        const data = groupedCross[key];
        series.push({
          name: `其他设备: ${key}`,
          type: 'line',
          data: data.map(d => [
            dayjs(d.timestamp).toDate().getTime(),
            d.value
          ]).sort((a, b) => a[0] - b[0]),
          smooth: true,
          lineStyle: { 
            color: colors[colorIndex % colors.length], 
            type: 'dashed',
            opacity: 0.7
          },
          itemStyle: { color: colors[colorIndex % colors.length] },
          symbol: 'none'
        });
        colorIndex++;
      });
    }

    if (primaryAnomalies.length > 0) {
      series.push({
        name: '本设备异常',
        type: 'scatter',
        data: primaryAnomalies.map(a => [
          dayjs(a.timestamp).toDate().getTime(),
          a.value
        ]),
        symbolSize: 14,
        itemStyle: { color: '#ff4d4f' }
      });
    }

    if (crossAnomalies.length > 0) {
      series.push({
        name: '跨设备异常',
        type: 'scatter',
        data: crossAnomalies.map(a => [
          dayjs(a.timestamp).toDate().getTime(),
          a.value
        ]),
        symbolSize: 12,
        symbol: 'diamond',
        itemStyle: { color: '#fa8c16' }
      });
    }

    return {
      title: {
        text: '告警溯源数据（含跨设备关联）',
        left: 'center'
      },
      tooltip: {
        trigger: 'axis'
      },
      legend: {
        top: 30,
        type: 'scroll',
        data: series.map(s => s.name)
      },
      grid: {
        top: 80,
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'time',
        axisLabel: {
          formatter: (value) => dayjs(value).format('HH:mm:ss')
        }
      },
      yAxis: {
        type: 'value',
        name: '数值'
      },
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        { type: 'slider', start: 0, end: 100 }
      ],
      series
    };
  };

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总告警数"
              value={stats.total_alerts || 0}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="活跃告警"
              value={stats.active_alerts || 0}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="24小时告警"
              value={stats.alerts_last_24h || 0}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="7天告警"
              value={stats.alerts_last_7d || 0}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={6}>
          <Card title="严重程度分布">
            <ReactECharts option={getSeverityChartOption()} style={{ height: 200 }} />
          </Card>
        </Col>
        <Col span={18}>
          <Card>
            <Space style={{ marginBottom: 16 }} wrap>
              <Select
                placeholder="状态筛选"
                value={selectedStatus}
                onChange={setSelectedStatus}
                style={{ width: 150 }}
                allowClear
              >
                <Option value="active">活跃</Option>
                <Option value="resolved">已处理</Option>
              </Select>
              
              <RangePicker
                value={timeRange}
                onChange={setTimeRange}
                showTime
              />
              
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={loadAlerts}
                loading={loading}
              >
                筛选
              </Button>
              
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  setSelectedStatus(undefined);
                  setTimeRange(null);
                  loadAlerts();
                  loadStats();
                }}
              >
                刷新
              </Button>
            </Space>

            {alerts.length > 0 ? (
              <Table
                columns={columns}
                dataSource={alerts.map(a => ({ ...a, key: a.id }))}
                loading={loading}
                pagination={{ pageSize: 10 }}
                scroll={{ x: 1000 }}
              />
            ) : (
              <Empty description="暂无告警数据" />
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title="告警溯源分析（支持跨设备关联）"
        open={traceModalVisible}
        onCancel={() => setTraceModalVisible(false)}
        footer={null}
        width={1000}
        style={{ top: 20 }}
      >
        {traceData && (
          <div>
            {traceData.cross_device_data?.anomalies_count > 0 && (
              <Alert
                message={`发现 ${traceData.cross_device_data?.anomalies_count} 个跨设备关联异常，涉及 ${traceData.cross_device_data?.affected_devices?.length || 0} 个其他设备`}
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="告警ID">{traceData.alert?.id?.substring(0, 8)}</Descriptions.Item>
              <Descriptions.Item label="设备">{traceData.alert?.device_id}</Descriptions.Item>
              <Descriptions.Item label="传感器">{traceData.alert?.sensor_type}</Descriptions.Item>
              <Descriptions.Item label="严重程度">
                <Tag color={getSeverityColor(traceData.alert?.severity)}>
                  {getSeverityLabel(traceData.alert?.severity)}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="异常值" span={2}>
                {traceData.alert?.anomaly_value?.toFixed(4)}
              </Descriptions.Item>
              <Descriptions.Item label="告警时间" span={2}>
                {dayjs(traceData.alert?.timestamp).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
            </Descriptions>

            <Tabs 
              activeKey={activeTraceTab} 
              onChange={setActiveTraceTab}
              type="card"
            >
              <TabPane 
                tab={
                  <span>
                    <WarningOutlined />
                    综合视图 ({traceData.total_data_points || 0} 数据点)
                  </span>
                } 
                key="1"
              >
                <Card size="small">
                  <ReactECharts option={getTraceChartOption()} style={{ height: 300 }} />
                </Card>
              </TabPane>
              
              <TabPane 
                tab={
                  <span>
                    本设备异常 ({traceData.primary_device_data?.anomalies_count || 0})
                  </span>
                } 
                key="2"
              >
                <Card size="small" title={`设备: ${traceData.primary_device_data?.device_id}`}>
                  {traceData.primary_device_data?.anomalies?.length > 0 ? (
                    <Table
                      size="small"
                      pagination={{ pageSize: 5 }}
                      dataSource={(traceData.primary_device_data?.anomalies || []).map((a, i) => ({ ...a, key: i }))}
                      columns={[
                        { title: '时间', dataIndex: 'timestamp', render: t => dayjs(t).format('HH:mm:ss'), width: 100 },
                        { title: '传感器', dataIndex: 'sensor_type', render: s => <Tag color={SensorColors[s] || '#1890ff'}>{s}</Tag> },
                        { title: '异常值', dataIndex: 'value', render: v => v?.toFixed(2) },
                        { 
                          title: '检测方法', 
                          dataIndex: 'method', 
                          render: m => <Tag color={m === '3sigma' ? '#1890ff' : '#722ed1'}>
                            {m === '3sigma' ? '3σ原则' : '孤立森林'}
                          </Tag>
                        },
                        { title: '异常分数', dataIndex: 'score', render: s => s?.toFixed(4) }
                      ]}
                      scroll={{ x: 600 }}
                    />
                  ) : (
                    <Empty description="本设备无其他异常" />
                  )}
                </Card>
              </TabPane>
              
              <TabPane 
                tab={
                  <span>
                    <GlobalOutlined />
                    跨设备关联 ({traceData.cross_device_data?.anomalies_count || 0})
                  </span>
                } 
                key="3"
              >
                <Card size="small" title={`关联设备: ${traceData.cross_device_data?.affected_devices?.join(', ') || '无'}`}>
                  {traceData.cross_device_data?.anomalies?.length > 0 ? (
                    <>
                      <Row gutter={16} style={{ marginBottom: 16 }}>
                        <Col span={8}>
                          <Card size="small">
                            <Statistic 
                              title="跨设备异常数" 
                              value={traceData.cross_device_data?.anomalies_count || 0}
                              valueStyle={{ color: '#fa8c16' }}
                            />
                          </Card>
                        </Col>
                        <Col span={8}>
                          <Card size="small">
                            <Statistic 
                              title="关联告警数" 
                              value={traceData.cross_device_data?.alerts_count || 0}
                              valueStyle={{ color: '#faad14' }}
                            />
                          </Card>
                        </Col>
                        <Col span={8}>
                          <Card size="small">
                            <Statistic 
                              title="受影响设备" 
                              value={traceData.cross_device_data?.affected_devices?.length || 0}
                              valueStyle={{ color: '#722ed1' }}
                            />
                          </Card>
                        </Col>
                      </Row>
                      
                      <Table
                        size="small"
                        pagination={{ pageSize: 5 }}
                        dataSource={(traceData.cross_device_data?.anomalies || []).map((a, i) => ({ ...a, key: i }))}
                        columns={[
                          { title: '设备', dataIndex: 'device_id', key: 'device_id' },
                          { title: '时间', dataIndex: 'timestamp', render: t => dayjs(t).format('HH:mm:ss') },
                          { title: '传感器', dataIndex: 'sensor_type', render: s => <Tag color={SensorColors[s] || '#1890ff'}>{s}</Tag> },
                          { title: '值', dataIndex: 'value', render: v => v?.toFixed(2) },
                          { 
                            title: '方法', 
                            dataIndex: 'method', 
                            render: m => <Tag color={m === '3sigma' ? '#1890ff' : '#722ed1'}>
                              {m === '3sigma' ? '3σ' : '孤立森林'}
                            </Tag>
                          }
                        ]}
                        scroll={{ x: 700 }}
                      />
                      
                      {traceData.cross_device_data?.alerts?.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                          <h4 style={{ marginBottom: 8 }}>关联告警 ({traceData.cross_device_data?.alerts?.length})</h4>
                          <Table
                            size="small"
                            pagination={{ pageSize: 5 }}
                            dataSource={(traceData.cross_device_data?.alerts || []).map((a, i) => ({ ...a, key: i }))}
                            columns={[
                              { title: '告警ID', dataIndex: 'id', render: id => id?.substring(0, 8) },
                              { title: '设备', dataIndex: 'device_id' },
                              { title: '传感器', dataIndex: 'sensor_type' },
                              { title: '异常值', dataIndex: 'anomaly_value', render: v => v?.toFixed(2) },
                              { 
                                title: '严重程度', 
                                dataIndex: 'severity', 
                                render: s => <Tag color={getSeverityColor(s)}>{getSeverityLabel(s)}</Tag>
                              },
                              { 
                                title: '状态', 
                                dataIndex: 'status', 
                                render: s => <Tag color={s === 'active' ? '#ff4d4f' : '#52c41a'}>
                                  {s === 'active' ? '活跃' : '已处理'}
                                </Tag>
                              }
                            ]}
                            scroll={{ x: 700 }}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <Empty description="未发现跨设备关联异常" />
                  )}
                </Card>
              </TabPane>
            </Tabs>
          </div>
        )}
      </Modal>

      <Modal
        title={
          <span>
            <ExperimentOutlined /> 异常根因分析
          </span>
        }
        open={rootCauseModalVisible}
        onCancel={() => setRootCauseModalVisible(false)}
        footer={null}
        width={900}
        style={{ top: 20 }}
      >
        {rootCauseLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Space direction="vertical" align="center">
              <Progress type="circle" percent={75} status="active" />
              <span>正在进行根因分析...</span>
            </Space>
          </div>
        ) : rootCauseData ? (
          <div>
            {rootCauseData.summary?.recommendations?.length > 0 && (
              <AntAlert
                message={
                  <span>
                    发现 {rootCauseData.summary.recommendations.length} 个潜在根因。
                    最可能的根因传感器：
                    <Tag color={getConfidenceColor(rootCauseData.summary.recommendations[0]?.confidence || 0)}>
                      {rootCauseData.summary.recommendations[0]?.device_id}_{rootCauseData.summary.recommendations[0]?.sensor_type}
                    </Tag>
                    (置信度: {(rootCauseData.summary.recommendations[0]?.confidence * 100 || 0).toFixed(1)}%)
                  </span>
                }
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="告警ID">{rootCauseData.alert_id?.substring(0, 8)}</Descriptions.Item>
              <Descriptions.Item label="分析时间">
                {dayjs(rootCauseData.analysis_timestamp).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
              <Descriptions.Item label="报告链接" span={2}>
                <a href={rootCauseData.report_url} target="_blank" rel="noopener noreferrer">
                  <LinkOutlined /> 查看详细报告
                </a>
              </Descriptions.Item>
            </Descriptions>

            <Tabs type="card">
              <TabPane 
                tab={<span><RocketOutlined /> 根因推荐</span>} 
                key="recommendations"
              >
                <Card size="small">
                  {(rootCauseData.summary?.recommendations?.length > 0) ? (
                    <List
                      dataSource={rootCauseData.summary.recommendations}
                      renderItem={(item, index) => (
                        <List.Item>
                          <List.Item.Meta
                            avatar={
                              <Badge 
                                count={index + 1} 
                                style={{ backgroundColor: getConfidenceColor(item.confidence || 0) }} 
                              />
                            }
                            title={
                              <Space>
                                <Tag color={SensorColors[item.sensor_type] || '#1890ff'}>
                                  {item.device_id}_{item.sensor_type}
                                </Tag>
                                <Progress 
                                  percent={Math.round((item.confidence || 0) * 100)} 
                                  size="small"
                                  strokeColor={getConfidenceColor(item.confidence || 0)}
                                  style={{ width: 150 }}
                                />
                                <span style={{ fontWeight: 'bold' }}>
                                  故障位置: {item.fault_location}
                                </span>
                              </Space>
                            }
                            description={
                              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                                <div>
                                  <span style={{ fontWeight: 'bold' }}>证据来源: </span>
                                  {(item.evidence_sources || []).map((e, i) => (
                                    <Tag key={i} color="blue">{getEvidenceLabel(e)}</Tag>
                                  ))}
                                </div>
                                {item.evidence_details && (
                                  <div>
                                    <span style={{ fontWeight: 'bold' }}>证据详情: </span>
                                    <span style={{ color: '#666' }}>{item.evidence_details}</span>
                                  </div>
                                )}
                              </Space>
                            }
                          />
                        </List.Item>
                      )}
                    />
                  ) : (
                    <Empty description="未找到明确的根因推荐" />
                  )}
                </Card>
              </TabPane>

              <TabPane 
                tab={<span><ApiOutlined /> 分析详情</span>} 
                key="details"
              >
                <Card size="small">
                  <Row gutter={16}>
                    <Col span={8}>
                      <Card size="small">
                        <Statistic 
                          title="关联规则证据" 
                          value={rootCauseData.analysis_result?.by_rules?.length || 0}
                          valueStyle={{ color: '#1890ff' }}
                        />
                      </Card>
                    </Col>
                    <Col span={8}>
                      <Card size="small">
                        <Statistic 
                          title="拓扑关系证据" 
                          value={rootCauseData.analysis_result?.by_topology?.length || 0}
                          valueStyle={{ color: '#722ed1' }}
                        />
                      </Card>
                    </Col>
                    <Col span={8}>
                      <Card size="small">
                        <Statistic 
                          title="历史模式证据" 
                          value={rootCauseData.analysis_result?.by_history?.length || 0}
                          valueStyle={{ color: '#52c41a' }}
                        />
                      </Card>
                    </Col>
                  </Row>

                  {rootCauseData.summary?.suggestions && (
                    <div style={{ marginTop: 16 }}>
                      <h4 style={{ marginBottom: 8 }}>处理建议</h4>
                      <List
                        dataSource={rootCauseData.summary.suggestions}
                        renderItem={(suggestion, index) => (
                          <List.Item>
                            <List.Item.Meta
                              avatar={<QuestionCircleOutlined style={{ color: '#1890ff' }} />}
                              description={suggestion}
                            />
                          </List.Item>
                        )}
                      />
                    </div>
                  )}
                </Card>
              </TabPane>
            </Tabs>
          </div>
        ) : (
          <Empty description="无分析数据" />
        )}
      </Modal>

      <Modal
        title={
          <span>
            <BellOutlined /> 发送告警通知
          </span>
        }
        open={notificationModalVisible}
        onCancel={() => setNotificationModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setNotificationModalVisible(false)}>
            取消
          </Button>,
          <Button 
            key="send" 
            type="primary" 
            icon={<MailOutlined />}
            onClick={executeSendNotification}
            loading={notificationLoading}
            disabled={selectedChannels.length === 0}
          >
            发送通知
          </Button>
        ]}
        width={700}
      >
        {selectedAlert && (
          <div>
            <Card size="small" style={{ marginBottom: 16 }}>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="告警ID">{selectedAlert.id?.substring(0, 8)}</Descriptions.Item>
                <Descriptions.Item label="设备">{selectedAlert.device_id}</Descriptions.Item>
                <Descriptions.Item label="传感器">{selectedAlert.sensor_type}</Descriptions.Item>
                <Descriptions.Item label="严重程度">
                  <Tag color={getSeverityColor(selectedAlert.severity)}>
                    {getSeverityLabel(selectedAlert.severity)}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="异常值" span={2}>
                  {selectedAlert.anomaly_value?.toFixed(4)}
                </Descriptions.Item>
                <Descriptions.Item label="告警时间" span={2}>
                  {dayjs(selectedAlert.timestamp).format('YYYY-MM-DD HH:mm:ss')}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card size="small" title="通知配置">
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
                    通知通道:
                  </label>
                  <Select
                    mode="multiple"
                    placeholder="选择通知通道"
                    value={selectedChannels}
                    onChange={setSelectedChannels}
                    style={{ width: '100%' }}
                  >
                    <Option value="email">
                      <Space><MailOutlined /> 邮件通知</Space>
                    </Option>
                    <Option value="wechat">
                      <Space><ShareAltOutlined /> 企业微信</Space>
                    </Option>
                  </Select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
                    包含根因分析:
                  </label>
                  <Space>
                    <Switch 
                      checked={includeRootCause} 
                      onChange={setIncludeRootCause} 
                    />
                    <span style={{ color: includeRootCause ? '#52c41a' : '#999' }}>
                      {includeRootCause ? '已启用（通知将包含根因推荐）' : '已禁用'}
                    </span>
                  </Space>
                </div>

                <Button 
                  type="dashed" 
                  icon={<BellOutlined />}
                  onClick={handleCheckNotificationStatus}
                  style={{ width: '100%' }}
                >
                  检查通知服务状态
                </Button>

                {notificationStatus && (
                  <Card size="small" title="通知服务状态">
                    <Space direction="vertical" size="small" style={{ width: '100%' }}>
                      <div>
                        <span style={{ fontWeight: 'bold' }}>邮件服务: </span>
                        <Tag color={notificationStatus.status?.email?.enabled ? 'green' : 'default'}>
                          {notificationStatus.status?.email?.enabled ? '已启用' : '未启用'}
                        </Tag>
                        {notificationStatus.status?.email?.enabled && (
                          <span style={{ marginLeft: 8 }}>
                            SMTP: {notificationStatus.status?.email?.config?.host || '-'}
                          </span>
                        )}
                      </div>
                      <div>
                        <span style={{ fontWeight: 'bold' }}>企业微信: </span>
                        <Tag color={notificationStatus.status?.wechat?.enabled ? 'green' : 'default'}>
                          {notificationStatus.status?.wechat?.enabled ? '已启用' : '未启用'}
                        </Tag>
                      </div>
                    </Space>
                  </Card>
                )}
              </Space>
            </Card>

            {notificationResult && (
              <Card size="small" title="发送结果" style={{ marginTop: 16 }}>
                <AntAlert
                  message={notificationResult.notification_result?.success ? '通知发送成功' : '通知发送失败'}
                  description={
                    <div>
                      <div>邮件: {notificationResult.notification_result?.channels?.email?.success ? '成功' : '失败'}</div>
                      <div>企业微信: {notificationResult.notification_result?.channels?.wechat?.success ? '成功' : '失败'}</div>
                      {notificationResult.report_url && (
                        <div style={{ marginTop: 8 }}>
                          <a href={notificationResult.report_url} target="_blank" rel="noopener noreferrer">
                            <LinkOutlined /> 查看分析报告
                          </a>
                        </div>
                      )}
                    </div>
                  }
                  type={notificationResult.notification_result?.success ? 'success' : 'error'}
                  showIcon
                />
              </Card>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default Alerts;
