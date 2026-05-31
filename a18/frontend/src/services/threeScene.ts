import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PipelineNode, Pipeline } from '../types';

export interface ThreeSceneOptions {
  showGrid?: boolean;
  showAxes?: boolean;
  backgroundColor?: number;
  onNodeClick?: (node: PipelineNode) => void;
  onPipelineClick?: (pipeline: Pipeline) => void;
  enableShadows?: boolean;
  maxPixelRatio?: number;
}

const MATERIAL_CACHE = new Map<string, THREE.MeshPhongMaterial>();

export class ThreeSceneManager {
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private controls: OrbitControls | null = null;
  private container: HTMLElement | null = null;
  private animationId: number | null = null;
  
  private nodeMeshes: Map<string, THREE.Mesh> = new Map();
  private pipelineMeshes: Map<string, THREE.Mesh> = new Map();
  private nodeDataMap: Map<THREE.Object3D, PipelineNode> = new Map();
  private pipelineDataMap: Map<THREE.Object3D, Pipeline> = new Map();
  
  private nodeGroup: THREE.Group | null = null;
  private pipelineGroup: THREE.Group | null = null;
  
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mouse: THREE.Vector2 = new THREE.Vector2();
  
  private options: ThreeSceneOptions;
  private isInitialized: boolean = false;

  constructor(options: ThreeSceneOptions = {}) {
    this.options = {
      showGrid: true,
      showAxes: true,
      backgroundColor: 0x1a1a2e,
      enableShadows: false,
      maxPixelRatio: 1,
      ...options
    };
  }

  initialize(container: HTMLElement): void {
    if (this.isInitialized) return;
    
    this.container = container;
    
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.options.backgroundColor || 0x1a1a2e);

    this.nodeGroup = new THREE.Group();
    this.scene.add(this.nodeGroup);
    
    this.pipelineGroup = new THREE.Group();
    this.scene.add(this.pipelineGroup);

