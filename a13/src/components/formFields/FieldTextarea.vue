<template>
  <el-input
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    type="textarea"
    :placeholder="field.placeholder"
    :disabled="field.disabled"
    :rows="field.props?.rows || 3"
    :maxlength="field.props?.maxlength"
    :show-word-limit="field.props?.showWordLimit"
  />
</template>

<script setup lang="ts">
import type { FormField } from '@/types/form'

defineProps<{
  field: FormField
  modelValue: string
}>()

defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()
</script>
