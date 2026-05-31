<template>
  <div class="app-container">
    <header class="app-header">
      <div class="logo">
        <el-icon><DocumentAdd /></el-icon>
        <span>表单管理</span>
      </div>
      <div style="display: flex; gap: 8px">
        <el-upload
          :show-file-list="false"
          accept=".json"
          :before-upload="handleImport"
        >
          <el-button>
            <el-icon><Upload /></el-icon>
            导入表单
          </el-button>
        </el-upload>
        <el-button type="primary" @click="createNewForm">
          <el-icon><Plus /></el-icon>
          新建表单
        </el-button>
      </div>
    </header>

    <div class="content-wrapper">
      <el-table v-if="forms.length > 0" :data="forms" stripe style="width: 100%">
        <el-table-column prop="name" label="表单名称" min-width="180" />
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        <el-table-column prop="fields" label="字段数" width="100" align="center">
          <template #default="{ row }">
            <el-tag>{{ row.fields.length }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.status === 'published'" type="success">已发布</el-tag>
            <el-tag v-else type="info">草稿</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="400" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" link @click="editForm(row)">
              <el-icon><Edit /></el-icon>
              编辑
            </el-button>
            <el-button type="success" size="small" link @click="previewForm(row)">
              <el-icon><View /></el-icon>
              预览
            </el-button>
            <el-button type="info" size="small" link @click="exportData(row)">
              <el-icon><Collection /></el-icon>
              导出数据
            </el-button>
            <el-button type="warning" size="small" link @click="exportJSON(row)">
              <el-icon><Download /></el-icon>
              导出JSON
            </el-button>
            <el-button type="danger" size="small" link @click="deleteForm(row)">
              <el-icon><Delete /></el-icon>
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else description="暂无表单，点击右上角新建表单">
        <el-button type="primary" @click="createNewForm">新建表单</el-button>
      </el-empty>
    </div>

    <ExportPanel
      v-model:visible="exportPanelVisible"
      :form="selectedForm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { indexedDBService } from '@/utils/indexedDB'
import type { FormSchema } from '@/types/form'
import ExportPanel from '@/components/extensions/ExportPanel.vue'

const router = useRouter()

const forms = ref<FormSchema[]>([])
const exportPanelVisible = ref(false)
const selectedForm = ref<FormSchema | null>(null)

onMounted(async () => {
  await indexedDBService.init()
  await loadForms()
})

async function loadForms() {
  const all = await indexedDBService.getAllForms()
  forms.value = all.sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt))
}

function formatDate(timestamp: number) {
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')
}

function createNewForm() {
  router.push('/editor')
}

function editForm(form: FormSchema) {
  router.push(`/editor/${form.id}`)
}

function previewForm(form: FormSchema) {
  router.push(`/preview/${form.id}`)
}

async function exportJSON(form: FormSchema) {
  const jsonStr = JSON.stringify(form, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${form.name}.json`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('导出成功')
}

function exportData(form: FormSchema) {
  selectedForm.value = form
  exportPanelVisible.value = true
}

async function deleteForm(form: FormSchema) {
  try {
    await ElMessageBox.confirm(
      `确定要删除表单 "${form.name}" 吗？此操作不可恢复。`,
      '确认删除',
      { type: 'warning' }
    )
    await indexedDBService.deleteForm(form.id)
    ElMessage.success('删除成功')
    await loadForms()
  } catch {
  }
}

async function handleImport(file: File) {
  const text = await file.text()
  try {
    const form = JSON.parse(text) as FormSchema
    const newId = `form_${Date.now()}`
    form.id = newId
    form.name = `${form.name} (副本)`
    form.createdAt = Date.now()
    form.updatedAt = Date.now()
    form.status = 'draft'
    await indexedDBService.saveForm(form)
    ElMessage.success('导入成功')
    await loadForms()
  } catch (error) {
    ElMessage.error('文件格式错误')
  }
  return false
}
</script>
