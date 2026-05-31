<template>
  <el-input-number
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :disabled="field.disabled"
    :min="field.props?.min"
    :max="field.props?.max"
    :step="field.props?.step || 1"
    :controls="field.props?.controls !== false"
    :precision="field.props?.precision"
    style="width: 100%"
  />
</template>

<script setup lang="ts">
import type { FormField } from '@/types/form'

defineProps<{
  field: FormField
  modelValue: number
}>()

defineEmits<{
  (e: 'update:modelValue', value: number): void
}>()
</script>
