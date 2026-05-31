<template>
  <div class="sidebar-section">
    <h3>图层</h3>
    <div class="layer-list">
      <div
        v-for="layer in layers"
        :key="layer.id"
        class="layer-item"
        :class="{ active: activeLayer === layer.id }"
        @click="selectLayer(layer.id)"
      >
        <input
          type="checkbox"
          :checked="isVisible(layer.id)"
          @click.stop
          @change="toggleVisibility(layer.id)"
        />
        <span class="layer-name" :style="{ color: layer.color }">{{ layer.name }}</span>
      </div>
    </div>
    
    <div class="form-group" style="margin-top: 1rem;">
      <label>地图尺寸</label>
      <div class="map-size-inputs">
        <div>
          <label style="font-size: 0.7rem; margin-bottom: 0.125rem;">宽度</label>
          <input
            type="number"
            class="form-control"
            v-model.number="localWidth"
            @change="onResize"
            min="4"
            max="100"
          />
        </div>
        <div>
          <label style="font-size: 0.7rem; margin-bottom: 0.125rem;">高度</label>
          <input
            type="number"
            class="form-control"
            v-model.number="localHeight"
            @change="onResize"
            min="4"
            max="100"
          />
        </div>
      </div>
    </div>
    
    <div class="form-group">
      <label>瓦片大小 (px)</label>
      <input
        type="number"
        class="form-control"
        v-model.number="localTileSize"
        @change="onTileSizeChange"
        min="8"
        max="64"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  layers: Array,
  activeLayer: String,
  visibleLayers: Array,
  mapConfig: Object
})

const emit = defineEmits(['select-layer', 'toggle-visibility', 'resize', 'tile-size-change'])

const localWidth = ref(props.mapConfig?.width || 20)
const localHeight = ref(props.mapConfig?.height || 15)
const localTileSize = ref(props.mapConfig?.tileSize || 32)

watch(() => props.mapConfig?.width, (val) => {
  localWidth.value = val || 20
})

watch(() => props.mapConfig?.height, (val) => {
  localHeight.value = val || 15
})

watch(() => props.mapConfig?.tileSize, (val) => {
  localTileSize.value = val || 32
})

const selectLayer = (layerId) => {
  emit('select-layer', layerId)
}

const isVisible = (layerId) => {
  return props.visibleLayers.includes(layerId)
}

const toggleVisibility = (layerId) => {
  emit('toggle-visibility', layerId)
}

const onResize = () => {
  emit('resize', localWidth.value, localHeight.value)
}

const onTileSizeChange = () => {
  emit('tile-size-change', localTileSize.value)
}
</script>
