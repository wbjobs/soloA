declare module 'three/examples/jsm/controls/OrbitControls' {
  import { Camera, EventDispatcher, MOUSE, TOUCH, Vector3 } from 'three'

  export interface OrbitControlsEventMap {
    change: {}
    start: {}
    end: {}
  }

  export class OrbitControls extends EventDispatcher<OrbitControlsEventMap> {
    constructor(object: Camera, domElement?: HTMLElement)

    object: Camera
    domElement: HTMLElement | Document

    enabled: boolean
    target: Vector3
    center: Vector3
    cursor: Vector3

    minDistance: number
    maxDistance: number
    minZoom: number
    maxZoom: number
    minTargetRadius: number
    maxTargetRadius: number

    minPolarAngle: number
    maxPolarAngle: number
    minAzimuthAngle: number
    maxAzimuthAngle: number

    enableDamping: boolean
    dampingFactor: number

    enableZoom: boolean
    zoomSpeed: number
    zoomToCursor: boolean

    enableRotate: boolean
    rotateSpeed: number

    enablePan: boolean
    panSpeed: number
    screenSpacePanning: boolean
    keyPanSpeed: number

    autoRotate: boolean
    autoRotateSpeed: number

    keys: { LEFT: string; UP: string; RIGHT: string; BOTTOM: string }
    mouseButtons: {
      LEFT?: MOUSE | null
      MIDDLE?: MOUSE | null
      RIGHT?: MOUSE | null
    }
    touches: { ONE?: TOUCH | null; TWO?: TOUCH | null }

    target0: Vector3
    position0: Vector3
    zoom0: number

    update(deltaTime?: number): boolean
    listenToKeyEvents(domElement: HTMLElement | Window): void
    stopListenToKeyEvents(): void
    saveState(): void
    reset(): void
    dispose(): void
    getPolarAngle(): number
    getAzimuthalAngle(): number
    getDistance(): number
  }
}
