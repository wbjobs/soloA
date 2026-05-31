import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { StationState, Ball } from '../types'
import api, { BallEvent, HeatmapRecord, StationStat } from '../services/api'

interface FactorySceneProps {
  isRunning: boolean
  speed: number
  stationConfigs: { id: number; processTime: number }[]
  showHeatmap: boolean
  sessionId: number | null
  onSessionCreated: (id: number) => void
  onStationStatesUpdate: (states: StationState[]) => void
  onBallCreated: () => void
  onBallCompleted: () => void
  onExportStatus: (status: 'idle' | 'syncing' | 'success' | 'error', message?: string) => void
}

const CONVEYOR_LENGTH = 30
const CONVEYOR_WIDTH = 4
const STATION_SIZE = 1.5
const BALL_RADIUS = 0.35
const BASE_SPEED = 5
const LOG_BATCH_INTERVAL = 2000
const HEATMAP_LOG_INTERVAL = 500

interface StationVisual {
  cube: THREE.Mesh
  ring: THREE.Mesh
  heatmapPlane: THREE.Mesh
  baseColor: number
}

function FactoryScene({
  isRunning,
  speed,
  stationConfigs,
  showHeatmap,
  sessionId,
  onSessionCreated,
  onStationStatesUpdate,
  onBallCreated,
  onBallCompleted,
  onExportStatus,
}: FactorySceneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  
  const ballsRef = useRef<Ball[]>([])
  const stationsRef = useRef<StationState[]>([])
  const stationVisualsRef = useRef<StationVisual[]>([])
  const stationPositionsRef = useRef<number[]>([])
  const stationConfigsRef = useRef(stationConfigs)
  const isRunningRef = useRef(isRunning)
  const speedRef = useRef(speed)
  const showHeatmapRef = useRef(showHeatmap)
  
  const lastBallSpawnTimeRef = useRef(0)
  const simulationStartTimeRef = useRef(0)
  const lastUpdateTimeRef = useRef(0)
  const ballIdCounterRef = useRef(0)
  const hasStartedRef = useRef(false)

  const eventQueueRef = useRef<BallEvent[]>([])
  const heatmapQueueRef = useRef<HeatmapRecord[]>([])
  const lastLogBatchTimeRef = useRef(0)
  const lastHeatmapLogTimeRef = useRef(0)
  const sessionIdRef = useRef<number | null>(null)
  const stationStatsRef = useRef<Map<number, { totalProcessed: number; totalWaitTime: number; waitCount: number; maxQueue: number }>>(new Map())

  useEffect(() => {
    stationConfigsRef.current = stationConfigs
  }, [stationConfigs])

  useEffect(() => {
    isRunningRef.current = isRunning
  }, [isRunning])

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    showHeatmapRef.current = showHeatmap
    updateHeatmapVisibility()
  }, [showHeatmap])

  useEffect(() => {
    sessionIdRef.current = sessionId
  }, [sessionId])

  const getUtilizationColor = (utilization: number): THREE.Color => {
    if (utilization >= 0.9) return new THREE.Color(0xff0000)
    if (utilization >= 0.75) return new THREE.Color(0xff6600)
    if (utilization >= 0.5) return new THREE.Color(0xffff00)
    if (utilization >= 0.25) return new THREE.Color(0x66ff00)
    return new THREE.Color(0x00ff00)
  }

  const updateHeatmapVisibility = () => {
    stationVisualsRef.current.forEach((visual) => {
      visual.heatmapPlane.visible = showHeatmapRef.current
    })
  }

  const updateHeatmapVisuals = () => {
    if (!showHeatmapRef.current) return

    stationsRef.current.forEach((station, index) => {
      const visual = stationVisualsRef.current[index]
      if (!visual) return

      const heatmapPlaneMaterial = visual.heatmapPlane.material as THREE.MeshBasicMaterial
      const color = getUtilizationColor(station.utilization)
      const intensity = 0.3 + station.utilization * 0.5
      const queueBonus = Math.min(station.queue.length * 0.1, 0.3)

      heatmapPlaneMaterial.color.copy(color)
      heatmapPlaneMaterial.opacity = Math.min(intensity + queueBonus, 0.9)

      const cubeMaterial = visual.cube.material as THREE.MeshStandardMaterial
      const ringMaterial = visual.ring.material as THREE.MeshStandardMaterial
      
      if (station.isProcessing) {
        const pulseIntensity = 0.3 + Math.sin(performance.now() / 150) * 0.2
        cubeMaterial.emissiveIntensity = pulseIntensity + station.utilization * 0.3
        ringMaterial.emissiveIntensity = pulseIntensity * 2
      } else {
        cubeMaterial.emissiveIntensity = 0.1 + station.utilization * 0.3
        ringMaterial.emissiveIntensity = 0.3 + station.utilization * 0.5
      }

      const scale = 1 + station.utilization * 0.2 + (station.queue.length * 0.05)
      visual.heatmapPlane.scale.set(scale, 1, scale)
    })
  }

  const logBallEvent = (event: Omit<BallEvent, 'session_id'>) => {
    if (sessionIdRef.current === null) return
    eventQueueRef.current.push({
      ...event,
      session_id: sessionIdRef.current,
    })
  }

  const logHeatmapData = () => {
    if (sessionIdRef.current === null) return

    stationsRef.current.forEach((station) => {
      heatmapQueueRef.current.push({
        session_id: sessionIdRef.current!,
        station_id: station.id,
        utilization: station.utilization,
        queue_length: station.queue.length,
        is_processing: station.isProcessing,
      })
    })
  }

  const flushLogs = async () => {
    if (sessionIdRef.current === null) return
    if (eventQueueRef.current.length === 0 && heatmapQueueRef.current.length === 0) return

    const eventsToSend = [...eventQueueRef.current]
    const heatmapToSend = [...heatmapQueueRef.current]
    eventQueueRef.current = []
    heatmapQueueRef.current = []

    onExportStatus('syncing', `同步中... 事件: ${eventsToSend.length}, 热力图: ${heatmapToSend.length}`)

    try {
      await api.logBatch(eventsToSend, heatmapToSend)
      onExportStatus('success', `已同步 ${eventsToSend.length + heatmapToSend.length} 条记录`)
    } catch (error) {
      console.error('Failed to sync logs:', error)
      eventQueueRef.current = [...eventsToSend, ...eventQueueRef.current]
      heatmapQueueRef.current = [...heatmapToSend, ...heatmapQueueRef.current]
      onExportStatus('error', '同步失败，将重试')
    }
  }

  const saveFinalStats = async () => {
    if (sessionIdRef.current === null) return

    const stats: StationStat[] = stationsRef.current.map((station) => {
      const stat = stationStatsRef.current.get(station.id) || { totalProcessed: 0, totalWaitTime: 0, waitCount: 0, maxQueue: 0 }
      return {
        station_id: station.id,
        utilization: station.utilization,
        total_processed: stat.totalProcessed,
        total_wait_time: stat.totalWaitTime,
        avg_wait_time: stat.waitCount > 0 ? stat.totalWaitTime / stat.waitCount : 0,
        max_queue_length: stat.maxQueue,
        process_time: station.processTime,
      }
    })

    try {
      await api.saveStationStats(sessionIdRef.current, stats)
    } catch (error) {
      console.error('Failed to save stats:', error)
    }
  }

  useEffect(() => {
    if (!containerRef.current) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0f172a)
    scene.fog = new THREE.Fog(0x0f172a, 30, 80)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(
      60,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    )
    camera.position.set(15, 18, 22)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.target.set(CONVEYOR_LENGTH / 2, 0, 0)
    controlsRef.current = controls

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(15, 30, 20)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    directionalLight.shadow.camera.near = 0.5
    directionalLight.shadow.camera.far = 100
    directionalLight.shadow.camera.left = -20
    directionalLight.shadow.camera.right = 50
    directionalLight.shadow.camera.top = 20
    directionalLight.shadow.camera.bottom = -20
    scene.add(directionalLight)

    const pointLight1 = new THREE.PointLight(0x4fc3f7, 0.5, 50)
    pointLight1.position.set(5, 10, 10)
    scene.add(pointLight1)

    const pointLight2 = new THREE.PointLight(0xff7043, 0.3, 50)
    pointLight2.position.set(25, 10, -10)
    scene.add(pointLight2)

    const floorGeometry = new THREE.PlaneGeometry(100, 60)
    const floorMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x1e293b,
      roughness: 0.9,
      metalness: 0.1
    })
    const floor = new THREE.Mesh(floorGeometry, floorMaterial)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)

    const gridHelper = new THREE.GridHelper(100, 100, 0x334155, 0x1e293b)
    scene.add(gridHelper)

    createConveyor(scene)
    createStations(scene)

    const handleResize = () => {
      if (!containerRef.current || !camera || !renderer) return
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    }
    window.addEventListener('resize', handleResize)

    stationsRef.current = stationConfigs.map((config, index) => ({
      id: config.id,
      currentBall: null,
      queue: [],
      processTime: config.processTime,
      remainingTime: 0,
      totalTime: 0,
      workingTime: 0,
      utilization: 0,
      isProcessing: false,
    }))

    stationConfigs.forEach((config) => {
      stationStatsRef.current.set(config.id, { totalProcessed: 0, totalWaitTime: 0, waitCount: 0, maxQueue: 0 })
    })

    return () => {
      window.removeEventListener('resize', handleResize)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (renderer && containerRef.current) {
        containerRef.current.removeChild(renderer.domElement)
        renderer.dispose()
      }
    }
  }, [])

  useEffect(() => {
    let previousTime = performance.now()
    let stateUpdateTimer = 0
    const STATE_UPDATE_INTERVAL = 100

    const animate = (currentTime: number) => {
      animationFrameRef.current = requestAnimationFrame(animate)
      
      const deltaTime = Math.min((currentTime - previousTime), 50)
      previousTime = currentTime

      if (controlsRef.current) {
        controlsRef.current.update()
      }

      if (isRunningRef.current) {
        if (!hasStartedRef.current) {
          hasStartedRef.current = true
          lastBallSpawnTimeRef.current = currentTime
          simulationStartTimeRef.current = currentTime
          lastUpdateTimeRef.current = currentTime
          lastLogBatchTimeRef.current = currentTime
          lastHeatmapLogTimeRef.current = currentTime
        }

        const simDelta = deltaTime * speedRef.current
        const spawnInterval = 3000 / speedRef.current

        if (currentTime - lastBallSpawnTimeRef.current > spawnInterval) {
          spawnBall()
          lastBallSpawnTimeRef.current = currentTime
        }

        updateSimulation(simDelta)
        updateBallPositions()
        updateHeatmapVisuals()

        if (currentTime - lastHeatmapLogTimeRef.current > HEATMAP_LOG_INTERVAL) {
          logHeatmapData()
          lastHeatmapLogTimeRef.current = currentTime
        }

        if (currentTime - lastLogBatchTimeRef.current > LOG_BATCH_INTERVAL) {
          flushLogs()
          lastLogBatchTimeRef.current = currentTime
        }

        stateUpdateTimer += deltaTime
        if (stateUpdateTimer > STATE_UPDATE_INTERVAL) {
          onStationStatesUpdate(stationsRef.current.map(s => ({ ...s })))
          stateUpdateTimer = 0
        }
      } else {
        if (hasStartedRef.current) {
          hasStartedRef.current = false
          flushLogs()
        }
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current)
      }
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [onStationStatesUpdate, onBallCreated, onBallCompleted, onExportStatus])

  const createConveyor = (scene: THREE.Scene) => {
    const conveyorGroup = new THREE.Group()

    const baseGeometry = new THREE.BoxGeometry(CONVEYOR_LENGTH, 0.3, CONVEYOR_WIDTH)
    const baseMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x475569,
      roughness: 0.7,
      metalness: 0.3
    })
    const base = new THREE.Mesh(baseGeometry, baseMaterial)
    base.position.set(CONVEYOR_LENGTH / 2, -0.15, 0)
    base.receiveShadow = true
    base.castShadow = true
    conveyorGroup.add(base)

    const beltGeometry = new THREE.BoxGeometry(CONVEYOR_LENGTH, 0.05, CONVEYOR_WIDTH - 0.4)
    const beltMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x334155,
      roughness: 0.8,
      metalness: 0.2
    })
    const belt = new THREE.Mesh(beltGeometry, beltMaterial)
    belt.position.set(CONVEYOR_LENGTH / 2, 0.025, 0)
    conveyorGroup.add(belt)

    const frameColors = [0x1e88e5, 0xe53935]
    for (let i = 0; i < 2; i++) {
      const frameGeometry = new THREE.BoxGeometry(CONVEYOR_LENGTH, 0.4, 0.2)
      const frameMaterial = new THREE.MeshStandardMaterial({ 
        color: frameColors[i],
        roughness: 0.4,
        metalness: 0.6
      })
      const frame = new THREE.Mesh(frameGeometry, frameMaterial)
      frame.position.set(
        CONVEYOR_LENGTH / 2, 
        -0.2, 
        (i === 0 ? 1 : -1) * (CONVEYOR_WIDTH / 2 - 0.1)
      )
      frame.castShadow = true
      conveyorGroup.add(frame)
    }

    for (let i = 0; i <= CONVEYOR_LENGTH; i += 3) {
      const rollerGeometry = new THREE.CylinderGeometry(0.1, 0.1, CONVEYOR_WIDTH - 0.5, 16)
      const rollerMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x64748b,
        roughness: 0.3,
        metalness: 0.8
      })
      const roller = new THREE.Mesh(rollerGeometry, rollerMaterial)
      roller.rotation.z = Math.PI / 2
      roller.position.set(i, 0, 0)
      conveyorGroup.add(roller)
    }

    const startGeometry = new THREE.ConeGeometry(0.5, 1.5, 3)
    const startMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x4caf50,
      emissive: 0x2e7d32,
      emissiveIntensity: 0.3
    })
    const start = new THREE.Mesh(startGeometry, startMaterial)
    start.position.set(-1, 1, 0)
    start.rotation.z = Math.PI / 2
    conveyorGroup.add(start)

    const endGeometry = new THREE.BoxGeometry(1.5, 2, 1.5)
    const endMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xff9800,
      emissive: 0xf57c00,
      emissiveIntensity: 0.2
    })
    const end = new THREE.Mesh(endGeometry, endMaterial)
    end.position.set(CONVEYOR_LENGTH + 1, 1, 0)
    end.castShadow = true
    conveyorGroup.add(end)

    scene.add(conveyorGroup)
  }

  const createStations = (scene: THREE.Scene) => {
    const stationGroup = new THREE.Group()
    const positions = [5, 15, 25]
    const colors = [0xef5350, 0x42a5f5, 0x66bb6a]
    
    stationPositionsRef.current = positions
    stationVisualsRef.current = []

    stationConfigs.forEach((_, index) => {
      const pos = positions[index]
      const color = colors[index]

      const platformGeometry = new THREE.CylinderGeometry(1.2, 1.2, 0.2, 32)
      const platformMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x616161,
        roughness: 0.5,
        metalness: 0.5
      })
      const platform = new THREE.Mesh(platformGeometry, platformMaterial)
      platform.position.set(pos, -0.1, -CONVEYOR_WIDTH / 2 - 1)
      platform.castShadow = true
      platform.receiveShadow = true
      stationGroup.add(platform)

      const cubeGeometry = new THREE.BoxGeometry(STATION_SIZE, STATION_SIZE, STATION_SIZE)
      const cubeMaterial = new THREE.MeshStandardMaterial({ 
        color: color,
        roughness: 0.3,
        metalness: 0.7,
        emissive: color,
        emissiveIntensity: 0.1
      })
      const cube = new THREE.Mesh(cubeGeometry, cubeMaterial)
      cube.position.set(pos, STATION_SIZE / 2 + 0.2, -CONVEYOR_WIDTH / 2 - 1)
      cube.castShadow = true
      stationGroup.add(cube)

      const ringGeometry = new THREE.TorusGeometry(1.4, 0.05, 16, 100)
      const ringMaterial = new THREE.MeshStandardMaterial({ 
        color: color,
        emissive: color,
        emissiveIntensity: 0.5
      })
      const ring = new THREE.Mesh(ringGeometry, ringMaterial)
      ring.rotation.x = Math.PI / 2
      ring.position.set(pos, 0.05, -CONVEYOR_WIDTH / 2 - 1)
      ring.userData.stationId = index
      stationGroup.add(ring)

      const heatmapGeometry = new THREE.CircleGeometry(2, 64)
      const heatmapMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
      })
      const heatmapPlane = new THREE.Mesh(heatmapGeometry, heatmapMaterial)
      heatmapPlane.rotation.x = -Math.PI / 2
      heatmapPlane.position.set(pos, 0.02, -CONVEYOR_WIDTH / 2 - 1)
      heatmapPlane.visible = false
      stationGroup.add(heatmapPlane)

      stationVisualsRef.current.push({
        cube,
        ring,
        heatmapPlane,
        baseColor: color,
      })

      const spotLight = new THREE.SpotLight(color, 0.8, 8, Math.PI / 6, 0.5, 1)
      spotLight.position.set(pos, 5, -CONVEYOR_WIDTH / 2 - 1)
      spotLight.target.position.set(pos, 0, -CONVEYOR_WIDTH / 2 - 1)
      spotLight.userData.stationId = index
      stationGroup.add(spotLight)
      stationGroup.add(spotLight.target)
    })

    scene.add(stationGroup)
  }

  const spawnBall = () => {
    if (!sceneRef.current) return

    const ballId = ballIdCounterRef.current++
    const colors = [0xff5252, 0x448aff, 0x69f0ae, 0xffd740, 0xe040fb, 0xff9100]
    const color = colors[ballId % colors.length]

    const geometry = new THREE.SphereGeometry(BALL_RADIUS, 32, 32)
    const material = new THREE.MeshStandardMaterial({ 
      color: color,
      roughness: 0.2,
      metalness: 0.8,
      emissive: color,
      emissiveIntensity: 0.2
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.position.set(-BALL_RADIUS, BALL_RADIUS + 0.1, 0)
    sceneRef.current.add(mesh)

    const ball: Ball = {
      id: ballId,
      mesh,
      progress: 0,
      currentStationIndex: -1,
      status: 'moving',
    }

    ballsRef.current.push(ball)
    onBallCreated()

    logBallEvent({
      ball_id: ballId,
      event_type: 'spawn',
      details: { color },
    })
  }

  const updateSimulation = (deltaTime: number) => {
    const stations = stationsRef.current
    const stationPositions = stationPositionsRef.current
    const configs = stationConfigsRef.current
    const moveSpeed = BASE_SPEED / CONVEYOR_LENGTH

    stations.forEach((station, index) => {
      station.processTime = configs[index].processTime
      station.totalTime += deltaTime

      if (station.isProcessing && station.currentBall) {
        station.remainingTime -= deltaTime
        station.workingTime += deltaTime

        if (station.remainingTime <= 0) {
          const completedBall = station.currentBall
          station.currentBall.progress = stationPositions[index] / CONVEYOR_LENGTH
          station.currentBall.status = 'moving'
          station.currentBall.currentStationIndex = index
          station.currentBall = null
          station.isProcessing = false
          station.remainingTime = 0

          const stat = stationStatsRef.current.get(station.id)!
          stat.totalProcessed++

          logBallEvent({
            ball_id: completedBall.id,
            event_type: 'end_process',
            station_id: station.id,
            details: { 
              processTime: station.processTime,
              queueLength: station.queue.length 
            },
          })

          if (station.queue.length > 0) {
            const nextBall = station.queue.shift()!
            startProcessing(station, nextBall)
          }
        }
      }

      if (station.totalTime > 0) {
        station.utilization = station.workingTime / station.totalTime
      }
    })

    const claimedStations = new Set<number>()
    const movingBalls = ballsRef.current.filter(b => b.status === 'moving')
    const sortedMovingBalls = [...movingBalls].sort((a, b) => a.progress - b.progress)

    for (const ball of sortedMovingBalls) {
      ball.progress += (moveSpeed * deltaTime) / 1000
      const worldX = ball.progress * CONVEYOR_LENGTH

      let targetStationIndex = -1
      let minDistance = Infinity

      for (let i = 0; i < stationPositions.length; i++) {
        if (i <= ball.currentStationIndex) continue
        if (claimedStations.has(i)) continue

        const station = stations[i]
        if (station.isProcessing) continue

        const stationX = stationPositions[i]
        const distance = Math.abs(worldX - stationX)
        const threshold = 0.3 + (moveSpeed * deltaTime / 1000) * CONVEYOR_LENGTH

        if (distance < threshold && distance < minDistance && worldX >= stationX - threshold) {
          targetStationIndex = i
          minDistance = distance
        }
      }

      if (targetStationIndex !== -1) {
        const station = stations[targetStationIndex]
        claimedStations.add(targetStationIndex)
        ball.progress = stationPositions[targetStationIndex] / CONVEYOR_LENGTH

        logBallEvent({
          ball_id: ball.id,
          event_type: 'arrive_station',
          station_id: targetStationIndex,
          details: { 
            queueLength: station.queue.length,
            isProcessing: station.isProcessing
          },
        })

        if (station.queue.length === 0) {
          startProcessing(station, ball)
        } else {
          ball.status = 'waiting'
          ball.mesh.position.x = stationPositions[targetStationIndex]
          station.queue.push(ball)

          const stat = stationStatsRef.current.get(station.id)!
          stat.waitCount++
          if (station.queue.length > stat.maxQueue) {
            stat.maxQueue = station.queue.length
          }
        }
      }
    }

    const ballsToRemove: number[] = []

    ballsRef.current.forEach((ball, index) => {
      if (ball.status === 'moving') {
        const worldX = ball.progress * CONVEYOR_LENGTH
        if (worldX >= CONVEYOR_LENGTH + 1) {
          ballsToRemove.push(index)
          logBallEvent({
            ball_id: ball.id,
            event_type: 'complete',
            details: { finalProgress: ball.progress },
          })
        }
      }
    })

    for (let i = ballsToRemove.length - 1; i >= 0; i--) {
      const index = ballsToRemove[i]
      const ball = ballsRef.current[index]
      if (ball.mesh && sceneRef.current) {
        sceneRef.current.remove(ball.mesh)
        ball.mesh.geometry.dispose()
        if (Array.isArray(ball.mesh.material)) {
          ball.mesh.material.forEach((m: THREE.Material) => m.dispose())
        } else {
          ball.mesh.material.dispose()
        }
      }
      ballsRef.current.splice(index, 1)
      onBallCompleted()
    }
  }

  const startProcessing = (station: StationState, ball: Ball) => {
    station.currentBall = ball
    station.isProcessing = true
    station.remainingTime = station.processTime
    ball.status = 'processing'

    logBallEvent({
      ball_id: ball.id,
      event_type: 'start_process',
      station_id: station.id,
      details: { 
        processTime: station.processTime,
        queueLength: station.queue.length
      },
    })
  }

  const updateBallPositions = () => {
    const stationPositions = stationPositionsRef.current
    const stations = stationsRef.current

    stations.forEach((station, stationIndex) => {
      const stationX = stationPositions[stationIndex]
      station.queue.forEach((ball, queueIndex) => {
        const offset = (queueIndex + 1) * (BALL_RADIUS * 2.2)
        ball.mesh.position.x = stationX - offset
        ball.mesh.position.y = BALL_RADIUS + 0.1
        ball.mesh.position.z = 0
      })
    })

    ballsRef.current.forEach((ball) => {
      if (ball.status === 'moving') {
        const worldX = Math.min(ball.progress * CONVEYOR_LENGTH, CONVEYOR_LENGTH + 1)
        ball.mesh.position.x = worldX
        ball.mesh.position.y = BALL_RADIUS + 0.1
        ball.mesh.position.z = 0
      } else if (ball.status === 'processing') {
        const stationIndex = stations.findIndex(s => s.currentBall === ball)
        if (stationIndex !== -1) {
          ball.mesh.position.x = stationPositions[stationIndex]
          ball.mesh.position.y = BALL_RADIUS + 0.5 + Math.sin(performance.now() / 200) * 0.1
          ball.mesh.position.z = -CONVEYOR_WIDTH / 2 - 1
        }
      }
    })
  }

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0
      }} 
    />
  )
}

export default FactoryScene
