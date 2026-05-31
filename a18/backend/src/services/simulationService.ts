import PipelineNode from '../models/PipelineNode';
import Pipeline from '../models/Pipeline';
import TopologyGraph, { GraphEdge } from './topologyService';

export interface FlowSimulationResult {
  nodePressures: Map<string, number>;
  pipeFlowRates: Map<string, number>;
  pipeVelocities: Map<string, number>;
  flowDirections: Map<string, { from: string; to: string }>;
}

export interface LeakSimulationResult {
  affectedNodes: string[];
  affectedPipes: string[];
  pressureDrop: Map<string, number>;
  impactArea: {
    center: { x: number; y: number };
    radius: number;
    nodes: { x: number; y: number; id: string }[];
  };
}

export class PipelineSimulation {
  private graph: TopologyGraph;

  constructor() {
    this.graph = new TopologyGraph();
  }

  async initialize() {
    await this.graph.loadFromDatabase();
  }

  async runFlowSimulation(): Promise<FlowSimulationResult> {
    const nodes = await PipelineNode.findAll();
    const pipelines = await Pipeline.findAll();

    const nodePressures = new Map<string, number>();
    const pipeFlowRates = new Map<string, number>();
    const pipeVelocities = new Map<string, number>();
    const flowDirections = new Map<string, { from: string; to: string }>();

    nodes.forEach(node => {
      let pressure = node.elevation + 10 + Math.random() * 20;
      if (node.nodeType === 'tank' || node.nodeType === 'reservoir') {
        pressure = node.elevation + 30 + Math.random() * 10;
      } else if (node.nodeType === 'junction') {
        pressure = node.elevation + 15 + Math.random() * 15;
      }
      nodePressures.set(node.id, pressure);
    });

    for (const pipeline of pipelines) {
      const startPressure = nodePressures.get(pipeline.startNodeId) || 0;
      const endPressure = nodePressures.get(pipeline.endNodeId) || 0;
      
      const pressureDiff = Math.abs(startPressure - endPressure);
      const flowRate = (pressureDiff * Math.PI * Math.pow(pipeline.diameter / 2, 2)) / (pipeline.roughness * pipeline.length);
      const velocity = (flowRate * 4) / (Math.PI * Math.pow(pipeline.diameter, 2));

      pipeFlowRates.set(pipeline.id, flowRate);
      pipeVelocities.set(pipeline.id, velocity);

      flowDirections.set(pipeline.id, {
        from: startPressure >= endPressure ? pipeline.startNodeId : pipeline.endNodeId,
        to: startPressure >= endPressure ? pipeline.endNodeId : pipeline.startNodeId
      });
    }

    return {
      nodePressures,
      pipeFlowRates,
      pipeVelocities,
      flowDirections
    };
  }

  async calculatePressureDistribution(): Promise<{
    nodes: { id: string; x: number; y: number; pressure: number; elevation: number }[];
    minPressure: number;
    maxPressure: number;
    avgPressure: number;
  }> {
    const nodes = await PipelineNode.findAll();
    const simulation = await this.runFlowSimulation();

    const pressureData = nodes.map(node => ({
      id: node.id,
      x: node.x,
      y: node.y,
      pressure: simulation.nodePressures.get(node.id) || 0,
      elevation: node.elevation
    }));

    const pressures = pressureData.map(p => p.pressure);
    const minPressure = Math.min(...pressures);
    const maxPressure = Math.max(...pressures);
    const avgPressure = pressures.reduce((a, b) => a + b, 0) / pressures.length;

    return {
      nodes: pressureData,
      minPressure,
      maxPressure,
      avgPressure
    };
  }

  async simulateLeak(
    leakNodeId: string,
    leakRate: number = 10
  ): Promise<LeakSimulationResult> {
    await this.initialize();
    const simulation = await this.runFlowSimulation();

    const affectedNodes = new Set<string>();
    const affectedPipes = new Set<string>();
    const pressureDrop = new Map<string, number>();

    const component = this.graph.findConnectedComponent(leakNodeId);
    const leakNode = this.graph.getNode(leakNodeId);

    if (!leakNode) {
      return {
        affectedNodes: [],
        affectedPipes: [],
        pressureDrop: new Map(),
        impactArea: {
          center: { x: 0, y: 0 },
          radius: 0,
          nodes: []
        }
      };
    }

    component.forEach(nodeId => {
      affectedNodes.add(nodeId);
      const originalPressure = simulation.nodePressures.get(nodeId) || 0;
      const node = this.graph.getNode(nodeId);
      
      if (node) {
        const distance = Math.sqrt(
          Math.pow(node.x - leakNode.x, 2) + Math.pow(node.y - leakNode.y, 2)
        );
        const distanceFactor = Math.max(0, 1 - distance / 500);
        const drop = originalPressure * 0.3 * distanceFactor * (leakRate / 10);
        pressureDrop.set(nodeId, drop);
      }
    });

    const allEdges = this.graph.getAllEdges();
    allEdges.forEach(edge => {
      if (affectedNodes.has(edge.startNodeId) && affectedNodes.has(edge.endNodeId)) {
        affectedPipes.add(edge.id);
      }
    });

    const nodePositions = Array.from(affectedNodes).map(nodeId => {
      const node = this.graph.getNode(nodeId);
      return node ? { x: node.x, y: node.y, id: nodeId } : null;
    }).filter(Boolean) as { x: number; y: number; id: string }[];

    let maxDistance = 0;
    nodePositions.forEach(pos => {
      const distance = Math.sqrt(
        Math.pow(pos.x - leakNode.x, 2) + Math.pow(pos.y - leakNode.y, 2)
      );
      maxDistance = Math.max(maxDistance, distance);
    });

    return {
      affectedNodes: Array.from(affectedNodes),
      affectedPipes: Array.from(affectedPipes),
      pressureDrop,
      impactArea: {
        center: { x: leakNode.x, y: leakNode.y },
        radius: maxDistance + 50,
        nodes: nodePositions
      }
    };
  }

  async getLeakImpactArea(
    leakNodeId: string,
    leakRate: number
  ): Promise<LeakSimulationResult['impactArea']> {
    const result = await this.simulateLeak(leakNodeId, leakRate);
    return result.impactArea;
  }
}

export default PipelineSimulation;
