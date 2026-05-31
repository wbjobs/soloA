<template>
  <div class="sidebar-section">
    <h3>瓦片集</h3>
    
    <div class="form-group">
      <label style="display: flex; align-items: center; gap: 0.5rem;">
        <input
          type="checkbox"
          v-model="useSlicing"
          @change="toggleSlicing"
        />
        <span>使用自动切分</span>
      </label>
    </div>
    
    <div v-if="useSlicing && !tilesetData" class="slicing-panel">
      <div class="form-group">
        <label>瓦片宽度</label>
        <input
          type="number"
          class="form-control"
          v-model.number="sliceWidth"
          min="8"
          max="256"
        />
      </div>
      
      <div class="form-group">
        <label>瓦片高度</label>
        <input
          type="number"
          class="form-control"
          v-model.number="sliceHeight"
          min="8"
          max="256"
        />
      </div>
      
      <div class="map-size-inputs">
        <div class="form-group">
          <label>左边距</label>
          <input
            type="number"
            class="form-control"
            v-model.number="sliceMargin"
            min="0"
            max="64"
          />
        </div>
        <div class="form-group">
          <label>间距</label>
          <input
            type="number"
            class="form-control"
            v-model.number="sliceSpacing"
            min="0"
            max="64"
          />
        </div>
      </div>
      
      <div class="form-group">
        <label style="display: flex; align-items: center; gap: 0.5rem;">
          <input type="checkbox" v-model="removeEmptyTiles" />
          <span>过滤空瓦片</span>
        </label>
      </div>
    </div>
    
    <div
      v-if="!tilesetUrl && !tilesetData"
      class="upload-area"
      @click="triggerUpload"
      @dragover.prevent="isDragOver = true"
      @dragleave="isDragOver = false"
      @drop.prevent="onDrop"
      :class="{ 'drag-over': isDragOver }"
    >
      <p>点击或拖拽上传瓦片集图片</p>
      <input
        type="file"
        ref="fileInput"
        class="file-input"
        accept="image/*"
        @change="onFileSelect"
      />
    </div>
    
    <div v-if="isProcessing" style="margin-top: 0.75rem;">
      <div class="progress-bar">
        <div class="progress-fill" style="width: 100%;"></div>
        <div class="progress-text">处理中...</div>
      </div>
    </div>
    
    <div v-if="tilesetData" class="tileset-preview">
      <img :src="tilesetData.original_path" alt="Tileset" />
      <p>已切分: {{ tilesetData.saved_tiles }} 个瓦片 (共 {{ tilesetData.total_tiles }})</p>
      <p style="margin-top: 0.25rem; font-size: 0.7rem;">
        网格: {{ Math.ceil(Math.sqrt(tilesetData.saved_tiles)) }} x {{ Math.ceil(Math.sqrt(tilesetData.saved_tiles)) }}
      </p>
    </div>
    
    <div v-else-if="tilesetUrl" class="tileset-preview">
      <img :src="tilesetUrl" alt="Tileset" />
      <p>尺寸: {{ tilesetColumns }} x {{ tilesetRows }} = {{ totalTiles }} 个瓦片</p>
    </div>
    
    <div class="form-group" v-if="tilesetUrl && !tilesetData">
      <label>瓦片宽度</label>
      <input
        type="number"
        class="form-control"
        v-model.number="localTileWidth"
        @change="updateTileSize"
        min="8"
        max="128"
      />
    </div>
    
    <div class="form-group" v-if="tilesetUrl && !tilesetData">
      <label>瓦片高度</label>
      <input
        type="number"
        class="form-control"
        v-model.number="localTileHeight"
        @change="updateTileSize"
        min="8"
        max="128"
      />
    </div>
    
    <div v-if="hasTiles" class="form-group">
      <label>选择瓦片</label>
      <div class="tile-picker">
        <div
          v-for="(tile, index) in displayTiles"
          :key="tile.id"
          class="tile-item"
          :class="{ selected: selectedTileId === tile.id }"
          @click="selectTile(tile.id)"
        >
          <canvas
            v-if="!tilesetData"
            :ref="el => tileCanvases[index] = el"
            :width="48"
            :height="48"
          ></canvas>
          <img
            v-else
            :src="tile.path"
            :alt="'Tile ' + tile.id"
            style="width: 100%; height: 100%; object-fit: contain;"
          />
        </div>
      </div>
    </div>
    
    <button v-if="hasTiles" class="btn btn-secondary" @click="clearTileset" style="width: 100%; margin-top: 0.5rem;">
      清除瓦片集
    </button>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, computed } from 'vue'

