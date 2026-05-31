export interface PipelineNode {
  id: string;
  name: string;
  nodeType: 'junction' | 'valve' | 'pump' | 'tank' | 'reservoir';
  x: number;
  y: number;
  z: number;
  elevation: number;
  pressure: number;
  demand: number;
  properties: Record<string, any>;
  layerId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Pipeline {
  id: string;
  name: string;
  startNodeId: string;
  endNodeId: string;
  material: string;
  diameter: number;
  length: number;
  depth: number;
  flowRate: number;
  velocity: number;
  roughness: number;
  status: 'active' | 'inactive' | 'maintenance';
  properties: Record<string, any>;
  layerId: string;
  geometry?: {
    type: string;
    coordinates: number[][];
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface Layer {
  id: string;
  name: string;
  type: 'terrain' | 'pipeline' | 'node' | 'annotation';
  visible: boolean;
  style: Record<string, any>;
  properties: Record<string, any>;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface FlowSimulationResult {
  nodePressures: Record<string, number>;
  pipeFlowRates: Record<string, number>;
  pipeVelocities: Record<string, number>;
  flowDirections: Record<string, {
    from: string;
    to: string;
  }>;
}

export interface PressureDistribution {
  nodes: {
    id: string;
    x: number;
    y: number;
    pressure: number;
    elevation: number;
  }[];
  minPressure: number;
  maxPressure: number;
  avgPressure: number;
}

export interface LeakSimulationResult {
  affectedNodes: string[];
  affectedPipes: string[];
  pressureDrop: Record<string, number>;
  impactArea: {
    center: { x: number; y: number };
    radius: number;
    nodes: { x: number; y: number; id: string }[];
  };
}

export interface ShortestPathResult {
  exists: boolean;
  path: string[];
  totalLength: number;
  edges: {
    id: string;
    startNodeId: string;
    endNodeId: string;
    length: number;
    diameter: number;
  }[];
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  message?: string;
}

export interface LayerStyle {
  color?: string;
  opacity?: number;
  width?: number;
  size?: number;
  outlineColor?: string;
  outlineWidth?: number;
}

export interface SelectionState {
  type: 'none' | 'single' | 'multiple' | 'box';
  selectedNodes: string[];
  selectedPipelines: string[];
  boxSelection?: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  };
}

export interface CameraView {
  longitude: number;
  latitude: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
}
