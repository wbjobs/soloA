import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Row, Col, Card, Statistic, Tag, Space, Typography, Button, Progress, Spin, Alert } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, ThunderboltOutlined, DatabaseOutlined, CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { ipcRenderer } from 'electron';

const { Title } = Typography;

const MAX_HISTORY_POINTS = 10000;
const MAX_RENDER_POINTS = 500;

const largestTriangleThreeBuckets = (data, threshold) => {
  const dataLength = data.length;
  if (threshold >= dataLength || threshold === 0) {
    return data;
  }

  const sampled = [];
  let sampledIndex = 0;

  const bucketSize = (dataLength - 2) / (threshold - 2);

  sampled[sampledIndex++] = data[0];

  for (let i = 0; i < threshold - 2; i++) {
    const avgRangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const avgRangeEnd = Math.floor((i + 2) * bucketSize) + 1;
    const avgRangeEnd2 = Math.min(avgRangeEnd, dataLength);

    let avgX = 0;
    let avgY = 0;
    const avgRangeLength = avgRangeEnd2 - avgRangeStart;
    for (let j = avgRangeStart; j < avgRangeEnd2; j++) {
      avgX += j;
      avgY += data[j].value;
    }
    avgX /= avgRangeLength;
    avgY /= avgRangeLength;

    const rangeOffs = Math.floor(i * bucketSize) + 1;
    const rangeTo = Math.floor((i + 1) * bucketSize) + 1;

    const pointAx = rangeOffs - 1;
    const pointAy = data[rangeOffs - 1].value;

    let maxArea = -1;
    let maxAreaPoint = data[rangeOffs];

    for (let j = rangeOffs; j < rangeTo; j++) {
      const area = Math.abs(
        (pointAx - avgX) * (data[j].value - pointAy) -
        (pointAx - j) * (avgY - pointAy)
      ) * 0.5;

      if (area > maxArea) {
        maxArea = area;
        maxAreaPoint = data[j];
      }
    }

    sampled[sampledIndex++] = maxAreaPoint;
  }

  sampled[sampledIndex] = data[dataLength - 1];

  return sampled;
};

const downsampleData = (data, maxPoints = MAX_RENDER_POINTS) => {
  if (!data || data.length <= maxPoints) {
    return data;
  }

  try {
    return largestTriangleThreeBuckets(data, maxPoints);
  } catch (e) {
    console.warn('LTTB 降采样失败，使用简单采样:', e.message);
    const step = Math.ceil(data.length / maxPoints);
    return data.filter((_, index) => index % step === 0 || index === data.length - 1);
  }
};

