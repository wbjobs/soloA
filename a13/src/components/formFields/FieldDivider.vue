<template>
  <el-divider :content-position="field.props?.contentPosition || 'center'">
    <span v-if="field.label">{{ field.label }}</span>
  </el-divider>
</template>

<script setup lang="ts">
import type { FormField } from '@/types/form'

defineProps<{
  field: FormField
}>()
</script>
