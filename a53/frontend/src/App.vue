<template>
  <div id="app">
    <header class="header">
      <h1>像素风地图编辑器</h1>
      <div class="actions">
        <button class="btn btn-secondary" @click="importMapJSON">导入地图</button>
        <button class="btn btn-primary" @click="exportMapJSON">导出 JSON</button>
        <button class="btn btn-danger" @click="confirmClear">清空</button>
      </div>
    </header>
    
    <div class="main-container">
      <aside class="sidebar">
        <LayerPanel
          :layers="mapEditor.layers"
          :activeLayer="mapEditor.activeLayer"
          :visibleLayers="mapEditor.visibleLayers"
          :mapConfig="mapEditor.mapConfig"
          @select-layer="mapEditor.activeLayer = $event"
          @toggle-visibility="mapEditor.toggleLayerVisibility"
          @resize="handleResize"
          @tile-size-change="mapEditor.mapConfig.tileSize = $event"
        />
        
        <TilesetPicker
          :tilesetUrl="tileset.tilesetUrl"
          :tileWidth="tileset.tileWidth"
          :tileHeight="tileset.tileHeight"
          :tilesetColumns="tileset.tilesetColumns"
          :tilesetRows="tileset.tilesetRows"
          :tilesetImage="tileset.tilesetImage"
          :selectedTileId="mapEditor.selectedTileId"
          @upload="handleTilesetUpload"
          @select="mapEditor.selectedTileId = $event"
          @clear="handleClearTileset"
          @update-size="handleTilesetSize"
        />
        
        <LightPanel
          :lightSources="mapEditor.lightSources"
          :mapConfig="mapEditor.mapConfig"
          @add="mapEditor.addLightSource"
          @remove="mapEditor.removeLightSource"
          @update="(i, l) => mapEditor.updateLightSource(i, l)"
        />
        
        <BakePanel
          :canBake="mapEditor.lightSources.length > 0"
          @bake="handleBake"
          @batch-bake="handleBatchBake"
        />
      </aside>
      
      <main class="editor-area">
        <div class="editor-toolbar">
          <button
            class="tool-btn"
            :class="{ active: mapEditor.currentTool === 'paint' }"
            @click="mapEditor.currentTool = 'paint'"
          >
            ✏️ 绘制
          </button>
          <button
            class="tool-btn"
            :class="{ active: mapEditor.currentTool === 'erase' }"
            @click="mapEditor.currentTool = 'erase'"
          >
            🗑️ 擦除
          </button>
          <div style="flex: 1;"></div>
          <span style="font-size: 0.8125rem; color: var(--text-muted);">
            瓦片: {{ mapEditor.tiles.length }} | 光源: {{ mapEditor.lightSources.length }}
          </span>
        </div>
        
        <MapCanvas
          :mapConfig="mapEditor.mapConfig"
          :tiles="mapEditor.tiles"
          :lightSources="mapEditor.lightSources"
          :activeLayer="mapEditor.activeLayer"
          :visibleLayers="mapEditor.visibleLayers"
          :selectedTileId="mapEditor.selectedTileId"
          :currentTool="mapEditor.currentTool"
          :tilesetData="tileset"
          @paint="handlePaint"
          @erase="mapEditor.eraseTile"
          @add-light="mapEditor.addLightSource"
        />
      </main>
    </div>
    
    <footer class="status-bar">
      <span>当前图层: {{ getActiveLayerName() }}</span>
      <span>地图尺寸: {{ mapEditor.mapConfig.width }} x {{ mapEditor.mapConfig.height }}</span>
      <span>选中瓦片: {{ mapEditor.selectedTileId === null ? '无' : '#' + mapEditor.selectedTileId }}</span>
    </footer>
    
    <input
      type="file"
      ref="importInput"
      class="file-input"
      accept=".json"
      @change="handleImportFile"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'

import MapCanvas from './components/MapCanvas.vue'
import LayerPanel from './components/LayerPanel.vue'
import TilesetPicker from './components/TilesetPicker.vue'
import LightPanel from './components/LightPanel.vue'
import BakePanel from './components/BakePanel.vue'

import { useMapEditor } from './composables/useMapEditor'
import { useTileset } from './composables/useTileset'
import { useAPI } from './composables/useAPI'

const mapEditor = useMapEditor()
const tileset = useTileset()
const api = useAPI()

const importInput = ref(null)

const getActiveLayerName = () => {
  const layer = mapEditor.layers.find(l => l.id === mapEditor.activeLayer)
  return layer ? layer.name : mapEditor.activeLayer
}

