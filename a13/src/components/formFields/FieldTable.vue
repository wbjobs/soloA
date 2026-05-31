<template>
  <div class="table-field-wrapper">
    <el-table :data="tableData" border style="width: 100%">
      <el-table-column
        v-for="col in columns"
        :key="col.field"
        :label="col.label"
        :min-width="150"
      >
        <template #default="{ $index }">
          <el-input
            v-if="col.type === 'input'"
            :model-value="tableData[$index][col.field]"
            @update:model-value="updateCell($index, col.field, $event)"
            size="small"
          />
          <el-select
            v-else-if="col.type === 'select'"
            :model-value="tableData[$index][col.field]"
            @update:model-value="updateCell($index, col.field, $event)"
            size="small"
            style="width: 100%"
          >
            <el-option
              v-for="opt in col.options"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
          <el-date-picker
            v-else-if="col.type === 'date'"
            :model-value="tableData[$index][col.field]"
            @update:model-value="updateCell($index, col.field, $event)"
            type="date"
            size="small"
            style="width: 100%"
            value-format="YYYY-MM-DD"
          />
          <el-input-number
            v-else-if="col.type === 'number'"
            :model-value="tableData[$index][col.field]"
            @update:model-value="updateCell($index, col.field, $event)"
            size="small"
            style="width: 100%"
          />
          <el-switch
            v-else-if="col.type === 'switch'"
            :model-value="tableData[$index][col.field]"
            @update:model-value="updateCell($index, col.field, $event)"
            size="small"
          />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ $index }">
          <el-button type="danger" size="small" link @click="removeRow($index)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-button type="primary" size="small" style="margin-top: 8px" @click="addRow">
      + 添加行
    </el-button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { FormField } from '@/types/form'

interface TableColumn {
  label: string
  field: string
  type: 'input' | 'select' | 'date' | 'number' | 'switch'
  options?: { label: string; value: any }[]
}

const props = defineProps<{
  field: FormField
  modelValue: Record<string, any>[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, any>[]): void
}>()

const tableData = ref<Record<string, any>[]>([])
const columns = (props.field.props?.columns || []) as TableColumn[]

watch(
  () => props.modelValue,
  (newVal) => {
    tableData.value = JSON.parse(JSON.stringify(newVal || []))
  },
  { immediate: true, deep: true }
)

function updateCell(rowIndex: number, field: string, value: any) {
  const newData = [...tableData.value]
  newData[rowIndex] = { ...newData[rowIndex], [field]: value }
  tableData.value = newData
  emit('update:modelValue', newData)
}

function addRow() {
  const newRow: Record<string, any> = {}
  columns.forEach((col) => {
    if (col.type === 'number') newRow[col.field] = 0
    else if (col.type === 'switch') newRow[col.field] = false
    else newRow[col.field] = ''
  })
  const newData = [...tableData.value, newRow]
  tableData.value = newData
  emit('update:modelValue', newData)
}

function removeRow(index: number) {
  const newData = tableData.value.filter((_, i) => i !== index)
  tableData.value = newData
  emit('update:modelValue', newData)
}
</script>
