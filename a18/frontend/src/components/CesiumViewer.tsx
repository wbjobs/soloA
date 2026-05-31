import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import * as Cesium from 'cesium';
import { CesiumSceneManager } from '../services/cesiumScene';
import type { PipelineNode, Pipeline, Layer, CameraView } from '../types';

export interface CesiumViewerRef {
  addNodes: (nodes: PipelineNode[]) => void;
  addPipelines: (pipelines: Pipeline[]) => void;
  addLayers: (layers: Layer[]) => void;
  clearAll: () => void;
  setCameraView: (view: CameraView) => void;
  flyToView: (view: CameraView, duration?: number) => void;
  updateLayerVisibility: (layerId: string, visible: boolean) => void;
  getViewer: () => Cesium.Viewer | null;
  selectEntity: (id: string) => void;
}

interface CesiumViewerProps {
  onEntitySelect?: (entity: any) => void;
  defaultView?: CameraView;
}

const CesiumViewer = forwardRef<CesiumViewerRef, CesiumViewerProps>(({ onEntitySelect, defaultView }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneManagerRef = useRef<CesiumSceneManager | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (containerRef.current && !sceneManagerRef.current) {
      const manager = new CesiumSceneManager();
      sceneManagerRef.current = manager;
      
      manager.initialize(containerRef.current, {
        defaultView,
        onEntitySelect
      });
      
      setIsReady(true);

      return () => {
        manager.destroy();
      };
    }
  }, [defaultView, onEntitySelect]);

  useImperativeHandle(ref, () => ({
    addNodes: (nodes: PipelineNode[]) => {
      if (sceneManagerRef.current) {
        nodes.forEach(node => sceneManagerRef.current!.addNode(node));
      }
    },
    addPipelines: (pipelines: Pipeline[]) => {
      if (sceneManagerRef.current) {
        pipelines.forEach(pipeline => sceneManagerRef.current!.addPipeline(pipeline));
      }
    },
    addLayers: (layers: Layer[]) => {
      if (sceneManagerRef.current) {
        layers.forEach(layer => sceneManagerRef.current!.addLayer(layer));
      }
    },
    clearAll: () => {
      sceneManagerRef.current?.clearAll();
    },
    setCameraView: (view: CameraView) => {
      sceneManagerRef.current?.setCameraView(view);
    },
    flyToView: (view: CameraView, duration: number = 2) => {
      sceneManagerRef.current?.flyToView(view, duration);
    },
    updateLayerVisibility: (layerId: string, visible: boolean) => {
      sceneManagerRef.current?.updateLayerVisibility(layerId, visible);
    },
    getViewer: () => {
      return sceneManagerRef.current?.getViewer() || null;
    },
    selectEntity: (id: string) => {
      const manager = sceneManagerRef.current;
      if (!manager) return;
      let entity = manager.getNodeEntity(id);
      if (!entity) entity = manager.getPipelineEntity(id);
      if (entity) manager.selectEntity(entity);
    }
  }), []);

  return (
    <div 
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
    >
      {!isReady && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          color: 'white',
          fontSize: '18px',
          fontWeight: 'bold'
        }}>
          加载中...
        </div>
      )}
    </div>
  );
});

CesiumViewer.displayName = 'CesiumViewer';

export default CesiumViewer;
