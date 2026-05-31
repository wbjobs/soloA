<template>
  <div
    class="canvas-wrapper"
    @dragover.prevent="handleDragOver"
    @drop="handleDrop"
    @click="handleCanvasClick"
  >
    <div v-if="!store.currentForm || store.fieldCount === 0" class="empty-canvas">
      <el-icon class="empty-icon"><DocumentAdd /></el-icon>
      <p>从左侧拖拽组件到此处</p>
      <p style="font-size: 12px; margin-top: 4px">或点击组件自动添加</p>
    </div>

    <div v-else class="canvas-fields">
      <template v-for="(field, index) in store.currentForm.fields" :key="field.id">
        <div
          v-memo="[field.id, store.selectedFieldId === field.id, field.label, field.required]"
          :class="['canvas-field', { selected: store.selectedFieldId === field.id }]"
          draggable="true"
          @click.stop="store.selectField(field.id)"
          @dragstart="(e) => handleFieldDragStart(e, index)"
          @dragover.prevent="handleFieldDragOver($event, index)"
          @drop.stop="handleFieldDrop($event, index)"
        >
          <div class="field-actions">
            <el-button type="primary" size="small" link @click.stop="store.duplicateField(field.id)">
              <el-icon><CopyDocument /></el-icon>
            </el-button>
            <el-button type="danger" size="small" link @click.stop="store.removeField(field.id)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>

          <el-form-item
            :label="field.type === 'divider' ? undefined : field.label"
            :required="field.required"
          >
            <FieldRenderer :field="field" :model-value="field.defaultValue" />
          </el-form-item>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, h, shallowRef, watch, markRaw } from 'vue'
import { useFormEditorStore } from '@/stores/formEditor'
import type { FormField, FieldType } from '@/types/form'
import { fieldComponents } from '@/components/formFields'
import { customComponentManager } from '@/utils/customComponentManager'
import type { Component } from 'vue'

const store = useFormEditorStore()

let draggedFieldIndex: number | null = null

function handleDragOver(event: DragEvent) {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy'
  }
}

function handleDrop(event: DragEvent) {
  if (event.dataTransfer) {
    const fieldType = event.dataTransfer.getData('fieldType')
    const isCustom = event.dataTransfer.getData('isCustom') === 'true'
    
    if (fieldType) {
      if (isCustom) {
        store.addCustomField(fieldType)
      } else {
        store.addField(fieldType as FieldType)
      }
    }
  }
}

function handleCanvasClick() {
  store.selectField(null)
}

function handleFieldDragStart(event: DragEvent, index: number) {
  draggedFieldIndex = index
  if (event.dataTransfer) {
    event.dataTransfer.setData('fieldIndex', String(index))
    event.dataTransfer.effectAllowed = 'move'
  }
}

function handleFieldDragOver(event: DragEvent, _index: number) {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function handleFieldDrop(_event: DragEvent, targetIndex: number) {
  if (draggedFieldIndex !== null && draggedFieldIndex !== targetIndex) {
    store.moveField(draggedFieldIndex, targetIndex)
  }
  draggedFieldIndex = null
}

const componentCache = new Map<string, Component>()

function getStandardComponent(type: string): Component {
  if (componentCache.has(type)) {
    return componentCache.get(type)!
  }
  
  if (type.startsWith('custom_')) {
    const customId = type.replace('custom_', '')
    const customComp = store.getCustomComponent(customId)
    if (customComp) {
      const compiled = customComponentManager.compileComponent(customComp)
      componentCache.set(type, markRaw(compiled))
      return compiled
    }
  }
  
  const comp = fieldComponents[type as keyof typeof fieldComponents] || fieldComponents.input
  componentCache.set(type, markRaw(comp))
  return comp
}

const FieldRenderer = defineComponent({
  name: 'FieldRenderer',
  props: {
    field: { type: Object as () => FormField, required: true },
    modelValue: { required: true }
  },
  emits: ['update:modelValue', 'change'],
  setup(props, { emit }) {
    const cachedComponent = shallowRef<Component>(markRaw(getStandardComponent(props.field.type)))
    
    watch(
      () => props.field.type,
      (newType) => {
        cachedComponent.value = markRaw(getStandardComponent(newType))
      }
    )
    
    return () => {
      return h(cachedComponent.value, {
        field: props.field,
        modelValue: props.modelValue,
        'onUpdate:modelValue': (val: any) => emit('update:modelValue', val),
        'onChange': (val: any) => emit('change', val)
      })
    }
  }
})
</script>
