<template>
  <el-switch
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :disabled="field.disabled"
    :active-text="field.props?.activeText"
    :inactive-text="field.props?.inactiveText"
  />
</template>

<script setup lang="ts">
import type { FormField } from '@/types/form'

defineProps<{
  field: FormField
  modelValue: boolean
}>()

defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()
</script>
