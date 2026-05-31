<template>
  <el-card class="suggestion-panel">
    <template #header>
      <div class="card-header">
        <span>智能补货建议</span>
        <el-button-group size="small">
          <el-button type="primary" @click="generateSuggestions" :loading="generating">
            <el-icon><Refresh /></el-icon>
            生成建议
          </el-button>
        </el-button-group>
      </div>
    </template>
    
    <div v-if="suggestions.length === 0" class="empty-suggestions">
      <el-empty description="暂无补货建议，点击按钮生成" :image-size="80" />
    </div>
    
    <el-table v-else :data="suggestions" size="small">
      <el-table-column label="紧急程度" width="100">
        <template #default="{ row }">
          <el-tag :type="getUrgencyType(row.urgency_level)" size="small">
            {{ getUrgencyText(row.urgency_level) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="consumable.name" label="耗材名称" min-width="120">
        <template #default="{ row }">
          {{ row.consumable?.name || 'Unknown' }}
        </template>
      </el-table-column>
      <el-table-column label="库存状态" width="180">
        <template #default="{ row }">
          <el-progress
            :percentage="Math.min(Math.round(row.current_stock / (row.safety_threshold * 5) * 100), 100)"
            :status="row.current_stock < row.safety_threshold ? 'exception' : ''"
            :stroke-width="10"
          >
            <template #default="{ percentage }">
              <span style="font-size: 10px;">{{ row.current_stock }} / {{ row.safety_threshold * 3 }}</span>
            </template>
          </el-progress>
        </template>
      </el-table-column>
      <el-table-column label="预计耗尽" width="100">
        <template #default="{ row }">
          <span v-if="row.estimated_days_to_empty !== null && row.estimated_days_to_empty !== undefined">
            {{ row.estimated_days_to_empty.toFixed(1) }} 天
          </span>
          <span v-else class="text-muted">--</span>
        </template>
      </el-table-column>
      <el-table-column prop="daily_usage_rate" label="日均消耗" width="80">
        <template #default="{ row }">
          {{ row.daily_usage_rate.toFixed(2) }}
        </template>
      </el-table-column>
      <el-table-column label="建议采购量" width="100">
        <template #default="{ row }">
          <el-input-number
            v-model="row.suggested_quantity"
            :min="row.consumable?.min_order_quantity || 1"
            size="small"
            :controls="false"
            style="width: 80px;"
          />
        </template>
      </el-table-column>
      <el-table-column label="原因" min-width="150" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.reason }}
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="getStatusType(row.status)" size="small">
            {{ getStatusText(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'pending'"
            type="primary"
            size="small"
            link
            @click="approveSuggestion(row)"
          >
            批准
          </el-button>
          <el-button
            v-if="row.status === 'approved'"
            type="success"
            size="small"
            link
            @click="completeSuggestion(row)"
          >
            完成
          </el-button>
          <span v-if="row.status === 'completed'" class="text-muted">已完成</span>
        </template>
      </el-table-column>
    </el-table>
    
    <div class="legend">
      <span class="legend-item">
        <span class="legend-color critical"></span>
        紧急
      </span>
      <span class="legend-item">
        <span class="legend-color high"></span>
        高
      </span>
      <span class="legend-item">
        <span class="legend-color medium"></span>
        中
      </span>
      <span class="legend-item">
        <span class="legend-color normal"></span>
        正常
      </span>
    </div>
  </el-card>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { api } from '../api'

const suggestions = ref([])
const generating = ref(false)

async function generateSuggestions() {
  generating.value = true
  try {
    const response = await api.generatePurchaseSuggestions()
    suggestions.value = response.data
    if (suggestions.value.length === 0) {
      ElMessage.success('当前库存充足，无需补货')
    } else {
      ElMessage.info(`生成了 ${suggestions.value.length} 条补货建议`)
    }
  } catch (error) {
    console.error('生成补货建议失败:', error)
    ElMessage.error('生成补货建议失败')
  } finally {
    generating.value = false
  }
}

async function loadSuggestions() {
  try {
    const response = await api.getPurchaseSuggestions()
    suggestions.value = response.data
  } catch (error) {
    console.error('加载补货建议失败:', error)
  }
}

async function approveSuggestion(row) {
  try {
    await api.approveSuggestion(row.id)
    row.status = 'approved'
    ElMessage.success('建议已批准')
  } catch (error) {
    console.error('批准建议失败:', error)
    ElMessage.error('批准失败')
  }
}

async function completeSuggestion(row) {
  try {
    await api.completeSuggestion(row.id)
    row.status = 'completed'
    ElMessage.success('补货已完成')
  } catch (error) {
    console.error('完成建议失败:', error)
    ElMessage.error('操作失败')
  }
}

function getUrgencyType(level) {
  switch (level) {
    case 'critical': return 'danger'
    case 'high': return 'warning'
    case 'medium': return ''
    default: return 'info'
  }
}

function getUrgencyText(level) {
  switch (level) {
    case 'critical': return '紧急'
    case 'high': return '高'
    case 'medium': return '中'
    default: return '正常'
  }
}

function getStatusType(status) {
  switch (status) {
    case 'completed': return 'success'
    case 'approved': return 'primary'
    default: return 'info'
  }
}

function getStatusText(status) {
  switch (status) {
    case 'completed': return '已完成'
    case 'approved': return '已批准'
    default: return '待处理'
  }
}

onMounted(() => {
  loadSuggestions()
})
</script>

<style scoped>
.suggestion-panel {
  margin-top: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.empty-suggestions {
  padding: 20px 0;
}

.legend {
  display: flex;
  gap: 20px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #606266;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.legend-color.critical { background-color: #f56c6c; }
.legend-color.high { background-color: #e6a23c; }
.legend-color.medium { background-color: #409eff; }
.legend-color.normal { background-color: #67c23a; }

.text-muted {
  color: #909399;
}
</style>
