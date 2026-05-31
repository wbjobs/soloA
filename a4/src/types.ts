export interface StationConfig {
  id: number;
  position: number;
  processTime: number;
}

export interface StationState {
  id: number;
  currentBall: Ball | null;
  queue: Ball[];
  processTime: number;
  remainingTime: number;
  totalTime: number;
  workingTime: number;
  utilization: number;
  isProcessing: boolean;
}

export interface Ball {
  id: number;
  mesh: any;
  progress: number;
  currentStationIndex: number;
  status: 'moving' | 'waiting' | 'processing' | 'done';
}

export interface SimulationState {
  isRunning: boolean;
  speed: number;
  stations: StationState[];
  balls: Ball[];
}
