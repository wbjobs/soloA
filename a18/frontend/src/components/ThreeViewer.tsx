import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import * as THREE from 'three';
import { ThreeSceneManager } from '../services/threeScene';
import type { PipelineNode, Pipeline } from '../types';

export interface ThreeViewerRef {
  addNodes: (nodes: PipelineNode[]) => void;
  addPipelines: (pipelines: Pipeline[], nodeMap: Map<string, PipelineNode>) => void;
  clearAll: () => void;
  fitCamera: () => void;
  highlightNode: (nodeId: string) => void;
  unhighlightNode: (nodeId: string) => void;
  highlightPipeline: (pipelineId: string) => void;
  unhighlightPipeline: (pipelineId: string) => void;
  getScene: () => THREE.Scene | null;
}

interface ThreeViewerProps {
  onNodeClick?: (node: PipelineNode) => void;
  onPipelineClick?: (pipeline: Pipeline) => void;
}

const ThreeViewer = forwardRef<ThreeViewerRef, ThreeViewerProps>(({ onNodeClick, onPipelineClick }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneManagerRef = useRef<ThreeSceneManager | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (containerRef.current && !sceneManagerRef.current) {
      const manager = new ThreeSceneManager({
        onNodeClick,
        onPipelineClick
      });
      sceneManagerRef.current = manager;
      
      manager.initialize(containerRef.current);
      setIsReady(true);

      return () => {
        manager.destroy();
      };
    }
  }, [onNodeClick, onPipelineClick]);

  useImperativeHandle(ref, () => ({
    addNodes: (nodes: PipelineNode[]) => {
      sceneManagerRef.current?.addNodes(nodes);
    },
    addPipelines: (pipelines: Pipeline[], nodeMap: Map<string, PipelineNode>) => {
      sceneManagerRef.current?.addPipelines(pipelines, nodeMap);
    },
    clearAll: () => {
      sceneManagerRef.current?.clearAll();
    },
    fitCamera: () => {
      sceneManagerRef.current?.fitCameraToScene();
    },
    highlightNode: (nodeId: string) => {
      sceneManagerRef.current?.highlightNode(nodeId);
    },
    unhighlightNode: (nodeId: string) => {
      sceneManagerRef.current?.unhighlightNode(nodeId);
    },
    highlightPipeline: (pipelineId: string) => {
      sceneManagerRef.current?.highlightPipeline(pipelineId);
    },
    unhighlightPipeline: (pipelineId: string) => {
      sceneManagerRef.current?.unhighlightPipeline(pipelineId);
    },
    getScene: () => {
      return sceneManagerRef.current?.getScene() || null;
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

ThreeViewer.displayName = 'ThreeViewer';

export default ThreeViewer;
