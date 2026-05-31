<template>
  <div v-if="cabinet" class="cabinet-info-panel">
    <el-card class="info-card">
      <template #header>
        <div class="card-header">
          <span>{{ cabinet.name }}</span>
          <el-tag :type="cabinetStatusType" size="small">
            {{ cabinetStatusText }}
          </el-tag>
        </div>
      </template>
      
      <el-descriptions :column="1" border size="small">
        <el-descriptions-item label="柜子ID">{{ cabinet.cabinet_id }}</el-descriptions-item>
        <el-descriptions-item label="位置">{{ cabinet.location || '未知' }}</el-descriptions-item>
        <el-descriptions-item label="描述">{{ cabinet.description || '-' }}</el-descriptions-item>
      </el-descriptions>

      <div v-if="cabinetStat" class="stats-section">
        <h4>库存概览</h4>
        <el-row :gutter="10">
          <el-col :span="12">
            <el-statistic title="物品种类" :value="cabinetStat.total_items" />
          </el-col>
          <el-col :span="12">
            <el-statistic title="库存总量" :value="cabinetStat.total_quantity" />
          </el-col>
        </el-row>
        <el-row :gutter="10" style="margin-top: 10px;">
          <el-col :span="12">
            <el-statistic title="库存水平" :value="cabinetStat.stock_level_percentage" suffix="%">
              <template #suffix>
                <span :class="getStockLevelClass(cabinetStat.stock_level_percentage)">%</span>
              </template>
            </el-statistic>
          </el-col>
          <el-col :span="12">
            <el-statistic 
              title="低于安全阈值" 
              :value="cabinetStat.below_threshold_count"
              :value-style="{ color: cabinetStat.below_threshold_count > 0 ? '#f56c6c' : '#67c23a' }"
            />
          </el-col>
        </el-row>
      </div>

      <div v-if="stockItems && stockItems.length > 0" class="stock-section">
        <h4>库存清单</h4>
        <el-table :data="stockItems" size="small" max-height="250">
          <el-table-column prop="consumable.name" label="名称" min-width="100">
            <template #default="{ row }">
              <el-tooltip :content="row.consumable?.description || ''" placement="top">
                <span>{{ row.consumable?.name }}</span>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column prop="quantity" label="库存" width="70">
            <template #default="{ row }">
              <span :class="getQuantityClass(row)">
                {{ row.quantity - row.reserved_quantity }}/{{ row.quantity }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="consumable.unit" label="单位" width="50" />
          <el-table-column prop="consumable.safety_threshold" label="安全阈值" width="70" />
          <el-table-column label="状态" width="80">
            <template #default="{ row }">
              <el-tag :type="getStockTagType(row)" size="small">
                {{ getStockStatus(row) }}
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div v-else class="empty-stock">
        <el-empty description="暂无库存数据" :image-size="60" />
      </div>
    </el-card>
  </div>
  <div v-else class="cabinet-info-panel empty">
    <el-empty description="点击3D场景中的耗材柜查看详情" />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { api } from '../api'

const props = defineProps({
  cabinet: {
    type: Object,
    default: null
  },
  cabinetStats: {
    type: Array,
    default: () => []
  }
})

const stockItems = ref([])

const cabinetStat = computed(() => {
  if (!props.cabinet || !props.cabinetStats) return null
  return props.cabinetStats.find(s => s.cabinet_id === props.cabinet.cabinet_id)
})

const cabinetStatusType = computed(() => {
  if (!cabinetStat.value) return 'info'
  if (cabinetStat.value.below_threshold_count > 0) return 'danger'
  if (cabinetStat.value.stock_level_percentage >= 60) return 'success'
  if (cabinetStat.value.stock_level_percentage >= 30) return 'warning'
  return 'danger'
})

const cabinetStatusText = computed(() => {
  if (!cabinetStat.value) return '未知'
  if (cabinetStat.value.below_threshold_count > 0) return '库存告警'
  if (cabinetStat.value.stock_level_percentage >= 60) return '库存充足'
  if (cabinetStat.value.stock_level_percentage >= 30) return '库存偏低'
  return '库存不足'
})

async function fetchStockItems() {
  if (!props.cabinet) {
    stockItems.value = []
    return
  }
  
  try {
    const response = await api.getCabinetStock(props.cabinet.cabinet_id)
    stockItems.value = response.data
  } catch (error) {
    console.error('获取库存失败:', error)
    stockItems.value = []
  }
}

function getStockLevelClass(percentage) {
  if (percentage >= 60) return 'text-success'
  if (percentage >= 30) return 'text-warning'
  return 'text-danger'
}

function getQuantityClass(row) {
  const available = row.quantity - row.reserved_quantity
  const threshold = row.consumable?.safety_threshold || 10
  
  if (available < threshold) return 'text-danger'
  if (available < threshold * 2) return 'text-warning'
  return 'text-success'
}

function getStockTagType(row) {
  const available = row.quantity - row.reserved_quantity
  const threshold = row.consumable?.safety_threshold || 10
  
  if (available < threshold) return 'danger'
  if (available < threshold * 2) return 'warning'
  return 'success'
}

function getStockStatus(row) {
  const available = row.quantity - row.reserved_quantity
  const threshold = row.consumable?.safety_threshold || 10
  
  if (available < threshold) return '需补货'
  if (available < threshold * 2) return '偏低'
  return '正常'
}

watch(() => props.cabinet, () => {
  fetchStockItems()
}, { immediate: true })
</script>

<style scoped>
.cabinet-info-panel {
  width: 100%;
  min-height: 300px;
}

.cabinet-info-panel.empty {
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

.stats-section, .stock-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}

.stats-section h4, .stock-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #303133;
}

.empty-stock {
  margin-top: 16px;
  padding: 20px 0;
  background: #fafafa;
  border-radius: 4px;
}

.text-success { color: #67c23a; }
.text-warning { color: #e6a23c; }
.text-danger { color: #f56c6c; }
</style>
