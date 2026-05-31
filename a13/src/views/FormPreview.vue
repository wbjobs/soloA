<template>
  <div style="min-height: 100vh; background: var(--bg-color); padding: 24px">
    <div v-if="loading" style="text-align: center; padding: 100px">
      <el-loading text="加载中..." />
    </div>

    <div v-else-if="!form" style="text-align: center; padding: 100px">
      <el-empty description="表单不存在或已被删除">
        <el-button type="primary" @click="goBack">返回列表</el-button>
      </el-empty>
    </div>

    <div v-else class="preview-container">
      <h1 class="preview-title">{{ form.name }}</h1>
      <p class="preview-desc">{{ form.description || '请填写以下表单信息' }}</p>

      <el-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-width="120px"
        label-position="right"
      >
        <template v-for="field in visibleFields" :key="field.id">
          <PreviewFieldItem
            :field="field"
            :model-value="formData[field.fieldName]"
            :is-hidden="fieldHiddenState[field.id]"
            :is-disabled="fieldDisabledState[field.id]"
            @update:model-value="(val: any) => handleFieldChange(field, val)"
            @change="(val: any) => handleFieldChange(field, val)"
          />
        </template>

        <el-form-item style="margin-top: 32px">
          <el-button type="primary" size="large" @click="handleSubmit" :loading="submitting">
            提交表单
          </el-button>
          <el-button size="large" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, markRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import type { FormSchema, FormField, ValidationRule } from '@/types/form'
import { indexedDBService } from '@/utils/indexedDB'
import { useFormEditorStore } from '@/stores/formEditor'
import PreviewFieldItem from '@/components/preview/PreviewFieldItem.vue'

const route = useRoute()
const router = useRouter()
const store = useFormEditorStore()
const formRef = ref<FormInstance>()
const loading = ref(true)
const submitting = ref(false)
const form = ref<FormSchema | null>(null)
const formData = reactive<Record<string, any>>({})
const fieldHiddenState = reactive<Record<string, boolean>>({})
const fieldDisabledState = reactive<Record<string, boolean>>({})
const cachedValidators = new Map<string, any>()
const isEvaluatingLinkages = ref(false)

const fieldMap = computed(() => {
  if (!form.value) return new Map()
  const map = new Map<string, FormField>()
  form.value.fields.forEach((f) => map.set(f.id, f))
  return map
})

const visibleFields = computed(() => {
  if (!form.value) return []
  return form.value.fields.filter((f) => !fieldHiddenState[f.id] && !f.hidden)
})

const formRules = computed<FormRules>(() => {
  if (!form.value) return {}
  const rules: FormRules = {}
  
  form.value.fields.forEach((field) => {
    const fieldRules: any[] = []
    
    if (field.required) {
      const requiredRule: any = { required: true, message: `${field.label}不能为空` }
      if (['checkbox', 'daterange'].includes(field.type)) {
        requiredRule.type = 'array'
        requiredRule.message = `请至少选择一个${field.label}`
      } else if (field.type === 'number') {
        requiredRule.type = 'number'
      }
      fieldRules.push(requiredRule)
    }
    
    if (field.validation && field.validation.length > 0) {
      field.validation.forEach((rule, ruleIndex) => {
        const cacheKey = `${field.id}_${ruleIndex}`
        const cached = cachedValidators.get(cacheKey)
        if (cached && cached.ruleHash === getRuleHash(rule)) {
          fieldRules.push(cached.ruleObj)
          return
        }
        
        const ruleObj = buildValidationRule(rule, field)
        cachedValidators.set(cacheKey, {
          ruleHash: getRuleHash(rule),
          ruleObj: markRaw(ruleObj)
        })
        fieldRules.push(ruleObj)
      })
    }
    
    if (fieldRules.length > 0) {
      rules[field.fieldName] = fieldRules
    }
  })
  
  return rules
})

