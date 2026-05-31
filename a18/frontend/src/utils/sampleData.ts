import type { PipelineNode, Pipeline, Layer } from '../types';

export function generateSampleNodes(): PipelineNode[] {
  const nodes: PipelineNode[] = [];
  
  const baseX = 116.397428;
  const baseY = 39.90923;
  
  const nodeTypes: Array<'junction' | 'valve' | 'pump' | 'tank' | 'reservoir'> = [
    'junction', 'junction', 'valve', 'junction', 'pump',
    'junction', 'valve', 'tank', 'junction', 'reservoir',
    'junction', 'junction', 'valve', 'junction', 'junction'
  ];

  const positions = [
    [0, 0], [0.002, 0], [0.004, 0], [0.006, 0], [0.008, 0],
    [0, 0.002], [0.002, 0.002], [0.004, 0.002], [0.006, 0.002], [0.008, 0.002],
    [0, 0.004], [0.002, 0.004], [0.004, 0.004], [0.006, 0.004], [0.008, 0.004]
  ];

  for (let i = 0; i < 15; i++) {
    nodes.push({
      id: `node_${i}`,
      name: `${nodeTypes[i].charAt(0).toUpperCase()}${nodeTypes[i].slice(1)} ${i + 1}`,
      nodeType: nodeTypes[i],
      x: baseX + positions[i][0],
      y: baseY + positions[i][1],
      z: Math.random() * 5 + 2,
      elevation: Math.random() * 20 + 50,
      pressure: Math.random() * 30 + 20,
      demand: Math.random() * 5,
      properties: {
        manufacturer: ['Company A', 'Company B', 'Company C'][Math.floor(Math.random() * 3)],
        installationDate: `2020-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`,
        condition: ['Excellent', 'Good', 'Fair'][Math.floor(Math.random() * 3)],
        lastInspection: `2024-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}`
      },
      layerId: 'layer_nodes'
    });
  }

  return nodes;
}

export function generateSamplePipelines(nodes: PipelineNode[]): Pipeline[] {
  const pipelines: Pipeline[] = [];
  const materials = ['Steel', 'PVC', 'PE', 'CastIron', 'Concrete'];
  const diameters = [100, 150, 200, 300, 500, 800];

  const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [1, 6], [2, 7], [3, 8], [4, 9],
    [5, 6], [6, 7], [7, 8], [8, 9],
    [5, 10], [6, 11], [7, 12], [8, 13], [9, 14],
    [10, 11], [11, 12], [12, 13], [13, 14]
  ];

  connections.forEach(([startIdx, endIdx], index) => {
    const startNode = nodes[startIdx];
    const endNode = nodes[endIdx];
    
    const distance = Math.sqrt(
      Math.pow(startNode.x - endNode.x, 2) + 
      Math.pow(startNode.y - endNode.y, 2)
    );
    
    const length = distance * 111000;
    
    pipelines.push({
      id: `pipeline_${index}`,
      name: `Pipeline ${index + 1}`,
      startNodeId: startNode.id,
      endNodeId: endNode.id,
      material: materials[Math.floor(Math.random() * materials.length)],
      diameter: diameters[Math.floor(Math.random() * diameters.length)],
      length: Math.round(length * 100) / 100,
      depth: Math.random() * 3 + 1,
      flowRate: Math.random() * 50 + 10,
      velocity: Math.random() * 3 + 0.5,
      roughness: 0.01 + Math.random() * 0.02,
      status: Math.random() > 0.9 ? 'maintenance' : 'active',
      properties: {
        manufacturer: ['Company X', 'Company Y', 'Company Z'][Math.floor(Math.random() * 3)],
        installationYear: 2015 + Math.floor(Math.random() * 10),
        lifeExpectancy: 30 + Math.floor(Math.random() * 20)
      },
      layerId: 'layer_pipelines',
      geometry: {
        type: 'LineString',
        coordinates: [
          [startNode.x, startNode.y, startNode.z],
          [endNode.x, endNode.y, endNode.z]
        ]
      }
    });
  });

  return pipelines;
}

export function generateSampleLayers(): Layer[] {
  return [
    {
      id: 'layer_terrain',
      name: '地形图层',
      type: 'terrain',
      visible: true,
      style: {
        color: '#336633',
        opacity: 0.8
      },
      properties: {
        description: '城市基础地形图层'
      },
      order: 0
    },
    {
      id: 'layer_pipelines',
      name: '管网图层',
      type: 'pipeline',
      visible: true,
      style: {
        color: '#0066ff',
        opacity: 0.9,
        width: 3
      },
      properties: {
        description: '城市管网管道图层'
      },
      order: 1
    },
    {
      id: 'layer_nodes',
      name: '节点图层',
      type: 'node',
      visible: true,
      style: {
        size: 8,
        opacity: 1,
        outlineWidth: 2
      },
      properties: {
        description: '管网节点图层（包括阀门、水泵、水箱等）'
      },
      order: 2
    },
    {
      id: 'layer_annotations',
      name: '标注图层',
      type: 'annotation',
      visible: true,
      style: {
        fontSize: 14,
        color: '#ffffff',
        outlineColor: '#000000'
      },
      properties: {
        description: '管网标注和信息图层'
      },
      order: 3
    }
  ];
}

export function getNodeTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    junction: '连接点',
    valve: '阀门',
    pump: '水泵',
    tank: '水箱',
    reservoir: '水库'
  };
  return labels[type] || type;
}

export function getMaterialLabel(material: string): string {
  const labels: Record<string, string> = {
    Steel: '钢管',
    PVC: 'PVC管',
    PE: 'PE管',
    CastIron: '铸铁管',
    Concrete: '混凝土管'
  };
  return labels[material] || material;
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: '运行中',
    inactive: '停用',
    maintenance: '维护中'
  };
  return labels[status] || status;
}
