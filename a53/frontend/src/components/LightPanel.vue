<template>
  <div class="sidebar-section">
    <h3>光照源</h3>
    
    <button
      class="btn btn-secondary"
      @click="addNewLight"
      :disabled="!canAdd"
      style="width: 100%; margin-bottom: 0.75rem;"
    >
      + 添加光照源
    </button>
    
    <div v-if="lightSources.length === 0" class="tileset-preview">
      <p>暂无光照源</p>
      <p style="margin-top: 0.25rem; font-size: 0.7rem;">在光照层点击画布添加</p>
    </div>
    
    <div v-else class="light-source-list">
      <div
        v-for="(light, index) in lightSources"
        :key="index"
        class="light-source-item"
      >
        <div class="light-source-header">
          <span style="font-size: 0.8125rem;">光源 #{{ index + 1 }}</span>
          <span class="remove" @click="removeLight(index)">删除</span>
        </div>
        
        <div class="light-source-props">
          <div class="form-group" style="margin-bottom: 0;">
            <label>X</label>
            <input
              type="number"
              class="form-control"
              v-model.number="light.x"
              step="0.5"
              @change="updateLight(index)"
            />
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label>Y</label>
            <input
              type="number"
              class="form-control"
              v-model.number="light.y"
              step="0.5"
              @change="updateLight(index)"
            />
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label>强度</label>
            <input
              type="number"
              class="form-control"
              v-model.number="light.intensity"
              min="0"
              max="3"
              step="0.1"
              @change="updateLight(index)"
            />
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label>半径</label>
            <input
              type="number"
              class="form-control"
              v-model.number="light.radius"
              min="1"
              max="20"
              step="0.5"
              @change="updateLight(index)"
            />
          </div>
          <div class="form-group" style="margin-bottom: 0; grid-column: span 2;">
            <label style="display: flex; align-items: center; gap: 0.5rem;">
              颜色
              <input
                type="color"
                class="color-input"
                v-model="light.color"
                @change="updateLight(index)"
              />
              <span style="font-family: monospace;">{{ light.color }}</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  lightSources: Array,
  mapConfig: Object
})

const emit = defineEmits(['add', 'remove', 'update'])

const canAdd = computed(() => {
  return props.lightSources && props.lightSources.length < 10
})

const addNewLight = () => {
  if (props.mapConfig) {
    const centerX = props.mapConfig.width / 2
    const centerY = props.mapConfig.height / 2
    emit('add', centerX, centerY)
  }
}

const removeLight = (index) => {
  emit('remove', index)
}

const updateLight = (index) => {
  emit('update', index, props.lightSources[index])
}
</script>
