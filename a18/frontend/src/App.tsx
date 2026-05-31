import { useState, useEffect, useRef, useCallback } from 'react';
import * as Cesium from 'cesium';
import CesiumViewer, { CesiumViewerRef } from './components/CesiumViewer';
import ThreeViewer, { ThreeViewerRef } from './components/ThreeViewer';
import Sidebar from './components/Sidebar';
import { generateSampleNodes, generateSamplePipelines, generateSampleLayers } from './utils/sampleData';
import { nodeApi, pipelineApi, layerApi, analysisApi, simulationApi, dataApi } from './services/api';
import type { PipelineNode, Pipeline, Layer, CameraView } from './types';

type ViewMode = 'cesium' | 'three';

function App() {
  const cesiumRef = useRef<CesiumViewerRef>(null);
  const threeRef = useRef<ThreeViewerRef>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cesium');
  const [nodes, setNodes] = useState<PipelineNode[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const defaultView: CameraView = {
    longitude: 116.397428,
    latitude: 39.90923,
    height: 5000,
    heading: 0,
    pitch: -45,
    roll: 0
  };

  const showMessage = (text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);

      try {
        const [layersRes, nodesRes, pipelinesRes] = await Promise.all([
          layerApi.getAll(),
          nodeApi.getAll(),
          pipelineApi.getAll()
        ]);

        if (layersRes.data.success) {
          setLayers(layersRes.data.data);
        }
        if (nodesRes.data.success) {
          setNodes(nodesRes.data.data);
        }
        if (pipelinesRes.data.success) {
          setPipelines(pipelinesRes.data.data);
        }
      } catch (apiError) {
        console.log('API不可用，使用示例数据');
        const sampleLayers = generateSampleLayers();
        const sampleNodes = generateSampleNodes();
        const samplePipelines = generateSamplePipelines(sampleNodes);
        
        setLayers(sampleLayers);
        setNodes(sampleNodes);
        setPipelines(samplePipelines);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
      showMessage('加载数据失败', 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (viewMode === 'cesium' && cesiumRef.current && nodes.length > 0 && layers.length > 0) {
      cesiumRef.current.clearAll();
      cesiumRef.current.addLayers(layers);
      cesiumRef.current.addNodes(nodes);
      cesiumRef.current.addPipelines(pipelines);
    } else if (viewMode === 'three' && threeRef.current && nodes.length > 0) {
      threeRef.current.clearAll();
      const nodeMap = new Map<string, PipelineNode>();
      nodes.forEach(node => nodeMap.set(node.id, node));
      threeRef.current.addNodes(nodes);
      threeRef.current.addPipelines(pipelines, nodeMap);
      threeRef.current.fitCamera();
    }
  }, [nodes, pipelines, layers, viewMode]);

  const handleEntitySelect = (entity: any) => {
    setSelectedEntity(entity);
  };

  const handleToggleLayerVisibility = async (layerId: string) => {
    try {
      const layer = layers.find(l => l.id === layerId);
      if (layer) {
        const res = await layerApi.toggleVisibility(layerId);
        if (res.data.success) {
          const updatedLayers = layers.map(l => 
            l.id === layerId ? res.data.data : l
          );
          setLayers(updatedLayers);
          
          if (viewMode === 'cesium' && cesiumRef.current) {
            cesiumRef.current.updateLayerVisibility(layerId, res.data.data.visible);
          }
        }
      }
    } catch (error) {
      console.error('切换图层显示失败:', error);
    }
  };

  const handleAnalysisAction = async (action: string, params?: any) => {
    try {
      let result;
      
      switch (action) {
        case 'connectivity':
          if (!params?.nodeId || !params?.targetNodeId) {
            showMessage('请选择起始节点和目标节点', 'error');
            return;
          }
          result = await analysisApi.checkConnectivity(params.nodeId, params.targetNodeId);
          if (result.data.success) {
            const connected = result.data.data.connected;
            showMessage(
              `节点 ${params.nodeId} 和 ${params.targetNodeId} ${connected ? '连通' : '不连通'}`,
              connected ? 'success' : 'info'
            );
          }
          break;

        case 'upstream':
          if (!params?.nodeId) {
            showMessage('请选择节点', 'error');
            return;
          }
          result = await analysisApi.getUpstream(params.nodeId, params.maxDepth);
          if (result.data.success) {
            showMessage(`找到 ${result.data.data.nodes.length} 个上游节点`, 'info');
            if (viewMode === 'cesium' && cesiumRef.current) {
              result.data.data.nodes.forEach((nodeId: string) => {
                cesiumRef.current?.selectEntity(nodeId);
              });
            }
          }
          break;

        case 'downstream':
          if (!params?.nodeId) {
            showMessage('请选择节点', 'error');
            return;
          }
          result = await analysisApi.getDownstream(params.nodeId, params.maxDepth);
          if (result.data.success) {
            showMessage(`找到 ${result.data.data.nodes.length} 个下游节点`, 'info');
          }
          break;

        case 'loops':
          result = await analysisApi.detectLoops();
          if (result.data.success) {
            showMessage(`检测到 ${result.data.data.loopCount} 个环路`, 'info');
          }
          break;

        case 'shortestPath':
          if (!params?.nodeId || !params?.targetNodeId) {
            showMessage('请选择起始节点和目标节点', 'error');
            return;
          }
          result = await analysisApi.getShortestPath(params.nodeId, params.targetNodeId);
          if (result.data.success) {
            if (result.data.data.exists) {
              showMessage(
                `最短路径长度: ${result.data.data.totalLength.toFixed(2)} m，经过 ${result.data.data.path.length} 个节点`,
                'success'
              );
            } else {
              showMessage('两个节点之间没有连通路径', 'info');
            }
          }
          break;
      }
    } catch (error) {
      console.error('分析失败:', error);
      showMessage('分析失败', 'error');
    }
  };

  const handleSimulationAction = async (action: string, params?: any) => {
    try {
      let result;
      
      switch (action) {
        case 'flow':
          showMessage('正在运行水力模拟...', 'info');
          result = await simulationApi.runFlowSimulation();
          if (result.data.success) {
            showMessage('水力模拟完成', 'success');
            console.log('流量模拟结果:', result.data.data);
          }
          break;

        case 'pressure':
          showMessage('正在计算压力分布...', 'info');
          result = await simulationApi.calculatePressureDistribution();
          if (result.data.success) {
            const data = result.data.data;
            showMessage(
              `压力分布: 最小 ${data.minPressure.toFixed(1)} m / 最大 ${data.maxPressure.toFixed(1)} m / 平均 ${data.avgPressure.toFixed(1)} m`,
              'success'
            );
          }
          break;

        case 'leak':
          if (!params?.leakNodeId) {
            showMessage('请选择泄漏节点', 'error');
            return;
          }
          showMessage('正在模拟泄漏...', 'info');
          result = await simulationApi.simulateLeak(params.leakNodeId, params.leakRate);
          if (result.data.success) {
            const data = result.data.data;
            showMessage(
              `泄漏模拟完成: 影响 ${data.affectedNodes.length} 个节点，${data.affectedPipes.length} 条管道`,
              'warning'
            );
            
            if (viewMode === 'cesium' && cesiumRef.current) {
              cesiumRef.current.selectEntity(params.leakNodeId);
            } else if (viewMode === 'three' && threeRef.current) {
              threeRef.current.highlightNode(params.leakNodeId);
              data.affectedPipes.forEach((pipeId: string) => {
                threeRef.current?.highlightPipeline(pipeId);
              });
            }
          }
          break;
      }
    } catch (error) {
      console.error('模拟失败:', error);
      showMessage('模拟失败', 'error');
    }
  };

  const handleExportData = async () => {
    try {
      const result = await dataApi.export({
        includeNodes: true,
        includePipelines: true,
        includeLayers: true
      });
      
      if (result.data.success) {
        const dataStr = JSON.stringify(result.data.data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pipeline_data_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showMessage('数据导出成功', 'success');
      }
    } catch (error) {
      console.error('导出失败:', error);
      showMessage('导出失败', 'error');
    }
  };

  const handleImportGeoJSON = async () => {
    try {
      const result = await dataApi.exportGeoJSON();
      if (result.data.success) {
        const dataStr = JSON.stringify(result.data.data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pipeline_geojson_${Date.now()}.geojson`;
        a.click();
        URL.revokeObjectURL(url);
        showMessage('GeoJSON导出成功', 'success');
      }
    } catch (error) {
      console.error('GeoJSON导出失败:', error);
      showMessage('GeoJSON导出失败', 'error');
    }
  };

  return (
    <div style={{
      display: 'flex',
      width: '100vw',
      height: '100vh',
      overflow: 'hidden'
    }}>
      <Sidebar
        layers={layers}
        selectedEntity={selectedEntity}
        onToggleLayerVisibility={handleToggleLayerVisibility}
        onAnalysisAction={handleAnalysisAction}
        onSimulationAction={handleSimulationAction}
        nodes={nodes}
        pipelines={pipelines}
      />

      <div style={{
        flex: 1,
        position: 'relative'
      }}>
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          zIndex: 100,
          display: 'flex',
          gap: '10px'
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '4px',
            padding: '4px',
            display: 'flex',
            gap: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }}>
            <button
              onClick={() => setViewMode('cesium')}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                background: viewMode === 'cesium' ? '#2c5282' : '#f0f0f0',
                color: viewMode === 'cesium' ? 'white' : '#333',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              三维地图
            </button>
            <button
              onClick={() => setViewMode('three')}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                background: viewMode === 'three' ? '#2c5282' : '#f0f0f0',
                color: viewMode === 'three' ? 'white' : '#333',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              管网模型
            </button>
          </div>

          <div style={{
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '4px',
            padding: '4px',
            display: 'flex',
            gap: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
          }}>
            <button
              onClick={handleExportData}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                background: '#27ae60',
                color: 'white',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              导出数据
            </button>
            <button
              onClick={handleImportGeoJSON}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                background: '#3498db',
                color: 'white',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              导出GeoJSON
            </button>
          </div>
        </div>

        {viewMode === 'cesium' ? (
          <CesiumViewer
            ref={cesiumRef}
            onEntitySelect={handleEntitySelect}
            defaultView={defaultView}
          />
        ) : (
          <ThreeViewer
            ref={threeRef}
            onNodeClick={(node) => {
              setSelectedEntity({
                properties: {
                  getValue: () => ({
                    type: 'node',
                    data: node
                  })
                }
              });
            }}
            onPipelineClick={(pipeline) => {
              setSelectedEntity({
                properties: {
                  getValue: () => ({
                    type: 'pipeline',
                    data: pipeline
                  })
                }
              });
            }}
          />
        )}

        {isLoading && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '20px 40px',
            borderRadius: '8px',
            fontSize: '16px'
          }}>
            正在加载数据...
          </div>
        )}

        {message && (
          <div style={{
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 24px',
            borderRadius: '4px',
            color: 'white',
            fontSize: '14px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 1000,
            background: message.type === 'success' ? '#27ae60' :
                       message.type === 'error' ? '#e74c3c' : '#3498db'
          }}>
            {message.text}
          </div>
        )}

        <div style={{
          position: 'absolute',
          bottom: '10px',
          left: '10px',
          background: 'rgba(0, 0, 0, 0.6)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px'
        }}>
          节点: {nodes.length} | 管道: {pipelines.length} | 图层: {layers.length}
        </div>
      </div>
    </div>
  );
}

export default App;
