<template>
  <div v-if="device" class="device-info-panel">
    <el-card class="info-card">
      <template #header>
        <div class="card-header">
          <span>{{ device.name }}</span>
          <el-tag :type="statusType" size="small">{{ statusText }}</el-tag>
        </div>
      </template>
      
      <el-descriptions :column="1" border size="small">
        <el-descriptions-item label="设备ID">{{ device.device_id }}</el-descriptions-item>
        <el-descriptions-item label="型号">{{ device.model || '未知' }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ deviceTypeText }}</el-descriptions-item>
        <el-descriptions-item label="位置">{{ device.location || '未知' }}</el-descriptions-item>
      </el-descriptions>

      <div v-if="realtimeData" class="realtime-section">
        <h4>实时数据</h4>
        <el-row :gutter="10">
          <el-col :span="12">
            <el-statistic title="温度" :value="realtimeData.temperature" suffix="°C">
              <template #suffix>
                <span :class="getTempClass(realtimeData.temperature)">°C</span>
              </template>
            </el-statistic>
          </el-col>
          <el-col :span="12">
            <el-statistic title="湿度" :value="realtimeData.humidity" suffix="%">
              <template #suffix>
                <span :class="getHumidityClass(realtimeData.humidity)">%</span>
              </template>
            </el-statistic>
          </el-col>
        </el-row>
        <el-row :gutter="10" style="margin-top: 10px;">
          <el-col :span="12">
            <el-statistic title="功率" :value="realtimeData.power" suffix="W" />
          </el-col>
          <el-col :span="12">
            <el-statistic title="压力" :value="realtimeData.pressure" suffix="kPa" />
          </el-col>
        </el-row>
      </div>

      <div v-if="activeAlerts && activeAlerts.length > 0" class="alerts-section">
        <h4>活动告警</h4>
        <el-alert
          v-for="alert in activeAlerts.slice(0, 3)"
          :key="alert.id"
          :title="alert.message"
          type="error"
          :closable="false"
          style="margin-bottom: 8px;"
        />
      </div>

      <div class="actions">
        <el-button type="primary" size="small" @click="$emit('view-chart', device)">
          查看趋势图
        </el-button>
        <el-button size="small" @click="$emit('make-reservation', device)">
          预约设备
        </el-button>
      </div>
    </el-card>
  </div>
  <div v-else class="device-info-panel empty">
    <el-empty description="点击3D场景中的设备查看详情" />
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  device: {
    type: Object,
    default: null
  },
  realtimeData: {
    type: Object,
    default: null
  },
  activeAlerts: {
    type: Array,
    default: () => []
  }
})

defineEmits(['view-chart', 'make-reservation'])

const statusType = computed(() => {
  if (!props.device) return 'info'
  const status = props.device.status
  switch (status) {
    case 'running': return 'success'
    case 'standby': return 'warning'
    case 'error': return 'danger'
    default: return 'info'
  }
})

const statusText = computed(() => {
  if (!props.device) return ''
  const statusMap = {
    running: '运行中',
    standby: '待机',
    error: '故障',
    offline: '离线'
  }
  return statusMap[props.device.status] || '未知'
})

const deviceTypeText = computed(() => {
  if (!props.device) return ''
  const typeMap = {
    HPLC: '高效液相色谱仪',
    GCMS: '气相色谱质谱联用仪',
    ICP: '等离子体发射光谱仪',
    FTIR: '傅里叶变换红外光谱仪',
    INCUBATOR: '恒温培养箱'
  }
  return typeMap[props.device.device_type] || props.device.device_type
})

function getTempClass(temp) {
  if (temp > 40 || temp < 10) return 'text-danger'
  if (temp > 35 || temp < 15) return 'text-warning'
  return 'text-success'
}

function getHumidityClass(humidity) {
  if (humidity > 85 || humidity < 20) return 'text-danger'
  if (humidity > 70 || humidity < 30) return 'text-warning'
  return 'text-success'
}
</script>

<style scoped>
.device-info-panel {
  width: 100%;
  min-height: 300px;
}

.device-info-panel.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  border-radius: 8px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.realtime-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}

.realtime-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #303133;
}

.alerts-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}

.alerts-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #303133;
}

.actions {
  margin-top: 16px;
  display: flex;
  gap: 8px;
}

.text-success { color: #67c23a; }
.text-warning { color: #e6a23c; }
.text-danger { color: #f56c6c; }
</style>
