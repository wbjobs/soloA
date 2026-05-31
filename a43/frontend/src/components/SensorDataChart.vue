<template>
  <el-card class="chart-card">
    <template #header>
      <div class="card-header">
        <span>传感器数据趋势 - {{ deviceName }}</span>
        <el-radio-group v-model="timeRange" size="small" @change="fetchData">
          <el-radio-button :value="1">1小时</el-radio-button>
          <el-radio-button :value="24">24小时</el-radio-button>
          <el-radio-button :value="168">7天</el-radio-button>
        </el-radio-group>
      </div>
    </template>
    <div ref="chartRef" class="chart-container"></div>
  </el-card>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { api } from '../api'

const props = defineProps({
  deviceId: {
    type: String,
    required: true
  },
  deviceName: {
    type: String,
    default: '未知设备'
  }
})

const chartRef = ref(null)
const timeRange = ref(24)
let chartInstance = null

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  
  if (timeRange.value >= 168) {
    return `${date.getMonth() + 1}/${date.getDate()} ${hours}:${minutes}`
  } else if (timeRange.value >= 24) {
    return `${hours}:${minutes}`
  } else {
    return `${hours}:${minutes}`
  }
}

const getChartOption = (data) => {
  const timestamps = data.map(d => formatTime(d.timestamp))
  const temperatures = data.map(d => d.temperature)
  const humidities = data.map(d => d.humidity)
  const powers = data.map(d => d.power)

  return {
    title: {
      text: '',
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross'
      }
    },
    legend: {
      data: ['温度', '湿度', '功率'],
      top: 10
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: 60,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: timestamps,
      axisLabel: {
        rotate: 45,
        interval: Math.floor(data.length / 10)
      }
    },
    yAxis: [
      {
        type: 'value',
        name: '温度(°C)/湿度(%)',
        position: 'left',
        axisLabel: {
          formatter: '{value}'
        }
      },
      {
        type: 'value',
        name: '功率(W)',
        position: 'right',
        axisLabel: {
          formatter: '{value}'
        }
      }
    ],
    series: [
      {
        name: '温度',
        type: 'line',
        smooth: true,
        yAxisIndex: 0,
        data: temperatures,
        lineStyle: {
          color: '#e74c3c',
          width: 2
        },
        itemStyle: {
          color: '#e74c3c'
        },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(231, 76, 60, 0.3)' },
            { offset: 1, color: 'rgba(231, 76, 60, 0.05)' }
          ])
        }
      },
      {
        name: '湿度',
        type: 'line',
        smooth: true,
        yAxisIndex: 0,
        data: humidities,
        lineStyle: {
          color: '#3498db',
          width: 2
        },
        itemStyle: {
          color: '#3498db'
        }
      },
      {
        name: '功率',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: powers,
        lineStyle: {
          color: '#2ecc71',
          width: 2
        },
        itemStyle: {
          color: '#2ecc71'
        }
      }
    ],
    visualMap: {
      show: false,
      pieces: [
        {
          gt: 40,
          color: '#e74c3c'
        },
        {
          gt: 35,
          lte: 40,
          color: '#f39c12'
        },
        {
          lte: 35,
          color: '#27ae60'
        }
      ],
      seriesIndex: 0
    }
  }
}

async function fetchData() {
  if (!props.deviceId) return

  try {
    const response = await api.getSensorDataRange(props.deviceId, timeRange.value)
    const data = response.data.data || []
    
    if (chartInstance) {
      if (data.length === 0) {
        chartInstance.setOption({
          title: {
            text: '暂无数据',
            left: 'center',
            top: 'middle'
          },
          series: []
        })
      } else {
        chartInstance.setOption(getChartOption(data))
      }
    }
  } catch (error) {
    console.error('获取传感器数据失败:', error)
  }
}

function initChart() {
  if (chartRef.value) {
    chartInstance = echarts.init(chartRef.value)
    fetchData()
  }
}

function handleResize() {
  if (chartInstance) {
    chartInstance.resize()
  }
}

watch(() => props.deviceId, () => {
  fetchData()
})

onMounted(() => {
  nextTick(() => {
    initChart()
    window.addEventListener('resize', handleResize)
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (chartInstance) {
    chartInstance.dispose()
  }
})
</script>

<style scoped>
.chart-card {
  width: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.chart-container {
  width: 100%;
  height: 400px;
}
</style>
