import PipelineNode from '../models/PipelineNode';
import Pipeline from '../models/Pipeline';

export interface GraphNode {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface GraphEdge {
  id: string;
  startNodeId: string;
  endNodeId: string;
  length: number;
  diameter: number;
}

export interface ConnectivityResult {
  connected: boolean;
  node1Exists: boolean;
  node2Exists: boolean;
  componentSize?: number;
}

export class TopologyGraph {
  private nodes: Map<string, GraphNode>;
  private adjacencyList: Map<string, { nodeId: string; edge: GraphEdge }[]>;
  private edges: GraphEdge[];
  private connectedComponents: Map<string, Set<string>>;
  private nodeToComponent: Map<string, string>;

  constructor() {
    this.nodes = new Map();
    this.adjacencyList = new Map();
    this.edges = [];
    this.connectedComponents = new Map();
    this.nodeToComponent = new Map();
  }

  async loadFromDatabase() {
    const nodes = await PipelineNode.findAll();
    const pipelines = await Pipeline.findAll();

    this.nodes.clear();
    this.adjacencyList.clear();
    this.edges = [];
    this.connectedComponents.clear();
    this.nodeToComponent.clear();

    nodes.forEach(node => {
      this.nodes.set(node.id, {
        id: node.id,
        x: node.x,
        y: node.y,
        z: node.z
      });
      this.adjacencyList.set(node.id, []);
    });

    pipelines.forEach(pipeline => {
      if (!this.adjacencyList.has(pipeline.startNodeId) || 
          !this.adjacencyList.has(pipeline.endNodeId)) {
        return;
      }

      const edge: GraphEdge = {
        id: pipeline.id,
        startNodeId: pipeline.startNodeId,
        endNodeId: pipeline.endNodeId,
        length: pipeline.length,
        diameter: pipeline.diameter
      };
      this.edges.push(edge);

      this.adjacencyList.get(pipeline.startNodeId)!.push({
        nodeId: pipeline.endNodeId,
        edge
      });
      
      this.adjacencyList.get(pipeline.endNodeId)!.push({
        nodeId: pipeline.startNodeId,
        edge
      });
    });

    this.computeConnectedComponents();
  }

  private computeConnectedComponents(): void {
    const visited: Set<string> = new Set();
    let componentIndex = 0;

    this.nodes.forEach((_, nodeId) => {
      if (!visited.has(nodeId)) {
        const component = new Set<string>();
        const stack: string[] = [nodeId];
        const componentId = `comp_${componentIndex++}`;

        while (stack.length > 0) {
          const current = stack.pop()!;
          if (!visited.has(current)) {
            visited.add(current);
            component.add(current);
            this.nodeToComponent.set(current, componentId);

            const neighbors = this.getNeighbors(current);
            neighbors.forEach(({ nodeId }) => {
              if (!visited.has(nodeId)) {
                stack.push(nodeId);
              }
            });
          }
        }

        this.connectedComponents.set(componentId, component);
      }
    });
  }

  getNode(nodeId: string): GraphNode | undefined {
    return this.nodes.get(nodeId);
  }

  hasNode(nodeId: string): boolean {
    return this.nodes.has(nodeId);
  }

  getNeighbors(nodeId: string): { nodeId: string; edge: GraphEdge }[] {
    return this.adjacencyList.get(nodeId) || [];
  }

  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }

  getAllEdges(): GraphEdge[] {
    return this.edges;
  }

  getNodeCount(): number {
    return this.nodes.size;
  }

  getEdgeCount(): number {
    return this.edges.length;
  }

  getConnectedComponentCount(): number {
    return this.connectedComponents.size;
  }

