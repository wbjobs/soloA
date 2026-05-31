import React, { useState, useEffect } from 'react';
import {
  Row,
  Col,
  Card,
  Table,
  Button,
  InputNumber,
  Space,
  Tag,
  message,
  Empty,
  Statistic,
  Descriptions,
  Tabs
} from 'antd';
import {
  ReloadOutlined,
  SearchOutlined,
  ArrowRightOutlined
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import { rulesApi } from '../services/api';

const { TabPane } = Tabs;

function AssociationRules() {
  const [loading, setLoading] = useState(false);
  const [miningLoading, setMiningLoading] = useState(false);
  const [rules, setRules] = useState([]);
  const [graphData, setGraphData] = useState({ nodes: [], edges: [] });
  
  const [minSupport, setMinSupport] = useState(0.1);
  const [minConfidence, setMinConfidence] = useState(0.5);
  const [minLift, setMinLift] = useState(1.0);
  const [timeWindow, setTimeWindow] = useState(5);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    setLoading(true);
    try {
      const [rulesResult, graphResult] = await Promise.all([
        rulesApi.getRules({ limit: 100 }),
        rulesApi.getRulesGraph()
      ]);
      
      setRules(rulesResult.rules || []);
      setGraphData({
        nodes: graphResult.nodes || [],
        edges: graphResult.edges || []
      });
    } catch (error) {
      console.error('Error loading rules:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMineRules = async () => {
    setMiningLoading(true);
    try {
      const result = await rulesApi.mineRules({
        min_support: minSupport,
        min_confidence: minConfidence,
        min_lift: minLift,
        time_window_minutes: timeWindow
      });
      
      if (result.rules_count > 0) {
        message.success(`成功挖掘 ${result.rules_count} 条关联规则`);
        setRules(result.rules || []);
        loadRules();
      } else {
        message.info(result.message || '未找到符合条件的关联规则');
      }
    } catch (error) {
      message.error('关联规则挖掘失败');
    } finally {
      setMiningLoading(false);
    }
  };

  const columns = [
    {
      title: '规则ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
      render: (text) => text?.substring(0, 8)
    },
    {
      title: '前提',
      dataIndex: 'antecedents',
      key: 'antecedents',
      render: (items) => (
        <Space wrap>
          {items.map((item, i) => (
            <Tag key={i} color="blue">{item}</Tag>
          ))}
        </Space>
      )
    },
    {
      title: '->',
      key: 'arrow',
      width: 40,
      render: () => <ArrowRightOutlined style={{ color: '#faad14' }} />
    },
    {
      title: '结论',
      dataIndex: 'consequents',
      key: 'consequents',
      render: (items) => (
        <Space wrap>
          {items.map((item, i) => (
            <Tag key={i} color="orange">{item}</Tag>
          ))}
        </Space>
      )
    },
    {
      title: '支持度',
      dataIndex: 'support',
      key: 'support',
      width: 100,
      sorter: (a, b) => a.support - b.support,
      render: (val) => (val * 100).toFixed(2) + '%'
    },
    {
      title: '置信度',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 100,
      sorter: (a, b) => a.confidence - b.confidence,
      render: (val) => (val * 100).toFixed(2) + '%'
    },
    {
      title: '提升度',
      dataIndex: 'lift',
      key: 'lift',
      width: 100,
      sorter: (a, b) => a.lift - b.lift,
      render: (val) => val?.toFixed(3)
    },
    {
      title: '杠杆率',
      dataIndex: 'leverage',
      key: 'leverage',
      width: 100,
      render: (val) => val?.toFixed(4)
    }
  ];

  const getGraphOption = () => {
    const { nodes, edges } = graphData;
    
    if (nodes.length === 0) {
      return {
        title: {
          text: '关联规则图',
          left: 'center'
        },
        series: []
      };
    }

    const maxLift = Math.max(...edges.map(e => e.lift || 1));

    return {
      title: {
        text: '关联规则可视化',
        left: 'center'
      },
      tooltip: {
        formatter: function(params) {
          if (params.dataType === 'edge') {
            return `
              <b>${params.data.source}</b> → <b>${params.data.target}</b><br/>
              支持度: ${(params.data.support * 100).toFixed(2)}%<br/>
              置信度: ${(params.data.confidence * 100).toFixed(2)}%<br/>
              提升度: ${params.data.lift?.toFixed(3)}
            `;
          }
          return params.data.name;
        }
      },
      series: [{
        type: 'graph',
        layout: 'force',
        roam: true,
        draggable: true,
        label: {
          show: true,
          position: 'right',
          formatter: '{b}'
        },
        edgeSymbol: ['none', 'arrow'],
        edgeSymbolSize: [0, 10],
        lineStyle: {
          curveness: 0.2
        },
        emphasis: {
          focus: 'adjacency',
          lineStyle: {
            width: 5
          }
        },
        force: {
          repulsion: 400,
          edgeLength: 150
        },
        data: nodes.map(node => ({
          id: node.id,
          name: node.name,
          symbolSize: 30,
          itemStyle: {
            color: '#1890ff'
          }
        })),
        links: edges.map(edge => ({
          source: edge.source,
          target: edge.target,
          value: edge.lift,
          lineStyle: {
            width: (edge.lift / maxLift) * 5 + 1,
            color: edge.lift > 2 ? '#ff4d4f' : '#faad14'
          },
          support: edge.support,
          confidence: edge.confidence,
          lift: edge.lift
        }))
      }]
    };
  };

  const getMetricsChartOption = () => {
    const supports = rules.map(r => r.support);
    const confidences = rules.map(r => r.confidence);
    const lifts = rules.map(r => r.lift);

    return {
      title: {
        text: '规则指标分布',
        left: 'center'
      },
      tooltip: {
        trigger: 'axis'
      },
      legend: {
        data: ['支持度', '置信度', '提升度'],
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
        type: 'category',
        data: rules.map((_, i) => `规则${i + 1}`)
      },
      yAxis: {
        type: 'value'
      },
      series: [
        {
          name: '支持度',
          type: 'bar',
          data: supports.map(s => (s * 100).toFixed(2))
        },
        {
          name: '置信度',
          type: 'bar',
          data: confidences.map(c => (c * 100).toFixed(2))
        },
        {
          name: '提升度',
          type: 'line',
          yAxisIndex: 0,
          data: lifts.map(l => l?.toFixed(3))
        }
      ]
    };
  };

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="关联规则数"
              value={rules.length}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="强规则 (Lift > 2)"
              value={rules.filter(r => r.lift > 2).length}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="挖掘参数配置">
            <Space wrap>
              <Space>
                <span>最小支持度:</span>
                <InputNumber
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={minSupport}
                  onChange={setMinSupport}
                />
              </Space>
              <Space>
                <span>最小置信度:</span>
                <InputNumber
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={minConfidence}
                  onChange={setMinConfidence}
                />
              </Space>
              <Space>
                <span>最小提升度:</span>
                <InputNumber
                  min={0.01}
                  step={0.1}
                  value={minLift}
                  onChange={setMinLift}
                />
              </Space>
              <Space>
                <span>时间窗口(分钟):</span>
                <InputNumber
                  min={1}
                  max={60}
                  value={timeWindow}
                  onChange={setTimeWindow}
                />
              </Space>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleMineRules}
                loading={miningLoading}
              >
                挖掘规则
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={loadRules}
                loading={loading}
              >
                刷新
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Tabs defaultActiveKey="1">
        <TabPane tab="规则列表" key="1">
          {rules.length > 0 ? (
            <Card>
              <Table
                columns={columns}
                dataSource={rules.map(r => ({ ...r, key: r.id }))}
                pagination={{ pageSize: 10 }}
                loading={loading}
                scroll={{ x: 1200 }}
              />
            </Card>
          ) : (
            <Card>
              <Empty description="暂无关联规则，请先进行挖掘" />
            </Card>
          )}
        </TabPane>
        
        <TabPane tab="规则图" key="2">
          <Card>
            {graphData.nodes.length > 0 ? (
              <ReactECharts
                option={getGraphOption()}
                style={{ height: 500 }}
              />
            ) : (
              <Empty description="暂无图数据" />
            )}
          </Card>
        </TabPane>
        
        <TabPane tab="指标分析" key="3">
          <Card>
            {rules.length > 0 ? (
              <ReactECharts
                option={getMetricsChartOption()}
                style={{ height: 400 }}
              />
            ) : (
              <Empty description="暂无数据" />
            )}
          </Card>
        </TabPane>
      </Tabs>
    </div>
  );
}

export default AssociationRules;
