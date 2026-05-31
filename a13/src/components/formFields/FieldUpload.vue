<template>
  <el-upload
    :file-list="modelValue"
    @update:file-list="$emit('update:modelValue', $event)"
    :action="field.props?.action || '#/mock-upload'"
    :multiple="field.props?.multiple"
    :limit="field.props?.limit"
    :accept="field.props?.accept"
    :disabled="field.disabled"
    :auto-upload="false"
    list-type="text"
  >
    <el-button type="primary">上传文件</el-button>
    <template #tip>
      <div class="el-upload__tip" v-if="field.props?.accept">
        仅支持 {{ field.props?.accept }} 格式
      </div>
    </template>
  </el-upload>
</template>

<script setup lang="ts">
import type { UploadUserFile } from 'element-plus'
import type { FormField } from '@/types/form'

defineProps<{
  field: FormField
  modelValue: UploadUserFile[]
}>()

defineEmits<{
  (e: 'update:modelValue', value: UploadUserFile[]): void
}>()
</script>