  findShortestPath(startNodeId: string, endNodeId: string): {
    path: string[];
    totalLength: number;
    edges: GraphEdge[];
  } | null {
    if (!this.nodes.has(startNodeId) || !this.nodes.has(endNodeId)) {
      return null;
    }

    const componentId1 = this.nodeToComponent.get(startNodeId);
    const componentId2 = this.nodeToComponent.get(endNodeId);
    
    if (componentId1 !== componentId2) {
      return null;
    }

    const distances: Map<string, number> = new Map();
    const previous: Map<string, { nodeId: string; edge: GraphEdge } | null> = new Map();
    const visited: Set<string> = new Set();

    this.nodes.forEach((_, id) => {
      distances.set(id, Infinity);
      previous.set(id, null);
    });
    distances.set(startNodeId, 0);

    const unvisited: string[] = [startNodeId];

    while (unvisited.length > 0) {
      let minDistance = Infinity;
      let currentNodeId: string | null = null;
      let minIndex = -1;

      for (let i = 0; i < unvisited.length; i++) {
        const id = unvisited[i];
        const dist = distances.get(id)!;
        if (dist < minDistance) {
          minDistance = dist;
          currentNodeId = id;
          minIndex = i;
        }
      }

      if (currentNodeId === null) break;
      
      unvisited.splice(minIndex, 1);
      visited.add(currentNodeId);

      if (currentNodeId === endNodeId) break;

      const neighbors = this.getNeighbors(currentNodeId);
      for (const { nodeId, edge } of neighbors) {
        if (!visited.has(nodeId)) {
          const newDistance = distances.get(currentNodeId)! + edge.length;
          if (newDistance < distances.get(nodeId)!) {
            distances.set(nodeId, newDistance);
            previous.set(nodeId, { nodeId: currentNodeId, edge });
            
            if (!unvisited.includes(nodeId)) {
              unvisited.push(nodeId);
            }
          }
        }
      }
    }

    if (distances.get(endNodeId)! === Infinity) {
      return null;
    }

    const path: string[] = [];
    const edges: GraphEdge[] = [];
    let current: string | null = endNodeId;

    while (current !== null) {
      path.unshift(current);
      const prev = previous.get(current);
      if (prev) {
        edges.unshift(prev.edge);
        current = prev.nodeId;
      } else {
        current = null;
      }
    }

    return {
      path,
      totalLength: distances.get(endNodeId)!,
      edges
    };
  }

  findConnectedComponent(nodeId: string): Set<string> {
    const componentId = this.nodeToComponent.get(nodeId);
    if (!componentId) {
      return new Set();
    }
    
    const component = this.connectedComponents.get(componentId);
    return component ? new Set(component) : new Set();
  }

  checkConnectivity(nodeId1: string, nodeId2: string): ConnectivityResult {
    const node1Exists = this.nodes.has(nodeId1);
    const node2Exists = this.nodes.has(nodeId2);

    if (!node1Exists || !node2Exists) {
      return {
        connected: false,
        node1Exists,
        node2Exists
      };
    }

    const componentId1 = this.nodeToComponent.get(nodeId1);
    const componentId2 = this.nodeToComponent.get(nodeId2);
    
    const connected = componentId1 === componentId2;
    const component = this.connectedComponents.get(componentId1!);

    return {
      connected,
      node1Exists: true,
      node2Exists: true,
      componentSize: component?.size
    };
  }

  isNodeConnectedToComponent(nodeId: string): boolean {
    return this.nodeToComponent.has(nodeId);
  }

