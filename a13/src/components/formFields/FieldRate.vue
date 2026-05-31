<template>
  <el-rate
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :disabled="field.disabled"
    :max="field.props?.max || 5"
    :allow-half="field.props?.allowHalf"
    :show-text="field.props?.showText"
    :show-score="field.props?.showScore"
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
