import PipelineNode from '../models/PipelineNode';
import Pipeline from '../models/Pipeline';
import FaultRecord from '../models/FaultRecord';
import TopologyGraph from './topologyService';
import type { Pipeline as PipelineType } from '../models/Pipeline';
import type { PipelineNode as NodeType } from '../models/PipelineNode';

export interface FaultSimulationConfig {
  faultType: 'pipe_break' | 'valve_failure' | 'leak' | 'clog' | 'pump_failure' | 'other';
  severity: 'critical' | 'high' | 'medium' | 'low';
  location: {
    x: number;
    y: number;
    z?: number;
  };
  affectedPipelineId?: string;
  affectedNodeId?: string;
  flowReduction?: number;
  pressureDrop?: number;
}

export interface FaultAnalysisResult {
  fault: any;
  affectedNodes: string[];
  affectedPipelines: string[];
  isolatedNodes: string[];
  impactArea: {
    center: { x: number; y: number };
    radius: number;
    nodes: { x: number; y: number; id: string }[];
  };
  affectedPopulation?: number;
  estimatedRepairTime: number;
  estimatedCost: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export class FaultAnalysisService {
  private topologyGraph: TopologyGraph;
  private nodes: NodeType[] = [];
  private pipelines: PipelineType[] = [];
  private nodeMap: Map<string, NodeType> = new Map();

  constructor() {
    this.topologyGraph = new TopologyGraph();
  }

  async initialize(): Promise<void> {
    await this.topologyGraph.loadFromDatabase();
    this.nodes = await PipelineNode.findAll();
    this.pipelines = await Pipeline.findAll();
    
    this.nodeMap.clear();
    this.nodes.forEach(node => {
      this.nodeMap.set(node.id, node);
    });
  }

  async simulateFault(config: FaultSimulationConfig): Promise<FaultAnalysisResult> {
    await this.initialize();

    const affectedNodes = new Set<string>();
    const affectedPipelines = new Set<string>();
    const isolatedNodes = new Set<string>();

    let faultLocation = { ...config.location };
    let affectedNodeId = config.affectedNodeId;
    let affectedPipelineId = config.affectedPipelineId;

    if (!affectedNodeId && !affectedPipelineId) {
      const nearestNode = this.topologyGraph.findNearestNode(
        config.location.x,
        config.location.y,
        1000
      );
      if (nearestNode) {
        affectedNodeId = nearestNode.id;
      }
    }

    if (affectedPipelineId) {
      const pipeline = this.pipelines.find(p => p.id === affectedPipelineId);
      if (pipeline) {
        affectedPipelines.add(pipeline.id);
        
        const component = this.topologyGraph.findConnectedComponent(pipeline.startNodeId);
        
        component.forEach(nodeId => {
          affectedNodes.add(nodeId);
        });

        this.pipelines.forEach(p => {
          if (component.has(p.startNodeId) || component.has(p.endNodeId)) {
            affectedPipelines.add(p.id);
          }
        });
      }
    } else if (affectedNodeId) {
      const node = this.nodeMap.get(affectedNodeId);
      if (node) {
        faultLocation = { x: node.x, y: node.y, z: node.z };
        
        const neighbors = this.topologyGraph.getNeighbors(affectedNodeId);
        neighbors.forEach(({ nodeId, edge }) => {
          affectedPipelines.add(edge.id);
        });

        const component = this.topologyGraph.findConnectedComponent(affectedNodeId);
        component.forEach(nodeId => {
          affectedNodes.add(nodeId);
        });

        if (config.faultType === 'valve_failure') {
          const isolated = this.findIsolatedNodes(affectedNodeId);
          isolated.forEach(nodeId => isolatedNodes.add(nodeId));
        }
      }
    }

    const impactArea = this.calculateImpactArea(
      faultLocation.x,
      faultLocation.y,
      affectedNodes,
      config.severity
    );

    const estimatedRepairTime = this.estimateRepairTime(config.faultType, config.severity);
    const estimatedCost = this.estimateCost(config.faultType, config.severity, affectedNodes.size);
    const priority = this.calculatePriority(config.severity, affectedNodes.size);

    const faultRecord = await this.createFaultRecord({
      ...config,
      location: faultLocation,
      affectedNodes: Array.from(affectedNodes),
      affectedPipelines: Array.from(affectedPipelines)
    });

    return {
      fault: faultRecord.toJSON(),
      affectedNodes: Array.from(affectedNodes),
      affectedPipelines: Array.from(affectedPipelines),
      isolatedNodes: Array.from(isolatedNodes),
      impactArea,
      affectedPopulation: this.estimateAffectedPopulation(affectedNodes.size),
      estimatedRepairTime,
      estimatedCost,
      priority
    };
  }

  private findIsolatedNodes(faultNodeId: string): string[] {
    const isolated: string[] = [];
    const neighbors = this.topologyGraph.getNeighbors(faultNodeId);

    neighbors.forEach(({ nodeId }) => {
      const component = this.topologyGraph.findConnectedComponent(nodeId);
      const hasOutlet = this.checkForOutlet(component);
      if (!hasOutlet) {
        component.forEach(id => {
          if (id !== faultNodeId && !isolated.includes(id)) {
            isolated.push(id);
          }
        });
      }
    });

    return isolated;
  }

  private checkForOutlet(component: Set<string>): boolean {
    for (const nodeId of component) {
      const node = this.nodeMap.get(nodeId);
      if (node && (node.nodeType === 'tank' || node.nodeType === 'reservoir' || node.nodeType === 'pump')) {
        return true;
      }
    }
    return false;
  }

  private calculateImpactArea(
    centerX: number,
    centerY: number,
    affectedNodes: Set<string>,
    severity: string
  ): {
    center: { x: number; y: number };
    radius: number;
    nodes: { x: number; y: number; id: string }[];
  } {
    let maxDistance = 0;
    const nodes: { x: number; y: number; id: string }[] = [];

    affectedNodes.forEach(nodeId => {
      const node = this.nodeMap.get(nodeId);
      if (node) {
        const distance = Math.sqrt(
          Math.pow(node.x - centerX, 2) + 
          Math.pow(node.y - centerY, 2)
        );
        maxDistance = Math.max(maxDistance, distance);
        nodes.push({ x: node.x, y: node.y, id: nodeId });
      }
    });

    const severityMultiplier = {
      critical: 1.5,
      high: 1.3,
      medium: 1.1,
      low: 1.0
    };

    return {
      center: { x: centerX, y: centerY },
      radius: maxDistance * (severityMultiplier[severity as keyof typeof severityMultiplier] || 1.0),
      nodes
    };
  }

  private estimateRepairTime(faultType: string, severity: string): number {
    const baseTime: Record<string, number> = {
      pipe_break: 24,
      valve_failure: 8,
      leak: 4,
      clog: 2,
      pump_failure: 12,
      other: 6
    };

    const severityMultiplier: Record<string, number> = {
      critical: 3,
      high: 2,
      medium: 1.5,
      low: 1
    };

    return (baseTime[faultType] || 6) * (severityMultiplier[severity] || 1);
  }

  private estimateCost(faultType: string, severity: string, affectedCount: number): number {
    const baseCost: Record<string, number> = {
      pipe_break: 50000,
      valve_failure: 15000,
      leak: 8000,
      clog: 3000,
      pump_failure: 35000,
      other: 10000
    };

    const severityMultiplier: Record<string, number> = {
      critical: 3,
      high: 2,
      medium: 1.5,
      low: 1
    };

    const base = baseCost[faultType] || 10000;
    const multiplier = severityMultiplier[severity] || 1;
    
    return base * multiplier * (1 + affectedCount * 0.1);
  }

  private calculatePriority(severity: string, affectedCount: number): 'critical' | 'high' | 'medium' | 'low' {
    if (severity === 'critical' || affectedCount > 50) return 'critical';
    if (severity === 'high' || affectedCount > 20) return 'high';
    if (severity === 'medium' || affectedCount > 10) return 'medium';
    return 'low';
  }

  private estimateAffectedPopulation(nodeCount: number): number {
    return Math.round(nodeCount * 500 + Math.random() * 200);
  }

  private async createFaultRecord(config: FaultSimulationConfig & {
    location: { x: number; y: number; z?: number };
    affectedNodes: string[];
    affectedPipelines: string[];
  }) {
    return await FaultRecord.create({
      faultType: config.faultType,
      severity: config.severity,
      status: 'active',
      pipelineId: config.affectedPipelineId,
      nodeId: config.affectedNodeId,
      x: config.location.x,
      y: config.location.y,
      z: config.location.z,
      description: `故障模拟 - ${this.getFaultTypeLabel(config.faultType)}`,
      startTime: new Date(),
      affectedNodes: config.affectedNodes,
      affectedPipelines: config.affectedPipelines,
      properties: {}
    });
  }

  private getFaultTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      pipe_break: '管道破裂',
      valve_failure: '阀门故障',
      leak: '泄漏',
      clog: '堵塞',
      pump_failure: '水泵故障',
      other: '其他故障'
    };
    return labels[type] || type;
  }

  async analyzeValveClosure(valveNodeId: string): Promise<{
    success: boolean;
    isolatedNodes: string[];
    isolatedPipelines: string[];
    affectedPressure: Record<string, number>;
    recommendation: string;
  }> {
    await this.initialize();

    const valveNode = this.nodeMap.get(valveNodeId);
    if (!valveNode || valveNode.nodeType !== 'valve') {
      return {
        success: false,
        isolatedNodes: [],
        isolatedPipelines: [],
        affectedPressure: {},
        recommendation: '指定的节点不是阀门'
      };
    }

    const neighbors = this.topologyGraph.getNeighbors(valveNodeId);
    const isolatedNodes = new Set<string>();
    const isolatedPipelines = new Set<string>();

    neighbors.forEach(({ nodeId, edge }) => {
      const component = this.topologyGraph.findConnectedComponent(nodeId);
      const hasOutlet = this.checkForOutlet(component);
      
      if (!hasOutlet) {
        component.forEach(id => {
          if (id !== valveNodeId) {
            isolatedNodes.add(id);
          }
        });
        isolatedPipelines.add(edge.id);
      }
    });

    const affectedPressure: Record<string, number> = {};
    isolatedNodes.forEach(nodeId => {
      affectedPressure[nodeId] = 0;
    });

    let recommendation = '';
    if (isolatedNodes.size > 0) {
      recommendation = `关闭此阀门将导致 ${isolatedNodes.size} 个节点断供。建议先切换备用线路或提前通知受影响用户。`;
    } else {
      recommendation = '此阀门处于冗余路径上，关闭后不会导致断供。';
    }

    return {
      success: true,
      isolatedNodes: Array.from(isolatedNodes),
      isolatedPipelines: Array.from(isolatedPipelines),
      affectedPressure,
      recommendation
    };
  }

  async getActiveFaults(): Promise<any[]> {
    return await FaultRecord.findAll({
      where: {
        status: {
          $in: ['active', 'in_progress']
        }
      },
      order: [['severity', 'ASC'], ['startTime', 'DESC']]
    });
  }

  async resolveFault(faultId: string, resolution: string, cost?: number): Promise<any> {
    const fault = await FaultRecord.findByPk(faultId);
    if (!fault) {
      throw new Error('故障记录不存在');
    }

    fault.status = 'resolved';
    fault.endTime = new Date();
    fault.resolution = resolution;
    if (cost !== undefined) {
      fault.cost = cost;
    }
    
    await fault.save();
    return fault;
  }

  calculateDistance(
    x1: number, y1: number, z1: number,
    x2: number, y2: number, z2: number,
    useGeodesic: boolean = false
  ): {
    distance: number;
    horizontalDistance: number;
    verticalDistance: number;
    unit: string;
  } {
    let horizontalDistance: number;
    
    if (useGeodesic) {
      horizontalDistance = this.haversineDistance(x1, y1, x2, y2);
    } else {
      horizontalDistance = Math.sqrt(
        Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2)
      ) * 111000;
    }

    const verticalDistance = Math.abs(z2 - z1);
    const distance = Math.sqrt(
      Math.pow(horizontalDistance, 2) + Math.pow(verticalDistance, 2)
    );

    return {
      distance,
      horizontalDistance,
      verticalDistance,
      unit: '米'
    };
  }

  private haversineDistance(
    lon1: number, lat1: number,
    lon2: number, lat2: number
  ): number {
    const R = 6371000;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  calculateArea(points: Array<{ x: number; y: number }>): {
    area: number;
    perimeter: number;
    unit: string;
  } {
    if (points.length < 3) {
      return { area: 0, perimeter: 0, unit: '平方米' };
    }

    let area = 0;
    let perimeter = 0;

    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;

      perimeter += Math.sqrt(
        Math.pow(points[j].x - points[i].x, 2) +
        Math.pow(points[j].y - points[i].y, 2)
      ) * 111000;
    }

    area = Math.abs(area / 2) * 111000 * 111000;

    return {
      area,
      perimeter,
      unit: '平方米'
    };
  }

  calculateHeight(
    x: number, y: number, z1: number, z2: number
  ): {
    height: number;
    unit: string;
  } {
    return {
      height: Math.abs(z2 - z1),
      unit: '米'
    };
  }
}

export default FaultAnalysisService;