    const width = container.clientWidth;
    const height = container.clientHeight;
    
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100000);
    this.camera.position.set(100, 100, 100);

    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    
    const pixelRatio = Math.min(
      this.options.maxPixelRatio || 1,
      window.devicePixelRatio
    );
    this.renderer.setPixelRatio(pixelRatio);
    
    if (this.options.enableShadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = true;

    this.setupLights();
    
    if (this.options.showGrid) {
      const gridHelper = new THREE.GridHelper(500, 50, 0x444444, 0x222222);
      this.scene.add(gridHelper);
    }

    if (this.options.showAxes) {
      const axesHelper = new THREE.AxesHelper(50);
      this.scene.add(axesHelper);
    }

    this.setupInteraction();
    this.animate();

    window.addEventListener('resize', this.onWindowResize.bind(this));
    this.isInitialized = true;
  }

  private setupLights(): void {
    if (!this.scene) return;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(100, 200, 100);
    
    if (this.options.enableShadows) {
      directionalLight.castShadow = true;
      directionalLight.shadow.mapSize.width = 1024;
      directionalLight.shadow.mapSize.height = 1024;
      directionalLight.shadow.camera.near = 0.5;
      directionalLight.shadow.camera.far = 500;
    }
    
    this.scene.add(directionalLight);

    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
    this.scene.add(hemisphereLight);
  }

  private setupInteraction(): void {
    if (!this.renderer || !this.container) return;

    this.renderer.domElement.addEventListener('click', (event: MouseEvent) => {
      const rect = this.container!.getBoundingClientRect();
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera!);

      const targets: THREE.Object3D[] = [];
      if (this.nodeGroup) targets.push(this.nodeGroup);
      if (this.pipelineGroup) targets.push(this.pipelineGroup);

      const intersects = this.raycaster.intersectObjects(targets, true);

      if (intersects.length > 0) {
        let clickedObject = intersects[0].object;
        
        while (clickedObject.parent && !this.nodeDataMap.has(clickedObject) && !this.pipelineDataMap.has(clickedObject)) {
          clickedObject = clickedObject.parent;
        }

        const node = this.nodeDataMap.get(clickedObject);
        if (node && this.options.onNodeClick) {
          this.options.onNodeClick(node);
          return;
        }

        const pipeline = this.pipelineDataMap.get(clickedObject);
        if (pipeline && this.options.onPipelineClick) {
          this.options.onPipelineClick(pipeline);
        }
      }
    });
  }

  private getOrCreateMaterial(
    color: string,
    isPipeline: boolean = false
  ): THREE.MeshPhongMaterial {
    const cacheKey = `${color}_${isPipeline}`;
    
    if (MATERIAL_CACHE.has(cacheKey)) {
      return MATERIAL_CACHE.get(cacheKey)!;
    }

    const material = new THREE.MeshPhongMaterial({
      color: new THREE.Color(color),
      shininess: isPipeline ? 20 : 50,
      specular: 0x444444,
      transparent: isPipeline,
      opacity: isPipeline ? 0.9 : 1,
      side: isPipeline ? THREE.DoubleSide : THREE.FrontSide
    });

    MATERIAL_CACHE.set(cacheKey, material);
    return material;
  }

  addNode(node: PipelineNode): THREE.Mesh {
    if (!this.scene || !this.nodeGroup) {
      throw new Error('Scene not initialized');
    }

    const color = this.getNodeColor(node.nodeType);
    const size = this.getNodeSize(node.nodeType);

    const geometry = this.createNodeGeometry(node.nodeType, size);
    const material = this.getOrCreateMaterial(color, false);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(node.x, node.z, node.y);
    
    if (this.options.enableShadows) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }

    this.nodeGroup.add(mesh);
    this.nodeMeshes.set(node.id, mesh);
    this.nodeDataMap.set(mesh, node);

    return mesh;
  }

  private createNodeGeometry(nodeType: string, size: number): THREE.BufferGeometry {
    switch (nodeType) {
      case 'valve':
        return new THREE.BoxGeometry(size, size, size);
      case 'pump':
        return new THREE.CylinderGeometry(size / 2, size / 2, size * 1.5, 12);
      case 'tank':
      case 'reservoir':
        return new THREE.CylinderGeometry(size, size, size * 2, 16);
      default:
        return new THREE.SphereGeometry(size / 2, 12, 12);
    }
  }

  addPipeline(pipeline: Pipeline, startNode?: PipelineNode, endNode?: PipelineNode): THREE.Mesh {
    if (!this.scene || !this.pipelineGroup) {
      throw new Error('Scene not initialized');
    }

    const color = this.getPipelineColor(pipeline);
    const radius = Math.max(pipeline.diameter / 100, 0.3);

    let curve: THREE.Curve<THREE.Vector3>;
    
    if (pipeline.geometry && pipeline.geometry.coordinates.length > 1) {
      const points = pipeline.geometry.coordinates.map(coord => 
        new THREE.Vector3(coord[0], coord[2] || 0, coord[1])
      );
      curve = new THREE.CatmullRomCurve3(points);
    } else if (startNode && endNode) {
      curve = new THREE.LineCurve3(
        new THREE.Vector3(startNode.x, startNode.z, startNode.y),
        new THREE.Vector3(endNode.x, endNode.z, endNode.y)
      );
    } else {
      curve = new THREE.LineCurve3(
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(10, 0, 10)
      );
    }

    const geometry = new THREE.TubeGeometry(curve, 32, radius, 6, false);
    const material = this.getOrCreateMaterial(color, true);

    const mesh = new THREE.Mesh(geometry, material);
    
    if (this.options.enableShadows) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }

    this.pipelineGroup.add(mesh);
    this.pipelineMeshes.set(pipeline.id, mesh);
    this.pipelineDataMap.set(mesh, pipeline);

    return mesh;
  }

  addNodesBatch(nodes: PipelineNode[], batchSize: number = 50): Promise<void> {
    return new Promise((resolve) => {
      let index = 0;
      
      const processBatch = () => {
        const endIndex = Math.min(index + batchSize, nodes.length);
        
        for (let i = index; i < endIndex; i++) {
          this.addNode(nodes[i]);
        }
        
        index = endIndex;
        
        if (index < nodes.length) {
          requestAnimationFrame(processBatch);
        } else {
          resolve();
        }
      };
      
      processBatch();
    });
  }

  addPipelinesBatch(
    pipelines: Pipeline[], 
    nodeMap: Map<string, PipelineNode>,
    batchSize: number = 30
  ): Promise<void> {
    return new Promise((resolve) => {
      let index = 0;
      
      const processBatch = () => {
        const endIndex = Math.min(index + batchSize, pipelines.length);
        
        for (let i = index; i < endIndex; i++) {
          const pipeline = pipelines[i];
          const startNode = nodeMap.get(pipeline.startNodeId);
          const endNode = nodeMap.get(pipeline.endNodeId);
          this.addPipeline(pipeline, startNode, endNode);
        }
        
        index = endIndex;
        
        if (index < pipelines.length) {
          requestAnimationFrame(processBatch);
        } else {
          resolve();
        }
      };
      
      processBatch();
    });
  }

  addNodes(nodes: PipelineNode[]): void {
    this.addNodesBatch(nodes);
  }

  addPipelines(pipelines: Pipeline[], nodeMap: Map<string, PipelineNode>): void {
    this.addPipelinesBatch(pipelines, nodeMap);
  }

  updateNodePosition(nodeId: string, x: number, y: number, z: number): void {
    const mesh = this.nodeMeshes.get(nodeId);
    if (mesh) {
      mesh.position.set(x, z, y);
    }
  }

  updateNodeColor(nodeId: string, color: string): void {
    const mesh = this.nodeMeshes.get(nodeId);
    if (mesh && mesh.material instanceof THREE.MeshPhongMaterial) {
      mesh.material.color.set(color);
    }
  }

  updatePipelineColor(pipelineId: string, color: string): void {
    const mesh = this.pipelineMeshes.get(pipelineId);
    if (mesh && mesh.material instanceof THREE.MeshPhongMaterial) {
      mesh.material.color.set(color);
    }
  }

  highlightNode(nodeId: string): void {
    const mesh = this.nodeMeshes.get(nodeId);
    if (mesh && mesh.material instanceof THREE.MeshPhongMaterial) {
      mesh.material.emissive = new THREE.Color(0xff0000);
      mesh.material.emissiveIntensity = 0.5;
    }
  }

  unhighlightNode(nodeId: string): void {
    const mesh = this.nodeMeshes.get(nodeId);
    if (mesh && mesh.material instanceof THREE.MeshPhongMaterial) {
      mesh.material.emissiveIntensity = 0;
    }
  }

  highlightPipeline(pipelineId: string): void {
    const mesh = this.pipelineMeshes.get(pipelineId);
    if (mesh && mesh.material instanceof THREE.MeshPhongMaterial) {
      mesh.material.emissive = new THREE.Color(0xff0000);
      mesh.material.emissiveIntensity = 0.3;
    }
  }

  unhighlightPipeline(pipelineId: string): void {
    const mesh = this.pipelineMeshes.get(pipelineId);
    if (mesh && mesh.material instanceof THREE.MeshPhongMaterial) {
      mesh.material.emissiveIntensity = 0;
    }
  }

  removeNode(nodeId: string): void {
    if (!this.scene || !this.nodeGroup) return;
    
    const mesh = this.nodeMeshes.get(nodeId);
    if (mesh) {
      this.nodeGroup.remove(mesh);
      mesh.geometry.dispose();
      this.nodeMeshes.delete(nodeId);
      this.nodeDataMap.delete(mesh);
    }
  }

  removePipeline(pipelineId: string): void {
    if (!this.scene || !this.pipelineGroup) return;
    
    const mesh = this.pipelineMeshes.get(pipelineId);
    if (mesh) {
      this.pipelineGroup.remove(mesh);
      mesh.geometry.dispose();
      this.pipelineMeshes.delete(pipelineId);
      this.pipelineDataMap.delete(mesh);
    }
  }

  clearAll(): void {
    if (!this.scene) return;

    this.nodeMeshes.forEach((mesh) => {
      if (this.nodeGroup) {
        this.nodeGroup.remove(mesh);
      }
      mesh.geometry.dispose();
    });

    this.pipelineMeshes.forEach((mesh) => {
      if (this.pipelineGroup) {
        this.pipelineGroup.remove(mesh);
      }
      mesh.geometry.dispose();
    });

    this.nodeMeshes.clear();
    this.pipelineMeshes.clear();
    this.nodeDataMap.clear();
    this.pipelineDataMap.clear();
  }

  setNodesVisibility(visible: boolean): void {
    if (this.nodeGroup) {
      this.nodeGroup.visible = visible;
    }
  }

  setPipelinesVisibility(visible: boolean): void {
    if (this.pipelineGroup) {
      this.pipelineGroup.visible = visible;
    }
  }

  fitCameraToScene(): void {
    if (!this.scene || !this.camera || !this.controls) return;

    const box = new THREE.Box3().setFromObject(this.scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / 2 * Math.tan(fov * 2));
    cameraZ *= 1.5;

    this.camera.position.set(center.x, center.y + cameraZ, center.z + cameraZ);
    this.controls.target.copy(center);
    this.controls.update();
  }

  private onWindowResize(): void {
    if (!this.container || !this.camera || !this.renderer) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private animate(): void {
    this.animationId = requestAnimationFrame(this.animate.bind(this));
    
    if (this.controls) {
      this.controls.update();
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private getNodeColor(nodeType: string): string {
    const colors: Record<string, string> = {
      junction: '#00ff00',
      valve: '#ff0000',
      pump: '#0000ff',
      tank: '#ffff00',
      reservoir: '#ff00ff'
    };
    return colors[nodeType] || '#00ff00';
  }

  private getNodeSize(nodeType: string): number {
    const sizes: Record<string, number> = {
      junction: 2,
      valve: 4,
      pump: 5,
      tank: 7,
      reservoir: 8
    };
    return sizes[nodeType] || 2;
  }

  private getPipelineColor(pipeline: Pipeline): string {
    if (pipeline.status === 'maintenance') return '#ff6600';
    if (pipeline.status === 'inactive') return '#888888';
    
    const materials: Record<string, string> = {
      Steel: '#0066ff',
      PVC: '#00ccff',
      PE: '#00ffcc',
      CastIron: '#666666',
      Concrete: '#996633'
    };
    return materials[pipeline.material] || '#0066ff';
  }

  getScene(): THREE.Scene | null {
    return this.scene;
  }

  getCamera(): THREE.PerspectiveCamera | null {
    return this.camera;
  }

  getRenderer(): THREE.WebGLRenderer | null {
    return this.renderer;
  }

  getNodeMesh(nodeId: string): THREE.Mesh | undefined {
    return this.nodeMeshes.get(nodeId);
  }

  getPipelineMesh(pipelineId: string): THREE.Mesh | undefined {
    return this.pipelineMeshes.get(pipelineId);
  }

  getNodeCount(): number {
    return this.nodeMeshes.size;
  }

  getPipelineCount(): number {
    return this.pipelineMeshes.size;
  }

  dispose(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }

    this.clearAll();

    if (this.controls) {
      this.controls.dispose();
    }

    if (this.renderer) {
      this.renderer.dispose();
      if (this.container && this.renderer.domElement.parentNode === this.container) {
        this.container.removeChild(this.renderer.domElement);
      }
    }

    window.removeEventListener('resize', this.onWindowResize.bind(this));

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.container = null;
    this.nodeGroup = null;
    this.pipelineGroup = null;
    this.isInitialized = false;
  }

  destroy(): void {
    this.dispose();
  }
}

export default ThreeSceneManager;
