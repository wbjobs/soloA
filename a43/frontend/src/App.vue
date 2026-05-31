<template>
  <div class="app-container">
    <el-container>
      <el-header class="app-header">
        <div class="header-content">
          <h1 class="app-title">
            <el-icon><Monitor /></el-icon>
            数字孪生智慧实验室管理平台
          </h1>
          <div class="header-right">
            <el-tag :type="mqttStatus ? 'success' : 'danger'" size="small">
              MQTT: {{ mqttStatus ? '已连接' : '未连接' }}
            </el-tag>
            <el-tag :type="wsStatus ? 'success' : 'warning'" size="small" style="margin-left: 10px;">
              WebSocket: {{ wsStatus ? '已连接' : '连接中' }}
            </el-tag>
          </div>
        </div>
      </el-header>
      
      <el-main class="app-main">
        <el-row :gutter="20">
          <el-col :span="16">
            <el-card class="scene-card">
              <template #header>
                <div class="card-header">
                  <span>实验室3D数字孪生场景</span>
                  <div class="header-controls">
                    <el-tag v-for="(count, status) in deviceStatusCounts" :key="status" size="small" :type="statusTagType(status)" style="margin-left: 8px;">
                      {{ statusText(status) }}: {{ count }}
                    </el-tag>
                  </div>
                </div>
              </template>
              <LabScene
                ref="labSceneRef"
                :devices="devices"
                :device-status="deviceStatusMap"
                :cabinets="cabinets"
                :cabinet-stats="cabinetStats"
                @device-click="handleDeviceClick"
                @device-hover="handleDeviceHover"
                @cabinet-click="handleCabinetClick"
                @cabinet-hover="handleCabinetHover"
              />
            </el-card>
          </el-col>
          
          <el-col :span="8">
            <div v-if="!selectedCabinet">
              <DeviceInfoPanel
                :device="selectedDevice"
                :realtime-data="selectedDeviceRealtime"
                :active-alerts="selectedDeviceAlerts"
                @view-chart="handleViewChart"
                @make-reservation="handleMakeReservation"
              />
            </div>
            <div v-else>
              <CabinetInfoPanel
                :cabinet="selectedCabinet"
                :cabinet-stats="cabinetStats"
              />
            </div>
            
            <el-card class="alerts-card" style="margin-top: 20px;">
              <template #header>
                <div class="card-header">
                  <span>实时告警</span>
                  <el-tag type="danger" size="small" v-if="activeAlerts.length > 0">
                    {{ activeAlerts.length }} 个活动告警
                  </el-tag>
                </div>
              </template>
              <div class="alerts-list">
                <el-alert
                  v-for="alert in activeAlerts.slice(0, 5)"
                  :key="alert.id"
                  :title="`[${alert.device_id}] ${alert.message}`"
                  type="error"
                  :closable="false"
                  show-icon
                  style="margin-bottom: 10px;"
                />
                <el-empty v-if="activeAlerts.length === 0" description="暂无活动告警" :image-size="80" />
              </div>
            </el-card>
          </el-col>
        </el-row>
        
        <el-row :gutter="20" style="margin-top: 20px;" v-if="chartDevice">
          <el-col :span="24">
            <SensorDataChart
              :device-id="chartDevice.device_id"
              :device-name="chartDevice.name"
            />
          </el-col>
        </el-row>
        
        <el-row :gutter="20" style="margin-top: 20px;">
          <el-col :span="24">
            <el-card class="reservation-card">
              <template #header>
                <div class="card-header">
                  <span>设备预约管理</span>
                  <el-button type="primary" size="small" @click="openReservationDialog">
                    新建预约
                  </el-button>
                </div>
              </template>
              <el-table :data="reservations" style="width: 100%" size="small">
                <el-table-column prop="device_id" label="设备ID" width="120" />
                <el-table-column prop="user_name" label="预约人" width="100" />
                <el-table-column prop="experiment_name" label="实验名称" />
                <el-table-column prop="start_time" label="开始时间" width="180">
                  <template #default="{ row }">
                    {{ formatDateTime(row.start_time) }}
                  </template>
                </el-table-column>
                <el-table-column prop="end_time" label="结束时间" width="180">
                  <template #default="{ row }">
                    {{ formatDateTime(row.end_time) }}
                  </template>
                </el-table-column>
                <el-table-column prop="status" label="状态" width="100">
                  <template #default="{ row }">
                    <el-tag :type="reservationStatusType(row.status)" size="small">
                      {{ reservationStatusText(row.status) }}
                    </el-tag>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="200">
                  <template #default="{ row }">
                    <el-button
                      v-if="row.status === 'confirmed'"
                      type="success"
                      size="small"
                      link
                      @click="completeReservation(row.id)"
                    >
                      完成
                    </el-button>
                    <el-button
                      type="danger"
                      size="small"
                      link
                      @click="cancelReservation(row.id)"
                      :disabled="row.status === 'cancelled' || row.status === 'completed'"
                    >
                      取消
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </el-col>
        </el-row>
        
        <PurchaseSuggestionPanel />
      </el-main>
    </el-container>
    
    <el-dialog
      v-model="showReservationDialog"
      title="设备预约"
      width="600px"
    >
      <el-form :model="reservationForm" label-width="100px">
        <el-form-item label="设备">
          <el-select v-model="reservationForm.device_id" placeholder="选择设备" style="width: 100%;">
            <el-option
              v-for="device in devices"
              :key="device.device_id"
              :label="device.name"
              :value="device.device_id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="预约人">
          <el-input v-model="reservationForm.user_name" placeholder="输入姓名" />
        </el-form-item>
        <el-form-item label="实验名称">
          <el-input v-model="reservationForm.experiment_name" placeholder="输入实验名称" />
        </el-form-item>
        <el-form-item label="开始时间">
          <el-date-picker
            v-model="reservationForm.start_time"
            type="datetime"
            placeholder="选择开始时间"
            style="width: 100%;"
            @change="checkConflict"
          />
        </el-form-item>
        <el-form-item label="结束时间">
          <el-date-picker
            v-model="reservationForm.end_time"
            type="datetime"
            placeholder="选择结束时间"
            style="width: 100%;"
            @change="checkConflict"
          />
        </el-form-item>
        
        <el-form-item label="所需耗材">
          <div class="consumables-section">
            <div v-for="(item, index) in reservationForm.consumables" :key="index" class="consumable-row">
              <el-select 
                v-model="item.consumable_id" 
                placeholder="选择耗材" 
                style="width: 200px;"
                @change="checkStock"
              >
                <el-option
                  v-for="consumable in consumables"
                  :key="consumable.consumable_id"
                  :label="`${consumable.name} (${consumable.unit})`"
                  :value="consumable.consumable_id"
                />
              </el-select>
              <el-input-number
                v-model="item.quantity"
                :min="1"
                size="small"
                style="width: 100px; margin-left: 10px;"
              />
              <el-button
                type="danger"
                size="small"
                link
                @click="removeConsumable(index)"
                style="margin-left: 10px;"
              >
                删除
              </el-button>
            </div>
            <el-button type="primary" size="small" text @click="addConsumable">
              + 添加耗材
            </el-button>
          </div>
        </el-form-item>
        
        <el-alert
          v-if="conflictMessage"
          :title="conflictMessage"
          type="error"
          :closable="false"
          style="margin-bottom: 10px;"
        />
        <el-alert
          v-if="stockShortageMessage"
          :title="stockShortageMessage"
          type="error"
          :closable="false"
          style="margin-bottom: 10px;"
        />
        <el-alert
          v-else-if="noConflict && reservationForm.start_time && reservationForm.end_time"
          title="无时间冲突，可以预约"
          type="success"
          :closable="false"
          style="margin-bottom: 10px;"
        />
      </el-form>
      <template #footer>
        <el-button @click="closeReservationDialog">取消</el-button>
        <el-button type="primary" @click="submitReservation" :loading="submitting">
          确认预约
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { Monitor } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import LabScene from './components/LabScene.vue'
import DeviceInfoPanel from './components/DeviceInfoPanel.vue'
import CabinetInfoPanel from './components/CabinetInfoPanel.vue'
import SensorDataChart from './components/SensorDataChart.vue'
import PurchaseSuggestionPanel from './components/PurchaseSuggestionPanel.vue'
import { api } from './api'

