<template>
  <div class="sidebar-section">
    <h3>光照烘焙</h3>
    
    <div class="bake-panel">
      <div class="form-group">
        <label style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
          <input
            type="checkbox"
            v-model="useBatch"
          />
          <span>批量烘焙</span>
        </label>
      </div>
      
      <div v-if="useBatch" class="batch-panel">
        <h4 style="font-size: 0.875rem; margin-bottom: 0.5rem;">批量设置</h4>
        
        <div
          class="upload-area"
          @click="triggerBatchUpload"
          @dragover.prevent="isBatchDragOver = true"
          @dragleave="isBatchDragOver = false"
          @drop.prevent="onBatchDrop"
          :class="{ 'drag-over': isBatchDragOver }"
          style="padding: 1rem;"
        >
          <p>点击或拖拽上传地图 JSON 文件</p>
          <p style="font-size: 0.7rem; margin-top: 0.25rem;">(支持多选)</p>
          <input
            type="file"
            ref="batchFileInput"
            class="file-input"
            accept=".json"
            multiple
            @change="onBatchFileSelect"
          />
        </div>
        
        <div v-if="batchMaps.length > 0" class="batch-list">
          <div
            v-for="(map, index) in batchMaps"
            :key="index"
            class="batch-item"
          >
            <span class="batch-item-name">{{ map.name }}</span>
            <span class="batch-item-remove" @click="removeBatchMap(index)">×</span>
          </div>
        </div>
        
        <div class="form-group" v-if="batchMaps.length > 0">
          <label>已选择 {{ batchMaps.length }} 个地图</label>
        </div>
      </div>
      
      <div class="form-group">
        <label>环境光强度: {{ ambientLight.toFixed(2) }}</label>
        <input
          type="range"
          class="form-control"
          v-model.number="ambientLight"
          min="0"
          max="1"
          step="0.05"
        />
      </div>
      
      <button
        class="btn btn-success"
        @click="startBake"
        :disabled="isBaking || !canStartBake"
        style="width: 100%;"
      >
        {{ getBakeButtonText() }}
      </button>
      
      <div v-if="isBaking" style="margin-top: 0.75rem;">
        <div v-if="isBatch" class="batch-progress">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progress * 100 + '%' }"></div>
            <div class="progress-text">{{ Math.round(progress * 100) }}%</div>
          </div>
          <p v-if="currentBatchInfo" style="font-size: 0.75rem; margin-top: 0.5rem; color: var(--text-muted);">
            正在处理: {{ currentBatchInfo.currentName }}
            ({{ currentBatchInfo.completed }}/{{ currentBatchInfo.total }})
          </p>
        </div>
        <div v-else class="progress-bar">
          <div class="progress-fill" :style="{ width: progress * 100 + '%' }"></div>
          <div class="progress-text">{{ Math.round(progress * 100) }}%</div>
        </div>
      </div>
      
      <div v-if="bakeResults.length > 0" class="bake-results">
        <p style="font-size: 0.875rem; margin-bottom: 0.5rem;">烘焙结果:</p>
        <div
          v-for="(result, index) in bakeResults"
          :key="index"
          class="bake-result"
        >
          <p v-if="result.name">{{ result.name }}</p>
          <div class="result-links">
            <a :href="result.lightmap_path" target="_blank">光照图</a>
            <a :href="result.json_path" target="_blank">地图 JSON</a>
          </div>
        </div>
      </div>
      
      <div v-if="batchErrors.length > 0" class="batch-errors">
        <p style="font-size: 0.875rem; margin-bottom: 0.5rem; color: var(--danger);">
          失败 ({{ batchErrors.length }}):
        </p>
        <div
          v-for="(error, index) in batchErrors"
          :key="index"
          class="error-item"
        >
          <span>{{ error.name }}: {{ error.error }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  canBake: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['bake', 'batch-bake'])

const ambientLight = ref(0.2)
const isBaking = ref(false)
const progress = ref(0)
const bakeResults = ref([])
const batchErrors = ref([])

const useBatch = ref(false)
const isBatch = ref(false)
const batchMaps = ref([])
const isBatchDragOver = ref(false)
const batchFileInput = ref(null)
const currentBatchInfo = ref(null)

const canStartBake = computed(() => {
  if (useBatch.value) {
    return batchMaps.value.length > 0
  }
  return props.canBake
})

const getBakeButtonText = () => {
  if (isBaking.value) {
    return useBatch.value ? '批量烘焙中...' : '烘焙中...'
  }
  return useBatch.value ? '开始批量烘焙' : '开始烘焙'
}

const triggerBatchUpload = () => {
  batchFileInput.value?.click()
}

const onBatchFileSelect = async (e) => {
  const files = e.target.files
  if (!files || files.length === 0) return
  
  for (const file of files) {
    await processBatchFile(file)
  }
  
  e.target.value = ''
}

const onBatchDrop = async (e) => {
  isBatchDragOver.value = false
  
  const files = Array.from(e.dataTransfer.files).filter(f => 
    f.type === 'application/json' || f.name.endsWith('.json')
  )
  
  for (const file of files) {
    await processBatchFile(file)
  }
}

const processBatchFile = async (file) => {
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    
    const hasLights = data.lightSources && data.lightSources.length > 0
    
    batchMaps.value.push({
      name: file.name.replace('.json', ''),
      mapData: data,
      hasLights
    })
  } catch (error) {
    console.error('Failed to parse file:', file.name, error)
  }
}

const removeBatchMap = (index) => {
  batchMaps.value.splice(index, 1)
}

const startBake = () => {
  if (isBaking.value) return
  
  isBaking.value = true
  progress.value = 0
  bakeResults.value = []
  batchErrors.value = []
  currentBatchInfo.value = null
  
  if (useBatch.value && batchMaps.value.length > 0) {
    isBatch.value = true
    emit('batch-bake', batchMaps.value, ambientLight.value, onProgress, onComplete, onError)
  } else {
    isBatch.value = false
    emit('bake', ambientLight.value, onProgress, onComplete, onError)
  }
}

const onProgress = (val, batchInfo) => {
  progress.value = val
  if (batchInfo) {
    currentBatchInfo.value = batchInfo
  }
}

const onComplete = (result) => {
  progress.value = 1
  isBaking.value = false
  
  if (isBatch.value && result.results) {
    bakeResults.value = result.results
    batchErrors.value = result.errors || []
  } else {
    bakeResults.value = [result]
  }
  
  isBatch.value = false
  currentBatchInfo.value = null
}

const onError = (error) => {
  console.error('Bake error:', error)
  isBaking.value = false
  progress.value = 0
  isBatch.value = false
  currentBatchInfo.value = null
}
</script>

<style scoped>
.batch-panel {
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}

.batch-list {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 120px;
  overflow-y: auto;
}

.batch-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem;
  background: var(--bg-dark);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.8125rem;
}

.batch-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-item-remove {
  color: var(--danger);
  cursor: pointer;
  font-size: 1.25rem;
  padding: 0 0.25rem;
  margin-left: 0.5rem;
}

.batch-progress {
  margin-top: 0.75rem;
}

.bake-results {
  margin-top: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.batch-errors {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}

.error-item {
  padding: 0.5rem;
  background: rgba(231, 76, 60, 0.1);
  border: 1px solid var(--danger);
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--danger);
}
</style>
