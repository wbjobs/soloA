import React, { useState, useEffect } from 'react';
import {
  Row,
  Col,
  Card,
  Statistic,
  Table,
  Tag,
  Button,
  Switch,
  Space,
  message
} from 'antd';
import {
  LineChartOutlined,
  WarningOutlined,
  DatabaseOutlined,
  BellOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import useStore from '../store/useStore';
import { statsApi, dataApi, alertsApi } from '../services/api';
import { SeverityColors } from '../types';

function Dashboard() {
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [deviceStats, setDeviceStats] = useState([]);
  const [trendData, setTrendData] = useState({ times: [], values: [] });
  const {
    realtimeEnabled,
    toggleRealtime,
    stats,
    updateStats
  } = useStore();

  useEffect(() => {
    loadData();
    
    let interval;
    if (realtimeEnabled) {
      interval = setInterval(loadData, 5000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [realtimeEnabled]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [overallStats, recentAlerts, devices] = await Promise.all([
        statsApi.getOverall(),
        alertsApi.getAlerts({ status: 'active' }),
        dataApi.getDevices()
      ]);
      
      updateStats({
        total_points: overallStats.total_points || 0,
        anomaly_count: overallStats.anomaly_count || 0,
        total_alerts: overallStats.total_alerts || 0,
        active_alerts: overallStats.active_alerts || 0
      });
      
      setAlerts(recentAlerts.alerts || []);
      
      const deviceStatsList = [];
      for (const device of devices.devices || []) {
        try {
          const deviceStat = await statsApi.getDeviceStats(device, 7);
          deviceStatsList.push({
            key: device,
            device_id: device,
            total_points: deviceStat.total_data_points,
            anomalies: deviceStat.anomalies_count,
            alerts: deviceStat.alerts_count,
            anomaly_rate: (deviceStat.anomaly_rate * 100).toFixed(2)
          });
        } catch (e) {
          console.error(`Error loading stats for device ${device}:`, e);
        }
      }
      setDeviceStats(deviceStatsList);
      
      generateMockTrendData();
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateMockTrendData = () => {
    const times = [];
    const values = [];
    const now = dayjs();
    
    for (let i = 24; i >= 0; i--) {
      times.push(now.subtract(i, 'hour').format('HH:00'));
      values.push(Math.floor(Math.random() * 100) + 50);
    }
    
    setTrendData({ times, values });
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

  const alertColumns = [
    {
      title: '告警ID',
      dataIndex: 'id',
      key: 'id',
      width: 120,
      render: (text) => text?.substring(0, 8)
    },
    {
      title: '设备',
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
      render: (severity) => (
        <Tag color={getSeverityColor(severity)}>
          {getSeverityLabel(severity)}
        </Tag>
      )
    },
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (time) => dayjs(time).format('YYYY-MM-DD HH:mm:ss')
    }
  ];

  const deviceColumns = [
    {
      title: '设备ID',
      dataIndex: 'device_id',
      key: 'device_id'
    },
    {
      title: '数据点数',
      dataIndex: 'total_points',
      key: 'total_points'
    },
    {
      title: '异常数',
      dataIndex: 'anomalies',
      key: 'anomalies'
    },
    {
      title: '告警数',
      dataIndex: 'alerts',
      key: 'alerts'
    },
    {
      title: '异常率 (%)',
      dataIndex: 'anomaly_rate',
      key: 'anomaly_rate'
    }
  ];

  const trendChartOption = {
    title: {
      text: '数据流量趋势 (24小时)',
      left: 'center'
    },
    tooltip: {
      trigger: 'axis'
    },
    xAxis: {
      type: 'category',
      data: trendData.times
    },
    yAxis: {
      type: 'value',
      name: '数据点数'
    },
    series: [{
      data: trendData.values,
      type: 'line',
      smooth: true,
      areaStyle: {
        color: 'rgba(24, 144, 255, 0.2)'
      },
      lineStyle: {
        color: '#1890ff'
      }
    }]
  };

  const severityDistributionOption = {
    title: {
      text: '告警严重程度分布',
      left: 'center'
    },
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
      label: {
        show: false
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      data: [
        { value: stats.total_alerts * 0.1, name: '严重', itemStyle: { color: '#ff4d4f' } },
        { value: stats.total_alerts * 0.25, name: '高', itemStyle: { color: '#fa8c16' } },
        { value: stats.total_alerts * 0.4, name: '中', itemStyle: { color: '#faad14' } },
        { value: stats.total_alerts * 0.25, name: '低', itemStyle: { color: '#52c41a' } }
      ]
    }]
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button
          type="primary"
          icon={<ReloadOutlined />}
          onClick={loadData}
          loading={loading}
        >
          刷新数据
        </Button>
        <Space>
          <span>实时刷新:</span>
          <Switch
            checked={realtimeEnabled}
            onChange={toggleRealtime}
            checkedChildren={<PlayCircleOutlined />}
            unCheckedChildren={<PauseCircleOutlined />}
          />
        </Space>
      </Space>

      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总数据点数"
              value={stats.total_points}
              prefix={<DatabaseOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="异常检测数"
              value={stats.anomaly_count}
              prefix={<LineChartOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="总告警数"
              value={stats.total_alerts}
              prefix={<BellOutlined style={{ color: '#faad14' }} />}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="活跃告警"
              value={stats.active_alerts}
              prefix={<WarningOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={16}>
          <Card title="数据流量趋势">
            <ReactECharts option={trendChartOption} style={{ height: 300 }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="告警分布">
            <ReactECharts option={severityDistributionOption} style={{ height: 300 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col span={14}>
          <Card title="活跃告警">
            <Table
              columns={alertColumns}
              dataSource={alerts.slice(0, 5)}
              pagination={false}
              size="small"
              scroll={{ x: 600 }}
            />
          </Card>
        </Col>
        <Col span={10}>
          <Card title="设备状态">
            <Table
              columns={deviceColumns}
              dataSource={deviceStats}
              pagination={false}
              size="small"
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default Dashboard;