function getRuleHash(rule: ValidationRule): string {
  return JSON.stringify([
    rule.type, rule.value, rule.pattern, rule.message, rule.validator, rule.asyncValidator
  ])
}

function buildValidationRule(rule: ValidationRule, field: FormField): any {
  const ruleObj: any = { message: rule.message || '校验失败' }
  
  switch (rule.type) {
    case 'pattern':
      if (rule.pattern) {
        try {
          ruleObj.pattern = new RegExp(rule.pattern)
        } catch {
          ruleObj.pattern = /.*/
          ruleObj.message = '正则表达式无效'
        }
      }
      break
    case 'email':
      ruleObj.type = 'email'
      ruleObj.message = rule.message || '请输入正确的邮箱地址'
      break
    case 'phone':
      ruleObj.pattern = /^1[3-9]\d{9}$/
      ruleObj.message = rule.message || '请输入正确的手机号'
      break
    case 'min':
      ruleObj.type = field.type === 'number' ? 'number' : 'string'
      ruleObj.min = Number(rule.value) || 0
      ruleObj.message = rule.message || `不能小于${rule.value}`
      break
    case 'max':
      ruleObj.type = field.type === 'number' ? 'number' : 'string'
      ruleObj.max = Number(rule.value) || Infinity
      ruleObj.message = rule.message || `不能大于${rule.value}`
      break
    case 'minLength':
      ruleObj.min = Number(rule.value) || 0
      ruleObj.message = rule.message || `长度不能小于${rule.value}`
      break
    case 'maxLength':
      ruleObj.max = Number(rule.value) || Infinity
      ruleObj.message = rule.message || `长度不能大于${rule.value}`
      break
    case 'custom':
      if (rule.validator) {
        try {
          const fn = new Function('value', `return (${rule.validator})(value)`)
          ruleObj.validator = (_rule: any, value: any, callback: any) => {
            try {
              const result = fn(value)
              if (result) {
                callback(new Error(typeof result === 'string' ? result : rule.message || '校验失败'))
              } else {
                callback()
              }
            } catch {
              callback(new Error(rule.message || '自定义校验执行失败'))
            }
          }
        } catch {
          ruleObj.validator = (_rule: any, _value: any, callback: any) => {
            callback(new Error('校验函数配置错误'))
          }
        }
      }
      break
    case 'async':
      ruleObj.validator = async (_rule: any, value: any, callback: any) => {
        try {
          const result = await store.validateField(field.fieldName, value)
          if (!result || !result.success) {
            callback(new Error(result?.message || '异步校验失败'))
          } else {
            callback()
          }
        } catch {
          callback(new Error('异步校验执行失败'))
        }
      }
      break
    default:
      break
  }
  
  return ruleObj
}

onMounted(async () => {
  await indexedDBService.init()
  const id = route.params.id as string
  const loadedForm = await indexedDBService.getForm(id)
  if (loadedForm) {
    form.value = loadedForm
    initializeFormData(loadedForm)
    evaluateAllLinkages()
  }
  loading.value = false
})

function initializeFormData(frm: FormSchema) {
  frm.fields.forEach((field) => {
    if (formData[field.fieldName] === undefined) {
      formData[field.fieldName] = field.defaultValue !== undefined 
        ? field.defaultValue 
        : getDefaultValueForType(field.type)
    }
    fieldHiddenState[field.id] = false
    fieldDisabledState[field.id] = false
  })
}

function getDefaultValueForType(type: string): any {
  switch (type) {
    case 'checkbox':
    case 'table':
      return []
    case 'number':
    case 'slider':
    case 'rate':
      return 0
    case 'switch':
      return false
    case 'daterange':
      return null
    default:
      return ''
  }
}

let linkageDebounceTimer: number | null = null

function handleFieldChange(field: FormField, value: any) {
  formData[field.fieldName] = value
  
  if (linkageDebounceTimer) {
    clearTimeout(linkageDebounceTimer)
  }
  
  linkageDebounceTimer = window.setTimeout(() => {
    evaluateAllLinkages()
  }, 16)
}

