<template>
  <el-form-item
    v-if="!isHidden && field.type !== 'divider'"
    :label="field.label"
    :prop="field.fieldName"
  >
    <OptimizedFieldRenderer
      :field="field"
      :model-value="modelValue"
      :extra-disabled="isDisabled"
      @update:model-value="$emit('update:modelValue', $event)"
      @change="$emit('change', $event)"
    />
  </el-form-item>
  <el-divider v-else-if="!isHidden && field.type === 'divider'" :content-position="field.props?.contentPosition || 'center'">
    <span v-if="field.label">{{ field.label }}</span>
  </el-divider>
</template>

<script setup lang="ts">
import { defineComponent, h, shallowRef, watch, markRaw } from 'vue'
import type { FormField } from '@/types/form'
import { fieldComponents } from '@/components/formFields'
import type { Component } from 'vue'

defineProps<{
  field: FormField
  modelValue: any
  isHidden?: boolean
  isDisabled?: boolean
}>()

defineEmits<{
  (e: 'update:modelValue', value: any): void
  (e: 'change', value: any): void
}>()

const componentCache = new Map<string, Component>()

function getCachedComponent(type: string): Component {
  if (componentCache.has(type)) {
    return componentCache.get(type)!
  }
  const comp = fieldComponents[type as keyof typeof fieldComponents] || fieldComponents.input
  componentCache.set(type, markRaw(comp))
  return comp
}

const OptimizedFieldRenderer = defineComponent({
  name: 'OptimizedFieldRenderer',
  props: {
    field: { type: Object as () => FormField, required: true },
    modelValue: { required: true },
    extraDisabled: { type: Boolean, default: false }
  },
  emits: ['update:modelValue', 'change'],
  setup(props, { emit }) {
    const cachedComponent = shallowRef<Component>(markRaw(getCachedComponent(props.field.type)))
    
    watch(
      () => props.field.type,
      (newType) => {
        cachedComponent.value = markRaw(getCachedComponent(newType))
      }
    )
    
    const effectiveDisabled = () => props.field.disabled || props.extraDisabled
    
    const fieldWithMergedDisabled = () => ({
      ...props.field,
      disabled: effectiveDisabled()
    })
    
    return () => {
      return h(cachedComponent.value, {
        field: fieldWithMergedDisabled(),
        modelValue: props.modelValue,
        'onUpdate:modelValue': (val: any) => emit('update:modelValue', val),
        'onChange': (val: any) => emit('change', val)
      })
    }
  }
})
</script>
