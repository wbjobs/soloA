import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { FrameData } from '../types'
import './Layout.module.css'

export type DisplayStyle = 'sphere' | 'stick' | 'ball_and_stick' | 'line'
export type ColorScheme = 'element' | 'residue' | 'chain'

interface MoleculeViewerProps {
  frameData: FrameData | null
  width?: number
  height?: number
  displayStyle?: DisplayStyle
  colorScheme?: ColorScheme
  showBox?: boolean
  sphereScale?: number
  stickRadius?: number
}

const ELEMENT_COLORS: Record<string, number> = {
  'H': 0xffffff,
  'C': 0x909090,
  'N': 0x3050f8,
  'O': 0xff0d0d,
  'F': 0x90e050,
  'Cl': 0x1ff01f,
  'Br': 0xa62929,
  'I': 0x940094,
  'S': 0xffff30,
  'P': 0xff8000,
  'He': 0xd9ffff,
  'Ne': 0xb3e3f5,
  'Ar': 0x80d1e3,
  'Kr': 0x5cb8d1,
  'Xe': 0x429eb0,
  'Ca': 0x3dff00,
  'Fe': 0e+0,
  'Na': 0xab5cf2,
  'Mg': 0x8aff00,
  'Zn': 0x7d80b0,
  'Cu': 0xc88033,
  default: 0xff1493
}

const RESIDUE_COLORS: Record<string, number> = {
  'ALA': 0x8cff8c,
  'ARG': 0x00007c,
  'ASN': 0xff7c70,
  'ASP': 0xa00042,
  'CYS': 0xffff70,
  'GLN': 0xff4c4c,
  'GLU': 0x660000,
  'GLY': 0xffffff,
  'HIS': 0x7070ff,
  'ILE': 0x004c00,
  'LEU': 0x455e45,
  'LYS': 0x4747b8,
  'MET': 0xb8a042,
  'PHE': 0x534c52,
  'PRO': 0x525252,
  'SER': 0xff7042,
  'THR': 0xb84c00,
  'TRP': 0x4f4600,
  'TYR': 0x8c704c,
  'VAL': 0xff8cff,
  default: 0xcccccc
}

function getElementColor(element: string | null, atomName: string): number {
  if (element && ELEMENT_COLORS[element]) {
    return ELEMENT_COLORS[element]
  }
  const name = (atomName || '').toUpperCase()
  const firstChar = name.charAt(0)
  if (ELEMENT_COLORS[firstChar]) {
    return ELEMENT_COLORS[firstChar]
  }
  return ELEMENT_COLORS.default
}

function getResidueColor(resname: string): number {
  const name = (resname || '').toUpperCase()
  return RESIDUE_COLORS[name] || RESIDUE_COLORS.default
}

function getElementRadius(element: string | null, atomName: string): number {
  const radiusMap: Record<string, number> = {
    'H': 1.2,
    'C': 1.7,
    'N': 1.5,
    'O': 1.4,
    'F': 1.35,
    'Cl': 1.8,
    'Br': 1.95,
    'I': 2.15,
    'S': 1.8,
    'P': 1.8,
    'Na': 2.27,
    'Mg': 1.73,
    'Ca': 2.31,
    'Fe': 1.4,
    'Zn': 1.39,
    'Cu': 1.4,
    default: 1.5
  }
  
  if (element && radiusMap[element]) {
    return radiusMap[element]
  }
  const name = (atomName || '').toUpperCase()
  const firstChar = name.charAt(0)
  if (radiusMap[firstChar]) {
    return radiusMap[firstChar]
  }
  return radiusMap.default
}

function computeBonds(positions: number[][], cutoff: number = 1.8): [number, number][] {
  const bonds: [number, number][] = []
  const n = positions.length
  const cutoffSq = cutoff * cutoff
  
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = positions[i][0] - positions[j][0]
      const dy = positions[i][1] - positions[j][1]
      const dz = positions[i][2] - positions[j][2]
      const distSq = dx * dx + dy * dy + dz * dz
      
      if (distSq < cutoffSq) {
        bonds.push([i, j])
      }
    }
  }
  
  return bonds
}