const labSceneRef = ref(null)
const devices = ref([])
const cabinets = ref([])
const cabinetStats = ref([])
const consumables = ref([])
const selectedDevice = ref(null)
const selectedCabinet = ref(null)
const selectedDeviceRealtime = ref(null)
const selectedDeviceAlerts = ref([])
const chartDevice = ref(null)
const activeAlerts = ref([])
const reservations = ref([])
const mqttStatus = ref(false)
const wsStatus = ref(false)
let ws = null

const showReservationDialog = ref(false)
const reservationForm = reactive({
  device_id: '',
  user_name: '',
  experiment_name: '',
  start_time: null,
  end_time: null,
  consumables: []
})
const conflictMessage = ref('')
const stockShortageMessage = ref('')
const noConflict = ref(false)
const submitting = ref(false)

const deviceStatusMap = computed(() => {
  const map = {}
  devices.value.forEach(d => {
    map[d.device_id] = d.status || 'standby'
  })
  return map
})

const deviceStatusCounts = computed(() => {
  const counts = { running: 0, standby: 0, error: 0, offline: 0 }
  devices.value.forEach(d => {
    const status = d.status || 'standby'
    if (counts[status] !== undefined) counts[status]++
  })
  return counts
})

function statusTagType(status) {
  switch (status) {
    case 'running': return 'success'
    case 'standby': return 'warning'
    case 'error': return 'danger'
    default: return 'info'
  }
}

