export interface Project {
  id: number
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface ProjectCreate {
  name: string
  description?: string
}

export interface ProjectUpdate {
  name?: string
  description?: string
}

export interface TrajectoryFile {
  id: number
  project_id: number
  name: string
  file_type: string
  file_path: string
  topology_path: string | null
  created_at: string
  metadata: TrajectoryMetadata | null
}

export interface TrajectoryMetadata {
  n_atoms: number
  n_frames: number
  box: number[] | null
  residues: { id: number; name: string; num_atoms: number }[]
  atom_types: string[]
  has_velocities: boolean
  has_forces: boolean
  time_step: number | null
}

export interface FrameData {
  frame_index: number
  time: number
  positions: number[][]
  atom_names: string[]
  atom_resnames: string[]
  atom_resids: number[]
  elements: string[] | null
  velocities: number[][] | null
  forces: number[][] | null
  box: number[] | null
}

export interface FrameInfo {
  frame_index: number
  time: number
  box: number[] | null
}

export interface RMSDResult {
  analysis_type: 'rmsd'
  selection: string
  reference_selection: string
  times: number[]
  frame_indices: number[]
  rmsd_values: number[]
  units: string
  summary: {
    mean: number
    std: number
    min: number
    max: number
  }
}

export interface RMSFResult {
  analysis_type: 'rmsf'
  selection: string
  atom_indices: number[]
  atom_names: string[]
  atom_resids: number[]
  atom_resnames: string[]
  atom_rmsf_values: number[]
  residue_ids: number[]
  residue_names: string[]
  residue_rmsf_values: number[]
  units: string
  times: number[]
  frame_indices: number[]
  summary: {
    mean_atom: number
    std_atom: number
    min_atom: number
    max_atom: number
    mean_residue: number
    std_residue: number
  }
}

export interface RDFResult {
  analysis_type: 'rdf'
  g1: string
  g2: string
  r_values: number[]
  gofr: number[]
  histogram: number[]
  n_frames_analyzed: number
  range: [number, number]
  nbins: number
  units: string
  summary?: {
    avg_volume: number
    g1_atoms: number
    g2_atoms: number
    max_gofr: number
  }
}

export type AnalysisDataType = RMSDResult | RMSFResult | RDFResult

export interface AnalysisResult {
  id: number
  project_id: number
  analysis_type: string
  name: string
  created_at: string
  config: Record<string, any> | null
  result_data: AnalysisDataType | null
}

export interface UploadResponse {
  success: boolean
  message: string
  file_id?: number
  file_name?: string
  file_type?: string
  metadata?: TrajectoryMetadata
}

export interface AnalysisConfig {
  start?: number
  stop?: number | null
  step?: number
  selection?: string
}

export interface RDFConfig extends AnalysisConfig {
  nbins?: number
  range_start?: number
  range_end?: number
  g1?: string
  g2?: string
}
