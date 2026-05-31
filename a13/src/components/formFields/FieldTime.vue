<template>
  <el-time-picker
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :placeholder="field.placeholder"
    :disabled="field.disabled"
    :format="field.props?.format"
    :value-format="field.props?.valueFormat"
    :clearable="field.props?.clearable !== false"
    style="width: 100%"
  />
</template>

<script setup lang="ts">
import type { FormField } from '@/types/form'

defineProps<{
  field: FormField
  modelValue: string | Date | null
}>()

defineEmits<{
  (e: 'update:modelValue', value: string | Date | null): void
}>()
</script>
