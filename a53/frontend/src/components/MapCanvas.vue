<template>
  <div class="editor-canvas-container" ref="containerRef">
    <canvas
      ref="canvasRef"
      class="editor-canvas"
      :width="canvasWidth"
      :height="canvasHeight"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
    ></canvas>
  </div>
</template>

<script setup>import { ref, watch, onMounted, nextTick } from 'vue';
const props = defineProps({
 mapConfig: Object,
 tiles: Array,
 lightSources: Array,
 activeLayer: String,
 visibleLayers: Array,
 selectedTileId: { type: Number, default: null },
 currentTool: { type: String, default: 'paint' },
 tilesetData: Object
});
const emit = defineEmits(['paint', 'erase', 'add-light']);
const canvasRef = ref(null);
const containerRef = ref(null);
const isPainting = ref(false);
const canvasWidth = ref(640);
const canvasHeight = ref(480);
const layerColors = {
 background: 'rgba(74, 144, 217, 0.3)',
 collision: 'rgba(231, 76, 60, 0.5)',
 light: 'rgba(243, 156, 18, 0.3)'
};
watch(() => props.mapConfig, () => {
 updateCanvasSize();
 render();
}, { deep: true });
watch(() => props.tiles, () => {
 render();
}, { deep: true });
watch(() => props.lightSources, () => {
 render();
}, { deep: true });
watch(() => props.visibleLayers, () => {
 render();
}, { deep: true });
watch(() => props.activeLayer, () => {
 render();
});
const updateCanvasSize = () => {
 if (!props.mapConfig)
 return;
 canvasWidth.value = props.mapConfig.width * props.mapConfig.tileSize;
 canvasHeight.value = props.mapConfig.height * props.mapConfig.tileSize;
};
const getTileCoordinates = (e) => {
 const canvas = canvasRef.value;
 if (!canvas || !props.mapConfig)
 return null;
 const rect = canvas.getBoundingClientRect();
 const scaleX = canvasWidth.value / rect.width;
 const scaleY = canvasHeight.value / rect.height;
 const x = Math.floor((e.clientX - rect.left) * scaleX / props.mapConfig.tileSize);
 const y = Math.floor((e.clientY - rect.top) * scaleY / props.mapConfig.tileSize);
 if (x < 0 || x >= props.mapConfig.width || y < 0 || y >= props.mapConfig.height) {
 return null;
 }
 return { x, y };
};
const onMouseDown = (e) => {
 const coords = getTileCoordinates(e);
 if (!coords)
 return;
 isPainting.value = true;
 handleAction(coords);
};
const onMouseMove = (e) => {
 if (!isPainting.value)
 return;
 const coords = getTileCoordinates(e);
 if (!coords)
 return;
 handleAction(coords);
};
const onMouseUp = () => {
 isPainting.value = false;
};
const handleAction = (coords) => {
 if (props.currentTool === 'paint') {
 if (props.activeLayer === 'light') {
 emit('add-light', coords.x + 0.5, coords.y + 0.5);
 }
 else {
 emit('paint', coords.x, coords.y);
 }
 }
 else if (props.currentTool === 'erase') {
 emit('erase', coords.x, coords.y);
 }
};
const render = () => {
 const canvas = canvasRef.value;
 if (!canvas || !props.mapConfig)
 return;
 const ctx = canvas.getContext('2d');
 const { width, height, tileSize } = props.mapConfig;
 ctx.clearRect(0, 0, canvasWidth.value, canvasHeight.value);
 drawGrid(ctx, width, height, tileSize);
 const layersToDraw = ['background', 'collision', 'light'];
 for (const layer of layersToDraw) {
 if (!props.visibleLayers.includes(layer))
 continue;
 drawTilesForLayer(ctx, layer, tileSize);
 }
 drawLightSources(ctx, tileSize);
 drawActiveLayerIndicator(ctx, tileSize);
};
const drawGrid = (ctx, width, height, tileSize) => {
 ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
 ctx.lineWidth = 1;
 for (let x = 0; x <= width; x++) {
 ctx.beginPath();
 ctx.moveTo(x * tileSize, 0);
 ctx.lineTo(x * tileSize, height * tileSize);
 ctx.stroke();
 }
 for (let y = 0; y <= height; y++) {
 ctx.beginPath();
 ctx.moveTo(0, y * tileSize);
 ctx.lineTo(width * tileSize, y * tileSize);
 ctx.stroke();
 }
};
const drawTilesForLayer = (ctx, layer, tileSize) => {
 const layerTiles = props.tiles.filter(t => t.layer === layer);
 for (const tile of layerTiles) {
 const x = tile.x * tileSize;
 const y = tile.y * tileSize;
 if (layer === 'background' && props.tilesetData && props.tilesetData.drawTile) {
 if (tile.tileId !== null && tile.tileId !== undefined) {
 props.tilesetData.drawTile(ctx, tile.tileId, x, y, tileSize);
 }
 }
 else {
 ctx.fillStyle = layerColors[layer] || 'rgba(255, 255, 255, 0.3)';
 ctx.fillRect(x, y, tileSize, tileSize);
 if (layer === 'collision') {
 ctx.strokeStyle = '#e74c3c';
 ctx.lineWidth = 2;
 ctx.strokeRect(x + 2, y + 2, tileSize - 4, tileSize - 4);
 }
 }
 }
};
const drawLightSources = (ctx, tileSize) => {
 if (!props.visibleLayers.includes('light'))
 return;
 for (const light of props.lightSources) {
 const cx = light.x * tileSize;
 const cy = light.y * tileSize;
 const radius = light.radius * tileSize;
 const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
 gradient.addColorStop(0, light.color + '80');
 gradient.addColorStop(0.5, light.color + '40');
 gradient.addColorStop(1, light.color + '00');
 ctx.fillStyle = gradient;
 ctx.beginPath();
 ctx.arc(cx, cy, radius, 0, Math.PI * 2);
 ctx.fill();
 ctx.fillStyle = light.color;
 ctx.beginPath();
 ctx.arc(cx, cy, 4, 0, Math.PI * 2);
 ctx.fill();
 ctx.strokeStyle = '#ffffff';
 ctx.lineWidth = 1;
 ctx.stroke();
 }
};
const drawActiveLayerIndicator = (ctx, tileSize) => {
 if (!props.visibleLayers.includes(props.activeLayer))
 return;
 if (props.activeLayer === 'background' || props.activeLayer === 'collision') {
 ctx.strokeStyle = props.activeLayer === 'background' ? '#4a90d9' : '#e74c3c';
 ctx.setLineDash([4, 4]);
 ctx.lineWidth = 2;
 ctx.strokeRect(1, 1, canvasWidth.value - 2, canvasHeight.value - 2);
 ctx.setLineDash([]);
 }
};
onMounted(() => {
 updateCanvasSize();
 nextTick(() => {
 render();
 });
});
</script>
