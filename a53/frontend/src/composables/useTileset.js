import { ref, computed } from 'vue'

export function useTileset() {
  const tilesetImage = ref(null)
  const tilesetUrl = ref(null)
  const tileWidth = ref(32)
  const tileHeight = ref(32)
  const tilesetColumns = ref(1)
  const tilesetRows = ref(1)
  const loaded = ref(false)

  const totalTiles = computed(() => tilesetColumns.value * tilesetRows.value)

  const loadTileset = async (url, tw = 32, th = 32) => {
    tilesetUrl.value = url
    tileWidth.value = tw
    tileHeight.value = th
    
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        tilesetImage.value = img
        tilesetColumns.value = Math.floor(img.width / tw)
        tilesetRows.value = Math.floor(img.height / th)
        loaded.value = true
        resolve(img)
      }
      img.onerror = () => {
        reject(new Error('Failed to load tileset'))
      }
      img.src = url
    })
  }

  const getTileSourceRect = (tileId) => {
    if (tileId === null || tileId < 0 || tileId >= totalTiles.value) {
      return null
    }
    
    const col = tileId % tilesetColumns.value
    const row = Math.floor(tileId / tilesetColumns.value)
    
    return {
      sx: col * tileWidth.value,
      sy: row * tileHeight.value,
      sw: tileWidth.value,
      sh: tileHeight.value
    }
  }

  const drawTile = (ctx, tileId, x, y, size) => {
    if (!tilesetImage.value) return
    
    const src = getTileSourceRect(tileId)
    if (!src) return
    
    ctx.drawImage(
      tilesetImage.value,
      src.sx, src.sy, src.sw, src.sh,
      x, y, size, size
    )
  }

  const clearTileset = () => {
    tilesetImage.value = null
    tilesetUrl.value = null
    tilesetColumns.value = 1
    tilesetRows.value = 1
    loaded.value = false
  }

  return {
    tilesetImage,
    tilesetUrl,
    tileWidth,
    tileHeight,
    tilesetColumns,
    tilesetRows,
    totalTiles,
    loaded,
    loadTileset,
    getTileSourceRect,
    drawTile,
    clearTileset
  }
}
