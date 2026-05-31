<template>
  <el-input
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :placeholder="field.placeholder"
    :disabled="field.disabled"
    :clearable="field.props?.clearable"
    :maxlength="field.props?.maxlength"
    :show-word-limit="field.props?.showWordLimit"
    :type="field.props?.type || 'text'"
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
