import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { FormSchema, FormField, FormData, FormResponse, FieldType } from '@/types/form'
import type { CustomComponent, FormVersion } from '@/types/extensions'
import { createField } from '@/utils/fieldFactory'
import { v4 as uuidv4 } from 'uuid'
import { indexedDBService } from '@/utils/indexedDB'
import { apiService } from '@/utils/api'
import { customComponentManager } from '@/utils/customComponentManager'
import { versionManager } from '@/utils/versionManager'

export const useFormEditorStore = defineStore('formEditor', () => {
  const currentForm = ref<FormSchema | null>(null)
  const selectedFieldId = ref<string | null>(null)
  const formList = ref<FormSchema[]>([])
  const customComponents = ref<CustomComponent[]>([])
  const versions = ref<FormVersion[]>([])

  const selectedField = computed(() => {
    if (!currentForm.value || !selectedFieldId.value) return null
    return currentForm.value.fields.find((f) => f.id === selectedFieldId.value) || null
  })

  const fieldCount = computed(() => currentForm.value?.fields.length || 0)
  const hasCustomComponents = computed(() => customComponents.value.length > 0)
  const hasVersions = computed(() => versions.value.length > 0)

  function createNewForm(): FormSchema {
    const now = Date.now()
    return {
      id: `form_${uuidv4().slice(0, 12)}`,
      name: '新建表单',
      description: '',
      fields: [],
      createdAt: now,
      updatedAt: now,
      isPublished: false,
    }
  }

  function initNewForm() {
    currentForm.value = createNewForm()
    selectedFieldId.value = null
    versions.value = []
  }

  function loadForm(form: FormSchema) {
    currentForm.value = JSON.parse(JSON.stringify(form))
    selectedFieldId.value = null
  }

  function selectField(fieldId: string | null) {
    selectedFieldId.value = fieldId
  }

  function addField(type: FormField['type'], index?: number) {
    if (!currentForm.value) initNewForm()
    const newField = createField(type, currentForm.value!.fields.length)
    if (index !== undefined && index >= 0) {
      currentForm.value!.fields.splice(index, 0, newField)
    } else {
      currentForm.value!.fields.push(newField)
    }
    selectedFieldId.value = newField.id
  }

  function addCustomField(customComponentId: string, index?: number) {
    if (!currentForm.value) initNewForm()
    const customComp = customComponents.value.find((c) => c.id === customComponentId)
    if (!customComp || !currentForm.value) return

    const customField: FormField = {
      id: `field_${uuidv4().slice(0, 8)}`,
      type: `custom_${customComponentId}` as FieldType,
      label: `${customComp.label}${currentForm.value.fields.length + 1}`,
      fieldName: `custom_${customComponentId}_${currentForm.value.fields.length + 1}`,
      required: false,
      disabled: false,
      hidden: false,
      validation: [],
      linkage: [],
      props: {
        customComponentId,
        customProps: {},
      },
    }

    if (index !== undefined && index >= 0) {
      currentForm.value.fields.splice(index, 0, customField)
    } else {
      currentForm.value.fields.push(customField)
    }
    selectedFieldId.value = customField.id
  }

  function moveField(fromIndex: number, toIndex: number) {
    if (!currentForm.value) return
    const fields = currentForm.value.fields
    if (fromIndex < 0 || fromIndex >= fields.length || toIndex < 0 || toIndex >= fields.length) return
    const [field] = fields.splice(fromIndex, 1)
    fields.splice(toIndex, 0, field)
  }

  function removeField(fieldId: string) {
    if (!currentForm.value) return
    const index = currentForm.value.fields.findIndex((f) => f.id === fieldId)
    if (index > -1) {
      currentForm.value.fields.splice(index, 1)
      if (selectedFieldId.value === fieldId) {
        selectedFieldId.value = null
      }
    }
  }

  function duplicateField(fieldId: string) {
    if (!currentForm.value) return
    const field = currentForm.value.fields.find((f) => f.id === fieldId)
    if (!field) return
    const newField = JSON.parse(JSON.stringify(field)) as FormField
    newField.id = `field_${uuidv4().slice(0, 8)}`
    newField.fieldName = `${field.fieldName}_copy`
    const index = currentForm.value.fields.findIndex((f) => f.id === fieldId)
    currentForm.value.fields.splice(index + 1, 0, newField)
    selectedFieldId.value = newField.id
  }

  function updateField(fieldId: string, updates: Partial<FormField>) {
    if (!currentForm.value) return
    const field = currentForm.value.fields.find((f) => f.id === fieldId)
    if (field) {
      Object.assign(field, updates)
    }
  }

  function updateCurrentForm(updates: Partial<FormSchema>) {
    if (!currentForm.value) return
    Object.assign(currentForm.value, updates)
    currentForm.value.updatedAt = Date.now()
  }

  function addValidationRule(fieldId: string) {
    if (!currentForm.value) return
    const field = currentForm.value.fields.find((f) => f.id === fieldId)
    if (field) {
      if (!field.validation) field.validation = []
      field.validation.push({
        type: 'required',
        message: '此字段为必填项',
      })
    }
  }

  function removeValidationRule(fieldId: string, ruleIndex: number) {
    if (!currentForm.value) return
    const field = currentForm.value.fields.find((f) => f.id === fieldId)
    if (field && field.validation) {
      field.validation.splice(ruleIndex, 1)
    }
  }

  function addLinkageRule(fieldId: string) {
    if (!currentForm.value) return
    const field = currentForm.value.fields.find((f) => f.id === fieldId)
    if (field) {
      if (!field.linkage) field.linkage = []
      field.linkage.push({
        id: `linkage_${uuidv4().slice(0, 8)}`,
        targetFieldId: fieldId,
        type: 'show',
        condition: {
          fieldId: currentForm.value.fields[0]?.id || fieldId,
          operator: '==',
          value: '',
        },
      })
    }
  }

  function removeLinkageRule(fieldId: string, ruleId: string) {
    if (!currentForm.value) return
    const field = currentForm.value.fields.find((f) => f.id === fieldId)
    if (field && field.linkage) {
      const index = field.linkage.findIndex((l) => l.id === ruleId)
      if (index > -1) {
        field.linkage.splice(index, 1)
      }
    }
  }

  async function saveToLocal(): Promise<void> {
    if (!currentForm.value) return
    await indexedDBService.saveForm(currentForm.value)
  }

  async function saveWithVersion(versionName?: string, versionDesc?: string): Promise<FormVersion | null> {
    if (!currentForm.value) return null
    await saveToLocal()
    const version = await versionManager.saveVersion(currentForm.value, {
      name: versionName,
      description: versionDesc,
    })
    await loadVersions()
    return version
  }

  async function loadFormList(): Promise<void> {
    formList.value = await indexedDBService.getAllForms()
    formList.value.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async function loadVersions(): Promise<void> {
    if (!currentForm.value) {
      versions.value = []
      return
    }
    versions.value = await versionManager.getVersions(currentForm.value.id)
  }

  async function restoreVersion(versionId: string): Promise<boolean> {
    const form = await versionManager.restoreVersion(versionId)
    if (form) {
      loadForm(form)
      await saveToLocal()
      return true
    }
    return false
  }

  async function deleteVersion(versionId: string): Promise<void> {
    await versionManager.deleteVersion(versionId)
    await loadVersions()
  }

  async function deleteForm(id: string): Promise<void> {
    await indexedDBService.deleteForm(id)
    await versionManager.deleteAllVersions(id)
    if (currentForm.value?.id === id) {
      currentForm.value = null
      selectedFieldId.value = null
      versions.value = []
    }
    await loadFormList()
  }

  async function publishForm(): Promise<FormResponse> {
    if (!currentForm.value) {
      return { success: false, message: '没有可发布的表单' }
    }
    try {
      const response = await apiService.publishForm(currentForm.value)
      if (response.success) {
        currentForm.value.isPublished = true
        currentForm.value.publishUrl = response.data?.publishUrl
        await saveToLocal()
      }
      return response
    } catch (error) {
      return { success: false, message: '发布失败' }
    }
  }

  async function submitFormData(formId: string, data: FormData): Promise<FormResponse> {
    try {
      const form = await indexedDBService.getForm(formId)
      if (!form) {
        return { success: false, message: '表单不存在' }
      }
      if (form.submitUrl) {
        return await apiService.submitToCustomUrl(form.submitUrl, data)
      }
      return await apiService.submitFormData(formId, data)
    } catch (error) {
      return { success: false, message: '提交失败' }
    }
  }

  function exportFormJSON(): string {
    if (!currentForm.value) return ''
    return JSON.stringify(currentForm.value, null, 2)
  }

  async function importFormJSON(jsonStr: string): Promise<void> {
    const form = await indexedDBService.importFormJSON(jsonStr)
    await indexedDBService.saveForm(form)
    loadForm(form)
    await loadFormList()
  }

  function getAvailableFields(excludeId?: string): FormField[] {
    if (!currentForm.value) return []
    return currentForm.value.fields.filter((f) => f.id !== excludeId && f.type !== 'divider')
  }

  async function validateField(fieldName: string, value: any): Promise<FormResponse> {
    return await apiService.validateField(fieldName, value)
  }

  async function loadCustomComponents(): Promise<void> {
    await customComponentManager.init()
    customComponents.value = await customComponentManager.getAllComponents()
  }

  async function saveCustomComponent(component: CustomComponent): Promise<void> {
    await customComponentManager.saveComponent(component)
    await loadCustomComponents()
  }

  async function deleteCustomComponent(id: string): Promise<void> {
    await customComponentManager.deleteComponent(id)
    await loadCustomComponents()
  }

  function getCustomComponent(id: string): CustomComponent | undefined {
    return customComponents.value.find((c) => c.id === id)
  }

  function clearAllCaches(): void {
    customComponentManager.clearCache()
  }

  return {
    currentForm,
    selectedFieldId,
    selectedField,
    fieldCount,
    formList,
    customComponents,
    versions,
    hasCustomComponents,
    hasVersions,
    createNewForm,
    initNewForm,
    loadForm,
    selectField,
    addField,
    addCustomField,
    moveField,
    removeField,
    duplicateField,
    updateField,
    updateCurrentForm,
    addValidationRule,
    removeValidationRule,
    addLinkageRule,
    removeLinkageRule,
    saveToLocal,
    saveWithVersion,
    loadFormList,
    loadVersions,
    restoreVersion,
    deleteVersion,
    deleteForm,
    publishForm,
    submitFormData,
    exportFormJSON,
    importFormJSON,
    getAvailableFields,
    validateField,
    loadCustomComponents,
    saveCustomComponent,
    deleteCustomComponent,
    getCustomComponent,
    clearAllCaches,
  }
})