  detectLoops(): string[][] {
    const loops: string[][] = [];
    const visited: Set<string> = new Set();
    const parentMap: Map<string, string | null> = new Map();

    const findCycle = (startNodeId: string): boolean => {
      const stack: { nodeId: string; parentId: string | null; visitedFlag: boolean }[] = [
        { nodeId: startNodeId, parentId: null, visitedFlag: false }
      ];
      const path: string[] = [];
      const pathSet: Set<string> = new Set();

      while (stack.length > 0) {
        const { nodeId, parentId, visitedFlag } = stack.pop()!;

        if (visitedFlag) {
          path.pop();
          pathSet.delete(nodeId);
          continue;
        }

        if (visited.has(nodeId)) {
          continue;
        }

        visited.add(nodeId);
        path.push(nodeId);
        pathSet.add(nodeId);
        parentMap.set(nodeId, parentId);

        stack.push({ nodeId, parentId, visitedFlag: true });

        const neighbors = this.getNeighbors(nodeId);
        for (const { nodeId: neighborId } of neighbors) {
          if (neighborId === parentId) {
            continue;
          }

          if (pathSet.has(neighborId)) {
            const startIndex = path.indexOf(neighborId);
            if (startIndex !== -1) {
              const loop = [...path.slice(startIndex), neighborId];
              if (loop.length >= 3) {
                loops.push(loop);
              }
            }
            continue;
          }

          if (!visited.has(neighborId)) {
            stack.push({ nodeId: neighborId, parentId: nodeId, visitedFlag: false });
          }
        }
      }

      return false;
    };

    this.nodes.forEach((_, nodeId) => {
      if (!visited.has(nodeId)) {
        findCycle(nodeId);
      }
    });

    return this.deduplicateLoops(loops);
  }

  private deduplicateLoops(loops: string[][]): string[][] {
    const uniqueLoops: string[][] = [];
    const seenSignatures: Set<string> = new Set();

    for (const loop of loops) {
      const sorted = [...loop].sort().join('|');
      if (!seenSignatures.has(sorted)) {
        seenSignatures.add(sorted);
        uniqueLoops.push(loop);
      }
    }

    return uniqueLoops;
  }

  findUpstream(startNodeId: string, maxDepth: number = 10): {
    nodes: string[];
    edges: GraphEdge[];
  } {
    return this.traverseDirection(startNodeId, maxDepth, true);
  }

  findDownstream(startNodeId: string, maxDepth: number = 10): {
    nodes: string[];
    edges: GraphEdge[];
  } {
    return this.traverseDirection(startNodeId, maxDepth, false);
  }

  private traverseDirection(
    startNodeId: string,
    maxDepth: number,
    isUpstream: boolean
  ): { nodes: string[]; edges: GraphEdge[] } {
    const visited: Set<string> = new Set();
    const nodes: string[] = [];
    const edges: GraphEdge[] = [];
    const queue: { nodeId: string; depth: number }[] = [{ nodeId: startNodeId, depth: 0 }];

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;
      
      if (visited.has(nodeId)) continue;
      if (depth > maxDepth) continue;
      if (!this.nodes.has(nodeId)) continue;

      visited.add(nodeId);
      if (nodeId !== startNodeId) {
        nodes.push(nodeId);
      }

      const neighbors = this.getNeighbors(nodeId);
      neighbors.forEach(({ nodeId: neighborId, edge }) => {
        if (!visited.has(neighborId) && this.nodes.has(neighborId)) {
          edges.push(edge);
          queue.push({ nodeId: neighborId, depth: depth + 1 });
        }
      });
    }

    return { nodes, edges };
  }

  findNearestNode(x: number, y: number, maxDistance: number = 100): GraphNode | null {
    let nearestNode: GraphNode | null = null;
    let minDistance = Infinity;

    this.nodes.forEach(node => {
      const distance = Math.sqrt(
        Math.pow(node.x - x, 2) + Math.pow(node.y - y,  2)
      );
      if (distance < minDistance && distance <= maxDistance) {
        minDistance = distance;
        nearestNode = node;
      }
    });

    return nearestNode;
  }

  getComponentStatistics(): {
    totalComponents: number;
    largestComponent: {
      size: number;
      percentage: number;
    };
    isolatedNodes: number;
  } {
    const totalComponents = this.connectedComponents.size;
    const totalNodes = this.nodes.size;
    
    let largestSize = 0;
    let isolatedCount = 0;

    this.connectedComponents.forEach(component => {
      if (component.size > largestSize) {
        largestSize = component.size;
      }
      if (component.size === 1) {
        isolatedCount++;
      }
    });

    return {
      totalComponents,
      largestComponent: {
        size: largestSize,
        percentage: totalNodes > 0 ? (largestSize / totalNodes) * 100 : 0
      },
      isolatedNodes: isolatedCount
    };
  }
}

export default TopologyGraph;
