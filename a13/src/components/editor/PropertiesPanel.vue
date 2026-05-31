<template>
  <div class="properties-panel">
    <div v-if="!store.currentForm" class="empty-state">
      <el-empty description="请先创建或加载表单" />
    </div>

    <div v-else-if="!store.selectedField" class="form-settings">
      <div class="properties-section">
        <div class="section-title">
          <el-icon><Setting /></el-icon>
          表单设置
        </div>
        <div class="property-item">
          <div class="property-label">表单名称</div>
          <el-input
            v-model="store.currentForm.name"
            placeholder="请输入表单名称"
            @input="handleFormUpdate"
          />
        </div>
        <div class="property-item">
          <div class="property-label">表单描述</div>
          <el-input
            v-model="store.currentForm.description"
            type="textarea"
            :rows="3"
            placeholder="请输入表单描述"
            @input="handleFormUpdate"
          />
        </div>
        <div class="property-item">
          <div class="property-label">提交地址 (API URL)</div>
          <el-input
            v-model="store.currentForm.submitUrl"
            placeholder="https://api.example.com/submit"
            @input="handleFormUpdate"
          />
        </div>
      </div>

      <div class="properties-section">
        <div class="section-title">
          <el-icon><Document /></el-icon>
          表单信息
        </div>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="字段数量">{{ store.fieldCount }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatTime(store.currentForm.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ formatTime(store.currentForm.updatedAt) }}</el-descriptions-item>
          <el-descriptions-item label="发布状态">
            <el-tag :type="store.currentForm.isPublished ? 'success' : 'info'">
              {{ store.currentForm.isPublished ? '已发布' : '未发布' }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </div>

    <div v-else class="field-settings">
      <div class="properties-section">
        <div class="section-title">
          <el-icon><Edit /></el-icon>
          基础属性
        </div>
        <div class="property-item">
          <div class="property-label">字段标签</div>
          <el-input
            v-model="store.selectedField.label"
            placeholder="请输入字段标签"
            @input="handleFieldUpdate"
          />
        </div>
        <div class="property-item">
          <div class="property-label">字段名 (fieldName)</div>
          <el-input
            v-model="store.selectedField.fieldName"
            placeholder="请输入字段名"
            @input="handleFieldUpdate"
          />
        </div>
        <div class="property-item" v-if="hasPlaceholder(store.selectedField.type)">
          <div class="property-label">占位符</div>
          <el-input
            v-model="store.selectedField.placeholder"
            placeholder="请输入占位符"
            @input="handleFieldUpdate"
          />
        </div>
        <div class="property-item" v-if="hasDefaultValue(store.selectedField.type)">
          <div class="property-label">默认值</div>
          <component
            :is="getDefaultInput(store.selectedField.type)"
            v-model="store.selectedField.defaultValue"
            @change="handleFieldUpdate"
            style="width: 100%"
          />
        </div>
      </div>

      <div class="properties-section">
        <div class="section-title">
          <el-icon><Operation /></el-icon>
          状态控制
        </div>
        <div class="property-item">
          <el-checkbox v-model="store.selectedField.required" @change="handleFieldUpdate">必填</el-checkbox>
        </div>
        <div class="property-item">
          <el-checkbox v-model="store.selectedField.disabled" @change="handleFieldUpdate">禁用</el-checkbox>
        </div>
        <div class="property-item">
          <el-checkbox v-model="store.selectedField.hidden" @change="handleFieldUpdate">隐藏</el-checkbox>
        </div>
      </div>

      <div class="properties-section" v-if="hasOptions(store.selectedField.type)">
        <div class="section-title" style="justify-content: space-between">
          <span style="display: flex; align-items: center; gap: 6px">
            <el-icon><Menu /></el-icon>
            选项配置
          </span>
          <el-button type="primary" size="small" link @click="addOption">+ 添加</el-button>
        </div>
        <div
          v-for="(opt, index) in store.selectedField.options"
          :key="index"
          class="validation-rule-item"
        >
          <div style="display: flex; gap: 8px">
            <el-input
              v-model="opt.label"
              placeholder="标签"
              size="small"
              @input="handleFieldUpdate"
            />
            <el-input
              v-model="opt.value"
              placeholder="值"
              size="small"
              @input="handleFieldUpdate"
            />
            <el-button type="danger" size="small" link @click="removeOption(index)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
      </div>

      <div class="properties-section">
        <div class="section-title" style="justify-content: space-between">
          <span style="display: flex; align-items: center; gap: 6px">
            <el-icon><CircleCheck /></el-icon>
            校验规则
          </span>
          <el-button type="primary" size="small" link @click="store.addValidationRule(store.selectedField.id)">
            + 添加
          </el-button>
        </div>
        <div
          v-for="(rule, index) in store.selectedField.validation"
          :key="index"
          class="validation-rule-item"
        >
          <div style="display: flex; gap: 8px; margin-bottom: 8px">
            <el-select
              v-model="rule.type"
              size="small"
              placeholder="规则类型"
              @change="handleFieldUpdate"
            >
              <el-option label="必填" value="required" />
              <el-option label="正则匹配" value="pattern" />
              <el-option label="邮箱格式" value="email" />
              <el-option label="手机号格式" value="phone" />
              <el-option label="最小值" value="min" />
              <el-option label="最大值" value="max" />
              <el-option label="最小长度" value="minLength" />
              <el-option label="最大长度" value="maxLength" />
              <el-option label="自定义校验" value="custom" />
              <el-option label="异步校验" value="async" />
            </el-select>
            <el-button type="danger" size="small" link @click="store.removeValidationRule(store.selectedField.id, index)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <div v-if="rule.type === 'pattern'" class="property-item" style="margin-bottom: 8px">
            <div class="property-label">正则表达式</div>
            <el-input v-model="rule.pattern" size="small" placeholder="正则表达式" @input="handleFieldUpdate" />
          </div>
          <div v-if="['min', 'max', 'minLength', 'maxLength'].includes(rule.type)" class="property-item" style="margin-bottom: 8px">
            <div class="property-label">值</div>
            <el-input-number v-model="rule.value" size="small" :min="0" @change="handleFieldUpdate" />
          </div>
          <div v-if="rule.type === 'custom'" class="property-item" style="margin-bottom: 8px">
            <div class="property-label">校验函数 (validator)</div>
            <el-input
              v-model="rule.validator"
              type="textarea"
              :rows="3"
              size="small"
              placeholder="function(value) { return value === 'test' ? '错误消息' : '' }"
              @input="handleFieldUpdate"
            />
          </div>
          <div v-if="rule.type === 'async'" class="property-item" style="margin-bottom: 8px">
            <div class="property-label">异步校验函数</div>
            <el-input
              v-model="rule.asyncValidator"
              type="textarea"
              :rows="3"
              size="small"
              placeholder="async function(value) { ... }"
              @input="handleFieldUpdate"
            />
          </div>
          <div class="property-item">
            <div class="property-label">错误提示</div>
            <el-input v-model="rule.message" size="small" placeholder="错误提示信息" @input="handleFieldUpdate" />
          </div>
        </div>
      </div>

      <div class="properties-section">
        <div class="section-title" style="justify-content: space-between">
          <span style="display: flex; align-items: center; gap: 6px">
            <el-icon><Connection /></el-icon>
            联动规则
          </span>
          <el-button type="primary" size="small" link @click="store.addLinkageRule(store.selectedField.id)">
            + 添加
          </el-button>
        </div>
        <div
          v-for="rule in store.selectedField.linkage"
          :key="rule.id"
          class="linkage-rule-item"
        >
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px">
            <span style="font-size: 12px; color: #909399">联动条件</span>
            <el-button type="danger" size="small" link @click="store.removeLinkageRule(store.selectedField.id, rule.id)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <div style="display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap">
            <el-select
              v-model="rule.condition.fieldId"
              size="small"
              placeholder="触发字段"
              style="width: 100px"
              @change="handleFieldUpdate"
            >
              <el-option
                v-for="f in availableFields"
                :key="f.id"
                :label="f.label"
                :value="f.id"
              />
            </el-select>
            <el-select
              v-model="rule.condition.operator"
              size="small"
              placeholder="操作符"
              style="width: 100px"
              @change="handleFieldUpdate"
            >
              <el-option label="等于" value="==" />
              <el-option label="不等于" value="!=" />
              <el-option label="大于" value=">" />
              <el-option label="小于" value="<" />
              <el-option label="包含" value="contains" />
              <el-option label="在列表中" value="in" />
            </el-select>
            <el-input
              v-model="rule.condition.value"
              size="small"
              placeholder="条件值"
              style="width: 120px"
              @input="handleFieldUpdate"
            />
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap">
            <span style="font-size: 12px; color: #909399">执行操作:</span>
            <el-select
              v-model="rule.type"
              size="small"
              placeholder="操作类型"
              @change="handleFieldUpdate"
            >
              <el-option label="显示" value="show" />
              <el-option label="隐藏" value="hide" />
              <el-option label="设置值" value="setValue" />
              <el-option label="设置选项" value="setOptions" />
              <el-option label="启用" value="enable" />
              <el-option label="禁用" value="disable" />
            </el-select>
            <el-input
              v-if="rule.type === 'setValue'"
              v-model="rule.value"
              size="small"
              placeholder="设置的值"
              @input="handleFieldUpdate"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useFormEditorStore } from '@/stores/formEditor'