function statusText(status) {
  const map = { running: '运行', standby: '待机', error: '故障', offline: '离线' }
  return map[status] || status
}

function reservationStatusType(status) {
  switch (status) {
    case 'completed': return 'success'
    case 'confirmed': return 'primary'
    case 'pending': return 'warning'
    case 'cancelled': return 'info'
    default: return 'info'
  }
}

function reservationStatusText(status) {
  const map = { completed: '已完成', confirmed: '已确认', pending: '待确认', cancelled: '已取消' }
  return map[status] || status
}

function formatDateTime(dt) {
  if (!dt) return ''
  return new Date(dt).toLocaleString('zh-CN')
}

async function fetchDevices() {
  try {
    const response = await api.getDevices()
    devices.value = response.data
  } catch (error) {
    console.error('获取设备列表失败:', error)
  }
}

async function fetchCabinets() {
  try {
    const response = await api.getCabinets()
    cabinets.value = response.data
  } catch (error) {
    console.error('获取耗材柜列表失败:', error)
  }
}

async function fetchCabinetStats() {
  try {
    const response = await api.getCabinetsStats()
    cabinetStats.value = response.data
  } catch (error) {
    console.error('获取耗材柜状态失败:', error)
  }
}

async function fetchConsumables() {
  try {
    const response = await api.getConsumables()
    consumables.value = response.data
  } catch (error) {
    console.error('获取耗材列表失败:', error)
  }
}

async function fetchAlerts() {
  try {
    const response = await api.getActiveAlerts()
    activeAlerts.value = response.data
  } catch (error) {
    console.error('获取告警失败:', error)
  }
}

async function fetchReservations() {
  try {
    const response = await api.getReservations()
    reservations.value = response.data
  } catch (error) {
    console.error('获取预约失败:', error)
  }
}

