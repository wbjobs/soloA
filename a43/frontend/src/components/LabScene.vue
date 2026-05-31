<template>
  <div class="lab-scene-container">
    <div ref="sceneContainer" class="scene-container"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const emit = defineEmits(['device-click', 'device-hover', 'cabinet-click', 'cabinet-hover'])

const props = defineProps({
  devices: {
    type: Array,
    default: () => []
  },
  deviceStatus: {
    type: Object,
    default: () => ({})
  },
  cabinets: {
    type: Array,
    default: () => []
  },
  cabinetStats: {
    type: Array,
    default: () => []
  }
})

const sceneContainer = ref(null)
let scene, camera, renderer, controls, raycaster, mouse
let deviceMeshes = []
let statusIndicators = []
let cabinetMeshes = []
let cabinetStatusIndicators = []
let animationId = null

const deviceTypes = {
  HPLC: { color: 0x3498db, size: [1.2, 0.8, 0.6], position: [-4, 0.4, 2] },
  GCMS: { color: 0x9b59b6, size: [1.0, 1.2, 0.8], position: [-2, 0.6, 2] },
  ICP: { color: 0xe67e22, size: [0.8, 1.0, 0.6], position: [2, 0.5, 2] },
  FTIR: { color: 0x1abc9c, size: [0.9, 0.7, 0.5], position: [4, 0.35, 2] },
  INCUBATOR: { color: 0x2ecc71, size: [1.0, 1.5, 0.8], position: [0, 0.75, -3] }
}

const cabinetPositions = {
  CAB_001: { position: [-8, 1.0, 0], size: [1.5, 2.0, 0.6] },
  CAB_002: { position: [8, 1.0, 0], size: [1.5, 2.0, 0.6] },
  CAB_003: { position: [0, 1.0, -5], size: [1.5, 2.0, 0.6] }
}

const statusColors = {
  running: 0x27ae60,
  standby: 0xf39c12,
  error: 0xe74c3c,
  offline: 0x7f8c8d,
  alert: 0xff0000
}

const deviceStatusColors = {
  running: 0x00ff00,
  standby: 0x3498db,
  error: 0xff0000,
  offline: 0x666666,
  alert: 0xff0000
}

function getHeatmapColor(percentage, belowThresholdCount = 0) {
  if (belowThresholdCount > 0) {
    return 0xff4444
  }
  
  if (percentage >= 80) {
    return 0x00ff00
  } else if (percentage >= 60) {
    return 0x88ff00
  } else if (percentage >= 40) {
    return 0xffff00
  } else if (percentage >= 20) {
    return 0xffaa00
  } else {
    return 0xff4400
  }
}

function initScene() {
  const container = sceneContainer.value
  if (!container) return

  const width = container.clientWidth
  const height = container.clientHeight

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a2e)

  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
  camera.position.set(12, 12, 12)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(width, height)
  renderer.shadowMap.enabled = true
  container.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.maxPolarAngle = Math.PI / 2.2

  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()

  addLights()
  createFloor()
  createWalls()
  createLabTables()
  createEquipment()
  createCabinets()
  setupEventListeners()

  animate()
}

function addLights() {
  const ambientLight = new THREE.AmbientLight(0x404040, 0.6)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(10, 20, 10)
  directionalLight.castShadow = true
  directionalLight.shadow.mapSize.width = 2048
  directionalLight.shadow.mapSize.height = 2048
  scene.add(directionalLight)

  const lightPositions = [
    [-3, 5, -3],
    [3, 5, -3],
    [-3, 5, 3],
    [3, 5, 3]
  ]

  lightPositions.forEach(pos => {
    const light = new THREE.PointLight(0xffffff, 0.4, 20)
    light.position.set(...pos)
    scene.add(light)
  })
}

function createFloor() {
  const floorGeometry = new THREE.PlaneGeometry(22, 18)
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: 0x34495e,
    roughness: 0.8,
    metalness: 0.2
  })
  const floor = new THREE.Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const gridHelper = new THREE.GridHelper(22, 44, 0x555555, 0x333333)
  scene.add(gridHelper)
}

function createWalls() {
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: 0x2c3e50,
    roughness: 0.6
  })

  const backWall = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 6),
    wallMaterial
  )
  backWall.position.set(0, 3, -9)
  scene.add(backWall)

  const leftWall = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 6),
    wallMaterial
  )
  leftWall.position.set(-11, 3, 0)
  leftWall.rotation.y = Math.PI / 2
  scene.add(leftWall)

  const rightWall = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 6),
    wallMaterial
  )
  rightWall.position.set(11, 3, 0)
  rightWall.rotation.y = -Math.PI / 2
  scene.add(rightWall)
}

