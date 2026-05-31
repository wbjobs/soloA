import { ref, reactive, computed } from 'vue'

export function useMapEditor() {
  const mapConfig = reactive({
    width: 20,
    height: 15,
    tileSize: 32
  })

  const tiles = ref([])
  const lightSources = ref([])
  const tileset = ref(null)

  const activeLayer = ref('background')
  const visibleLayers = ref(['background', 'collision', 'light'])
  const selectedTileId = ref(null)
  const currentTool = ref('paint')

  const layers = [
    { id: 'background', name: '背景层', color: '#4a90d9' },
    { id: 'collision', name: '碰撞层', color: '#e74c3c' },
    { id: 'light', name: '光照层', color: '#f39c12' }
  ]

  const getTileAt = (x, y, layer) => {
    return tiles.value.find(t => 
      t.x === x && t.y === y && t.layer === layer
    )
  }

  const setTile = (x, y, tileId = null, properties = {}) => {
    if (x < 0 || x >= mapConfig.width || y < 0 || y >= mapConfig.height) return
    
    const existingIndex = tiles.value.findIndex(t => 
      t.x === x && t.y === y && t.layer === activeLayer.value
    )
    
    if (tileId === null) {
      if (existingIndex !== -1) {
        tiles.value.splice(existingIndex, 1)
      }
    } else {
      const newTile = {
        x,
        y,
        layer: activeLayer.value,
        tileId,
        properties
      }
      
      if (existingIndex !== -1) {
        tiles.value[existingIndex] = newTile
      } else {
        tiles.value.push(newTile)
      }
    }
  }

  const eraseTile = (x, y) => {
    const index = tiles.value.findIndex(t => 
      t.x === x && t.y === y && t.layer === activeLayer.value
    )
    if (index !== -1) {
      tiles.value.splice(index, 1)
    }
  }

  const addLightSource = (x, y) => {
    lightSources.value.push({
      x,
      y,
      intensity: 1.0,
      color: '#ffffff',
      radius: 5.0
    })
  }

  const removeLightSource = (index) => {
    lightSources.value.splice(index, 1)
  }

  const updateLightSource = (index, updates) => {
    Object.assign(lightSources.value[index], updates)
  }

  const isLayerVisible = (layerId) => {
    return visibleLayers.value.includes(layerId)
  }

  const toggleLayerVisibility = (layerId) => {
    const index = visibleLayers.value.indexOf(layerId)
    if (index === -1) {
      visibleLayers.value.push(layerId)
    } else {
      visibleLayers.value.splice(index, 1)
    }
  }

  const exportMapData = () => {
    const tilesData = tiles.value.map(t => ({
      x: t.x,
      y: t.y,
      layer: t.layer,
      tileId: t.tileId,
      properties: t.properties || {}
    }))
    
    const lightSourcesData = lightSources.value.map(l => ({
      x: l.x,
      y: l.y,
      intensity: l.intensity,
      color: l.color,
      radius: l.radius
    }))
    
    return {
      width: mapConfig.width,
      height: mapConfig.height,
      tileSize: mapConfig.tileSize,
      layers: layers.map(l => l.id),
      tiles: tilesData,
      lightSources: lightSourcesData,
      tileset: tileset.value
    }
  }

  const importMapData = (data) => {
    if (data.width) mapConfig.width = data.width
    if (data.height) mapConfig.height = data.height
    if (data.tileSize) mapConfig.tileSize = data.tileSize
    if (data.tiles) tiles.value = data.tiles
    if (data.lightSources) lightSources.value = data.lightSources
    if (data.tileset) tileset.value = data.tileset
  }

  const clearMap = () => {
    tiles.value = []
    lightSources.value = []
  }

  const resizeMap = (newWidth, newHeight) => {
    tiles.value = tiles.value.filter(t => 
      t.x < newWidth && t.y < newHeight
    )
    lightSources.value = lightSources.value.filter(l => 
      l.x < newWidth && l.y < newHeight
    )
    mapConfig.width = newWidth
    mapConfig.height = newHeight
  }

  return {
    mapConfig,
    tiles,
    lightSources,
    tileset,
    activeLayer,
    visibleLayers,
    selectedTileId,
    currentTool,
    layers,
    getTileAt,
    setTile,
    eraseTile,
    addLightSource,
    removeLightSource,
    updateLightSource,
    isLayerVisible,
    toggleLayerVisibility,
    exportMapData,
    importMapData,
    clearMap,
    resizeMap
  }
}
