import React from 'react';
import ReactECharts from 'echarts-for-react';
import { DashboardMetrics, NTierRisk, CascadeResult } from '../types';

interface RiskDashboardProps {
  metrics: DashboardMetrics;
  nTierRisk?: NTierRisk[];
  cascadeResult?: CascadeResult | null;
  criticalPathLength?: number;
}

export const RiskDashboard: React.FC<RiskDashboardProps> = ({
  metrics,
  nTierRisk = [],
  cascadeResult = null,
  criticalPathLength = 0
}) => {
  const nTierRiskChartOption = {
    title: {
      text: 'N-Tier Risk Exposure',
      left: 'center',
      textStyle: { fontSize: 14, fontWeight: 600 }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: {
      data: ['Failure Ratio', 'Risk Exposure'],
      bottom: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '20%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: nTierRisk.map(r => `Tier ${r.tier}`),
      axisLabel: { interval: 0, rotate: 0 }
    },
    yAxis: {
      type: 'value',
      max: 1,
      axisLabel: { formatter: '{value}' }
    },
    series: [
      {
        name: 'Failure Ratio',
        type: 'bar',
        data: nTierRisk.map(r => r.failure_ratio),
        itemStyle: { color: '#ef4444' },
        barWidth: '30%'
      },
      {
        name: 'Risk Exposure',
        type: 'line',
        data: nTierRisk.map(r => r.risk_exposure),
        itemStyle: { color: '#f59e0b' },
        lineStyle: { width: 3 },
        symbol: 'circle',
        symbolSize: 8
      }
    ]
  };

  const betweennessChartOption = {
    title: {
      text: 'Top Betweenness Centrality',
      left: 'center',
      textStyle: { fontSize: 12, fontWeight: 600 }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      axisLabel: { formatter: '{value}' }
    },
    yAxis: {
      type: 'category',
      data: metrics.top_betweenness_nodes.map(n => n.name),
      inverse: true
    },
    series: [{
      type: 'bar',
      data: metrics.top_betweenness_nodes.map(n => n.value),
      itemStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 1, y2: 0,
          colorStops: [
            { offset: 0, color: '#3b82f6' },
            { offset: 1, color: '#8b5cf6' }
          ]
        }
      },
      barWidth: '60%'
    }]
  };

  const pagerankChartOption = {
    title: {
      text: 'Top PageRank Nodes',
      left: 'center',
      textStyle: { fontSize: 12, fontWeight: 600 }
    },
    tooltip: {
      trigger: 'item'
    },
    series: [{
      type: 'pie',
      radius: ['30%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: '#fff',
        borderWidth: 2
      },
      label: {
        show: true,
        formatter: '{b}: {c}'
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 14,
          fontWeight: 'bold'
        }
      },
      data: metrics.top_pagerank_nodes.map((n, i) => ({
        name: n.name,
        value: n.value.toFixed(4),
        itemStyle: {
          color: ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'][i % 5]
        }
      }))
    }]
  };

  const criticalPathGaugeOption = {
    title: {
      text: 'Critical Path Length',
      left: 'center',
      textStyle: { fontSize: 12, fontWeight: 600 }
    },
    series: [{
      type: 'gauge',
      startAngle: 180,
      endAngle: 0,
      min: 0,
      max: 60,
      splitNumber: 6,
      axisLine: {
        lineStyle: {
          width: 12,
          color: [
            [0.33, '#10b981'],
            [0.66, '#f59e0b'],
            [1, '#ef4444']
          ]
        }
      },
      pointer: {
        icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
        length: '60%',
        width: 12,
        offsetCenter: [0, '-10%'],
        itemStyle: { color: '#1f2937' }
      },
      axisTick: {
        length: 8,
        lineStyle: { color: 'auto', width: 2 }
      },
      splitLine: {
        length: 16,
        lineStyle: { color: 'auto', width: 3 }
      },
      axisLabel: {
        color: '#6b7280',
        fontSize: 10,
        distance: 30,
        formatter: '{value} days'
      },
      title: {
        offsetCenter: [0, '20%'],
        fontSize: 12
      },
      detail: {
        fontSize: 24,
        offsetCenter: [0, '0%'],
        valueAnimation: true,
        formatter: '{value} days',
        color: '#1f2937'
      },
      data: [{ value: criticalPathLength || 0 }]
    }]
  };

  const impactGaugeOption = {
    title: {
      text: 'Current Impact',
      left: 'center',
      textStyle: { fontSize: 12, fontWeight: 600 }
    },
    series: [{
      type: 'gauge',
      startAngle: 180,
      endAngle: 0,
      min: 0,
      max: 100,
      splitNumber: 5,
      axisLine: {
        lineStyle: {
          width: 12,
          color: [
            [0.25, '#10b981'],
            [0.5, '#f59e0b'],
            [0.75, '#ef4444'],
            [1, '#dc2626']
          ]
        }
      },
      pointer: {
        icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
        length: '60%',
        width: 12,
        offsetCenter: [0, '-10%'],
        itemStyle: { color: '#1f2937' }
      },
      axisTick: {
        length: 8,
        lineStyle: { color: 'auto', width: 2 }
      },
      splitLine: {
        length: 16,
        lineStyle: { color: 'auto', width: 3 }
      },
      axisLabel: {
        color: '#6b7280',
        fontSize: 10,
        distance: 30,
        formatter: '{value}%'
      },
      title: {
        offsetCenter: [0, '20%'],
        fontSize: 12
      },
      detail: {
        fontSize: 24,
        offsetCenter: [0, '0%'],
        valueAnimation: true,
        formatter: '{value}%',
        color: '#1f2937'
      },
      data: [{ value: cascadeResult?.total_impact || 0 }]
    }]
  };

  return (
    <div className="w-full space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Total Suppliers</div>
          <div className="text-3xl font-bold text-gray-800">{metrics.total_nodes}</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Supply Links</div>
          <div className="text-3xl font-bold text-blue-600">{metrics.total_edges}</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Max Tier Depth</div>
          <div className="text-3xl font-bold text-purple-600">{metrics.max_tier}</div>
        </div>
        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Failed Nodes</div>
          <div className="text-3xl font-bold text-red-600">
            {cascadeResult?.failed_nodes.length || 0}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
          <ReactECharts
            option={criticalPathGaugeOption}
            style={{ height: '250px' }}
            opts={{ renderer: 'svg' }}
          />
        </div>
        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
          <ReactECharts
            option={impactGaugeOption}
            style={{ height: '250px' }}
            opts={{ renderer: 'svg' }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
          <ReactECharts
            option={betweennessChartOption}
            style={{ height: '300px' }}
            opts={{ renderer: 'svg' }}
          />
        </div>
        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
          <ReactECharts
            option={pagerankChartOption}
            style={{ height: '300px' }}
            opts={{ renderer: 'svg' }}
          />
        </div>
      </div>

      {nTierRisk.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-4 border border-gray-100">
          <ReactECharts
            option={nTierRiskChartOption}
            style={{ height: '350px' }}
            opts={{ renderer: 'svg' }}
          />
        </div>
      )}

      {cascadeResult && (
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Cascade Failure Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-red-50 rounded-lg p-4">
              <div className="text-sm text-red-600 font-medium mb-1">Propagation Depth</div>
              <div className="text-2xl font-bold text-red-700">
                {cascadeResult.propagation_depth}
              </div>
              <div className="text-xs text-red-500 mt-1">levels of propagation</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <div className="text-sm text-orange-600 font-medium mb-1">Total Impact</div>
              <div className="text-2xl font-bold text-orange-700">
                {cascadeResult.total_impact.toFixed(1)}%
              </div>
              <div className="text-xs text-orange-500 mt-1">of network affected</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4">
              <div className="text-sm text-yellow-600 font-medium mb-1">Affected Edges</div>
              <div className="text-2xl font-bold text-yellow-700">
                {cascadeResult.affected_edges.length}
              </div>
              <div className="text-xs text-yellow-500 mt-1">supply links broken</div>
            </div>
          </div>

          {cascadeResult.propagation_path.length > 1 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Propagation Timeline</h4>
              <div className="flex flex-wrap gap-2">
                {cascadeResult.propagation_path.map((stage, index) => (
                  <div
                    key={index}
                    className={`px-3 py-2 rounded-lg text-xs ${
                      index === 0
                        ? 'bg-red-100 text-red-700 border border-red-200'
                        : 'bg-gray-100 text-gray-700 border border-gray-200'
                    }`}
                  >
                    <span className="font-semibold">Stage {index}: </span>
                    {stage.join(', ')}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RiskDashboard;
