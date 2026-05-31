<template>
  <div class="product-analysis">
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

    <el-row :gutter="20" class="chart-row">
      <el-col :span="24">
        <el-card shadow="hover">
          <div class="card-title">商品销售排行榜（按收入）</div>
          <div ref="rankChartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="chart-row">
      <el-col :span="24">
        <el-card shadow="hover">
          <div class="card-title">用户偏好热力图（按时段）</div>
          <div ref="heatmapChartRef" class="chart-container tall"></div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" class="chart-row">
      <el-col :span="24">
        <el-card shadow="hover">
          <div class="card-title">商品详细数据</div>
          <el-table :data="products" border class="table-container" stripe>
            <el-table-column prop="product_id" label="商品ID" width="120" />
            <el-table-column prop="product_name" label="商品名称" width="150" />
            <el-table-column prop="views" label="浏览量" sortable>
              <template #default="{ row }">
                {{ formatNumber(row.views) }}
              </template>
            </el-table-column>
            <el-table-column prop="clicks" label="点击量" sortable>
              <template #default="{ row }">
                {{ formatNumber(row.clicks) }}
              </template>
            </el-table-column>
            <el-table-column prop="add_to_carts" label="加购数" sortable>
              <template #default="{ row }">
                {{ formatNumber(row.add_to_carts) }}
              </template>
            </el-table-column>
            <el-table-column prop="purchases" label="购买数" sortable>
              <template #default="{ row }">
                {{ formatNumber(row.purchases) }}
              </template>
            </el-table-column>
            <el-table-column prop="revenue" label="收入(元)" sortable>
              <template #default="{ row }">
                ¥{{ row.revenue?.toLocaleString() || 0 }}
              </template>
            </el-table-column>
            <el-table-column prop="click_through_rate" label="点击率" sortable>
              <template #default="{ row }">
                <el-tag :type="getTagType(row.click_through_rate, 20)" size="small">
                  {{ row.click_through_rate }}%
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="conversion_rate" label="转化率" sortable>
              <template #default="{ row }">
                <el-tag :type="getTagType(row.conversion_rate, 5)" size="small">
                  {{ row.conversion_rate }}%
                </el-tag>
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
import { getProductPerformance } from '@/api/analytics'
import { getMockProductPerformance } from '@/utils/mockData'

const refreshKey = inject('refreshKey')

const dateRange = ref([
  dayjs().subtract(30, 'day').format('YYYY-MM-DD'),
  dayjs().format('YYYY-MM-DD')
])

const products = ref([])
const heatmapData = ref({})

const rankChartRef = ref(null)
const heatmapChartRef = ref(null)

let rankChart = null
let heatmapChart = null

function formatNumber(num) {
  return num?.toLocaleString() || 0
}

function getTagType(value, threshold) {
  if (value >= threshold) return 'success'
  if (value >= threshold / 2) return 'warning'
  return 'info'
}

async function fetchData() {
  try {
    const params = {
      start_date: dateRange.value[0],
      end_date: dateRange.value[1],
      limit: 10
    }
    
    const res = await getProductPerformance(params).catch(() => null)
    let data
    
    if (res && res.data) {
      data = res.data
    } else {
      data = getMockProductPerformance()
    }
    
    products.value = data.products
    heatmapData.value = data.heatmap
    
    await nextTick()
    initCharts()
  } catch (error) {
    console.error('获取数据失败:', error)
  }
}

function initCharts() {
  initRankChart()
  initHeatmapChart()
}

function initRankChart() {
  if (!rankChartRef.value) return
  
  if (rankChart) {
    rankChart.dispose()
  }
  
  rankChart = echarts.init(rankChartRef.value)
  
  const sorted = [...products.value].sort((a, b) => b.revenue - a.revenue)
  
  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      formatter: function(params) {
        const item = sorted[params[0].dataIndex]
        return `${item.product_name}<br/>收入: ¥${item.revenue}<br/>转化率: ${item.conversion_rate}%`
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      axisLabel: {
        formatter: '{value}元'
      }
    },
    yAxis: {
      type: 'category',
      data: sorted.map(p => p.product_name),
      inverse: true
    },
    series: [{
      type: 'bar',
      data: sorted.map((p, index) => ({
        value: p.revenue,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: ['#83bff6', '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'][index % 10] + 'CC' },
            { offset: 1, color: ['#83bff6', '#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc'][index % 10] }
          ])
        }
      })),
      barWidth: '60%',
      label: {
        show: true,
        position: 'right',
        formatter: '¥{c}'
      }
    }]
  }
  
  rankChart.setOption(option)
}

function initHeatmapChart() {
  if (!heatmapChartRef.value) return
  
  if (heatmapChart) {
    heatmapChart.dispose()
  }
  
  heatmapChart = echarts.init(heatmapChartRef.value)
  
  const hours = heatmapData.value.hours || []
  const categories = heatmapData.value.categories || []
  const data = heatmapData.value.data || []
  
  const option = {
    tooltip: {
      position: 'top',
      formatter: function(params) {
        return `${hours[params.data[0]]}<br/>${categories[params.data[1]]}<br/>活跃度: ${params.data[2]}`
      }
    },
    grid: {
      left: '10%',
      right: '10%',
      top: '10%',
      bottom: '15%'
    },
    xAxis: {
      type: 'category',
      data: hours,
      splitArea: {
        show: true
      },
      axisLabel: {
        rotate: 45
      }
    },
    yAxis: {
      type: 'category',
      data: categories,
      splitArea: {
        show: true
      }
    },
    visualMap: {
      min: 0,
      max: 100,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: '0%',
      inRange: {
        color: ['#e0ffff', '#006edd']
      }
    },
    series: [{
      type: 'heatmap',
      data: data,
      label: {
        show: false
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0, 0, 0, 0.5)'
        }
      }
    }]
  }
  
  heatmapChart.setOption(option)
}

function handleResize() {
  rankChart?.resize()
  heatmapChart?.resize()
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
  rankChart?.dispose()
  heatmapChart?.dispose()
})
</script>

<style lang="scss" scoped>
.product-analysis {
  .filter-bar {
    margin-bottom: 20px;
  }
  
  .chart-row {
    margin-bottom: 20px;
  }
  
  .chart-container.tall {
    height: 400px;
  }
}
</style>
