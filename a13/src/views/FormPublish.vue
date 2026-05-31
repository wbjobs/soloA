<template>
  <div style="min-height: 100vh; background: var(--bg-color); padding: 40px; display: flex; justify-content: center">
    <div class="preview-container" style="max-width: 600px; text-align: center">
      <div v-if="loading" style="padding: 60px">
        <el-loading text="加载表单中..." />
      </div>

      <div v-else-if="!form">
        <el-empty description="表单不存在或已下线" />
      </div>

      <template v-else>
        <el-result icon="success" title="表单发布成功">
          <template #sub-title>
            您的表单已成功发布，可以通过以下链接访问
          </template>
          <template #extra>
            <div style="background: #f5f7fa; padding: 16px; border-radius: 8px; margin-bottom: 24px">
              <el-input :value="publishUrl" readonly>
                <template #append>
                  <el-button @click="copyUrl">复制链接</el-button>
                </template>
              </el-input>
            </div>
            <div style="display: flex; gap: 12px; justify-content: center">
              <el-button type="primary" @click="goToPreview">
                <el-icon><View /></el-icon>
                预览表单
              </el-button>
              <el-button @click="goToEditor">
                <el-icon><EditPen /></el-icon>
                继续编辑
              </el-button>
            </div>
          </template>
        </el-result>

        <el-divider>表单信息</el-divider>

        <el-descriptions :column="1" border>
          <el-descriptions-item label="表单名称">{{ form.name }}</el-descriptions-item>
          <el-descriptions-item label="表单描述">{{ form.description || '无' }}</el-descriptions-item>
          <el-descriptions-item label="字段数量">{{ form.fields.length }}</el-descriptions-item>
          <el-descriptions-item label="发布状态">
            <el-tag type="success">已发布</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="提交地址">
            {{ form.submitUrl || '使用默认提交地址' }}
          </el-descriptions-item>
        </el-descriptions>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormSchema } from '@/types/form'
import { indexedDBService } from '@/utils/indexedDB'

const route = useRoute()
const router = useRouter()
const loading = ref(true)
const form = ref<FormSchema | null>(null)

const publishUrl = computed(() => {
  if (!form.value) return ''
  return form.value.publishUrl || `https://forms.example.com/f/${form.value.id}`
})

onMounted(async () => {
  await indexedDBService.init()
  const id = route.params.id as string
  const loadedForm = await indexedDBService.getForm(id)
  form.value = loadedForm || null
  loading.value = false
})

function copyUrl() {
  navigator.clipboard.writeText(publishUrl.value)
    .then(() => {
      ElMessage.success('链接已复制到剪贴板')
    })
    .catch(() => {
      ElMessage.warning('复制失败，请手动复制')
    })
}

function goToPreview() {
  if (form.value) {
    router.push(`/preview/${form.value.id}`)
  }
}

function goToEditor() {
  if (form.value) {
    router.push(`/editor/${form.value.id}`)
  }
}
</script>