export function MoleculeViewer({
  frameData,
  width = 800,
  height = 500,
  displayStyle = 'ball_and_stick',
  colorScheme = 'element',
  showBox = true,
  sphereScale = 0.3,
  stickRadius = 0.15
}: MoleculeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const moleculeGroupRef = useRef<THREE.Group | null>(null)
  const animationIdRef = useRef<number | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  const initScene = useCallback(() => {
    if (!containerRef.current || isInitialized) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0d1117)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000)
    camera.position.set(0, 0, 50)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    containerRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controlsRef.current = controls

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(10, 20, 10)
    scene.add(directionalLight)

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.4)
    directionalLight2.position.set(-10, -10, -10)
    scene.add(directionalLight2)

    const moleculeGroup = new THREE.Group()
    scene.add(moleculeGroup)
    moleculeGroupRef.current = moleculeGroup

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    setIsInitialized(true)
  }, [width, height, isInitialized])

  const clearMolecule = useCallback(() => {
    if (moleculeGroupRef.current) {
      while (moleculeGroupRef.current.children.length > 0) {
        const child = moleculeGroupRef.current.children[0]
        moleculeGroupRef.current.remove(child)
        
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose())
          } else {
            child.material.dispose()
          }
        } else if (child instanceof THREE.Line) {
          child.geometry.dispose()
        }
      }
    }
  }, [])

  const createAtoms = useCallback((data: FrameData) => {
    if (!moleculeGroupRef.current) return

    const { positions, atom_names, atom_resnames, elements } = data
    const nAtoms = positions.length

    const sphereGeometry = new THREE.SphereGeometry(1, 16, 16)

    for (let i = 0; i < nAtoms; i++) {
      let color: number
      if (colorScheme === 'element') {
        color = getElementColor(elements?.[i] || null, atom_names[i])
      } else {
        color = getResidueColor(atom_resnames[i])
      }

      let radius: number
      if (displayStyle === 'sphere') {
        radius = getElementRadius(elements?.[i] || null, atom_names[i])
      } else {
        radius = sphereScale * getElementRadius(elements?.[i] || null, atom_names[i])
      }

      if (displayStyle === 'stick') {
        radius = stickRadius
      }

      const material = new THREE.MeshPhongMaterial({
        color,
        shininess: 50,
        specular: 0x222222
      })

      const mesh = new THREE.Mesh(sphereGeometry, material)
      mesh.position.set(positions[i][0], positions[i][1], positions[i][2])
      mesh.scale.setScalar(radius)
      mesh.userData.atomIndex = i
      mesh.userData.atomName = atom_names[i]
      mesh.userData.residueName = atom_resnames[i]
      
      moleculeGroupRef.current.add(mesh)
    }

    sphereGeometry.dispose()
  }, [displayStyle, colorScheme, sphereScale, stickRadius])

  const createBonds = useCallback((data: FrameData) => {
    if (!moleculeGroupRef.current) return
    if (displayStyle === 'sphere') return

    const { positions, atom_names, elements } = data
    const bonds = computeBonds(positions, 1.8)

    const cylinderGeometry = new THREE.CylinderGeometry(stickRadius, stickRadius, 1, 8)

    bonds.forEach(([i, j]) => {
      const start = new THREE.Vector3(positions[i][0], positions[i][1], positions[i][2])
      const end = new THREE.Vector3(positions[j][0], positions[j][1], positions[j][2])
      const direction = new THREE.Vector3().subVectors(end, start)
      const length = direction.length()
      const midpoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)

      let color1: number
      let color2: number
      if (colorScheme === 'element') {
        color1 = getElementColor(elements?.[i] || null, atom_names[i])
        color2 = getElementColor(elements?.[j] || null, atom_names[j])
      } else {
        color1 = 0xcccccc
        color2 = 0xcccccc
      }

      const quaternion = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.clone().normalize()
      )

      const material1 = new THREE.MeshPhongMaterial({
        color: color1,
        shininess: 30
      })
      const mesh1 = new THREE.Mesh(cylinderGeometry, material1)
      mesh1.position.set(
        (start.x + midpoint.x) / 2,
        (start.y + midpoint.y) / 2,
        (start.z + midpoint.z) / 2
      )
      mesh1.scale.set(1, length / 2, 1)
      mesh1.setRotationFromQuaternion(quaternion)
      moleculeGroupRef.current!.add(mesh1)

      const material2 = new THREE.MeshPhongMaterial({
        color: color2,
        shininess: 30
      })
      const mesh2 = new THREE.Mesh(cylinderGeometry, material2)
      mesh2.position.set(
        (midpoint.x + end.x) / 2,
        (midpoint.y + end.y) / 2,
        (midpoint.z + end.z) / 2
      )
      mesh2.scale.set(1, length / 2, 1)
      mesh2.setRotationFromQuaternion(quaternion)
      moleculeGroupRef.current!.add(mesh2)
    })

    cylinderGeometry.dispose()
  }, [displayStyle, colorScheme, stickRadius])

  const createBox = useCallback((data: FrameData) => {
    if (!moleculeGroupRef.current || !showBox || !data.box) return

    const [a, b, c, alpha, beta, gamma] = data.box
    const geometry = new THREE.BoxGeometry(a, b, c)
    
    const edges = new THREE.EdgesGeometry(geometry)
    const lineMaterial = new THREE.LineBasicMaterial({ 
      color: 0x666666,
      linewidth: 1,
      transparent: true,
      opacity: 0.5
    })
    const wireframe = new THREE.LineSegments(edges, lineMaterial)
    wireframe.position.set(a / 2, b / 2, c / 2)
    
    moleculeGroupRef.current.add(wireframe)
  }, [showBox])

  const centerAndZoom = useCallback((data: FrameData) => {
    if (!cameraRef.current || !moleculeGroupRef.current) return

    const { positions } = data
    if (positions.length === 0) return

    const n = positions.length
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    let minZ = Infinity, maxZ = -Infinity

    for (let i = 0; i < n; i++) {
      minX = Math.min(minX, positions[i][0])
      maxX = Math.max(maxX, positions[i][0])
      minY = Math.min(minY, positions[i][1])
      maxY = Math.max(maxY, positions[i][1])
      minZ = Math.min(minZ, positions[i][2])
      maxZ = Math.max(maxZ, positions[i][2])
    }

    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const centerZ = (minZ + maxZ) / 2

    const sizeX = maxX - minX
    const sizeY = maxY - minY
    const sizeZ = maxZ - minZ
    const maxSize = Math.max(sizeX, sizeY, sizeZ, 10)

    const camera = cameraRef.current
    const fov = camera.fov * (Math.PI / 180)
    const distance = (maxSize / 2) / Math.tan(fov / 2) * 2.0

    moleculeGroupRef.current.position.set(-centerX, -centerY, -centerZ)
    camera.position.set(0, 0, distance)
    camera.lookAt(0, 0, 0)
    
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0)
      controlsRef.current.update()
    }
  }, [])

  const renderMolecule = useCallback((data: FrameData) => {
    if (!isInitialized) return

    clearMolecule()
    createBox(data)
    
    if (displayStyle === 'line') {
      createBonds(data)
    } else {
      createAtoms(data)
      if (displayStyle !== 'sphere') {
        createBonds(data)
      }
    }
    
    centerAndZoom(data)
  }, [
    isInitialized, 
    clearMolecule, 
    createAtoms, 
    createBonds, 
    createBox,
    centerAndZoom,
    displayStyle
  ])

  useEffect(() => {
    initScene()
  }, [initScene])

  useEffect(() => {
    if (frameData && isInitialized) {
      renderMolecule(frameData)
    }
  }, [frameData, renderMolecule, isInitialized])

  useEffect(() => {
    if (frameData && isInitialized) {
      renderMolecule(frameData)
    }
  }, [displayStyle, colorScheme, showBox, sphereScale, stickRadius])

  useEffect(() => {
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current)
      }
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement)
        rendererRef.current.dispose()
      }
    }
  }, [])

  return (
    <div 
      ref={containerRef} 
      className="viewer-container"
      style={{ width: '100%', height: height }}
    >
      {(!frameData || !frameData.positions?.length) && (
        <div className="empty-state" style={{ height: height }}>
          <div className="icon">🔬</div>
          <p>Select a frame to view molecule</p>
        </div>
      )}
    </div>
  )
}
