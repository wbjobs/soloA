<template>
  <div class="reports">
    <el-card shadow="hover" class="export-card">
      <div class="card-title">生成报表</div>
      <el-form :model="exportForm" label-width="100px" class="export-form">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-form-item label="报表类型">
              <el-select v-model="exportForm.report_type" placeholder="请选择报表类型">
                <el-option label="概览报表" value="overview" />
                <el-option label="用户分析" value="user" />
                <el-option label="商品分析" value="product" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="10">
            <el-form-item label="时间范围">
              <el-date-picker
                v-model="exportForm.dateRange"
                type="daterange"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                value-format="YYYY-MM-DD"
              />
            </el-form-item>
          </el-col>
          <el-col :span="6">
            <el-form-item label="导出格式">
              <el-radio-group v-model="exportForm.format">
                <el-radio value="pdf">PDF</el-radio>
                <el-radio value="excel">Excel</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item>
          <el-button type="primary" :loading="exporting" @click="handleExport">
            <el-icon><Download /></el-icon>
            生成报表
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="hover" class="list-card" style="margin-top: 20px;">
      <div class="card-title">报表列表</div>
      <el-table :data="reports" border class="table-container" stripe>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column label="报表类型" width="120">
          <template #default="{ row }">
            <el-tag :type="getReportTypeTag(row.report_type)" size="small">
              {{ getReportTypeName(row.report_type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="时间范围" width="250">
          <template #default="{ row }">
            {{ row.start_date }} 至 {{ row.end_date }}
          </template>
        </el-table-column>
        <el-table-column label="格式" width="100">
          <template #default="{ row }">
            {{ row.format?.toUpperCase() }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getStatusTag(row.status)" size="small">
              {{ getStatusName(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180" />
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'completed' && row.download_url"
              type="primary"
              size="small"
              link
              @click="handleDownload(row)"
            >
              <el-icon><Download /></el-icon>
              下载
            </el-button>
            <span v-else-if="row.status === 'processing'">
              <el-icon class="is-loading"><Loading /></el-icon>
              处理中
            </span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, watch, inject } from 'vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'
import { Download, Loading } from '@element-plus/icons-vue'
import { exportReport, getReports } from '@/api/analytics'
import { getMockReports } from '@/utils/mockData'

const refreshKey = inject('refreshKey')

const exporting = ref(false)
const reports = ref([])

const exportForm = ref({
  report_type: 'overview',
  dateRange: [
    dayjs().subtract(7, 'day').format('YYYY-MM-DD'),
    dayjs().format('YYYY-MM-DD')
  ],
  format: 'pdf'
})

const reportTypeNames = {
  overview: '概览报表',
  user: '用户分析',
  product: '商品分析'
}

const statusNames = {
  pending: '待处理',
  processing: '处理中',
  completed: '已完成',
  failed: '失败'
}

function getReportTypeName(type) {
  return reportTypeNames[type] || type
}

function getReportTypeTag(type) {
  const tags = {
    overview: '',
    user: 'success',
    product: 'warning'
  }
  return tags[type] || ''
}

function getStatusName(status) {
  return statusNames[status] || status
}

function getStatusTag(status) {
  const tags = {
    pending: 'info',
    processing: 'warning',
    completed: 'success',
    failed: 'danger'
  }
  return tags[status] || ''
}

async function fetchReports() {
  try {
    const res = await getReports().catch(() => null)
    
    if (res && res.data) {
      reports.value = res.data
    } else {
      reports.value = getMockReports()
    }
  } catch (error) {
    console.error('获取报表列表失败:', error)
    reports.value = getMockReports()
  }
}

async function handleExport() {
  if (!exportForm.value.report_type || !exportForm.value.dateRange) {
    ElMessage.warning('请选择报表类型和时间范围')
    return
  }
  
  exporting.value = true
  
  try {
    const data = {
      report_type: exportForm.value.report_type,
      start_date: exportForm.value.dateRange[0],
      end_date: exportForm.value.dateRange[1],
      format: exportForm.value.format
    }
    
    const res = await exportReport(data).catch(() => null)
    
    if (res && res.data) {
      ElMessage.success('报表生成成功！')
      fetchReports()
    } else {
      ElMessage.success('报表已添加到生成队列（演示模式）')
      setTimeout(() => {
        fetchReports()
      }, 1000)
    }
  } catch (error) {
    ElMessage.error('生成报表失败')
  } finally {
    exporting.value = false
  }
}

function handleDownload(row) {
  if (row.download_url) {
    window.open(row.download_url, '_blank')
  } else {
    ElMessage.info('演示模式：报表文件暂不可用')
  }
}

watch(refreshKey, () => {
  fetchReports()
})

onMounted(() => {
  fetchReports()
})
</script>

<style lang="scss" scoped>
.reports {
  .export-card {
    .export-form {
      margin-top: 20px;
    }
  }
  
  .list-card {
    margin-top: 20px;
  }
}
</style>
