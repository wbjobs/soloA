<template>
  <el-radio-group
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :disabled="field.disabled"
  >
    <el-radio
      v-for="option in field.options"
      :key="option.value"
      :label="option.value"
      :disabled="option.disabled"
    >
      {{ option.label }}
    </el-radio>
  </el-radio-group>
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
