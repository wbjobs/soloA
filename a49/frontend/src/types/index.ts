export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface BodyData {
  name: string;
  mass: number;
  radius: number;
  position: Vector3D;
  velocity: Vector3D;
  color: string;
}

export interface SimulationState {
  step: number;
  time: number;
  bodies: BodyData[];
  history: number[][];
}

export interface SimulationConfig {
  id?: number;
  name: string;
  description?: string;
  G: number;
  dt: number;
  integrator: 'euler' | 'symplectic' | 'rk4';
  algorithm: 'direct' | 'barnes_hut';
  theta: number;
  enable_collision: boolean;
  save_history: boolean;
  enable_relativity?: boolean;
  c?: number;
  softening?: number;
}

export interface CameraTarget {
  mode: 'free' | 'follow';
  followBodyIndex: number;
}

export interface ViewSettings {
  showTrails: boolean;
  trailLength: number;
  showLabels: boolean;
  particleScale: number;
  background: string;
  showHabitableZone: boolean;
}
