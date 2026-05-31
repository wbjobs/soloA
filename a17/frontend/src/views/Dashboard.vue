<template>
  <div class="dashboard">
    <div class="filter-bar">
      <el-date-picker
        v-model="dateRange"
        type="daterange"
        range-separator="至"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        value-format="YYYY-MM-DD"
        @change="fetchData"
      />
    </div>

    <el-row :gutter="20" class="kpi-row">
      <el-col :span="6" v-for="(kpi, index) in kpiCards" :key="kpi.label">
        <el-card class="stat-card" shadow="hover">
          <div class="kpi-icon" :style="{ background: kpi.bgColor }">
            <el-icon :size="24" :color="kpi.iconColor">{{ kpi.icon }}</el-icon>
          </div>
          <div class="kpi-content">
            <div class="stat-number">{{ formatNumber(kpi.value) }}</div>
            <div class="stat-label">{{ kpi.label }}</div>
            <div class="stat-change" :class="kpi.change >= 0 ? 'positive' : 'negative'">
              <el-icon v-if="kpi.change >= 0"><Top /></el-icon>
              <el-icon v-else><Bottom /></el-icon>
              {{ Math.abs(kpi.change) }}% 较上周
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="chart-row">
      <el-col :span="24">
        <el-card shadow="hover">
          <div class="card-title">用户行为趋势</div>
          <div ref="trendChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="chart-row">
      <el-col :span="12">
        <el-card shadow="hover">
          <div class="card-title">核心指标概览</div>
          <div ref="radarChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card shadow="hover">
          <div class="card-title">收入趋势</div>
          <div ref="revenueChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, inject, nextTick } from 'vue'
import * as echarts from 'echarts'
import dayjs from 'dayjs'
import { TrendCharts, UserFilled, ShoppingCart, Money, Top, Bottom } from '@element-plus/icons-vue'
import { getOverviewStats } from '@/api/analytics'
import { getMockOverviewStats } from '@/utils/mockData'

const refreshKey = inject('refreshKey')

const dateRange = ref([
  dayjs().subtract(7, 'day').format('YYYY-MM-DD'),
  dayjs().format('YYYY-MM-DD')
])

const stats = ref({})
const trend = ref({})

const trendChartRef = ref(null)
const radarChartRef = ref(null)
const revenueChartRef = ref(null)

let trendChart = null
let radarChart = null
let revenueChart = null

const kpiCards = ref([
  { label: '页面浏览量(PV)', value: 0, change: 12.5, icon: 'TrendCharts', bgColor: '#409EFF20', iconColor: '#409EFF' },
  { label: '独立访客(UV)', value: 0, change: 8.3, icon: 'UserFilled', bgColor: '#67C23A20', iconColor: '#67C23A' },
  { label: '订单数', value: 0, change: 15.2, icon: 'ShoppingCart', bgColor: '#E6A23C20', iconColor: '#E6A23C' },
  { label: '总收入(元)', value: 0, change: 20.1, icon: 'Money', bgColor: '#F56C6C20', iconColor: '#F56C6C' }
])

function formatNumber(num) {
  if (num >= 10000) {
    return (num / 10000).toFixed(2) + '万'
  }
  return num.toLocaleString()
}

async function fetchData() {
  try {
    const params = {
      start_date: dateRange.value[0],
      end_date: dateRange.value[1]
    }
    
    const res = await getOverviewStats(params).catch(() => null)
    let data
    
    if (res && res.data) {
      data = res.data
    } else {
      data = getMockOverviewStats()
    }
    
    stats.value = data.stats
    trend.value = data.trend
    
    kpiCards.value[0].value = data.stats.pv
    kpiCards.value[1].value = data.stats.uv
    kpiCards.value[2].value = data.stats.purchases
    kpiCards.value[3].value = data.stats.total_revenue
    
    await nextTick()
    initCharts()
  } catch (error) {
    console.error('获取数据失败:', error)
  }
}

function initCharts() {
  initTrendChart()
  initRadarChart()
  initRevenueChart()
}

function initTrendChart() {
  if (!trendChartRef.value) return
  
  if (trendChart) {
    trendChart.dispose()
  }
  
  trendChart = echarts.init(trendChartRef.value)
  
  const option = {
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['PV', 'UV', '订单数']
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: trend.value.dates?.map(d => d.slice(5)) || []
    },
    yAxis: [
      {
        type: 'value',
        name: '访问量'
      },
      {
        type: 'value',
        name: '订单数'
      }
    ],
    series: [
      {
        name: 'PV',
        type: 'line',
        smooth: true,
        data: trend.value.pv || [],
        itemStyle: { color: '#409EFF' }
      },
      {
        name: 'UV',
        type: 'line',
        smooth: true,
        data: trend.value.uv || [],
        itemStyle: { color: '#67C23A' }
      },
      {
        name: '订单数',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: trend.value.orders || [],
        itemStyle: { color: '#E6A23C' }
      }
    ]
  }
  
  trendChart.setOption(option)
}

function initRadarChart() {
  if (!radarChartRef.value) return
  
  if (radarChart) {
    radarChart.dispose()
  }
  
  radarChart = echarts.init(radarChartRef.value)
  
  const option = {
    tooltip: {},
    radar: {
      indicator: [
        { name: '点击率', max: 100 },
        { name: '加购转化率', max: 100 },
        { name: '下单转化率', max: 100 },
        { name: '整体转化率', max: 100 },
        { name: '客单价指数', max: 100 }
      ]
    },
    series: [{
      type: 'radar',
      data: [{
        value: [
          stats.value.click_through_rate || 35.9,
          stats.value.cart_conversion_rate || 19.7,
          stats.value.purchase_conversion_rate || 14.4,
          stats.value.overall_conversion_rate || 4.48,
          Math.min((stats.value.avg_order_value || 358) / 5, 100)
        ],
        name: '转化指标',
        areaStyle: { color: 'rgba(64, 158, 255, 0.3)' },
        lineStyle: { color: '#409EFF' }
      }]
    }]
  }
  
  radarChart.setOption(option)
}

function initRevenueChart() {
  if (!revenueChartRef.value) return
  
  if (revenueChart) {
    revenueChart.dispose()
  }
  
  revenueChart = echarts.init(revenueChartRef.value)
  
  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: '{b}<br/>收入: ¥{c}'
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: trend.value.dates?.map(d => d.slice(5)) || []
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: '{value}元'
      }
    },
    series: [{
      type: 'bar',
      data: trend.value.revenue || [],
      itemStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: '#83bff6' },
          { offset: 0.5, color: '#188df0' },
          { offset: 1, color: '#188df0' }
        ])
      }
    }]
  }
  
  revenueChart.setOption(option)
}

function handleResize() {
  trendChart?.resize()
  radarChart?.resize()
  revenueChart?.resize()
}

watch(refreshKey, () => {
  fetchData()
})

onMounted(() => {
  fetchData()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  trendChart?.dispose()
  radarChart?.dispose()
  revenueChart?.dispose()
})
</script>

<style lang="scss" scoped>
.dashboard {
  .filter-bar {
    margin-bottom: 20px;
  }
  
  .kpi-row {
    margin-bottom: 20px;
  }
  
  .chart-row {
    margin-bottom: 20px;
  }
  
  .stat-card {
    display: flex;
    align-items: center;
    gap: 15px;
    padding: 10px;
    
    .kpi-icon {
      width: 60px;
      height: 60px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .kpi-content {
      flex: 1;
    }
  }
}
</style>
