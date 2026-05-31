import React, { useState, useEffect, useCallback } from 'react';
import {
  Row,
  Col,
  Card,
  Select,
  DatePicker,
  Button,
  Switch,
  Space,
  Tag,
  Table,
  Tooltip,
  message,
  Empty
} from 'antd';
import {
  ReloadOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  SearchOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import useStore from '../store/useStore';
import { dataApi, statsApi } from '../services/api';
import { SensorColors, MethodColors } from '../types';

const { RangePicker } = DatePicker;
const { Option } = Select;

function TimeSeriesChart() {
  const [loading, setLoading] = useState(false);
  const [sensorData, setSensorData] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [showAnomalies, setShowAnomalies] = useState(true);
  const [aggregatedBy, setAggregatedBy] = useState('all');
  const {
    devices,
    sensorTypes,
    selectedDevices,
    selectedSensors,
    timeRange,
    realtimeEnabled,
    setDevices,
    setSensorTypes,
    setSelectedDevices,
    setSelectedSensors,
    setTimeRange,
    toggleRealtime
  } = useStore();

  useEffect(() => {
    loadDevicesAndSensors();
  }, []);

  useEffect(() => {
    if (devices.length > 0) {
      loadData();
    }
    
    let interval;
    if (realtimeEnabled) {
      interval = setInterval(loadData, 5000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedDevices, selectedSensors, timeRange, realtimeEnabled]);

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

  const loadData = useCallback(async () => {
    if (selectedDevices.length === 0) {
      setSensorData([]);
      setAnomalies([]);
      return;
    }

    setLoading(true);
    try {
      const params = {
        start_time: timeRange[0],
        end_time: timeRange[1],
        device_ids: selectedDevices.join(',')
      };
      
      if (selectedSensors.length > 0) {
        params.sensor_types = selectedSensors.join(',');
      }

      const result = await statsApi.getRealtime(params);
      
      setSensorData(result.sensor_data || []);
      setAnomalies(result.anomalies || []);
    } catch (error) {
      console.error('Error loading sensor data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDevices, selectedSensors, timeRange]);

  const handleDeviceChange = (values) => {
    setSelectedDevices(values);
  };

  const handleSensorChange = (values) => {
    setSelectedSensors(values);
  };

  const handleTimeRangeChange = (dates) => {
    if (dates) {
      setTimeRange([
        dates[0].toISOString(),
        dates[1].toISOString()
      ]);
    }
  };

  const getChartOption = () => {
    const series = [];
    const groupedData = {};

    sensorData.forEach(point => {
      const key = `${point.device_id}_${point.sensor_type}`;
      if (!groupedData[key]) {
        groupedData[key] = {
          device_id: point.device_id,
          sensor_type: point.sensor_type,
          data: []
        };
      }
      groupedData[key].data.push([
        dayjs(point.timestamp).toDate().getTime(),
        point.value
      ]);
    });

    Object.keys(groupedData).forEach(key => {
      const group = groupedData[key];
      series.push({
        name: `${group.device_id} - ${group.sensor_type}`,
        type: 'line',
        data: group.data.sort((a, b) => a[0] - b[0]),
        smooth: true,
        showSymbol: false,
        lineStyle: {
          width: 2,
          color: SensorColors[group.sensor_type] || '#1890ff'
        },
        itemStyle: {
          color: SensorColors[group.sensor_type] || '#1890ff'
        }
      });
    });

    if (showAnomalies && anomalies.length > 0) {
      const sigmaAnomalies = anomalies.filter(a => a.method === '3sigma');
      const ifAnomalies = anomalies.filter(a => a.method === 'isolation_forest');

      if (sigmaAnomalies.length > 0) {
        series.push({
          name: '3σ异常点',
          type: 'scatter',
          data: sigmaAnomalies.map(a => [
            dayjs(a.timestamp).toDate().getTime(),
            a.value
          ]),
          symbolSize: 12,
          itemStyle: {
            color: MethodColors['3sigma']
          },
          markPoint: {
            symbol: 'circle',
            symbolSize: 15
          }
        });
      }

      if (ifAnomalies.length > 0) {
        series.push({
          name: '孤立森林异常点',
          type: 'scatter',
          data: ifAnomalies.map(a => [
            dayjs(a.timestamp).toDate().getTime(),
            a.value
          ]),
          symbolSize: 12,
          itemStyle: {
            color: MethodColors['isolation_forest']
          },
          markPoint: {
            symbol: 'diamond',
            symbolSize: 15
          }
        });
      }
    }

    return {
      title: {
        text: '时序数据分析',
        left: 'center'
      },
      tooltip: {
        trigger: 'axis',
        formatter: function(params) {
          let result = dayjs(params[0].axisValue).format('YYYY-MM-DD HH:mm:ss') + '<br/>';
          params.forEach(param => {
            if (param.seriesType === 'line') {
              result += `${param.marker}${param.seriesName}: ${param.value[1].toFixed(2)}<br/>`;
            } else {
              result += `${param.marker}<span style="color:red;font-weight:bold">${param.seriesName}</span><br/>`;
            }
          });
          return result;
        }
      },
      legend: {
        data: series.map(s => s.name),
        top: 30
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: 80,
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
        {
          type: 'inside',
          start: 0,
          end: 100
        },
        {
          start: 0,
          end: 100
        }
      ],
      series
    };
  };

  const anomalyColumns = [
    {
      title: '时间',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (time) => dayjs(time).format('YYYY-MM-DD HH:mm:ss')
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
      dataIndex: 'value',
      key: 'value',
      render: (val) => val?.toFixed(2)
    },
    {
      title: '检测方法',
      dataIndex: 'method',
      key: 'method',
      render: (method) => (
        <Tag color={MethodColors[method]}>
          {method === '3sigma' ? '3σ原则' : '孤立森林'}
        </Tag>
      )
    },
    {
      title: '异常分数',
      dataIndex: 'score',
      key: 'score',
      render: (score) => score?.toFixed(4)
    }
  ];

  const summaryData = () => {
    const sensorCount = new Set(sensorData.map(d => `${d.device_id}_${d.sensor_type}`)).size;
    return [
      { label: '数据点总数', value: sensorData.length },
      { label: '传感器数量', value: sensorCount },
      { label: '异常点数量', value: anomalies.length },
      { label: '异常率', value: sensorData.length > 0 
        ? ((anomalies.length / sensorData.length) * 100).toFixed(2) + '%' 
        : '0%' }
    ];
  };

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col span={5}>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>选择设备</div>
            <Select
              mode="multiple"
              placeholder="请选择设备"
              value={selectedDevices}
              onChange={handleDeviceChange}
              style={{ width: '100%' }}
              allowClear
            >
              {devices.map(device => (
                <Option key={device} value={device}>{device}</Option>
              ))}
            </Select>
          </Col>
          <Col span={5}>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>选择传感器</div>
            <Select
              mode="multiple"
              placeholder="全部传感器"
              value={selectedSensors}
              onChange={handleSensorChange}
              style={{ width: '100%' }}
              allowClear
            >
              {sensorTypes.map(sensor => (
                <Option key={sensor} value={sensor}>
                  <Tag color={SensorColors[sensor]}>{sensor}</Tag>
                </Option>
              ))}
            </Select>
          </Col>
          <Col span={6}>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>时间范围</div>
            <RangePicker
              showTime
              value={[dayjs(timeRange[0]), dayjs(timeRange[1])]}
              onChange={handleTimeRangeChange}
              style={{ width: '100%' }}
            />
          </Col>
          <Col span={3}>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>显示异常点</div>
            <Switch
              checked={showAnomalies}
              onChange={setShowAnomalies}
            />
          </Col>
          <Col span={5}>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>操作</div>
            <Space>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={loadData}
                loading={loading}
              >
                查询
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={loadDevicesAndSensors}
              >
                刷新
              </Button>
              <Space>
                <span>实时:</span>
                <Switch
                  checked={realtimeEnabled}
                  onChange={toggleRealtime}
                  checkedChildren={<PlayCircleOutlined />}
                  unCheckedChildren={<PauseCircleOutlined />}
                />
              </Space>
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        {summaryData().map((item, index) => (
          <Col span={6} key={index}>
            <Card>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 'bold', color: '#1890ff' }}>
                  {item.value}
                </div>
                <div style={{ color: '#666', marginTop: 4 }}>{item.label}</div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={16}>
        <Col span={24}>
          <Card title="时序曲线图">
            {sensorData.length > 0 ? (
              <ReactECharts
                option={getChartOption()}
                style={{ height: 400 }}
                loading={loading}
              />
            ) : (
              <Empty description="请选择设备和时间范围查看数据" />
            )}
          </Card>
        </Col>
      </Row>

      {showAnomalies && (
        <Row gutter={16} style={{ marginTop: 16 }}>
          <Col span={24}>
            <Card title={`异常点详情 (${anomalies.length})`}>
              {anomalies.length > 0 ? (
                <Table
                  columns={anomalyColumns}
                  dataSource={anomalies.map((a, i) => ({ ...a, key: i }))}
                  pagination={{ pageSize: 10 }}
                  size="small"
                />
              ) : (
                <Empty description="暂无异常数据" />
              )}
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
}

export default TimeSeriesChart;