import dayjs from 'dayjs'
import type { FieldType } from '@/types/form'

const store = useFormEditorStore()

const availableFields = computed(() => {
  if (!store.selectedField) return []
  return store.getAvailableFields(store.selectedField.id)
})

function formatTime(timestamp: number): string {
  return dayjs(timestamp).format('YYYY-MM-DD HH:mm:ss')
}

function handleFormUpdate() {
  store.updateCurrentForm({})
}

function handleFieldUpdate() {
  if (store.selectedField) {
    store.updateField(store.selectedField.id, {})
  }
}

function hasPlaceholder(type: FieldType): boolean {
  return ['input', 'textarea', 'select', 'date', 'time'].includes(type)
}

function hasDefaultValue(type: FieldType): boolean {
  return ['input', 'textarea', 'number', 'select', 'radio', 'checkbox', 'switch', 'rate', 'slider'].includes(type)
}

function hasOptions(type: FieldType): boolean {
  return ['select', 'radio', 'checkbox'].includes(type)
}

function getDefaultInput(type: FieldType): string {
  if (type === 'number' || type === 'slider' || type === 'rate') return 'el-input-number'
  if (type === 'switch') return 'el-switch'
  return 'el-input'
}

function addOption() {
  if (!store.selectedField?.options) return
  const index = store.selectedField.options.length + 1
  store.selectedField.options.push({
    label: `选项${index}`,
    value: `option${index}`,
  })
  handleFieldUpdate()
}

function removeOption(index: number) {
  if (!store.selectedField?.options) return
  store.selectedField.options.splice(index, 1)
  handleFieldUpdate()
}
</script>
