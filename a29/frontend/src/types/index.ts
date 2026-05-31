export interface GridParams {
  width: number
  height: number
  element_size: number
}

export interface MaterialParams {
  vp: number
  vs: number
  density: number
}

export interface SourceParams {
  x: number
  y: number
  frequency: number
  amplitude: number
  source_type: string
}

export interface SolverParams {
  total_time: number
  time_step: number | null
  output_interval: number
  courant_number: number
  use_mpi?: boolean
  n_procs?: number
}

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface SimulationTask {
  id: number
  name: string
  status: TaskStatus
  progress: number
  grid_params: GridParams
  material_params: MaterialParams
  source_params: SourceParams
  solver_params: SolverParams
  created_at: string | null
  started_at: string | null
  completed_at: string | null
  error_message: string | null
}

export interface TaskListEntry {
  id: number
  name: string
  status: TaskStatus
  progress: number
  created_at: string | null
  started_at: string | null
  completed_at: string | null
}

export interface SimulationCreate {
  name: string
  grid_params: GridParams
  material_params: MaterialParams
  source_params: SourceParams
  solver_params: SolverParams
}

export interface SnapshotInfo {
  task_id: number
  n_snapshots: number
  times: number[]
  parameters: {
    dt: number
    total_time: number
    n_steps: number
    vp: number
    vs: number
    density: number
  }
  mesh: {
    width: number
    height: number
    n_nodes: number
    n_elements: number
  }
}

export interface SnapshotData {
  time: number
  step: number
  index: number
  nx: number
  ny: number
  width: number
  height: number
  x_coords: number[]
  y_coords: number[]
  ux: number[][]
  uy: number[][]
  magnitude: number[][]
  ux_raw: number[][]
  uy_raw: number[][]
  magnitude_raw: number[][]
}

export interface SeismogramPoint {
  receiver_x: number
  receiver_y: number
  actual_x: number
  actual_y: number
  time: number[]
  ux: number[]
  uy: number[]
}

export interface SeismogramsResponse {
  seismograms: SeismogramPoint[]
}


export type FaultType = 'normal' | 'reverse' | 'strike-slip' | 'thrust'

export interface MaterialLayer {
  vp: number
  vs: number
  density: number
  y_min: number
  y_max: number
  x_min?: number
  x_max?: number
  gradient?: Record<string, [number, number]>
  name?: string
}

export interface FaultZone {
  start: [number, number]
  end: [number, number]
  width: number
  material: MaterialParams
  fault_type: FaultType
  displacement?: number
  name?: string
}

export interface GeologyModelParams {
  domain_width: number
  domain_height: number
  base_material: MaterialParams
  layers: MaterialLayer[]
  faults: FaultZone[]
}

export interface GeologyPreviewRequest {
  model_params: GeologyModelParams
  nx?: number
  ny?: number
}

export interface GeologyPreviewResponse {
  success: boolean
  x: number[]
  y: number[]
  vp: number[][]
  vs: number[][]
  density: number[][]
  layers: string[]
  faults: string[]
}


export interface SourceParameters {
  x: number
  y: number
  strike?: number
  dip?: number
  rake?: number
  moment?: number
  depth?: number
}

export interface InversionParams {
  max_iterations?: number
  learning_rate?: number
  tolerance?: number
  f0?: number
}

export interface InversionRequest {
  mesh_params: GridParams
  material_params: MaterialParams
  receivers: [number, number][]
  observed_data_path: string
  synthetic_source?: SourceParameters
  initial_source: SourceParameters
  inversion_params?: InversionParams
  total_time?: number
}

export type InversionStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface InversionProgressResponse {
  task_id: string
  status: InversionStatus
  progress: number
  current_iteration: number
  current_misfit?: number
}

export interface InversionResultResponse {
  success: boolean
  task_id: string
  status: InversionStatus
  iterations: number
  final_misfit?: number
  misfit_history: number[]
  initial_source?: SourceParameters
  best_source?: SourceParameters
  converged: boolean
  error_message?: string
}


export type VideoFormat = 'mp4' | 'webm' | 'gif'
export type Colormap = 'viridis' | 'seismic' | 'jet' | 'hot' | 'cool'

export interface AnimationRequest {
  width?: number
  height?: number
  fps?: number
  format?: VideoFormat
  colormap?: Colormap
  field_type?: string
  include_time_label?: boolean
  include_colorbar?: boolean
  quality?: number
}

export type AnimationStatus = 'pending' | 'generating' | 'rendering' | 'completed' | 'failed'

export interface AnimationProgressResponse {
  task_id: string
  status: AnimationStatus
  progress: number
  message?: string
}

export interface AnimationResponse {
  success: boolean
  task_id: string
  status: AnimationStatus
  progress: number
  output_path?: string
  file_size_bytes?: number
  format?: string
  error_message?: string
}
