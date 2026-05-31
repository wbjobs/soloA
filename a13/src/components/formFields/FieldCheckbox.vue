<template>
  <el-checkbox-group
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :disabled="field.disabled"
  >
    <el-checkbox
      v-for="option in field.options"
      :key="option.value"
      :label="option.value"
      :disabled="option.disabled"
    >
      {{ option.label }}
    </el-checkbox>
  </el-checkbox-group>
</template>

<script setup lang="ts">
import type { FormField } from '@/types/form'

defineProps<{
  field: FormField
  modelValue: any[]
}>()

defineEmits<{
  (e: 'update:modelValue', value: any[]): void
}>()
</script>
