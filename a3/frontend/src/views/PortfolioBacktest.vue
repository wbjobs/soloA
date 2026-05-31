<template>
  <div class="portfolio-container">
    <el-row :gutter="20">
      <el-col :span="24">
        <el-card class="config-card">
          <template #header>
            <div class="card-header">
              <el-icon><Coin /></el-icon>
              <span>组合回测配置</span>
            </div>
          </template>
          
          <el-row :gutter="20">
            <el-col :span="8">
              <el-form-item label="选择股票">
                <el-select
                  v-model="newStockSymbol"
                  placeholder="选择要添加的股票"
                  style="width: 100%"
                  @change="addStock"
                >
                  <el-option
                    v-for="symbol in availableSymbols"
                    :key="symbol"
                    :label="symbol"
                    :value="symbol"
                  />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="再平衡频率">
                <el-select v-model="rebalanceFreq" style="width: 100%">
                  <el-option label="不调整" value="none" />
                  <el-option label="月度" value="monthly" />
                  <el-option label="季度" value="quarterly" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="8">
              <el-form-item label="加权方式">
                <el-select v-model="weightMethod" style="width: 100%">
                  <el-option label="等权" value="equal" />
                  <el-option label="市值加权" value="market_cap" />
                  <el-option label="波动率倒数" value="volatility" />
                  <el-option label="自定义" value="custom" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>

          <el-divider />

          <el-table :data="selectedStocks" style="width: 100%" border>
            <el-table-column prop="symbol" label="股票代码" width="150" />
            <el-table-column label="权重" width="250">
              <template #default="scope">
                <el-slider
                  v-if="weightMethod === 'custom'"
                  v-model="scope.row.weight"
                  :min="0"
                  :max="1"
                  :step="0.05"
                  :marks="{0: '0%', 0.5: '50%', 1: '100%'}"
                  @change="normalizeWeights"
                />
                <span v-else class="weight-text">{{ (scope.row.weight * 100).toFixed(1) }}%</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="scope">
                <el-button
                  type="danger"
                  size="small"
                  link
                  @click="removeStock(scope.$index)"
                >
                  移除
                </el-button>
              </template>
            </el-table-column>
          </el-table>

          <el-divider />

          <el-checkbox-group v-model="selectedFactors" @change="runPortfolioBacktest">
            <el-checkbox value="MA" border>MA 均线</el-checkbox>
            <el-checkbox value="RSI" border>RSI 相对强弱</el-checkbox>
            <el-checkbox value="MACD" border>MACD 指数平滑</el-checkbox>
            <el-checkbox value="Bollinger" border>布林带</el-checkbox>
          </el-checkbox-group>

          <el-divider />

          <el-row :gutter="20">
            <el-col :span="6">
              <el-form-item label="MA 周期">
                <el-slider
                  v-model="params.ma_period"
                  :min="5"
                  :max="60"
                  :step="1"
                  show-input
                  @change="runPortfolioBacktest"
                />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="RSI 周期">
                <el-slider
                  v-model="params.rsi_period"
                  :min="6"
                  :max="30"
                  :step="1"
                  show-input
                  @change="runPortfolioBacktest"
                />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="MACD 快线">
                <el-slider
                  v-model="params.macd_fast"
                  :min="5"
                  :max="20"
                  :step="1"
                  show-input
                  @change="runPortfolioBacktest"
                />
              </el-form-item>
            </el-col>
            <el-col :span="6">
              <el-form-item label="MACD 慢线">
                <el-slider
                  v-model="params.macd_slow"
                  :min="15"
                  :max="40"
                  :step="1"
                  show-input
                  @change="runPortfolioBacktest"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="24">
        <el-card class="metrics-card">
          <template #header>
            <div class="card-header">
              <el-icon><DataAnalysis /></el-icon>
              <span>组合绩效指标</span>
            </div>
          </template>
          <el-row :gutter="20">
            <el-col :span="4">
              <el-statistic title="总收益率" :value="result.total_return" :precision="2">
                <template #suffix>
                  <span :class="result.total_return >= 0 ? 'positive' : 'negative'">%</span>
                </template>
              </el-statistic>
            </el-col>
            <el-col :span="4">
              <el-statistic title="年化收益率" :value="result.annualized_return" :precision="2">
                <template #suffix>
                  <span :class="result.annualized_return >= 0 ? 'positive' : 'negative'">%</span>
                </template>
              </el-statistic>
            </el-col>
            <el-col :span="4">
              <el-statistic title="最大回撤" :value="result.max_drawdown" :precision="2">
                <template #suffix>
                  <span class="negative">%</span>
                </template>
              </el-statistic>
            </el-col>
            <el-col :span="4">
              <el-statistic title="夏普比率" :value="result.sharpe_ratio" :precision="2" />
            </el-col>
            <el-col :span="4">
              <el-statistic title="年化波动率" :value="result.volatility" :precision="2">
                <template #suffix>
                  <span>%</span>
                </template>
              </el-statistic>
            </el-col>
            <el-col :span="4">
              <el-statistic title="股票数量" :value="selectedStocks.length" />
            </el-col>
          </el-row>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="14">
        <el-card class="chart-card">
          <template #header>
            <div class="card-header">
              <el-icon><TrendCharts /></el-icon>
              <span>组合净值曲线</span>
            </div>
          </template>
          <div ref="chartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card class="heatmap-card">
          <template #header>
            <div class="card-header">
              <el-icon><Grid /></el-icon>
              <span>相关性热力图</span>
            </div>
          </template>
          <div ref="heatmapRef" class="heatmap-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="12">
        <el-card class="risk-card">
          <template #header>
            <div class="card-header">
              <el-icon><PieChart /></el-icon>
              <span>风险归因分析</span>
            </div>
          </template>
          <el-table :data="result.risk_attribution.items" border>
            <el-table-column prop="symbol" label="股票" width="100" />
            <el-table-column label="权重(%)">
              <template #default="scope">
                {{ (scope.row.weight * 100).toFixed(1) }}
              </template>
            </el-table-column>
            <el-table-column label="风险贡献">
              <template #default="scope">
                {{ scope.row.contribution.toFixed(4) }}
              </template>
            </el-table-column>
            <el-table-column label="贡献占比(%)">
              <template #default="scope">
                <el-tag :type="getTagType(scope.row.contribution_pct)">
                  {{ (scope.row.contribution_pct * 100).toFixed(1) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="边际风险">
              <template #default="scope">
                {{ scope.row.marginal_risk.toFixed(4) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="allocation-card">
          <template #header>
            <div class="card-header">
              <el-icon><PieChart /></el-icon>
              <span>组合权重分布</span>
            </div>
          </template>
          <div ref="allocationRef" class="allocation-container"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, watch, onMounted, nextTick, computed } from 'vue'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import { getSymbols, runPortfolioBacktest } from '../api'

const availableSymbols = ref([])
const newStockSymbol = ref('')
const selectedStocks = ref([])
const selectedFactors = ref(['MA'])
const weightMethod = ref('equal')
const rebalanceFreq = ref('monthly')

const chartRef = ref(null)
const heatmapRef = ref(null)
const allocationRef = ref(null)

let chartInstance = null
let heatmapInstance = null
let allocationInstance = null

const params = reactive({
  ma_period: 20,
  rsi_period: 14,
  macd_fast: 12,
  macd_slow: 26,
  macd_signal: 9,
  bb_period: 20,
  bb_std: 2.0
})

const result = reactive({
  dates: [],
  portfolio_values: [],
  benchmark_values: [],
  total_return: 0,
  annualized_return: 0,
  max_drawdown: 0,
  sharpe_ratio: 0,
  volatility: 0,
  allocations: [],
  correlation: { symbols: [], correlation_matrix: [] },
  risk_attribution: { portfolio_volatility: 0, items: [] }
})

const loadSymbols = async () => {
  try {
    const response = await getSymbols()
    availableSymbols.value = response.data.symbols
  } catch (error) {
    console.error('加载股票列表失败:', error)
  }
}

const addStock = () => {
  if (!newStockSymbol.value) return
  if (selectedStocks.value.find(s => s.symbol === newStockSymbol.value)) {
    ElMessage.warning('该股票已在组合中')
    return
  }
  
  selectedStocks.value.push({
    symbol: newStockSymbol.value,
    weight: 1.0 / (selectedStocks.value.length + 1)
  })
  
  if (weightMethod.value !== 'custom') {
    normalizeWeights()
  }
  
  newStockSymbol.value = ''
  runPortfolioBacktest()
}

const removeStock = (index) => {
  selectedStocks.value.splice(index, 1)
  if (selectedStocks.value.length > 0) {
    normalizeWeights()
  }
  runPortfolioBacktest()
}

const normalizeWeights = () => {
  if (weightMethod.value !== 'custom') {
    const n = selectedStocks.value.length
    if (n > 0) {
      selectedStocks.value.forEach(s => {
        s.weight = 1.0 / n
      })
    }
  } else {
    const total = selectedStocks.value.reduce((sum, s) => sum + s.weight, 0)
    if (total > 0) {
      selectedStocks.value.forEach(s => {
        s.weight = s.weight / total
      })
    }
  }
}

const getTagType = (value) => {
  if (value > 0.3) return 'danger'
  if (value > 0.15) return 'warning'
  return 'success'
}

const runPortfolioBacktest = async () => {
  if (selectedStocks.value.length < 2 || selectedFactors.value.length === 0) return
  
  try {
    const request = {
      stocks: selectedStocks.value.map(s => ({
        symbol: s.symbol,
        weight: weightMethod.value === 'custom' ? s.weight : null
      })),
      weight_method: weightMethod.value,
      rebalance_frequency: rebalanceFreq.value,
      factors: selectedFactors.value,
      params: { ...params }
    }
    
    const response = await runPortfolioBacktest(request)
    const data = response.data
    
    result.dates = data.dates
    result.portfolio_values = data.portfolio_values
    result.benchmark_values = data.benchmark_values
    result.total_return = (data.total_return * 100).toFixed(2)
    result.annualized_return = (data.annualized_return * 100).toFixed(2)
    result.max_drawdown = (data.max_drawdown * 100).toFixed(2)
    result.sharpe_ratio = data.sharpe_ratio?.toFixed(2) || 0
    result.volatility = (data.volatility * 100).toFixed(2)
    result.allocations = data.allocations
    result.correlation = data.correlation
    result.risk_attribution = data.risk_attribution
    
    if (weightMethod.value !== 'custom') {
      selectedStocks.value.forEach(s => {
        const alloc = data.allocations.find(a => a.symbol === s.symbol)
        if (alloc) {
          s.weight = alloc.weight
        }
      })
    }
    
    await nextTick()
    updateCharts()
  } catch (error) {
    console.error('组合回测失败:', error)
    ElMessage.error(error.response?.data?.detail || '组合回测失败')
  }
}

const initCharts = () => {
  if (chartRef.value) {
    chartInstance = echarts.init(chartRef.value)
  }
  if (heatmapRef.value) {
    heatmapInstance = echarts.init(heatmapRef.value)
  }
  if (allocationRef.value) {
    allocationInstance = echarts.init(allocationRef.value)
  }
  
  window.addEventListener('resize', () => {
    chartInstance?.resize()
    heatmapInstance?.resize()
    allocationInstance?.resize()
  })
}

const updateCharts = () => {
  updateMainChart()
  updateHeatmap()
  updateAllocationChart()
}

const updateMainChart = () => {
  if (!chartInstance) return
  
  const option = {
    title: {
      text: '组合净值曲线对比',
      left: 'center',
      textStyle: { fontSize: 14, fontWeight: 600 }
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        let result = `<div style="font-weight: bold;">${params[0].axisValue}</div>`
        params.forEach(param => {
          result += `<div style="color: ${param.color};">${param.seriesName}: ${param.value.toFixed(2)}</div>`
        })
        return result
      }
    },
    legend: { data: ['组合净值', '基准净值'], top: 30 },
    grid: { left: '3%', right: '4%', bottom: '3%', top: 70, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: result.dates,
      axisLabel: { rotate: 45 }
    },
    yAxis: { type: 'value', scale: true },
    series: [
      {
        name: '组合净值',
        type: 'line',
        data: result.portfolio_values,
        smooth: true,
        lineStyle: { width: 2, color: '#667eea' },
        itemStyle: { color: '#667eea' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(102, 126, 234, 0.3)' },
            { offset: 1, color: 'rgba(102, 126, 234, 0.05)' }
          ])
        }
      },
      {
        name: '基准净值',
        type: 'line',
        data: result.benchmark_values,
        smooth: true,
        lineStyle: { width: 2, color: '#f56c6c' },
        itemStyle: { color: '#f56c6c' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(245, 108, 108, 0.3)' },
            { offset: 1, color: 'rgba(245, 108, 108, 0.05)' }
          ])
        }
      }
    ]
  }
  
  chartInstance.setOption(option, true)
}

