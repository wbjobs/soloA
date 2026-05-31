import { useEffect, useRef, useMemo } from 'react'
import * as THREE from 'three'
import type { SnapshotData } from '../types'

interface WavefieldVisualizationProps {
  snapshot: SnapshotData
  fieldType?: 'magnitude' | 'ux' | 'uy'
}

const MAX_TEXTURE_SIZE = 2048

function createColormapTexture(): THREE.DataTexture {
  const size = 256
  const data = new Uint8Array(4 * size)

  for (let i = 0; i < size; i++) {
    const t = i / (size - 1)
    let r: number, g: number, b: number

    if (t < 0.25) {
      const s = t / 0.25
      r = 0
      g = 0
      b = Math.floor(128 + s * 127)
    } else if (t < 0.5) {
      const s = (t - 0.25) / 0.25
      r = 0
      g = Math.floor(s * 255)
      b = Math.floor(255 - s * 255)
    } else if (t < 0.75) {
      const s = (t - 0.5) / 0.25
      r = Math.floor(s * 255)
      g = Math.floor(255 - s * 255)
      b = 0
    } else {
      const s = (t - 0.75) / 0.25
      r = 255
      g = Math.floor(255 - s * 128)
      b = 0
    }

    data[4 * i] = r
    data[4 * i + 1] = g
    data[4 * i + 2] = b
    data[4 * i + 3] = 255
  }

  const texture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat)
  texture.needsUpdate = true
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping

  return texture
}

function createDataTexture(
  data: number[][],
  targetSize: { width: number; height: number }
): THREE.DataTexture {
  const originalWidth = data[0]?.length || 1
  const originalHeight = data.length

  const scaleX = targetSize.width / originalWidth
  const scaleY = targetSize.height / originalHeight

  const textureData = new Uint8Array(4 * targetSize.width * targetSize.height)

  for (let ty = 0; ty < targetSize.height; ty++) {
    const y = Math.min(Math.floor(ty / scaleY), originalHeight - 1)
    for (let tx = 0; tx < targetSize.width; tx++) {
      const x = Math.min(Math.floor(tx / scaleX), originalWidth - 1)

      const value = Math.max(0, Math.min(1, data[y]?.[x] ?? 0))
      const byteValue = Math.floor(value * 255)

      const idx = 4 * (ty * targetSize.width + tx)
      textureData[idx] = byteValue
      textureData[idx + 1] = byteValue
      textureData[idx + 2] = byteValue
      textureData[idx + 3] = 255
    }
  }

  const texture = new THREE.DataTexture(
    textureData,
    targetSize.width,
    targetSize.height,
    THREE.RGBAFormat
  )
  texture.needsUpdate = true
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping

  return texture
}

function calculateTextureSize(nx: number, ny: number): { width: number; height: number } {
  if (nx <= MAX_TEXTURE_SIZE && ny <= MAX_TEXTURE_SIZE) {
    return { width: nx, height: ny }
  }

  const aspect = nx / ny
  if (aspect > 1) {
    const width = MAX_TEXTURE_SIZE
    const height = Math.floor(width / aspect)
    return { width, height }
  } else {
    const height = MAX_TEXTURE_SIZE
    const width = Math.floor(height * aspect)
    return { width, height }
  }
}

const vertexShader = `
  varying vec2 vUv;
  
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = `
  uniform sampler2D dataTexture;
  uniform sampler2D colormapTexture;
  
  varying vec2 vUv;
  
  void main() {
    vec4 dataSample = texture2D(dataTexture, vUv);
    float value = dataSample.r;
    
    vec4 colorSample = texture2D(colormapTexture, vec2(value, 0.5));
    gl_FragColor = colorSample;
  }
`

export function WavefieldVisualization({
  snapshot,
  fieldType = 'magnitude',
}: WavefieldVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const meshRef = useRef<THREE.Mesh | null>(null)
  const colormapTextureRef = useRef<THREE.DataTexture | null>(null)
  const dataTextureRef = useRef<THREE.DataTexture | null>(null)

  const colormapTexture = useMemo(() => createColormapTexture(), [])

  const textureSize = useMemo(() => {
    return calculateTextureSize(snapshot.nx, snapshot.ny)
  }, [snapshot.nx, snapshot.ny])

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0f172a)
    sceneRef.current = scene

    const aspect = snapshot.width / snapshot.height
    const viewWidth = 2
    const viewHeight = viewWidth / aspect

    const camera = new THREE.OrthographicCamera(
      -viewWidth / 2,
      viewWidth / 2,
      viewHeight / 2,
      -viewHeight / 2,
      0.1,
      1000
    )
    camera.position.z = 1
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    colormapTextureRef.current = colormapTexture

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        dataTexture: { value: null },
        colormapTexture: { value: colormapTexture },
      },
      side: THREE.DoubleSide,
    })

    const geometry = new THREE.PlaneGeometry(viewWidth, viewHeight, 1, 1)
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)
    meshRef.current = mesh

    const handleResize = () => {
      if (!container || !renderer || !camera) return
      const newWidth = container.clientWidth
      const newHeight = container.clientHeight
      renderer.setSize(newWidth, newHeight)
    }
    window.addEventListener('resize', handleResize)

    renderer.render(scene, camera)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (renderer) {
        container.removeChild(renderer.domElement)
        renderer.dispose()
      }
      geometry.dispose()
      material.dispose()
    }
  }, [snapshot.width, snapshot.height, colormapTexture])

  useEffect(() => {
    if (!meshRef.current) return

    const mesh = meshRef.current
    const material = mesh.material as THREE.ShaderMaterial

    const data = fieldType === 'ux' 
      ? snapshot.ux 
      : fieldType === 'uy' 
      ? snapshot.uy 
      : snapshot.magnitude

    const dataTexture = createDataTexture(data, textureSize)

    if (dataTextureRef.current) {
      dataTextureRef.current.dispose()
    }
    dataTextureRef.current = dataTexture

    material.uniforms.dataTexture.value = dataTexture
    material.uniforms.dataTexture.needsUpdate = true

    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current)
    }
  }, [snapshot, fieldType, textureSize])

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full min-h-[400px] rounded-lg overflow-hidden"
    />
  )
}