function createLabTables() {
  const tableMaterial = new THREE.MeshStandardMaterial({
    color: 0x8b4513,
    roughness: 0.7
  })

  const tables = [
    { pos: [-3, 0.4, 2], size: [4, 0.1, 1.5] },
    { pos: [3, 0.4, 2], size: [4, 0.1, 1.5] },
    { pos: [0, 0.4, -2], size: [3, 0.1, 2] }
  ]

  tables.forEach(table => {
    const tableMesh = new THREE.Mesh(
      new THREE.BoxGeometry(...table.size),
      tableMaterial
    )
    tableMesh.position.set(...table.pos)
    tableMesh.receiveShadow = true
    tableMesh.castShadow = true
    scene.add(tableMesh)

    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 })
    const legPositions = [
      [table.pos[0] - table.size[0]/2 + 0.2, 0.2, table.pos[2] - table.size[2]/2 + 0.1],
      [table.pos[0] + table.size[0]/2 - 0.2, 0.2, table.pos[2] - table.size[2]/2 + 0.1],
      [table.pos[0] - table.size[0]/2 + 0.2, 0.2, table.pos[2] + table.size[2]/2 - 0.1],
      [table.pos[0] + table.size[0]/2 - 0.2, 0.2, table.pos[2] + table.size[2]/2 - 0.1]
    ]

    legPositions.forEach(pos => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.4),
        legMaterial
      )
      leg.position.set(...pos)
      leg.castShadow = true
      scene.add(leg)
    })
  })
}

function createEquipment() {
  deviceMeshes.forEach(mesh => {
    scene.remove(mesh)
    mesh.geometry?.dispose()
    mesh.material?.dispose()
  })
  statusIndicators.forEach(indicator => {
    scene.remove(indicator)
    indicator.geometry?.dispose()
    indicator.material?.dispose()
  })
  deviceMeshes = []
  statusIndicators = []

  props.devices.forEach((device) => {
    const typeConfig = deviceTypes[device.device_type] || deviceTypes.HPLC
    const status = props.deviceStatus[device.device_id] || device.status || 'standby'
    const statusColor = statusColors[status] || statusColors.offline
    const bodyColor = deviceStatusColors[status] || typeConfig.color

    const baseGeometry = new THREE.BoxGeometry(...typeConfig.size)
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: bodyColor,
      metalness: 0.4,
      roughness: 0.3
    })
    const equipment = new THREE.Mesh(baseGeometry, baseMaterial)
    
    const pos = typeConfig.position
    equipment.position.set(pos[0], pos[1], pos[2])
    equipment.castShadow = true
    equipment.receiveShadow = true
    
    equipment.userData = {
      deviceId: device.device_id,
      deviceData: device,
      deviceType: device.device_type,
      isEquipment: true,
      baseColor: typeConfig.color
    }

    const statusGeometry = new THREE.SphereGeometry(0.1, 16, 16)
    const statusMaterial = new THREE.MeshBasicMaterial({
      color: statusColor
    })
    const statusIndicator = new THREE.Mesh(statusGeometry, statusMaterial)
    statusIndicator.position.set(
      pos[0],
      pos[1] + typeConfig.size[1] / 2 + 0.15,
      pos[2]
    )
    statusIndicator.userData = { 
      deviceId: device.device_id,
      isStatusIndicator: true
    }
    
    scene.add(equipment)
    scene.add(statusIndicator)
    deviceMeshes.push(equipment)
    statusIndicators.push(statusIndicator)
  })
}

