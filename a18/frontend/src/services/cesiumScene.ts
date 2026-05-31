import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { PipelineNode, Pipeline, Layer, CameraView, LayerStyle } from '../types';

const BATCH_SIZE = 100;

export class CesiumSceneManager {
  private viewer: Cesium.Viewer | null = null;
  private container: HTMLElement | null = null;
  private nodeEntities: Map<string, Cesium.Entity> = new Map();
  private pipelineEntities: Map<string, Cesium.Entity> = new Map();
  private layers: Map<string, { layer: Layer; entities: Set<string> }> = new Map();
  private selectedEntity: Cesium.Entity | null = null;
  private onEntitySelect: ((entity: any) => void) | null = null;
  
  private pointPrimitiveCollection: Cesium.PointPrimitiveCollection | null = null;
  private polylineCollection: Cesium.PolylineCollection | null = null;
  private nodeIdToPrimitiveIndex: Map<string, number> = new Map();
  private pipelineIdToPrimitiveIndex: Map<string, number> = new Map();
  private usePrimitives: boolean = true;

  constructor() {}

  initialize(container: HTMLElement, options?: {
    defaultView?: CameraView;
    onEntitySelect?: (entity: any) => void;
    usePrimitives?: boolean;
  }): Cesium.Viewer {
    this.container = container;
    if (options?.onEntitySelect) {
      this.onEntitySelect = options.onEntitySelect;
    }
    if (options?.usePrimitives !== undefined) {
      this.usePrimitives = options.usePrimitives;
    }

    Cesium.Ion.defaultAccessToken = '';

    this.viewer = new Cesium.Viewer(container, {
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: true,
      navigationHelpButton: false,
      fullscreenButton: true,
      infoBox: false,
      selectionIndicator: true,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      targetFrameRate: 60
    });

    this.viewer.scene.globe.enableLighting = false;
    this.viewer.scene.skyAtmosphere.show = false;
    this.viewer.scene.fog.enabled = false;
    this.viewer.scene.globe.depthTestAgainstTerrain = false;
    
    if (this.viewer.scene.postProcessStages) {
      this.viewer.scene.postProcessStages.bloom.enabled = false;
    }

    if (options?.defaultView) {
      this.setCameraView(options.defaultView);
    } else {
      this.viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(116.397428, 39.90923, 10000),
        duration: 0
      });
    }

    this.setupInteraction();

    if (this.usePrimitives) {
      this.initializePrimitiveCollections();
    }

    return this.viewer;
  }

  private initializePrimitiveCollections(): void {
    if (!this.viewer) return;

    this.pointPrimitiveCollection = new Cesium.PointPrimitiveCollection({
      blendOption: Cesium.BlendOption.OPAQUE_AND_TRANSLUCENT
    });
    
    this.polylineCollection = new Cesium.PolylineCollection();
    
    this.viewer.scene.primitives.add(this.pointPrimitiveCollection);
    this.viewer.scene.primitives.add(this.polylineCollection);
  }

  private setupInteraction(): void {
    if (!this.viewer) return;

    const handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);

    handler.setInputAction((movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      if (!this.viewer) return;
      
      if (this.usePrimitives) {
        this.handlePrimitivePick(movement.position);
      } else {
        const picked = this.viewer.scene.pick(movement.position);
        
        if (Cesium.defined(picked) && picked.id instanceof Cesium.Entity) {
          const entity = picked.id;
          this.selectEntity(entity);
          if (this.onEntitySelect) {
            this.onEntitySelect(entity);
          }
        } else {
          this.clearSelection();
          if (this.onEntitySelect) {
            this.onEntitySelect(null);
          }
        }
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  private handlePrimitivePick(position: Cesium.Cartesian2): void {
    if (!this.viewer) return;

    const picked = this.viewer.scene.pick(position);
    
    if (Cesium.defined(picked)) {
      let selectedData: any = null;
      
      if (picked.primitive && picked.id) {
        if (this.nodeIdToPrimitiveIndex.has(picked.id)) {
          selectedData = {
            type: 'node',
            id: picked.id
          };
        } else if (this.pipelineIdToPrimitiveIndex.has(picked.id)) {
          selectedData = {
            type: 'pipeline',
            id: picked.id
          };
        }
      }

      if (selectedData) {
        const entity = this.nodeEntities.get(selectedData.id) || this.pipelineEntities.get(selectedData.id);
        if (entity) {
          this.selectEntity(entity);
          if (this.onEntitySelect) {
            this.onEntitySelect(entity);
          }
        }
      } else {
        this.clearSelection();
        if (this.onEntitySelect) {
          this.onEntitySelect(null);
        }
      }
    } else {
      this.clearSelection();
      if (this.onEntitySelect) {
        this.onEntitySelect(null);
      }
    }
  }

  selectEntity(entity: Cesium.Entity): void {
    if (!this.viewer) return;
    
    this.clearSelection();
    this.selectedEntity = entity;
    this.viewer.selectedEntity = entity;
  }

  clearSelection(): void {
    if (!this.viewer) return;
    
    this.selectedEntity = null;
    this.viewer.selectedEntity = undefined;
  }

  getSelectedEntity(): Cesium.Entity | null {
    return this.selectedEntity;
  }

  setCameraView(view: CameraView): void {
    if (!this.viewer) return;

    this.viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        view.longitude,
        view.latitude,
        view.height
      ),
      orientation: {
        heading: Cesium.Math.toRadians(view.heading),
        pitch: Cesium.Math.toRadians(view.pitch),
        roll: Cesium.Math.toRadians(view.roll)
      }
    });
  }

  flyToView(view: CameraView, duration: number = 2): void {
    if (!this.viewer) return;

    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        view.longitude,
        view.latitude,
        view.height
      ),
      orientation: {
        heading: Cesium.Math.toRadians(view.heading),
        pitch: Cesium.Math.toRadians(view.pitch),
        roll: Cesium.Math.toRadians(view.roll)
      },
      duration
    });
  }

  getCurrentView(): CameraView | null {
    if (!this.viewer) return null;

    const position = this.viewer.camera.position;
    const cartographic = Cesium.Cartographic.fromCartesian(position);

    return {
      longitude: Cesium.Math.toDegrees(cartographic.longitude),
      latitude: Cesium.Math.toDegrees(cartographic.latitude),
      height: cartographic.height,
      heading: Cesium.Math.toDegrees(this.viewer.camera.heading),
      pitch: Cesium.Math.toDegrees(this.viewer.camera.pitch),
      roll: Cesium.Math.toDegrees(this.viewer.camera.roll)
    };
  }

  addNode(node: PipelineNode, style?: LayerStyle): Cesium.Entity {
    if (!this.viewer) {
      throw new Error('Viewer not initialized');
    }

    const entityStyle = style || {
      color: this.getNodeColor(node.nodeType),
      size: this.getNodeSize(node.nodeType)
    };

    if (this.usePrimitives && this.pointPrimitiveCollection) {
      return this.addNodeWithPrimitive(node, entityStyle);
    }

    const entity = this.viewer.entities.add({
      id: node.id,
      name: node.name,
      position: Cesium.Cartesian3.fromDegrees(node.x, node.y, node.z),
      point: {
        pixelSize: entityStyle.size || 8,
        color: Cesium.Color.fromCssColorString(entityStyle.color || '#00ff00'),
        outlineColor: Cesium.Color.fromCssColorString(entityStyle.outlineColor || '#ffffff'),
        outlineWidth: entityStyle.outlineWidth || 2,
        heightReference: Cesium.HeightReference.NONE
      },
      properties: {
        type: 'node',
        nodeType: node.nodeType,
        data: node
      }
    });

    this.nodeEntities.set(node.id, entity);
    
    if (node.layerId) {
      const layerData = this.layers.get(node.layerId);
      if (layerData) {
        layerData.entities.add(node.id);
      }
    }

    return entity;
  }

  private addNodeWithPrimitive(node: PipelineNode, style: LayerStyle): Cesium.Entity {
    if (!this.viewer || !this.pointPrimitiveCollection) {
      throw new Error('Viewer not initialized');
    }

    const color = Cesium.Color.fromCssColorString(style.color || this.getNodeColor(node.nodeType));
    const outlineColor = Cesium.Color.fromCssColorString(style.outlineColor || '#ffffff');
    
    const point = this.pointPrimitiveCollection.add({
      position: Cesium.Cartesian3.fromDegrees(node.x, node.y, node.z),
      color: color,
      outlineColor: outlineColor,
      outlineWidth: style.outlineWidth || 2,
      pixelSize: style.size || this.getNodeSize(node.nodeType),
      id: node.id
    });

    const index = this.pointPrimitiveCollection.length - 1;
    this.nodeIdToPrimitiveIndex.set(node.id, index);

    const entity = this.viewer.entities.add({
      id: node.id,
      name: node.name,
      position: Cesium.Cartesian3.fromDegrees(node.x, node.y, node.z),
      properties: {
        type: 'node',
        nodeType: node.nodeType,
        data: node
      }
    });

    this.nodeEntities.set(node.id, entity);
    
    if (node.layerId) {
      const layerData = this.layers.get(node.layerId);
      if (layerData) {
        layerData.entities.add(node.id);
      }
    }

    return entity;
  }

  addNodesBatch(nodes: PipelineNode[]): void {
    if (!this.viewer) return;
    
    const totalNodes = nodes.length;
    let processed = 0;

    const processBatch = (startIndex: number) => {
      const endIndex = Math.min(startIndex + BATCH_SIZE, totalNodes);
      
      for (let i = startIndex; i < endIndex; i++) {
        this.addNode(nodes[i]);
        processed++;
      }

      if (endIndex < totalNodes) {
        requestAnimationFrame(() => processBatch(endIndex));
      }
    };

    processBatch(0);
  }

  addPipeline(pipeline: Pipeline, style?: LayerStyle): Cesium.Entity {
    if (!this.viewer) {
      throw new Error('Viewer not initialized');
    }

    const entityStyle = style || {
      color: this.getPipelineColor(pipeline),
      width: this.getPipelineWidth(pipeline.diameter)
    };

    let positions: Cesium.Cartesian3[];
    
    if (pipeline.geometry && pipeline.geometry.coordinates) {
      positions = pipeline.geometry.coordinates.map(coord => 
        Cesium.Cartesian3.fromDegrees(coord[0], coord[1], coord[2] || 0)
      );
    } else {
      positions = [
        Cesium.Cartesian3.fromDegrees(0, 0, 0),
        Cesium.Cartesian3.fromDegrees(0.001, 0.001, 0)
      ];
    }

    if (this.usePrimitives && this.polylineCollection) {
      return this.addPipelineWithPrimitive(pipeline, positions, entityStyle);
    }

    const entity = this.viewer.entities.add({
      id: pipeline.id,
      name: pipeline.name,
      polyline: {
        positions,
        width: entityStyle.width || 3,
        material: Cesium.Color.fromCssColorString(entityStyle.color || '#0066ff'),
        clampToGround: false,
        arcType: Cesium.ArcType.NONE
      },
      properties: {
        type: 'pipeline',
        data: pipeline
      }
    });

    this.pipelineEntities.set(pipeline.id, entity);
    
    if (pipeline.layerId) {
      const layerData = this.layers.get(pipeline.layerId);
      if (layerData) {
        layerData.entities.add(pipeline.id);
      }
    }

    return entity;
  }

  private addPipelineWithPrimitive(
    pipeline: Pipeline, 
    positions: Cesium.Cartesian3[],
    style: LayerStyle
  ): Cesium.Entity {
    if (!this.viewer || !this.polylineCollection) {
      throw new Error('Viewer not initialized');
    }

    const color = Cesium.Color.fromCssColorString(style.color || this.getPipelineColor(pipeline));
    
    const polyline = this.polylineCollection.add({
      positions: positions,
      width: style.width || this.getPipelineWidth(pipeline.diameter),
      material: new Cesium.PolylineMaterialAppearance({
        material: Cesium.Material.fromType('Color', {
          color: color
        })
      }),
      id: pipeline.id
    });

    const index = this.polylineCollection.length - 1;
    this.pipelineIdToPrimitiveIndex.set(pipeline.id, index);

    const entity = this.viewer.entities.add({
      id: pipeline.id,
      name: pipeline.name,
      polyline: {
        positions,
        show: false
      },
      properties: {
        type: 'pipeline',
        data: pipeline
      }
    });

    this.pipelineEntities.set(pipeline.id, entity);
    
    if (pipeline.layerId) {
      const layerData = this.layers.get(pipeline.layerId);
      if (layerData) {
        layerData.entities.add(pipeline.id);
      }
    }

    return entity;
  }

  addPipelinesBatch(pipelines: Pipeline[]): void {
    if (!this.viewer) return;
    
    const totalPipelines = pipelines.length;
    let processed = 0;

    const processBatch = (startIndex: number) => {
      const endIndex = Math.min(startIndex + BATCH_SIZE, totalPipelines);
      
      for (let i = startIndex; i < endIndex; i++) {
        this.addPipeline(pipelines[i]);
        processed++;
      }

      if (endIndex < totalPipelines) {
        requestAnimationFrame(() => processBatch(endIndex));
      }
    };

    processBatch(0);
  }

  addLayer(layer: Layer): void {
    this.layers.set(layer.id, {
      layer,
      entities: new Set()
    });
  }

  updateLayerVisibility(layerId: string, visible: boolean): void {
    const layerData = this.layers.get(layerId);
    if (!layerData) return;

    layerData.layer.visible = visible;

    if (this.usePrimitives) {
      this.updatePrimitiveVisibility(layerId, visible);
    }

    layerData.entities.forEach(entityId => {
      const nodeEntity = this.nodeEntities.get(entityId);
      if (nodeEntity) {
        nodeEntity.show = visible;
      }
      
      const pipelineEntity = this.pipelineEntities.get(entityId);
      if (pipelineEntity) {
        pipelineEntity.show = visible;
      }
    });
  }

  private updatePrimitiveVisibility(layerId: string, visible: boolean): void {
    const layerData = this.layers.get(layerId);
    if (!layerData || !this.pointPrimitiveCollection || !this.polylineCollection) return;

    layerData.entities.forEach(entityId => {
      if (this.nodeIdToPrimitiveIndex.has(entityId)) {
        const index = this.nodeIdToPrimitiveIndex.get(entityId)!;
        const point = this.pointPrimitiveCollection!.get(index);
        if (point) {
          point.show = visible;
        }
      }
      
      if (this.pipelineIdToPrimitiveIndex.has(entityId)) {
        const index = this.pipelineIdToPrimitiveIndex.get(entityId)!;
        const polyline = this.polylineCollection!.get(index);
        if (polyline) {
          polyline.show = visible;
        }
      }
    });
  }

  updateEntityStyle(entityId: string, style: LayerStyle): void {
    const nodeEntity = this.nodeEntities.get(entityId);
    if (nodeEntity && nodeEntity.point) {
      if (style.color) {
        nodeEntity.point.color = new Cesium.ConstantProperty(
          Cesium.Color.fromCssColorString(style.color)
        );
      }
      if (style.size) {
        nodeEntity.point.pixelSize = new Cesium.ConstantProperty(style.size);
      }
      
      if (this.usePrimitives && this.pointPrimitiveCollection) {
        const index = this.nodeIdToPrimitiveIndex.get(entityId);
        if (index !== undefined) {
          const point = this.pointPrimitiveCollection.get(index);
          if (point) {
            if (style.color) {
              point.color = Cesium.Color.fromCssColorString(style.color);
            }
            if (style.size) {
              point.pixelSize = style.size;
            }
          }
        }
      }
    }

    const pipelineEntity = this.pipelineEntities.get(entityId);
    if (pipelineEntity && pipelineEntity.polyline) {
      if (style.color) {
        pipelineEntity.polyline.material = new Cesium.ColorMaterialProperty(
          Cesium.Color.fromCssColorString(style.color)
        );
      }
      if (style.width) {
        pipelineEntity.polyline.width = new Cesium.ConstantProperty(style.width);
      }
      
      if (this.usePrimitives && this.polylineCollection) {
        const index = this.pipelineIdToPrimitiveIndex.get(entityId);
        if (index !== undefined) {
          const polyline = this.polylineCollection.get(index);
          if (polyline) {
            if (style.color) {
              polyline.material = new Cesium.PolylineMaterialAppearance({
                material: Cesium.Material.fromType('Color', {
                  color: Cesium.Color.fromCssColorString(style.color)
                })
              });
            }
            if (style.width) {
              polyline.width = style.width;
            }
          }
        }
      }
    }
  }

  removeNode(nodeId: string): void {
    if (!this.viewer) return;
    
    const entity = this.nodeEntities.get(nodeId);
    if (entity) {
      this.viewer.entities.remove(entity);
      this.nodeEntities.delete(nodeId);
    }
    
    if (this.usePrimitives && this.pointPrimitiveCollection) {
      const index = this.nodeIdToPrimitiveIndex.get(nodeId);
      if (index !== undefined) {
        const point = this.pointPrimitiveCollection.get(index);
        if (point) {
          this.pointPrimitiveCollection.remove(point);
        }
        this.nodeIdToPrimitiveIndex.delete(nodeId);
      }
    }
  }

  removePipeline(pipelineId: string): void {
    if (!this.viewer) return;
    
    const entity = this.pipelineEntities.get(pipelineId);
    if (entity) {
      this.viewer.entities.remove(entity);
      this.pipelineEntities.delete(pipelineId);
    }
    
    if (this.usePrimitives && this.polylineCollection) {
      const index = this.pipelineIdToPrimitiveIndex.get(pipelineId);
      if (index !== undefined) {
        const polyline = this.polylineCollection.get(index);
        if (polyline) {
          this.polylineCollection.remove(polyline);
        }
        this.pipelineIdToPrimitiveIndex.delete(pipelineId);
      }
    }
  }

  clearAll(): void {
    if (!this.viewer) return;
    
    this.viewer.entities.removeAll();
    this.nodeEntities.clear();
    this.pipelineEntities.clear();
    this.layers.clear();
    this.nodeIdToPrimitiveIndex.clear();
    this.pipelineIdToPrimitiveIndex.clear();
    
    if (this.pointPrimitiveCollection) {
      this.pointPrimitiveCollection.removeAll();
    }
    if (this.polylineCollection) {
      this.polylineCollection.removeAll();
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
      junction: 6,
      valve: 10,
      pump: 12,
      tank: 14,
      reservoir: 16
    };
    return sizes[nodeType] || 6;
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

  private getPipelineWidth(diameter: number): number {
    if (diameter >= 1000) return 8;
    if (diameter >= 500) return 6;
    if (diameter >= 200) return 4;
    return 3;
  }

  getViewer(): Cesium.Viewer | null {
    return this.viewer;
  }

  getNodeEntity(nodeId: string): Cesium.Entity | undefined {
    return this.nodeEntities.get(nodeId);
  }

  getPipelineEntity(pipelineId: string): Cesium.Entity | undefined {
    return this.pipelineEntities.get(pipelineId);
  }

  requestRender(): void {
    if (this.viewer) {
      this.viewer.scene.requestRender();
    }
  }

  destroy(): void {
    if (this.pointPrimitiveCollection) {
      this.pointPrimitiveCollection.removeAll();
      this.pointPrimitiveCollection = null;
    }
    if (this.polylineCollection) {
      this.polylineCollection.removeAll();
      this.polylineCollection = null;
    }
    
    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
    }
    this.container = null;
    this.nodeEntities.clear();
    this.pipelineEntities.clear();
    this.layers.clear();
    this.nodeIdToPrimitiveIndex.clear();
    this.pipelineIdToPrimitiveIndex.clear();
  }
}

export default CesiumSceneManager;
