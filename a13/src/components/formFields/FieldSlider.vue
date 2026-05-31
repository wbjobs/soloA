<template>
  <el-slider
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :disabled="field.disabled"
    :min="field.props?.min || 0"
    :max="field.props?.max || 100"
    :step="field.props?.step || 1"
    :show-stops="field.props?.showStops"
    :show-input="field.props?.showInput"
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