function createCabinets() {
  cabinetMeshes.forEach(mesh => {
    scene.remove(mesh)
    mesh.geometry?.dispose()
    mesh.material?.dispose()
  })
  cabinetStatusIndicators.forEach(indicator => {
    scene.remove(indicator)
    indicator.geometry?.dispose()
    indicator.material?.dispose()
  })
  cabinetMeshes = []
  cabinetStatusIndicators = []

  const defaultCabinetConfig = {
    size: [1.5, 2.0, 0.6]
  }

  props.cabinets.forEach((cabinet, index) => {
    let cabinetConfig = cabinetPositions[cabinet.cabinet_id]
    
    if (!cabinetConfig) {
      const positions = [
        { position: [-8, 1.0, 0] },
        { position: [8, 1.0, 0] },
        { position: [0, 1.0, -5] },
        { position: [-8, 1.0, -4] }
      ]
      const posIndex = index % positions.length
      cabinetConfig = {
        position: positions[posIndex].position,
        size: defaultCabinetConfig.size
      }
    }

    const cabinetStat = props.cabinetStats.find(s => s.cabinet_id === cabinet.cabinet_id)
    const stockLevel = cabinetStat ? cabinetStat.stock_level_percentage : 50
    const belowThreshold = cabinetStat ? cabinetStat.below_threshold_count : 0
    const bodyColor = getHeatmapColor(stockLevel, belowThreshold)

    const cabinetGeometry = new THREE.BoxGeometry(...cabinetConfig.size)
    const cabinetMaterial = new THREE.MeshStandardMaterial({
      color: bodyColor,
      metalness: 0.3,
      roughness: 0.5,
      transparent: true,
      opacity: 0.9
    })
    const cabinetMesh = new THREE.Mesh(cabinetGeometry, cabinetMaterial)
    
    cabinetMesh.position.set(...cabinetConfig.position)
    cabinetMesh.castShadow = true
    cabinetMesh.receiveShadow = true
    
    cabinetMesh.userData = {
      cabinetId: cabinet.cabinet_id,
      cabinetData: cabinet,
      isCabinet: true,
      stockLevel: stockLevel,
      belowThreshold: belowThreshold
    }

    const borderGeometry = new THREE.BoxGeometry(
      cabinetConfig.size[0] + 0.05,
      cabinetConfig.size[1] + 0.05,
      cabinetConfig.size[2] + 0.05
    )
    const borderMaterial = new THREE.MeshBasicMaterial({
      color: 0x666666,
      wireframe: true
    })
    const border = new THREE.Mesh(borderGeometry, borderMaterial)
    border.position.set(...cabinetConfig.position)
    border.userData = { parentCabinetId: cabinet.cabinet_id }
    
    const labelGeometry = new THREE.PlaneGeometry(1.2, 0.2)
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#2c3e50'
    ctx.fillRect(0, 0, 256, 64)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 28px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(cabinet.name, 128, 32)
    
    const texture = new THREE.CanvasTexture(canvas)
    const labelMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true
    })
    const label = new THREE.Mesh(labelGeometry, labelMaterial)
    label.position.set(
      cabinetConfig.position[0],
      cabinetConfig.position[1] + cabinetConfig.size[1]/2 + 0.2,
      cabinetConfig.position[2]
    )
    label.rotation.x = -0.3
    label.userData = { parentCabinetId: cabinet.cabinet_id }

    const alertIndicator = null
    if (belowThreshold > 0) {
      const alertGeometry = new THREE.ConeGeometry(0.15, 0.25, 4)
      const alertMaterial = new THREE.MeshBasicMaterial({
        color: 0xff0000
      })
      const alertIndicator = new THREE.Mesh(alertGeometry, alertMaterial)
      alertIndicator.position.set(
        cabinetConfig.position[0],
        cabinetConfig.position[1] + cabinetConfig.size[1]/2 + 0.5,
        cabinetConfig.position[2]
      )
      alertIndicator.rotation.z = Math.PI
      alertIndicator.userData = { 
        parentCabinetId: cabinet.cabinet_id,
        isAlertIndicator: true
      }
      cabinetStatusIndicators.push(alertIndicator)
      scene.add(alertIndicator)
    }

    scene.add(cabinetMesh)
    scene.add(border)
    scene.add(label)
    cabinetMeshes.push(cabinetMesh)
    cabinetStatusIndicators.push(border)
    cabinetStatusIndicators.push(label)
  })
}

function updateDeviceStatus(deviceId, newStatus) {
  const equipment = deviceMeshes.find(m => m.userData.deviceId === deviceId)
  const indicator = statusIndicators.find(i => i.userData.deviceId === deviceId)
  
  if (!equipment && !indicator) {
    console.log(`[LabScene] Device ${deviceId} not found in scene, recreating all...`)
    if (scene) {
      createEquipment()
    }
    return
  }

  const newStatusColor = statusColors[newStatus] || statusColors.offline
  const newBodyColor = deviceStatusColors[newStatus] || equipment?.userData?.baseColor || 0x3498db

  console.log(`[LabScene] Updating device ${deviceId} status: ${newStatus}, color: 0x${newBodyColor.toString(16)}`)

  if (equipment && equipment.material) {
    equipment.material.color.setHex(newBodyColor)
    equipment.material.needsUpdate = true
  }

  if (indicator && indicator.material) {
    indicator.material.color.setHex(newStatusColor)
    indicator.material.needsUpdate = true
  }
}

function watchDeviceStatus() {
  const previousStatus = {}
  
  return function() {
    let hasChanges = false
    
    props.devices.forEach(device => {
      const currentStatus = props.deviceStatus[device.device_id] || device.status || 'standby'
      const prevStatus = previousStatus[device.device_id]
      
      if (prevStatus !== undefined && prevStatus !== currentStatus) {
        console.log(`[LabScene] Status changed for ${device.device_id}: ${prevStatus} -> ${currentStatus}`)
        updateDeviceStatus(device.device_id, currentStatus)
        hasChanges = true
      }
      
      previousStatus[device.device_id] = currentStatus
    })
    
    return hasChanges
  }
}

