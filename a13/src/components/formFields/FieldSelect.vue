<template>
  <el-select
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :placeholder="field.placeholder"
    :disabled="field.disabled"
    :clearable="field.props?.clearable"
    :multiple="field.props?.multiple"
    :filterable="field.props?.filterable"
    style="width: 100%"
  >
    <el-option
      v-for="option in field.options"
      :key="option.value"
      :label="option.label"
      :value="option.value"
      :disabled="option.disabled"
    />
  </el-select>
</template>

<script setup lang="ts">
import type { FormField } from '@/types/form'

defineProps<{
  field: FormField
  modelValue: any
}>()

defineEmits<{
  (e: 'update:modelValue', value: any): void
}>()
</script>
