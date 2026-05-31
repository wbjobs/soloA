<template>
  <el-drawer
    v-model="drawerVisible"
    title="版本管理"
    size="500px"
    :before-close="handleClose"
  >
    <div v-if="!store.currentForm" style="text-align: center; padding: 40px">
      <el-empty description="请先打开或创建一个表单" />
    </div>

    <div v-else>
      <div style="margin-bottom: 16px; display: flex; gap: 8px">
        <el-button type="primary" @click="saveNewVersion" :loading="saving">
          <el-icon><Plus /></el-icon>
          保存新版本
        </el-button>
        <el-button @click="refreshVersions">
          <el-icon><Refresh /></el-icon>
          刷新
        </el-button>
      </div>

      <div v-if="store.versions.length === 0" style="text-align: center; padding: 40px">
        <el-empty description="暂无版本历史，点击上方按钮保存第一个版本" />
      </div>

      <div v-else>
        <el-timeline>
          <el-timeline-item
            v-for="version in store.versions"
            :key="version.id"
            :timestamp="formatTime(version.createdAt)"
            placement="top"
          >
            <el-card shadow="hover" :class="{ 'version-current': isCurrentVersion(version) }">
              <div style="display: flex; justify-content: space-between; align-items: flex-start">
                <div>
                  <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px">
                    <el-tag size="small" type="primary" style="margin-right: 8px">
                      v{{ version.version }}
                    </el-tag>
                    {{ version.name }}
                    <el-tag v-if="isCurrentVersion(version)" size="small" type="success" style="margin-left: 8px">
                      当前
                    </el-tag>
                  </div>
                  <div v-if="version.description" style="font-size: 12px; color: #909399; margin-top: 4px">
                    {{ version.description }}
                  </div>
                </div>
                <div style="display: flex; gap: 4px">
                  <el-button
                    type="primary"
                    size="small"
                    link
                    @click="restoreVersion(version)"
                    :disabled="isCurrentVersion(version)"
                  >
                    恢复
                  </el-button>
                  <el-button
                    type="danger"
                    size="small"
                    link
                    @click="confirmDelete(version)"
                  >
                    删除
                  </el-button>
                </div>
              </div>
            </el-card>
          </el-timeline-item>
        </el-timeline>
      </div>
    </div>
  </el-drawer>

  <el-dialog
    v-model="saveDialogVisible"
    title="保存新版本"
    width="400px"
  >
    <el-form label-width="80px">
      <el-form-item label="版本名称">
        <el-input v-model="newVersionName" placeholder="例如：初始版本" />
      </el-form-item>
      <el-form-item label="版本描述">
        <el-input
          v-model="newVersionDesc"
          type="textarea"
          :rows="3"
          placeholder="描述本次修改的内容"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="saveDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="confirmSaveVersion" :loading="saving">确认保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useFormEditorStore } from '@/stores/formEditor'
import dayjs from 'dayjs'
import type { FormVersion } from '@/types/extensions'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'restored'): void
}>()

const drawerVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const store = useFormEditorStore()
const saveDialogVisible = ref(false)
const newVersionName = ref('')
const newVersionDesc = ref('')
const saving = ref(false)

watch(
  () => props.visible,
  async (val) => {
    if (val) {
      await refreshVersions()
    }
  }
)

function formatTime(timestamp: number): string {
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')
}

function isCurrentVersion(version: FormVersion): boolean {
  if (!store.currentForm) return false
  return version.createdAt >= store.currentForm.updatedAt
}

async function refreshVersions() {
  await store.loadVersions()
}

function saveNewVersion() {
  if (!store.currentForm) return
  const nextVersion = store.versions.length + 1
  newVersionName.value = `版本 ${nextVersion}`
  newVersionDesc.value = ''
  saveDialogVisible.value = true
}

async function confirmSaveVersion() {
  if (!store.currentForm) return
  
  saving.value = true
  try {
    const version = await store.saveWithVersion(
      newVersionName.value,
      newVersionDesc.value
    )
    if (version) {
      ElMessage.success('版本保存成功')
      saveDialogVisible.value = false
    }
  } catch (error) {
    ElMessage.error('版本保存失败')
  } finally {
    saving.value = false
  }
}

async function restoreVersion(version: FormVersion) {
  try {
    await ElMessageBox.confirm(
      `确定要恢复到版本 "v${version.version} - ${version.name}" 吗？当前未保存的修改将会丢失。`,
      '确认恢复',
      { type: 'warning' }
    )
    
    const success = await store.restoreVersion(version.id)
    if (success) {
      ElMessage.success('版本恢复成功')
      emit('restored')
    } else {
      ElMessage.error('版本恢复失败')
    }
  } catch {
  }
}

async function confirmDelete(version: FormVersion) {
  try {
    await ElMessageBox.confirm(
      `确定要删除版本 "v${version.version} - ${version.name}" 吗？此操作不可恢复。`,
      '确认删除',
      { type: 'warning' }
    )
    
    await store.deleteVersion(version.id)
    ElMessage.success('版本删除成功')
  } catch {
  }
}

function handleClose() {
  emit('update:visible', false)
}
</script>

<style scoped>
.version-current {
  border: 2px solid #67c23a !important;
}
</style>
