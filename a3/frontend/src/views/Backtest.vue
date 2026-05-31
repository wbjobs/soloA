<template>
  <div class="backtest-container">
    <el-row :gutter="20">
      <el-col :span="24">
        <el-card class="upload-card">
          <template #header>
            <div class="card-header">
              <el-icon><Upload /></el-icon>
              <span>数据导入</span>
            </div>
          </template>
          <el-row :gutter="20">
            <el-col :span="8">
              <el-form-item label="股票代码">
                <el-input
                  v-model="symbolInput"
                  placeholder="请输入股票代码，如 AAPL"
                  clearable
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-upload
                ref="uploadRef"
                :auto-upload="false"
                :limit="1"
                :on-exceed="handleExceed"
                :on-change="handleFileChange"
                accept=".csv"
                drag
              >
                <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
                <div class="el-upload__text">
                  拖拽CSV文件到此处，或<em>点击上传</em>
                </div>
                <template #tip>
                  <div class="el-upload__tip">
                    请上传包含 date, open, high, low, close, volume 列的CSV文件
                  </div>
                </template>
              </el-upload>
            </el-col>
            <el-col :span="4">
              <el-button
                type="primary"
                :disabled="!symbolInput || !selectedFile"
                @click="handleUpload"
                :loading="uploading"
              >
                导入数据
              </el-button>
            </el-col>
          </el-row>
          <el-divider />
          <el-row>
            <el-col :span="12">
              <el-form-item label="选择股票">
                <el-select
                  v-model="selectedSymbol"
                  placeholder="请选择股票"
                  style="width: 100%"
                  @change="handleSymbolChange"
                >
                  <el-option
                    v-for="symbol in symbols"
                    :key="symbol"
                    :label="symbol"
                    :value="symbol"
                  />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20" style="margin-top: 20px">
      <el-col :span="6">
        <el-card class="factor-card">
          <template #header>
            <div class="card-header">
              <el-icon><Setting /></el-icon>
              <span>因子选择与参数</span>
            </div>
          </template>
          <el-form label-position="top">
            <el-checkbox-group v-model="selectedFactors" @change="runBacktest">
              <el-checkbox value="MA" border>MA 均线</el-checkbox>
              <el-checkbox value="RSI" border>RSI 相对强弱</el-checkbox>
              <el-checkbox value="MACD" border>MACD 指数平滑</el-checkbox>
              <el-checkbox value="Bollinger" border>布林带</el-checkbox>
            </el-checkbox-group>

            <el-divider />

            <div v-if="selectedFactors.includes('MA')" class="param-section">
              <el-form-item label="MA 周期">
                <el-slider
                  v-model="params.ma_period"
                  :min="5"
                  :max="60"
                  :step="1"
                  show-input
                  @change="runBacktest"
                />
              </el-form-item>
            </div>

            <div v-if="selectedFactors.includes('RSI')" class="param-section">
              <el-form-item label="RSI 周期">
                <el-slider
                  v-model="params.rsi_period"
                  :min="6"
                  :max="30"
                  :step="1"
                  show-input
                  @change="runBacktest"
                />
              </el-form-item>
            </div>

            <div v-if="selectedFactors.includes('MACD')" class="param-section">
              <el-form-item label="MACD 快线周期">
                <el-slider
                  v-model="params.macd_fast"
                  :min="5"
                  :max="20"
                  :step="1"
                  show-input
                  @change="runBacktest"
                />
              </el-form-item>
              <el-form-item label="MACD 慢线周期">
                <el-slider
                  v-model="params.macd_slow"
                  :min="15"
                  :max="40"
                  :step="1"
                  show-input
                  @change="runBacktest"
                />
              </el-form-item>
              <el-form-item label="MACD 信号线周期">
                <el-slider
                  v-model="params.macd_signal"
                  :min="5"
                  :max="15"
                  :step="1"
                  show-input
                  @change="runBacktest"
                />
              </el-form-item>
            </div>

            <div v-if="selectedFactors.includes('Bollinger')" class="param-section">
              <el-form-item label="布林带周期">
                <el-slider
                  v-model="params.bb_period"
                  :min="10"
                  :max="50"
                  :step="1"
                  show-input
                  @change="runBacktest"
                />
              </el-form-item>
              <el-form-item label="布林带标准差">
                <el-slider
                  v-model="params.bb_std"
                  :min="1"
                  :max="3"
                  :step="0.5"
                  show-input
                  @change="runBacktest"
                />
              </el-form-item>
            </div>
          </el-form>
        </el-card>
      </el-col>

      <el-col :span="18">
        <el-card class="result-card">
          <template #header>
            <div class="card-header">
              <el-icon><DataAnalysis /></el-icon>
              <span>回测结果</span>
            </div>
          </template>
          
          <el-row :gutter="20" style="margin-bottom: 20px">
            <el-col :span="6">
              <el-statistic title="总收益率" :value="backtestResult.total_return" :precision="2" suffix="%">
                <template #suffix>
                  <span :class="backtestResult.total_return >= 0 ? 'positive' : 'negative'">%</span>
                </template>
              </el-statistic>
            </el-col>
            <el-col :span="6">
              <el-statistic title="年化收益率" :value="backtestResult.annualized_return" :precision="2" suffix="%">
                <template #suffix>
                  <span :class="backtestResult.annualized_return >= 0 ? 'positive' : 'negative'">%</span>
                </template>
              </el-statistic>
            </el-col>
            <el-col :span="6">
              <el-statistic title="最大回撤" :value="backtestResult.max_drawdown" :precision="2" suffix="%">
                <template #suffix>
                  <span class="negative">%</span>
                </template>
              </el-statistic>
            </el-col>
            <el-col :span="6">
              <el-statistic title="夏普比率" :value="backtestResult.sharpe_ratio" :precision="2" />
            </el-col>
          </el-row>

          <div ref="chartRef" class="chart-container"></div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import * as echarts from 'echarts'
