<template>
  <el-dialog
    v-model="dialogVisible"
    title="导出数据"
    width="600px"
  >
    <div v-if="!form" style="text-align: center; padding: 40px">
      <el-empty description="请先选择要导出的表单" />
    </div>

    <div v-else>
      <el-form label-width="120px">
        <el-form-item label="表单名称">
          <el-tag>{{ form.name }}</el-tag>
        </el-form-item>

        <el-form-item label="导出格式">
          <el-radio-group v-model="exportFormat">
            <el-radio value="excel">Excel (.xlsx)</el-radio>
            <el-radio value="csv">CSV (.csv)</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="导出内容">
          <el-radio-group v-model="exportType">
            <el-radio value="data">表单数据</el-radio>
            <el-radio value="fields">字段配置</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item v-if="exportType === 'data'" label="数据条数">
          <el-input-number
            v-model="dataCount"
            :min="1"
            :max="1000"
            :step="10"
          />
          <span style="margin-left: 8px; color: #909399">条（使用示例数据）</span>
        </el-form-item>

        <el-form-item label="包含表头">
          <el-switch v-model="includeHeader" />
        </el-form-item>

        <el-form-item label="文件名">
          <el-input v-model="fileName" placeholder="留空则自动生成" />
        </el-form-item>
      </el-form>

      <el-divider>预览数据</el-divider>

      <div v-if="previewData.length > 0" style="max-height: 200px; overflow-y: auto">
        <el-table :data="previewData.slice(0, 3)" size="small" border>
          <el-table-column
            v-for="header in previewHeaders"
            :key="header"
            :prop="header"
            :label="header"
            show-overflow-tooltip
          />
        </el-table>
        <div v-if="previewData.length > 3" style="text-align: center; padding: 8px; color: #909399">
          共 {{ previewData.length }} 条数据，仅显示前 3 条
        </div>
      </div>
      <div v-else style="text-align: center; padding: 20px; color: #909399">
        暂无预览数据
      </div>
    </div>

    <template #footer>
      <el-button @click="$emit('update:visible', false)">取消</el-button>
      <el-button type="primary" @click="handleExport" :loading="exporting">
        <el-icon><Download /></el-icon>
        立即导出
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormSchema } from '@/types/form'
import { ExportManager, generateSampleData } from '@/utils/exportManager'
import type { ExportOptions } from '@/types/extensions'

const props = defineProps<{
  visible: boolean
  form?: FormSchema | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
}>()

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const exportFormat = ref<'excel' | 'csv'>('excel')
const exportType = ref<'data' | 'fields'>('data')
const dataCount = ref(50)
const includeHeader = ref(true)
const fileName = ref('')
const exporting = ref(false)

const form = computed(() => props.form)

const previewData = computed(() => {
  if (!props.form) return []
  if (exportType.value === 'data') {
    return generateSampleData(props.form.id, Math.min(dataCount.value, 50))
  }
  return props.form.fields
    .filter((f) => f.type !== 'divider')
    .map((field, index) => ({
      序号: index + 1,
      字段名称: field.label,
      字段标识: field.fieldName,
      组件类型: field.type,
      是否必填: field.required ? '是' : '否',
    }))
})

const previewHeaders = computed(() => {
  if (previewData.value.length === 0) return []
  return Object.keys(previewData.value[0])
})

watch(
  () => props.visible,
  (val) => {
    if (val) {
      exportFormat.value = 'excel'
      exportType.value = 'data'
      dataCount.value = 50
      includeHeader.value = true
      fileName.value = ''
    }
  }
)

async function handleExport() {
  if (!props.form) return

  exporting.value = true
  try {
    const options: ExportOptions = {
      format: exportFormat.value,
      includeHeader: includeHeader.value,
      fileName: fileName.value || undefined,
    }

    if (exportType.value === 'fields') {
      await ExportManager.exportFormFields(props.form)
      ElMessage.success('字段配置导出成功')
    } else {
      const data = generateSampleData(props.form.id, dataCount.value)
      const finalFileName = fileName.value || ExportManager.generateFileName(props.form.name, exportFormat.value)

      if (exportFormat.value === 'csv') {
        const csvContent = await ExportManager.exportToCSV(props.form, data, options)
        ExportManager.downloadCSV(csvContent, finalFileName.replace(/\.xlsx$/, '.csv'))
      } else {
        const buffer = await ExportManager.exportToExcel(props.form, data, options)
        ExportManager.downloadExcel(buffer, finalFileName.replace(/\.csv$/, '.xlsx'))
      }
      ElMessage.success('数据导出成功')
    }

    emit('update:visible', false)
  } catch (error: any) {
    ElMessage.error(`导出失败: ${error.message}`)
  } finally {
    exporting.value = false
  }
}
</script>
