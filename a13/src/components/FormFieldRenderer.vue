<template>
  <component
    :is="fieldComponent"
    :field="field"
    :model-value="modelValue"
    @update:model-value="(val: any) => emit('update:modelValue', val)"
    @change="(val: any) => emit('change', val)"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FormField } from '@/types/form'
import { getFieldComponent } from './formFields'

const props = defineProps<{
  field: FormField
  modelValue: any
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: any): void
  (e: 'change', value: any): void
}>()

const fieldComponent = computed(() => getFieldComponent(props.field.type))
</script>