const Dashboard = ({ realtimeData }) => {
  const [historyPoints, setHistoryPoints] = useState({
    'tag-temp': [],
    'tag-pressure': [],
    'tag-flow': []
  });
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [renderMode, setRenderMode] = useState('canvas');
  const [showStats, setShowStats] = useState(false);

  const chartRefs = useRef({});

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const devs = await ipcRenderer.invoke('getDevices');
      setDevices(devs);
    } catch (err) {
      console.error('加载设备失败:', err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    if (Object.keys(realtimeData).length === 0) return;

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    setHistoryPoints(prev => {
      const newPoints = { ...prev };

      Object.keys(realtimeData).forEach(tagId => {
        if (!newPoints[tagId]) newPoints[tagId] = [];

        const newPoint = {
          value: realtimeData[tagId].value,
          time: timeStr,
          timestamp: Date.now()
        };

        const existingPoints = newPoints[tagId];
        if (existingPoints.length >= MAX_HISTORY_POINTS) {
          const downsampled = downsampleData(existingPoints, Math.floor(MAX_HISTORY_POINTS / 2));
          newPoints[tagId] = [...downsampled, newPoint];
        } else {
          newPoints[tagId] = [...existingPoints, newPoint];
        }
      });

      return newPoints;
    });
  }, [realtimeData]);

  const getSampledPoints = useCallback((tagId) => {
    const points = historyPoints[tagId] || [];
    return downsampleData(points, MAX_RENDER_POINTS);
  }, [historyPoints]);

  const getGaugeOption = (title, value, unit, min = 0, max = 100, alarmHigh = 80, alarmLow = 10) => {
    return {
      series: [
        {
          type: 'gauge',
          startAngle: 180,
          endAngle: 0,
          min: min,
          max: max,
          splitNumber: 10,
          animation: false,
          axisLine: {
            lineStyle: {
              width: 20,
              color: [
                [alarmLow / max, '#ff6347'],
                [alarmHigh / max, '#52c41a'],
                [1, '#ff6347']
              ]
            }
          },
          pointer: {
            icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
            length: '60%',
            width: 12,
            offsetCenter: [0, '-40%'],
            itemStyle: {
              color: 'auto'
            }
          },
          axisTick: {
            length: 12,
            lineStyle: {
              color: 'auto',
              width: 2
            }
          },
          splitLine: {
            length: 20,
            lineStyle: {
              color: 'auto',
              width: 5
            }
          },
          axisLabel: {
            color: '#464646',
            fontSize: 12,
            distance: -60,
            formatter: function (value) {
              if (value === 0) return value;
              return '';
            }
          },
          title: {
            offsetCenter: [0, '-5%'],
            fontSize: 14,
            color: '#666'
          },
          detail: {
            fontSize: 24,
            offsetCenter: [0, '25%'],
            valueAnimation: true,
            formatter: function (value) {
              return Math.round(value * 10) / 10;
            },
            color: 'auto'
          },
          data: [
            {
              value: value || 0,
              name: title
            }
          ]
        }
      ]
    };
  };

  const getLineChartOption = useCallback((tagId, title, unit) => {
    const points = getSampledPoints(tagId);
    const originalCount = (historyPoints[tagId] || []).length;

    return {
      animation: false,
      title: {
        text: title,
        subtext: originalCount > MAX_RENDER_POINTS
          ? `显示 ${points.length}/${originalCount} 点 (已降采样)`
          : `显示 ${points.length} 点`,
        left: 'center',
        textStyle: { fontSize: 14 },
        subtextStyle: { fontSize: 11, color: '#999' }
      },
      tooltip: {
        trigger: 'axis',
        formatter: `{b}<br/>{c} ${unit}`,
        axisPointer: { type: 'cross' }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '20%',
        containLabel: true
      },
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100
        }
      ],
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: points.map(p => p.time),
        axisLabel: {
          interval: Math.floor(points.length / 10),
          rotate: 0
        }
      },
      yAxis: {
        type: 'value',
        name: unit,
        scale: true
      },
      series: [
        {
          name: title,
          type: 'line',
          smooth: points.length < 1000,
          symbol: points.length < 500 ? 'circle' : 'none',
          symbolSize: 4,
          sampling: points.length > 1000 ? 'lttb' : 'none',
          showSymbol: points.length < 500,
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(24, 144, 255, 0.5)' },
                { offset: 1, color: 'rgba(24, 144, 255, 0.05)' }
              ]
            }
          },
          lineStyle: { color: '#1890ff', width: points.length > 1000 ? 1 : 2 },
          data: points.map(p => p.value)
        }
      ]
    };
  }, [getSampledPoints, historyPoints]);

  const clearHistory = () => {
    setHistoryPoints({
      'tag-temp': [],
      'tag-pressure': [],
      'tag-flow': []
    });
  };

  const tempData = realtimeData['tag-temp'];
  const pressureData = realtimeData['tag-pressure'];
  const flowData = realtimeData['tag-flow'];

  const totalPoints = Object.values(historyPoints).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div>
      <Title level={4} style={{ marginBottom: 20 }}>
        <Space>
          <ThunderboltOutlined style={{ color: '#1890ff' }} />
          实时监控仪表盘
          <Button
            icon={<ReloadOutlined />}
            size="small"
            onClick={loadDevices}
            loading={loading}
          >
            刷新
          </Button>
          <Button
            size="small"
            onClick={clearHistory}
          >
            清除历史
          </Button>
          <Button
            size="small"
            onClick={() => setShowStats(!showStats)}
          >
            {showStats ? '隐藏统计' : '显示统计'}
          </Button>
        </Space>
      </Title>

      {showStats && (
        <Alert
          message="性能统计"
          description={`
            总数据点: ${totalPoints} | 
            单曲线最大: ${MAX_HISTORY_POINTS} | 
            渲染降采样到: ${MAX_RENDER_POINTS} | 
            渲染模式: ${renderMode}
          `}
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="在线设备数"
              value={devices.length}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="采集标签数"
              value={3}
              prefix={<DatabaseOutlined style={{ color: '#1890ff' }} />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="车间温度"
              value={tempData?.value || '--'}
              precision={1}
              suffix="°C"
              valueStyle={{ color: tempData?.value > 80 ? '#ff4d4f' : '#3f8600' }}
              prefix={tempData?.value > 60 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="当前流量"
              value={flowData?.value || '--'}
              precision={0}
              suffix="m³/h"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col span={8}>
          <Card title="车间温度" bordered>
            <ReactECharts
              option={getGaugeOption('温度', tempData?.value, '°C', 0, 100, 80, 10)}
              style={{ height: 250 }}
              opts={{ renderer: 'svg', lazyUpdate: true }}
            />
            <Space style={{ marginTop: 10 }}>
              <Tag color="orange">低: {'<'} 10°C</Tag>
              <Tag color="green">正常: 10-80°C</Tag>
              <Tag color="red">高: {'>'} 80°C</Tag>
            </Space>
          </Card>
        </Col>
        <Col span={8}>
          <Card title="管道压力" bordered>
            <ReactECharts
              option={getGaugeOption('压力', pressureData?.value, 'MPa', 0, 10, 8, 0.5)}
              style={{ height: 250 }}
              opts={{ renderer: 'svg', lazyUpdate: true }}
            />
            <Space style={{ marginTop: 10 }}>
              <Tag color="orange">低: {'<'} 0.5MPa</Tag>
              <Tag color="green">正常: 0.5-8MPa</Tag>
              <Tag color="red">高: {'>'} 8MPa</Tag>
            </Space>
          </Card>
        </Col>
        <Col span={8}>
          <Card title="流量" bordered>
            <ReactECharts
              option={getGaugeOption('流量', flowData?.value, 'm³/h', 0, 1000, 800, 100)}
              style={{ height: 250 }}
              opts={{ renderer: 'svg', lazyUpdate: true }}
            />
            <Space style={{ marginTop: 10 }}>
              <Tag color="orange">低: {'<'} 100</Tag>
              <Tag color="green">正常: 100-800</Tag>
              <Tag color="red">高: {'>'} 800</Tag>
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card
            title="温度趋势"
            bordered
            extra={
              <Space>
                <Tag color="blue">
                  {getSampledPoints('tag-temp').length}/{(historyPoints['tag-temp'] || []).length} 点
                </Tag>
              </Space>
            }
          >
            <ReactECharts
              ref={(e) => { chartRefs.current['tag-temp'] = e; }}
              option={getLineChartOption('tag-temp', '车间温度', '°C')}
              style={{ height: 280 }}
              opts={{ renderer: 'canvas', lazyUpdate: true }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card
            title="流量趋势"
            bordered
            extra={
              <Space>
                <Tag color="blue">
                  {getSampledPoints('tag-flow').length}/{(historyPoints['tag-flow'] || []).length} 点
                </Tag>
              </Space>
            }
          >
            <ReactECharts
              ref={(e) => { chartRefs.current['tag-flow'] = e; }}
              option={getLineChartOption('tag-flow', '流量', 'm³/h')}
              style={{ height: 280 }}
              opts={{ renderer: 'canvas', lazyUpdate: true }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="设备状态" bordered style={{ marginTop: 16 }}>
        <Space size={[16, 16]} wrap>
          {devices.map(device => (
            <div key={device.id} style={{
              border: '1px solid #d9d9d9',
              borderRadius: 8,
              padding: 16,
              minWidth: 200
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: 8 }}>
                {device.name}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>
                协议: {device.protocol.toUpperCase()}
              </div>
              <div style={{ fontSize: 12, color: '#666' }}>
                状态:
                <Tag color={device.status === 'connected' ? 'green' : 'red'}>
                  {device.status === 'connected' ? '在线' : '离线'}
                </Tag>
              </div>
              <Progress
                percent={device.status === 'connected' ? 100 : 0}
                showInfo={false}
                size="small"
                strokeColor={device.status === 'connected' ? '#52c41a' : '#ff4d4f'}
              />
            </div>
          ))}
        </Space>
      </Card>
    </div>
  );
};

export default React.memo(Dashboard);