const checkStatusChanges = watchDeviceStatus()

function updateEquipment() {
  console.log('[LabScene] updateEquipment called, checking status changes...')
  
  if (!scene) {
    console.log('[LabScene] Scene not initialized, skipping update')
    return
  }
  
  const hasChanges = checkStatusChanges()
  
  if (!hasChanges && deviceMeshes.length !== props.devices.length) {
    console.log('[LabScene] Device count changed, recreating equipment')
    createEquipment()
  }
}

function updateCabinets() {
  console.log('[LabScene] updateCabinets called')
  
  if (!scene) {
    return
  }
  
  createCabinets()
}

function setupEventListeners() {
  const domElement = renderer.domElement
  domElement.addEventListener('click', onMouseClick)
  domElement.addEventListener('mousemove', onMouseMove)
  window.addEventListener('resize', onWindowResize)
}

function onMouseClick(event) {
  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera)
  
  const allClickable = [...deviceMeshes, ...cabinetMeshes]
  const intersects = raycaster.intersectObjects(allClickable)

  if (intersects.length > 0) {
    const clickedMesh = intersects[0].object
    if (clickedMesh.userData.isEquipment) {
      emit('device-click', clickedMesh.userData.deviceData)
    } else if (clickedMesh.userData.isCabinet) {
      emit('cabinet-click', clickedMesh.userData.cabinetData)
    }
  }
}

function onMouseMove(event) {
  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

  raycaster.setFromCamera(mouse, camera)
  
  const allClickable = [...deviceMeshes, ...cabinetMeshes]
  const intersects = raycaster.intersectObjects(allClickable)

  deviceMeshes.forEach(mesh => {
    mesh.scale.set(1, 1, 1)
  })
  cabinetMeshes.forEach(mesh => {
    mesh.scale.set(1, 1, 1)
  })

  if (intersects.length > 0) {
    const hoveredMesh = intersects[0].object
    hoveredMesh.scale.set(1.03, 1.03, 1.03)
    
    if (hoveredMesh.userData.isEquipment) {
      emit('device-hover', hoveredMesh.userData.deviceData)
    } else if (hoveredMesh.userData.isCabinet) {
      emit('cabinet-hover', hoveredMesh.userData.cabinetData)
    }
  }
}

function onWindowResize() {
  if (!sceneContainer.value) return
  const container = sceneContainer.value
  camera.aspect = container.clientWidth / container.clientHeight
  camera.updateProjectionMatrix()
  renderer.setSize(container.clientWidth, container.clientHeight)
}

function animate() {
  animationId = requestAnimationFrame(animate)
  controls.update()

  statusIndicators.forEach(indicator => {
    indicator.rotation.y += 0.02
  })
  
  cabinetStatusIndicators.forEach(indicator => {
    if (indicator.userData && indicator.userData.isAlertIndicator) {
      indicator.rotation.y += 0.05
      const time = Date.now() * 0.003
      indicator.position.y += Math.sin(time) * 0.002
    }
  })

  renderer.render(scene, camera)
}

watch(() => props.devices, () => {
  console.log('[LabScene] Devices prop changed')
  updateEquipment()
}, { deep: true })

watch(() => props.deviceStatus, () => {
  console.log('[LabScene] deviceStatus prop changed')
  updateEquipment()
}, { deep: true })

watch(() => props.cabinets, () => {
  console.log('[LabScene] Cabinets prop changed')
  updateCabinets()
}, { deep: true })

watch(() => props.cabinetStats, () => {
  console.log('[LabScene] cabinetStats prop changed')
  updateCabinets()
}, { deep: true })

onMounted(() => {
  nextTick(() => {
    initScene()
  })
})

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  if (renderer && renderer.domElement) {
    renderer.domElement.removeEventListener('click', onMouseClick)
    renderer.domElement.removeEventListener('mousemove', onMouseMove)
  }
  window.removeEventListener('resize', onWindowResize)
  
  deviceMeshes.forEach(mesh => {
    mesh.geometry?.dispose()
    mesh.material?.dispose()
  })
  statusIndicators.forEach(indicator => {
    indicator.geometry?.dispose()
    indicator.material?.dispose()
  })
  cabinetMeshes.forEach(mesh => {
    mesh.geometry?.dispose()
    mesh.material?.dispose()
  })
  cabinetStatusIndicators.forEach(indicator => {
    indicator.geometry?.dispose()
    indicator.material?.dispose()
  })
  
  if (renderer) {
    renderer.dispose()
  }
})

defineExpose({
  updateEquipment,
  updateCabinets
})
</script>

<style scoped>
.lab-scene-container {
  width: 100%;
  height: 100%;
  min-height: 400px;
}

.scene-container {
  width: 100%;
  height: 100%;
}
</style>