async function handleDeviceClick(device) {
  selectedCabinet.value = null
  selectedDevice.value = device
  
  try {
    const response = await api.getDeviceRealtime(device.device_id)
    selectedDeviceRealtime.value = response.data.latest_data
    selectedDeviceAlerts.value = response.data.active_alerts
  } catch (error) {
    console.error('获取设备实时数据失败:', error)
  }
}

function handleDeviceHover(device) {
}

function handleCabinetClick(cabinet) {
  selectedDevice.value = null
  selectedCabinet.value = cabinet
}

function handleCabinetHover(cabinet) {
}

function handleViewChart(device) {
  chartDevice.value = device
}

function openReservationDialog(device = null) {
  if (device) {
    reservationForm.device_id = device.device_id
  }
  reservationForm.consumables = []
  conflictMessage.value = ''
  stockShortageMessage.value = ''
  noConflict.value = false
  showReservationDialog.value = true
}

function closeReservationDialog() {
  showReservationDialog.value = false
  reservationForm.user_name = ''
  reservationForm.experiment_name = ''
  reservationForm.start_time = null
  reservationForm.end_time = null
  reservationForm.consumables = []
}

function handleMakeReservation(device) {
  openReservationDialog(device)
}

function addConsumable() {
  reservationForm.consumables.push({
    consumable_id: '',
    quantity: 1
  })
}

function removeConsumable(index) {
  reservationForm.consumables.splice(index, 1)
  checkStock()
}

async function checkConflict() {
  if (!reservationForm.device_id || !reservationForm.start_time || !reservationForm.end_time) {
    conflictMessage.value = ''
    noConflict.value = false
    return
  }
  
  try {
    const response = await api.checkReservationConflict(
      reservationForm.device_id,
      reservationForm.start_time.toISOString(),
      reservationForm.end_time.toISOString()
    )
    
    if (response.data.has_conflict) {
      conflictMessage.value = response.data.message
      noConflict.value = false
    } else {
      conflictMessage.value = ''
      noConflict.value = true
    }
  } catch (error) {
    conflictMessage.value = error.response?.data?.detail?.message || '检查冲突失败'
    noConflict.value = false
  }
}

async function checkStock() {
  stockShortageMessage.value = ''
  
  const items = reservationForm.consumables.filter(c => c.consumable_id && c.quantity > 0)
  if (items.length === 0) return
  
  try {
    const response = await api.checkStock(items)
    if (!response.data.available) {
      const shortages = response.data.shortages.map(s => 
        `${s.name}: 需要${s.requested}${s.unit}, 可用${s.available}${s.unit}`
      ).join('; ')
      stockShortageMessage.value = `库存不足: ${shortages}`
    }
  } catch (error) {
    console.error('检查库存失败:', error)
  }
}

async function submitReservation() {
  if (!reservationForm.device_id || !reservationForm.user_name || 
      !reservationForm.start_time || !reservationForm.end_time) {
    ElMessage.warning('请填写完整的预约信息')
    return
  }
  
  if (stockShortageMessage.value) {
    ElMessage.warning('存在库存不足的耗材，请调整')
    return
  }
  
  submitting.value = true
  try {
    const requestData = {
      device_id: reservationForm.device_id,
      user_name: reservationForm.user_name,
      experiment_name: reservationForm.experiment_name,
      start_time: reservationForm.start_time.toISOString(),
      end_time: reservationForm.end_time.toISOString(),
      consumables: reservationForm.consumables.filter(c => c.consumable_id && c.quantity > 0)
    }
    
    if (requestData.consumables.length > 0) {
      await api.createReservationWithConsumables(requestData)
    } else {
      await api.createReservation(requestData)
    }
    
    ElMessage.success('预约成功！')
    closeReservationDialog()
    fetchReservations()
    fetchCabinetStats()
  } catch (error) {
    const errMsg = error.response?.data?.detail?.message || 
                   error.response?.data?.detail || 
                   '预约失败'
    ElMessage.error(errMsg)
  } finally {
    submitting.value = false
  }
}

