<template>
  <div class="component-library">
    <div style="padding: 12px; border-bottom: 1px solid var(--border-color)">
      <el-button type="primary" size="small" @click="openCustomEditor" style="width: 100%">
        <el-icon><Plus /></el-icon>
        新建自定义组件
      </el-button>
    </div>

    <div v-for="group in groupedFields" :key="group.key" class="field-group">
      <div class="group-title">{{ group.label }}</div>
      <div
        v-for="field in group.fields"
        :key="field.type"
        class="field-item"
        draggable="true"
        @dragstart="handleDragStart($event, field.type, false)"
        @click="handleClick(field.type, false)"
      >
        <el-icon class="field-icon">
          <component :is="field.icon" />
        </el-icon>
        <span>{{ field.label }}</span>
      </div>
    </div>

    <div v-if="store.customComponents.length > 0" class="field-group">
      <div class="group-title">自定义组件</div>
      <div
        v-for="comp in store.customComponents"
        :key="comp.id"
        class="field-item"
        draggable="true"
        @dragstart="handleDragStart($event, comp.id, true)"
        @click="handleClick(comp.id, true)"
      >
        <el-icon class="field-icon" style="color: #67c23a">
          <component :is="comp.icon" />
        </el-icon>
        <span>{{ comp.label }}</span>
        <el-dropdown trigger="click" style="margin-left: auto" @click.stop>
          <el-button type="primary" size="small" link>
            <el-icon><MoreFilled /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="editCustomComponent(comp)">
                <el-icon><Edit /></el-icon>
                编辑
              </el-dropdown-item>
              <el-dropdown-item divided @click="deleteCustomComponent(comp)">
                <el-icon style="color: #f56c6c"><Delete /></el-icon>
                <span style="color: #f56c6c">删除</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
  </div>

  <CustomComponentEditor
    v-model:visible="customEditorVisible"
    :edit-component="editingComponent"
    @saved="handleCustomComponentSaved"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { fieldConfigs } from '@/utils/fieldFactory'
import type { FieldType } from '@/types/form'
import { useFormEditorStore } from '@/stores/formEditor'
import CustomComponentEditor from '@/components/extensions/CustomComponentEditor.vue'
import type { CustomComponent } from '@/types/extensions'

const store = useFormEditorStore()

const emit = defineEmits<{
  (e: 'add', type: FieldType): void
  (e: 'addCustom', componentId: string): void
}>()

const customEditorVisible = ref(false)
const editingComponent = ref<CustomComponent | null>(null)

const groupMap: Record<string, string> = {
  basic: '基础组件',
  advanced: '高级组件',
  layout: '布局组件',
}

const groupedFields = computed(() => {
  const groups: Record<string, typeof fieldConfigs> = {}
  fieldConfigs.forEach((config) => {
    if (!groups[config.group]) groups[config.group] = []
    groups[config.group].push(config)
  })
  return Object.entries(groups).map(([key, fields]) => ({
    key,
    label: groupMap[key] || key,
    fields,
  }))
})

onMounted(async () => {
  await store.loadCustomComponents()
})

function handleDragStart(event: DragEvent, id: string, isCustom: boolean) {
  if (event.dataTransfer) {
    event.dataTransfer.setData('fieldType', id)
    event.dataTransfer.setData('isCustom', String(isCustom))
    event.dataTransfer.effectAllowed = 'copy'
  }
}

function handleClick(id: string, isCustom: boolean) {
  if (isCustom) {
    emit('addCustom', id)
  } else {
    emit('add', id as FieldType)
  }
}

function openCustomEditor() {
  editingComponent.value = null
  customEditorVisible.value = true
}

function editCustomComponent(comp: CustomComponent) {
  editingComponent.value = comp
  customEditorVisible.value = true
}

async function deleteCustomComponent(comp: CustomComponent) {
  try {
    await ElMessageBox.confirm(
      `确定要删除自定义组件 "${comp.label}" 吗？此操作不可恢复。`,
      '确认删除',
      { type: 'warning' }
    )
    await store.deleteCustomComponent(comp.id)
    ElMessage.success('组件删除成功')
  } catch {
  }
}

function handleCustomComponentSaved() {
  store.loadCustomComponents()
}
</script>