function evaluateAllLinkages() {
  if (!form.value || isEvaluatingLinkages.value) return
  
  isEvaluatingLinkages.value = true
  
  try {
    const newHiddenState: Record<string, boolean> = { ...fieldHiddenState }
    const newDisabledState: Record<string, boolean> = { ...fieldDisabledState }
    const valueUpdates: Array<{ fieldName: string; value: any }> = []
    
    form.value.fields.forEach((field) => {
      if (!field.linkage || field.linkage.length === 0) return
      
      field.linkage.forEach((rule) => {
        const conditionField = fieldMap.value.get(rule.condition.fieldId)
        if (!conditionField) return
        
        const conditionValue = formData[conditionField.fieldName]
        const conditionMet = evaluateCondition(conditionValue, rule.condition.operator, rule.condition.value)
        
        switch (rule.type) {
          case 'show':
            newHiddenState[field.id] = !conditionMet
            break
          case 'hide':
            newHiddenState[field.id] = conditionMet
            break
          case 'enable':
            newDisabledState[field.id] = !conditionMet
            break
          case 'disable':
            newDisabledState[field.id] = conditionMet
            break
          case 'setValue':
            if (conditionMet) {
              valueUpdates.push({ fieldName: field.fieldName, value: rule.value })
            }
            break
        }
      })
    })
    
    Object.assign(fieldHiddenState, newHiddenState)
    Object.assign(fieldDisabledState, newDisabledState)
    
    valueUpdates.forEach(({ fieldName, value }) => {
      if (formData[fieldName] !== value) {
        formData[fieldName] = value
      }
    })
  } finally {
    isEvaluatingLinkages.value = false
  }
}

function evaluateCondition(value: any, operator: string, conditionValue: any): boolean {
  const normalizedValue = normalizeValue(value)
  const normalizedCondition = normalizeValue(conditionValue)
  
  switch (operator) {
    case '==':
      return normalizedValue == normalizedCondition
    case '!=':
      return normalizedValue != normalizedCondition
    case '>':
      return normalizedValue > normalizedCondition
    case '<':
      return normalizedValue < normalizedCondition
    case '>=':
      return normalizedValue >= normalizedCondition
    case '<=':
      return normalizedValue <= normalizedCondition
    case 'contains':
      if (Array.isArray(normalizedValue)) {
        return normalizedValue.includes(normalizedCondition)
      }
      return String(normalizedValue).includes(String(normalizedCondition))
    case 'in':
      if (Array.isArray(normalizedCondition)) {
        return normalizedCondition.includes(normalizedValue)
      }
      try {
        const arr = typeof normalizedCondition === 'string' 
          ? JSON.parse(normalizedCondition) 
          : normalizedCondition
        return Array.isArray(arr) && arr.includes(normalizedValue)
      } catch {
        return false
      }
    default:
      return false
  }
}

function normalizeValue(value: any): any {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!isNaN(Number(trimmed)) && trimmed !== '') {
      return Number(trimmed)
    }
    return trimmed
  }
  return value
}

async function handleSubmit() {
  if (!formRef.value || !form.value) return
  
  try {
    await formRef.value.validate()
  } catch {
    ElMessage.warning('请检查表单填写是否正确')
    return
  }
  
  submitting.value = true
  try {
    const response = await store.submitFormData(form.value.id, { ...formData })
    if (response.success) {
      ElMessage.success('提交成功！')
    } else {
      ElMessage.error(response.message)
    }
  } catch (error) {
    ElMessage.error('提交失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

function handleReset() {
  formRef.value?.resetFields()
  if (form.value) {
    Object.keys(formData).forEach((key) => {
      delete formData[key]
    })
    initializeFormData(form.value)
    cachedValidators.clear()
    evaluateAllLinkages()
  }
}

function goBack() {
  router.push('/forms')
}
</script>