async function completeReservation(id) {
  try {
    await ElMessageBox.confirm('确认完成此预约？完成后锁定的耗材将被扣除。', '提示', {
      type: 'info'
    })
    
    await api.completeReservation(id)
    ElMessage.success('预约已完成，耗材已扣除')
    fetchReservations()
    fetchCabinetStats()
  } catch {
  }
}

async function cancelReservation(id) {
  try {
    await ElMessageBox.confirm('确定要取消此预约吗？锁定的耗材将被释放。', '提示', {
      type: 'warning'
    })
    
    await api.cancelReservation(id)
    ElMessage.success('预约已取消')
    fetchReservations()
    fetchCabinetStats()
  } catch {
  }
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}/ws/alerts`
  
  ws = new WebSocket(wsUrl)
  
  ws.onopen = () => {
    wsStatus.value = true
    console.log('WebSocket 连接成功')
  }
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      if (data.type === 'alert') {
        ElMessage.warning({
          message: `设备告警: ${data.data.device_name} - ${data.data.message}`,
          duration: 5000,
          showClose: true
        })
        activeAlerts.value.unshift(data.data)
        if (activeAlerts.value.length > 20) {
          activeAlerts.value = activeAlerts.value.slice(0, 20)
        }
        
        const alertDeviceId = data.data.device_id
        const deviceIndex = devices.value.findIndex(d => d.device_id === alertDeviceId)
        if (deviceIndex !== -1) {
          devices.value[deviceIndex].status = 'error'
          
          if (selectedDevice.value && selectedDevice.value.device_id === alertDeviceId) {
            selectedDevice.value.status = 'error'
          }
        }
      }
    } catch (error) {
      console.error('解析WebSocket消息失败:', error)
    }
  }
  
  ws.onclose = () => {
    wsStatus.value = false
    console.log('WebSocket 连接关闭，3秒后重试...')
    setTimeout(connectWebSocket, 3000)
  }
  
  ws.onerror = (error) => {
    console.error('WebSocket 错误:', error)
    wsStatus.value = false
  }
}

function generateMockData() {
  const baseTemp = 25
  const baseHumidity = 50
  const basePower = 1500
  
  devices.value.forEach(async device => {
    const temp = baseTemp + (Math.random() - 0.5) * 10
    const humidity = baseHumidity + (Math.random() - 0.5) * 20
    const power = basePower + Math.random() * 2000
    
    try {
      await api.batchInsertData([{
        device_id: device.device_id,
        temperature: parseFloat(temp.toFixed(1)),
        humidity: parseFloat(humidity.toFixed(1)),
        pressure: 101.3,
        power: parseFloat(power.toFixed(0))
      }])
    } catch (e) {
    }
  })
}

onMounted(async () => {
  await fetchDevices()
  await fetchCabinets()
  await fetchCabinetStats()
  await fetchConsumables()
  await fetchAlerts()
  await fetchReservations()
  connectWebSocket()
  
  setInterval(() => {
    fetchDevices()
    fetchAlerts()
    fetchCabinetStats()
  }, 5000)
  
  setTimeout(generateMockData, 2000)
  setInterval(generateMockData, 30000)
})

onUnmounted(() => {
  if (ws) {
    ws.close()
  }
})
</script>

<style scoped>
.app-container {
  min-height: 100vh;
  background: #f0f2f5;
}

.app-header {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
}

.app-title {
  color: #fff;
  margin: 0;
  font-size: 20px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.header-right {
  display: flex;
  align-items: center;
}

.app-main {
  padding: 20px;
}

.scene-card {
  height: 500px;
}

.scene-card :deep(.el-card__body) {
  height: calc(100% - 60px);
  padding: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-controls {
  display: flex;
  align-items: center;
}

.alerts-card {
  max-height: 200px;
  overflow-y: auto;
}

.alerts-list {
  max-height: 140px;
  overflow-y: auto;
}

.reservation-card {
  margin-top: 20px;
}

.consumables-section {
  width: 100%;
}

.consumable-row {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}
</style>
