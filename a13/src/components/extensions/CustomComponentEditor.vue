<template>
  <el-dialog
    v-model="dialogVisible"
    title="自定义组件编辑器"
    width="1200px"
    :close-on-click-modal="false"
  >
    <el-tabs v-model="activeTab">
      <el-tab-pane label="基本信息" name="basic">
        <el-form label-width="100px">
          <el-form-item label="组件名称">
            <el-input v-model="form.name" placeholder="组件唯一标识（英文）" />
          </el-form-item>
          <el-form-item label="显示名称">
            <el-input v-model="form.label" placeholder="在组件库中显示的名称" />
          </el-form-item>
          <el-form-item label="图标">
            <el-select v-model="form.icon" placeholder="选择图标" style="width: 200px">
              <el-option
                v-for="icon in availableIcons"
                :key="icon"
                :label="icon"
                :value="icon"
              >
                <span style="display: flex; align-items: center; gap: 8px">
                  <el-icon><component :is="icon" /></el-icon>
                  {{ icon }}
                </span>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item label="描述">
            <el-input
              v-model="form.description"
              type="textarea"
              :rows="2"
              placeholder="组件功能描述"
            />
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="模板" name="template">
        <div style="margin-bottom: 12px">
          <el-tag type="info">使用 Vue 模板语法，可使用 <code v-pre>{{ modelValue }}</code> 和 <code v-pre>{{ field }}</code></el-tag>
        </div>
        <el-input
          v-model="form.template"
          type="textarea"
          :rows="12"
          placeholder="例如：&#10;&lt;div class='custom-component'&gt;&#10;  &lt;el-input v-model='modelValue' :placeholder='field.placeholder' /&gt;&#10;&lt;/div&gt;"
          style="font-family: 'Consolas', 'Monaco', monospace; font-size: 13px"
        />
        <div style="margin-top: 12px">
          <el-text type="secondary" size="small">
            可用变量：modelValue（绑定值）、field（字段配置）
          </el-text>
        </div>
      </el-tab-pane>

      <el-tab-pane label="逻辑" name="script">
        <div style="margin-bottom: 12px">
          <el-tag type="info">可选：定义 setup 函数</el-tag>
        </div>
        <el-input
          v-model="form.script"
          type="textarea"
          :rows="12"
          placeholder="function setup(props, { emit }) {&#10;  const handleChange = (val) => {&#10;    emit('update:modelValue', val)&#10;    emit('change', val)&#10;  }&#10;  return { handleChange }&#10;}"
          style="font-family: 'Consolas', 'Monaco', monospace; font-size: 13px"
        />
      </el-tab-pane>

      <el-tab-pane label="属性定义" name="props">
        <div style="margin-bottom: 12px">
          <el-button type="primary" size="small" @click="addProp">+ 添加属性</el-button>
        </div>
        <div v-for="(prop, index) in form.props" :key="index" class="validation-rule-item">
          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
            <el-input
              v-model="prop.name"
              placeholder="属性名"
              size="small"
              style="width: 120px"
            />
            <el-select v-model="prop.type" placeholder="类型" size="small" style="width: 100px">
              <el-option label="字符串" value="string" />
              <el-option label="数字" value="number" />
              <el-option label="布尔" value="boolean" />
              <el-option label="对象" value="object" />
              <el-option label="数组" value="array" />
            </el-select>
            <el-input
              v-model="prop.label"
              placeholder="显示名称"
              size="small"
              style="width: 120px"
            />
            <el-input
              v-model="prop.defaultValue"
              placeholder="默认值"
              size="small"
              style="width: 120px"
            />
            <el-checkbox v-model="prop.required" size="small">必填</el-checkbox>
            <el-button type="danger" size="small" link @click="removeProp(index)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>
        <div v-if="!form.props || form.props.length === 0" style="color: #909399; font-size: 13px">
          暂无自定义属性
        </div>
      </el-tab-pane>

      <el-tab-pane label="预览" name="preview">
        <div style="border: 1px solid #dcdfe6; border-radius: 4px; padding: 24px; min-height: 200px">
          <div v-if="previewError" style="color: #f56c6c; margin-bottom: 16px">
            {{ previewError }}
          </div>
          <div v-else-if="previewComponent">
            <component
              :is="previewComponent"
              :field="previewField"
              :model-value="previewValue"
              @update:model-value="previewValue = $event"
            />
          </div>
          <div v-else style="color: #909399; text-align: center; padding: 40px">
            点击"预览"按钮查看效果
          </div>
        </div>
        <div style="margin-top: 16px">
          <el-button type="primary" @click="testPreview">预览组件</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button type="primary" @click="handleSave" :loading="saving">保存组件</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, markRaw, shallowRef, computed } from 'vue'