const props = defineProps({
  tilesetUrl: String,
  tileWidth: Number,
  tileHeight: Number,
  tilesetColumns: Number,
  tilesetRows: Number,
  tilesetImage: Object,
  selectedTileId: Number
})

const emit = defineEmits(['upload', 'select', 'clear', 'update-size', 'sliced'])

const fileInput = ref(null)
const isDragOver = ref(false)
const localTileWidth = ref(32)
const localTileHeight = ref(32)
const tileCanvases = ref([])
const isProcessing = ref(false)

const useSlicing = ref(false)
const sliceWidth = ref(32)
const sliceHeight = ref(32)
const sliceMargin = ref(0)
const sliceSpacing = ref(0)
const removeEmptyTiles = ref(true)
const tilesetData = ref(null)

const totalTiles = computed(() => {
  return (props.tilesetColumns || 1) * (props.tilesetRows || 1)
})

const hasTiles = computed(() => {
  if (tilesetData.value) {
    return tilesetData.value.saved_tiles > 0
  }
  return props.tilesetUrl && totalTiles.value > 0
})

const displayTiles = computed(() => {
  if (tilesetData.value && tilesetData.value.tiles) {
    return tilesetData.value.tiles
  }
  
  const tiles = []
  const cols = props.tilesetColumns || 1
  const rows = props.tilesetRows || 1
  for (let i = 0; i < cols * rows; i++) {
    tiles.push({ id: i })
  }
  return tiles
})

watch(() => props.tileWidth, (val) => {
  localTileWidth.value = val || 32
})

watch(() => props.tileHeight, (val) => {
  localTileHeight.value = val || 32
})

watch(() => props.tilesetImage, () => {
  if (!tilesetData.value) {
    nextTick(() => {
      renderTilePreview()
    })
  }
})

const toggleSlicing = () => {
  if (useSlicing.value && !tilesetData.value) {
    tilesetData.value = null
  }
}

const triggerUpload = () => {
  fileInput.value?.click()
}

const onFileSelect = async (e) => {
  const file = e.target.files?.[0]
  if (file) {
    await handleUpload(file)
  }
  e.target.value = ''
}

const onDrop = async (e) => {
  isDragOver.value = false
  const file = e.dataTransfer.files?.[0]
  if (file && file.type.startsWith('image/')) {
    await handleUpload(file)
  }
}

const handleUpload = async (file) => {
  isProcessing.value = true
  
  try {
    if (useSlicing.value) {
      const { sliceTileset } = await import('../composables/useAPI').then(m => m.useAPI())
      
      const result = await sliceTileset(file, {
        tileWidth: sliceWidth.value,
        tileHeight: sliceHeight.value,
        margin: sliceMargin.value,
        spacing: sliceSpacing.value,
        removeEmpty: removeEmptyTiles.value
      })
      
      if (result.success) {
        tilesetData.value = result
        emit('sliced', result)
        
        emit('upload', file, result)
      }
    } else {
      emit('upload', file)
    }
  } catch (error) {
    console.error('Upload failed:', error)
    alert('上传失败: ' + (error.response?.data?.detail || error.message))
  } finally {
    isProcessing.value = false
  }
}

const selectTile = (tileId) => {
  emit('select', tileId)
}

const updateTileSize = () => {
  emit('update-size', localTileWidth.value, localTileHeight.value)
}

const clearTileset = () => {
  tilesetData.value = null
  emit('clear')
}

const renderTilePreview = () => {
  if (!props.tilesetImage || tilesetData.value) return
  
  tileCanvases.value.forEach((canvas, index) => {
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, 48, 48)
    
    const col = index % (props.tilesetColumns || 1)
    const row = Math.floor(index / (props.tilesetColumns || 1))
    
    ctx.drawImage(
      props.tilesetImage,
      col * (props.tileWidth || 32),
      row * (props.tileHeight || 32),
      props.tileWidth || 32,
      props.tileHeight || 32,
      0, 0, 48, 48
    )
  })
}
</script>

<style scoped>
.slicing-panel {
  padding: 0.75rem;
  background: var(--bg-dark);
  border: 1px solid var(--border);
  border-radius: 4px;
  margin-bottom: 0.75rem;
}
</style>