const handleResize = (width, height) => {
  if (confirm('调整地图大小可能会删除超出范围的瓦片和光源，是否继续?')) {
    mapEditor.resizeMap(width, height)
  }
}

const handleTilesetUpload = async (file) => {
  try {
    const result = await api.uploadTileset(file)
    if (result.success) {
      await tileset.loadTileset(result.url)
      mapEditor.tileset.value = result.url
    }
  } catch (error) {
    console.error('Upload failed:', error)
    alert('上传失败: ' + (error.response?.data?.detail || error.message))
  }
}

const handleTilesetSize = async (w, h) => {
  if (tileset.tilesetUrl.value) {
    await tileset.loadTileset(tileset.tilesetUrl.value, w, h)
  }
}

const handleClearTileset = () => {
  tileset.clearTileset()
  mapEditor.tileset.value = null
  mapEditor.selectedTileId.value = null
}

const handlePaint = (x, y) => {
  const tileId = mapEditor.activeLayer.value === 'background' 
    ? mapEditor.selectedTileId.value 
    : 1
  
  if (tileId !== null && tileId !== undefined) {
    mapEditor.setTile(x, y, tileId)
  }
}

const handleBake = async (ambientLight, onProgress, onComplete, onError) => {
  try {
    const mapData = mapEditor.exportMapData()
    const bakeResponse = await api.startBake(mapData, ambientLight)
    
    if (!bakeResponse.success) {
      onError(new Error('Failed to start bake'))
      return
    }
    
    const taskId = bakeResponse.task_id
    
    const pollProgress = setInterval(async () => {
      try {
        const status = await api.getTaskStatus(taskId)
        onProgress(status.progress)
        
        if (status.status === 'completed') {
          clearInterval(pollProgress)
          onComplete(status.result)
        } else if (status.status === 'failed') {
          clearInterval(pollProgress)
          onError(new Error(status.error || 'Bake failed'))
        }
      } catch (e) {
        console.error('Progress check failed:', e)
      }
    }, 500)
  } catch (error) {
    onError(error)
  }
}

const handleBatchBake = async (batchMaps, ambientLight, onProgress, onComplete, onError) => {
  try {
    const maps = batchMaps.map(item => ({
      name: item.name,
      mapData: item.mapData
    }))
    
    const bakeResponse = await api.startBatchBake(maps, ambientLight)
    
    if (!bakeResponse.success) {
      onError(new Error('Failed to start batch bake'))
      return
    }
    
    const taskId = bakeResponse.task_id
    
    const pollProgress = setInterval(async () => {
      try {
        const status = await api.getTaskStatus(taskId)
        
        if (status.isBatch && status.batch) {
          onProgress(status.progress, {
            total: status.batch.total,
            completed: status.batch.completed,
            currentIndex: status.batch.currentIndex,
            currentName: status.batch.currentName,
            currentProgress: status.batch.currentProgress,
            results: status.batch.results,
            errors: status.batch.errors
          })
        } else {
          onProgress(status.progress, null)
        }
        
        if (status.status === 'completed') {
          clearInterval(pollProgress)
          onComplete(status.result)
        } else if (status.status === 'failed') {
          clearInterval(pollProgress)
          onError(new Error(status.error || 'Batch bake failed'))
        }
      } catch (e) {
        console.error('Batch progress check failed:', e)
      }
    }, 500)
  } catch (error) {
    onError(error)
  }
}

const exportMapJSON = () => {
  const mapData = mapEditor.exportMapData()
  const jsonStr = JSON.stringify(mapData, null, 2)
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  
  const a = document.createElement('a')
  a.href = url
  a.download = 'map_' + Date.now() + '.json'
  a.click()
  URL.revokeObjectURL(url)
}

const importMapJSON = () => {
  importInput.value?.click()
}

const handleImportFile = async (e) => {
  const file = e.target.files?.[0]
  if (!file) return
  
  const text = await file.text()
  try {
    const data = JSON.parse(text)
    mapEditor.importMapData(data)
    
    if (data.tileset) {
      await tileset.loadTileset(data.tileset)
    }
  } catch (error) {
    console.error('Import failed:', error)
    alert('导入失败: ' + error.message)
  }
  
  e.target.value = ''
}

const confirmClear = () => {
  if (confirm('确定要清空地图吗? 此操作不可撤销。')) {
    mapEditor.clearMap()
  }
}
</script>
