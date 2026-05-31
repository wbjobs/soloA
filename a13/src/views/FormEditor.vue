<template>
  <div class="app-container">
    <header class="app-header">
      <div class="logo">
        <el-icon><EditPen /></el-icon>
        <span>低代码表单构建器</span>
      </div>
      <div style="display: flex; gap: 8px">
        <el-button @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          返回列表
        </el-button>
        <el-button @click="handlePreview">
          <el-icon><View /></el-icon>
          预览
        </el-button>
        <el-button @click="exportDataPanelVisible = true">
          <el-icon><Collection /></el-icon>
          导出数据
        </el-button>
        <el-button @click="versionPanelVisible = true">
          <el-icon><Histogram /></el-icon>
          版本管理
        </el-button>
        <el-button @click="handleExport">
          <el-icon><Download /></el-icon>
          导出JSON
        </el-button>
        <el-dropdown trigger="click">
          <el-button type="primary">
            <el-icon><DocumentChecked /></el-icon>
            保存
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="handleSave">
                <el-icon><DocumentChecked /></el-icon>
                仅保存
              </el-dropdown-item>
              <el-dropdown-item divided @click="handleSaveWithVersion">
                <el-icon><Plus /></el-icon>
                保存为新版本
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button @click="handlePublish" type="success">
          <el-icon><Promotion /></el-icon>
          发布
        </el-button>
      </div>
    </header>

    <div class="app-body">
      <aside class="sidebar">
        <ComponentLibrary @add="store.addField" @add-custom="store.addCustomField" />
      </aside>

      <main class="canvas-container">
        <EditorCanvas />
      </main>

      <aside class="properties-panel">
        <PropertiesPanel />
      </aside>
    </div>

    <VersionManagerPanel
      v-model:visible="versionPanelVisible"
      @restored="handleVersionRestored"
    />

    <ExportPanel
      v-model:visible="exportDataPanelVisible"
      :form="store.currentForm"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useFormEditorStore } from '@/stores/formEditor'
import { indexedDBService } from '@/utils/indexedDB'
import { customComponentManager } from '@/utils/customComponentManager'
import { versionManager } from '@/utils/versionManager'
import ComponentLibrary from '@/components/editor/ComponentLibrary.vue'
import EditorCanvas from '@/components/editor/EditorCanvas.vue'
import PropertiesPanel from '@/components/editor/PropertiesPanel.vue'
import VersionManagerPanel from '@/components/extensions/VersionManagerPanel.vue'
import ExportPanel from '@/components/extensions/ExportPanel.vue'

const route = useRoute()
const router = useRouter()
const store = useFormEditorStore()

const versionPanelVisible = ref(false)
const exportDataPanelVisible = ref(false)

onMounted(async () => {
  await indexedDBService.init()
  await customComponentManager.init()
  await versionManager.init()
  
  await store.loadCustomComponents()
  
  const id = route.params.id as string
  if (id) {
    const form = await indexedDBService.getForm(id)
    if (form) {
      store.loadForm(form)
      await store.loadVersions()
    } else {
      ElMessage.warning('表单不存在，已创建新表单')
      store.initNewForm()
    }
  } else {
    store.initNewForm()
  }
})

function goBack() {
  router.push('/forms')
}

function handlePreview() {
  if (!store.currentForm) {
    ElMessage.warning('请先创建表单')
    return
  }
  if (!store.currentForm.id) {
    handleSave().then(() => {
      router.push(`/preview/${store.currentForm?.id}`)
    })
  } else {
    router.push(`/preview/${store.currentForm.id}`)
  }
}

function handleExport() {
  if (!store.currentForm) {
    ElMessage.warning('请先创建表单')
    return
  }
  const jsonStr = store.exportFormJSON()
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${store.currentForm.name}.json`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success('导出成功')
}

async function handleSave() {
  try {
    await store.saveToLocal()
    ElMessage.success('保存成功')
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

async function handleSaveWithVersion() {
  if (!store.currentForm) {
    ElMessage.warning('请先创建表单')
    return
  }
  
  try {
    const nextVersion = store.versions.length + 1
    const { value } = await ElMessageBox.prompt('请输入版本名称', '保存新版本', {
      confirmButtonText: '确认保存',
      cancelButtonText: '取消',
      inputPattern: /.+/,
      inputErrorMessage: '版本名称不能为空',
      inputValue: `版本 ${nextVersion}`,
    })
    
    const { value: descValue } = await ElMessageBox.prompt('请输入版本描述（可选）', '版本描述', {
      confirmButtonText: '确认',
      cancelButtonText: '跳过',
      inputType: 'textarea',
      inputValidator: () => true,
    }).catch(() => ({ value: '' }))
    
    const version = await store.saveWithVersion(
      value as string,
      descValue as string
    )
    
    if (version) {
      ElMessage.success(`版本 v${version.version} 保存成功`)
    }
  } catch {
  }
}

function handleVersionRestored() {
  ElMessage.info('版本已恢复，请记得保存当前修改')
}

async function handlePublish() {
  if (!store.currentForm || store.currentForm.fields.length === 0) {
    ElMessage.warning('请先添加表单字段')
    return
  }
  try {
    await handleSave()
    const response = await store.publishForm()
    if (response.success) {
      ElMessage.success(`发布成功！访问链接: ${response.data?.publishUrl}`)
    } else {
      ElMessage.error(response.message)
    }
  } catch (error) {
    ElMessage.error('发布失败')
  }
}
</script>
