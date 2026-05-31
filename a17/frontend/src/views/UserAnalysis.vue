<template>
  <div class="user-analysis">
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

    <el-row :gutter="20" class="stats-row">
      <el-col :span="8">
        <el-card shadow="hover">
          <div class="summary-item">
            <div class="summary-number">{{ formatNumber(repeatData.total_buyers) }}</div>
            <div class="summary-label">总购买用户</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover">
          <div class="summary-item">
            <div class="summary-number">{{ formatNumber(repeatData.repeat_buyers) }}</div>
            <div class="summary-label">复购用户</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover">
          <div class="summary-item highlight">
            <div class="summary-number">{{ repeatData.repeat_purchase_rate }}%</div>
            <div class="summary-label">复购率</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="chart-row">
      <el-col :span="14">
        <el-card shadow="hover">
          <div class="card-title">用户行为转化漏斗</div>
          <div ref="funnelChartRef" class="chart-container tall"></div>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card shadow="hover">
          <div class="card-title">用户分群分布</div>
          <div ref="segmentChartRef" class="chart-container tall"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="chart-row">
      <el-col :span="24">
        <el-card shadow="hover">
          <div class="card-title">漏斗转化详情</div>
          <el-table :data="funnelData" border class="table-container">
            <el-table-column prop="name" label="阶段" />
            <el-table-column prop="users" label="用户数" />
            <el-table-column prop="percentage" label="转化率(%)" />
            <el-table-column prop="drop_off" label="流失率(%)">
              <template #default="{ row }">
                <el-tag type="danger" size="small">{{ row.drop_off }}%</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, inject, nextTick } from 'vue'
import * as echarts from 'echarts'
import dayjs from 'dayjs'
import { getConversionFunnel } from '@/api/analytics'
import { getMockConversionFunnel } from '@/utils/mockData'

const refreshKey = inject('refreshKey')

const dateRange = ref([
  dayjs().subtract(30, 'day').format('YYYY-MM-DD'),
  dayjs().format('YYYY-MM-DD')
])

const funnelData = ref([])
const segmentData = ref([])
const repeatData = ref({
  total_buyers: 0,
  repeat_buyers: 0,
  repeat_purchase_rate: 0
})

const funnelChartRef = ref(null)
const segmentChartRef = ref(null)

let funnelChart = null
let segmentChart = null

function formatNumber(num) {
  return num?.toLocaleString() || 0
}

async function fetchData() {
  try {
    const params = {
      start_date: dateRange.value[0],
      end_date: dateRange.value[1]
    }
    
    const res = await getConversionFunnel(params).catch(() => null)
    let data
    
    if (res && res.data) {
      data = res.data
    } else {
      data = getMockConversionFunnel()
    }
    
    funnelData.value = data.funnel
    segmentData.value = data.segments
    repeatData.value = data.repeat_purchase
    
    await nextTick()
    initCharts()
  } catch (error) {
    console.error('获取数据失败:', error)
  }
}

function initCharts() {
  initFunnelChart()
  initSegmentChart()
}

function initFunnelChart() {
  if (!funnelChartRef.value) return
  
  if (funnelChart) {
    funnelChart.dispose()
  }
  
  funnelChart = echarts.init(funnelChartRef.value)
  
  const colors = ['#409EFF', '#67C23A', '#E6A23C', '#F56C6C']
  
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    series: [{
      type: 'funnel',
      left: '10%',
      top: 60,
      bottom: 60,
      width: '80%',
      min: 0,
      max: 100,
      minSize: '30%',
      maxSize: '100%',
      sort: 'descending',
      gap: 2,
      label: {
        show: true,
        position: 'inside',
        formatter: '{b}\n{c}人\n{d}%',
        fontSize: 14
      },
      labelLine: {
        length: 10,
        lineStyle: {
          width: 1,
          type: 'solid'
        }
      },
      itemStyle: {
        borderColor: '#fff',
        borderWidth: 1
      },
      emphasis: {
        label: {
          fontSize: 16
        }
      },
      data: funnelData.value.map((item, index) => ({
        value: item.users,
        name: item.name,
        itemStyle: { color: colors[index] }
      }))
    }]
  }
  
  funnelChart.setOption(option)
}

function initSegmentChart() {
  if (!segmentChartRef.value) return
  
  if (segmentChart) {
    segmentChart.dispose()
  }
  
  segmentChart = echarts.init(segmentChartRef.value)
  
  const option = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c}人 ({d}%)'
    },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center'
    },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['35%', '50%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: '#fff',
        borderWidth: 2
      },
      label: {
        show: false,
        position: 'center'
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 18,
          fontWeight: 'bold',
          formatter: '{b}\n{d}%'
        }
      },
      labelLine: {
        show: false
      },
      data: segmentData.value
    }]
  }
  
  segmentChart.setOption(option)
}

function handleResize() {
  funnelChart?.resize()
  segmentChart?.resize()
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
  funnelChart?.dispose()
  segmentChart?.dispose()
})
</script>

<style lang="scss" scoped>
.user-analysis {
  .filter-bar {
    margin-bottom: 20px;
  }
  
  .stats-row {
    margin-bottom: 20px;
  }
  
  .chart-row {
    margin-bottom: 20px;
  }
  
  .summary-item {
    text-align: center;
    padding: 10px;
    
    .summary-number {
      font-size: 32px;
      font-weight: bold;
      color: #303133;
    }
    
    .summary-label {
      font-size: 14px;
      color: #909399;
      margin-top: 5px;
    }
    
    &.highlight .summary-number {
      color: #409EFF;
    }
  }
  
  .chart-container.tall {
    height: 400px;
  }
}
</style>