const updateHeatmap = () => {
  if (!heatmapInstance) return
  
  const symbols = result.correlation.symbols
  const matrix = result.correlation.correlation_matrix
  
  if (!symbols || symbols.length < 2) return
  
  const heatmapData = []
  for (let i = 0; i < symbols.length; i++) {
    for (let j = 0; j < symbols.length; j++) {
      heatmapData.push([j, i, matrix[i][j]])
    }
  }
  
  const option = {
    tooltip: {
      position: 'top',
      formatter: (params) => {
        return `${symbols[params.data[1]]} - ${symbols[params.data[0]]}<br/>相关系数: ${params.data[2].toFixed(4)}`
      }
    },
    grid: { height: '70%', top: '10%' },
    xAxis: {
      type: 'category',
      data: symbols,
      splitArea: { show: true }
    },
    yAxis: {
      type: 'category',
      data: symbols,
      splitArea: { show: true }
    },
    visualMap: {
      min: -1,
      max: 1,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '0%',
      inRange: {
        color: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026']
      }
    },
    series: [{
      name: '相关性',
      type: 'heatmap',
      data: heatmapData,
      label: {
        show: true,
        formatter: (params) => params.data[2].toFixed(2)
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }]
  }
  
  heatmapInstance.setOption(option, true)
}

const updateAllocationChart = () => {
  if (!allocationInstance) return
  
  const allocations = result.risk_attribution.items
  
  if (!allocations || allocations.length === 0) return
  
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      orient: 'vertical',
      right: 10,
      top: 'center'
    },
    series: [
      {
        name: '权重分布',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: true,
          formatter: '{b}: {d}%'
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 16,
            fontWeight: 'bold'
          }
        },
        data: allocations.map(item => ({
          value: (item.weight * 100).toFixed(1),
          name: item.symbol
        }))
      }
    ]
  }
  
  allocationInstance.setOption(option, true)
}

watch([weightMethod, rebalanceFreq], () => {
  normalizeWeights()
  runPortfolioBacktest()
})

watch(selectedFactors, () => {
  runPortfolioBacktest()
})

onMounted(() => {
  loadSymbols()
  nextTick(() => {
    initCharts()
  })
})
</script>

<style scoped>
.portfolio-container {
  padding: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 16px;
}

.weight-text {
  font-size: 14px;
  color: #606266;
}

.chart-container {
  width: 100%;
  height: 350px;
}

.heatmap-container {
  width: 100%;
  height: 350px;
}

.allocation-container {
  width: 100%;
  height: 300px;
}

.positive {
  color: #67c23a;
}

.negative {
  color: #f56c6c;
}

.config-card,
.metrics-card,
.chart-card,
.heatmap-card,
.risk-card,
.allocation-card {
  border-radius: 12px;
}
</style>