import { ElMessage } from 'element-plus'
import type { CustomComponent } from '@/types/extensions'
import { customComponentManager } from '@/utils/customComponentManager'
import type { FormField } from '@/types/form'

const props = defineProps<{
  visible: boolean
  editComponent?: CustomComponent | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'saved', component: CustomComponent): void
}>()

const dialogVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val)
})

const activeTab = ref('basic')
const saving = ref(false)
const previewComponent = shallowRef<any>(null)
const previewError = ref('')
const previewValue = ref('测试值')
const previewField: FormField = {
  id: 'preview',
  type: 'input',
  label: '预览字段',
  fieldName: 'preview',
  placeholder: '请输入...',
  required: false,
  disabled: false,
  hidden: false,
  validation: [],
  linkage: [],
  props: {},
}

const availableIcons = [
  'Edit', 'Document', 'Calculator', 'ArrowDown', 'Radio', 'Check',
  'Calendar', 'Date', 'Timer', 'Switch', 'Star', 'Slider', 'Upload',
  'Grid', 'MoreFilled', 'MagicStick', 'Tools', 'Picture', 'Money',
  'Location', 'Phone', 'Message', 'User', 'Connection', 'Setting'
]

const defaultForm: Omit<CustomComponent, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'myComponent',
  label: '我的组件',
  icon: 'MagicStick',
  description: '自定义组件',
  template: `<div class="custom-wrapper">
  <el-input 
    v-model="modelValue" 
    :placeholder="field.placeholder || '请输入'" 
    clearable
  />
</div>`,
  script: '',
  props: [],
  events: [],
}

const form = ref<Omit<CustomComponent, 'id' | 'createdAt' | 'updatedAt'>>({ ...defaultForm })

watch(
  () => props.visible,
  (val) => {
    if (val) {
      if (props.editComponent) {
        form.value = { ...props.editComponent }
      } else {
        form.value = { ...defaultForm }
      }
      activeTab.value = 'basic'
      previewComponent.value = null
      previewError.value = ''
    }
  }
)

function addProp() {
  if (!form.value.props) {
    form.value.props = []
  }
  form.value.props.push({
    name: '',
    type: 'string',
    label: '',
    defaultValue: '',
    required: false,
  })
}

function removeProp(index: number) {
  if (form.value.props) {
    form.value.props.splice(index, 1)
  }
}

function testPreview() {
  previewError.value = ''
  previewComponent.value = null
  
  try {
    const testComponent: CustomComponent = {
      id: 'test_preview',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...form.value,
    }
    
    const compiled = customComponentManager.compileComponent(testComponent)
    previewComponent.value = markRaw(compiled)
    ElMessage.success('组件编译成功')
  } catch (error: any) {
    previewError.value = `编译错误: ${error.message}`
    ElMessage.error('组件编译失败')
  }
}

async function handleSave() {
  if (!form.value.name || !form.value.label) {
    ElMessage.warning('请填写组件名称和显示名称')
    return
  }
  
  if (!form.value.template || !form.value.template.trim()) {
    ElMessage.warning('请填写组件模板')
    return
  }
  
  saving.value = true
  try {
    const testComponent: CustomComponent = {
      id: 'test_save',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...form.value,
    }
    customComponentManager.compileComponent(testComponent)
    
    let component: CustomComponent
    if (props.editComponent) {
      component = {
        ...props.editComponent,
        ...form.value,
      }
    } else {
      component = customComponentManager.createComponent(
        form.value.name,
        form.value.label,
        form.value.template,
        form.value.script,
        {
          icon: form.value.icon,
          description: form.value.description,
          props: form.value.props,
          events: form.value.events,
        }
      )
    }
    
    await customComponentManager.saveComponent(component)
    ElMessage.success('组件保存成功')
    emit('saved', component)
    handleCancel()
  } catch (error: any) {
    ElMessage.error(`保存失败: ${error.message}`)
  } finally {
    saving.value = false
  }
}

function handleCancel() {
  emit('update:visible', false)
}
</script>
