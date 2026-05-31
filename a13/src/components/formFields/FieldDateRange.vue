<template>
  <el-date-picker
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    type="daterange"
    :disabled="field.disabled"
    :format="field.props?.format"
    :value-format="field.props?.valueFormat"
    :start-placeholder="field.props?.startPlaceholder || '开始日期'"
    :end-placeholder="field.props?.endPlaceholder || '结束日期'"
    :clearable="field.props?.clearable !== false"
    style="width: 100%"
  />
</template>

<script setup lang="ts">
import type { FormField } from '@/types/form'

defineProps<{
  field: FormField
  modelValue: [string, string] | [Date, Date] | null
}>()

defineEmits<{
  (e: 'update:modelValue', value: [string, string] | [Date, Date] | null): void
}>()
</script>