import { uploadCSV, getSymbols, runBacktest } from '../api'

const symbolInput = ref('')
const selectedFile = ref(null)
const uploading = ref(false)
const symbols = ref([])
const selectedSymbol = ref('')
const selectedFactors = ref(['MA'])
const uploadRef = ref(null)
const chartRef = ref(null)
let chartInstance = null

const params = reactive({
  ma_period: 20,
  rsi_period: 14,
  macd_fast: 12,
  macd_slow: 26,
  macd_signal: 9,
  bb_period: 20,
  bb_std: 2.0
})

const backtestResult = reactive({
  dates: [],
  portfolio_values: [],
  benchmark_values: [],
  total_return: 0,
  annualized_return: 0,
  max_drawdown: 0,
  sharpe_ratio: 0
})

const handleFileChange = (file) => {
  selectedFile.value = file.raw
}

const handleExceed = () => {
  ElMessage.warning('只能上传一个文件')
}

const handleUpload = async () => {
  if (!symbolInput.value || !selectedFile.value) return
  
  uploading.value = true
  try {
    const response = await uploadCSV(symbolInput.value, selectedFile.value)
    ElMessage.success(`成功导入 ${response.data.records_imported} 条数据`)
    await loadSymbols()
    selectedSymbol.value = symbolInput.value
    symbolInput.value = ''
    selectedFile.value = null
    uploadRef.value?.clearFiles()
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '上传失败')
  } finally {
    uploading.value = false
  }
}

const loadSymbols = async () => {
  try {
    const response = await getSymbols()
    symbols.value = response.data.symbols
  } catch (error) {
    console.error('加载股票列表失败:', error)
  }
}

const handleSymbolChange = () => {
  runBacktest()
}

const runBacktest = async () => {
  if (!selectedSymbol.value || selectedFactors.value.length === 0) return
  
  try {
    const request = {
      symbol: selectedSymbol.value,
      factors: selectedFactors.value,
      params: { ...params }
    }
    
    const response = await runBacktest(request)
    const data = response.data
    
    backtestResult.dates = data.dates
    backtestResult.portfolio_values = data.portfolio_values
    backtestResult.benchmark_values = data.benchmark_values
    backtestResult.total_return = (data.total_return * 100).toFixed(2)
    backtestResult.annualized_return = (data.annualized_return * 100).toFixed(2)
    backtestResult.max_drawdown = (data.max_drawdown * 100).toFixed(2)
    backtestResult.sharpe_ratio = data.sharpe_ratio?.toFixed(2) || 0
    
    await nextTick()
    updateChart()
  } catch (error) {
    console.error('回测失败:', error)
    ElMessage.error(error.response?.data?.detail || '回测失败')
  }
}

const initChart = () => {
  if (!chartRef.value) return
  
  chartInstance = echarts.init(chartRef.value)
  
  window.addEventListener('resize', () => {
    chartInstance?.resize()
  })
}

const updateChart = () => {
  if (!chartInstance) return
  
  const option = {
    title: {
      text: '净值曲线对比',
      left: 'center',
      textStyle: {
        fontSize: 16,
        fontWeight: 600
      }
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
    legend: {
      data: ['策略净值', '基准净值'],
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
      boundaryGap: false,
      data: backtestResult.dates,
      axisLabel: {
        rotate: 45
      }
    },
    yAxis: {
      type: 'value',
      scale: true
    },
    series: [
      {
        name: '策略净值',
        type: 'line',
        data: backtestResult.portfolio_values,
        smooth: true,
        lineStyle: {
          width: 2,
          color: '#667eea'
        },
        itemStyle: {
          color: '#667eea'
        },
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
        data: backtestResult.benchmark_values,
        smooth: true,
        lineStyle: {
          width: 2,
          color: '#f56c6c'
        },
        itemStyle: {
          color: '#f56c6c'
        },
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

watch(
  () => selectedFactors.value,
  () => {
    runBacktest()
  },
  { deep: true }
)

onMounted(() => {
  loadSymbols()
  nextTick(() => {
    initChart()
  })
})
</script>

<style scoped>
.backtest-container {
  padding: 20px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 16px;
}

.upload-card {
  border-radius: 12px;
}

.factor-card {
  border-radius: 12px;
}

.result-card {
  border-radius: 12px;
}

.param-section {
  margin-top: 15px;
}

.chart-container {
  width: 100%;
  height: 450px;
}

.positive {
  color: #67c23a;
}

.negative {
  color: #f56c6c;
}

:deep(.el-checkbox-button__inner) {
  margin-bottom: 8px;
}

:deep(.el-statistic__content) {
  display: flex;
  align-items: baseline;
}
</style>
