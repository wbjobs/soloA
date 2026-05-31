export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: 'admin' | 'doctor' | 'technician';
  is_active: boolean;
  created_at: string;
}

export interface Patient {
  id: number;
  patient_id: string;
  name: string;
  birth_date: string | null;
  gender: string | null;
  age: number | null;
  created_at: string;
}

export interface Study {
  id: number;
  study_uid: string;
  patient_id: number;
  study_date: string | null;
  study_time: string | null;
  study_description: string | null;
  modalities: string[];
  institution: string | null;
  referring_physician: string | null;
  created_at: string;
}

export interface Series {
  id: number;
  series_uid: string;
  study_id: number;
  series_number: number | null;
  modality: string | null;
  series_description: string | null;
  body_part: string | null;
  rows: number | null;
  columns: number | null;
  slice_thickness: number | null;
  slice_spacing: number | null;
  pixel_spacing: number[] | null;
  image_orientation: number[] | null;
  image_position: number[] | null;
  window_center: number | null;
  window_width: number | null;
  instance_count: number | null;
  created_at: string;
}

export interface Instance {
  id: number;
  instance_uid: string;
  series_id: number;
  instance_number: number | null;
  sop_class_uid: string | null;
  slice_location: number | null;
  image_position: number[] | null;
  created_at: string;
}

export interface AIFinding {
  slice_index: number;
  instance_uid: string;
  instance_number: number | null;
  slice_location: number | null;
  bounding_box: { x: number; y: number; width: number; height: number };
  center: { x: number; y: number };
  confidence: number;
  severity: 'high' | 'medium' | 'low';
}

export interface AIDetectionResults {
  series_id: number;
  series_uid: string;
  modality: string;
  total_slices: number;
  total_findings: number;
  high_confidence: number;
  findings: AIFinding[];
  processed_at: string;
}

export interface TaskStatus {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  results: AIDetectionResults | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface Report {
  id: number;
  study_id: number;
  doctor_id: number | null;
  findings: string | null;
  impression: string | null;
  recommendations: string | null;
  follow_up: string | null;
  is_final: boolean;
  created_at: string;
  updated_at: string | null;
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  timestamp: string;
}

export type ToolType = 
  | 'pan' 
  | 'zoom' 
  | 'window' 
  | 'length' 
  | 'elliptical_roi' 
  | 'rectangular_roi' 
  | 'arrow' 
  | 'angle'
  | 'crosshair';

export interface PaginatedResponse<T> {
  total: number;
  skip: number;
  limit: number;
  data: T[];
}

export type AnnotationType =
  | 'nodule'
  | 'lesion'
  | 'lymph_node'
  | 'calcification'
  | 'text'
  | 'arrow'
  | 'circle'
  | 'rectangle'
  | 'line'
  | 'angle';

export type ReviewStatus = 'pending' | 'agree' | 'disagree' | 'modified';

export interface Annotation {
  id: number;
  series_id: number;
  instance_id: number;
  created_by: number;
  annotation_type: AnnotationType;
  coordinates: Record<string, any>;
  description?: string;
  pathology?: string;
  confidence?: number;
  is_draft: boolean;
  parent_id?: number;
  created_at: string;
  updated_at?: string;
}

export interface AnnotationReview {
  id: number;
  annotation_id: number;
  reviewed_by: number;
  status: ReviewStatus;
  comment?: string;
  modified_coordinates?: Record<string, any>;
  created_at: string;
  updated_at?: string;
}

export interface ReportTemplate {
  id: number;
  name: string;
  category?: string;
  modality?: string;
  body_part?: string;
  findings_template?: string;
  impression_template?: string;
  recommendations_template?: string;
  is_default: boolean;
  is_public: boolean;
  created_by: number;
  created_at: string;
  updated_at?: string;
}

export interface VolumeMetadata {
  series_id: number;
  dimensions: {
    slices: number;
    rows: number;
    columns: number;
  };
  spacing: {
    pixel_spacing: number[] | null;
    slice_thickness: number | null;
    slice_spacing: number | null;
  };
  orientation: number[] | null;
  position: number[] | null;
  window: {
    center: number | null;
    width: number | null;
  };
  modality: string | null;
}

export type ProjectionType = 'mip' | 'minip' | 'average';
export type ProjectionAxis = 0 | 1 | 2;

export interface ViewportState {
  series: Series | null;
  instances: Instance[];
  currentIndex: number;
  tool: ToolType;
  windowCenter: number;
  windowWidth: number;
  zoom: number;
  pan: { x: number; y: number };
  rotate: number;
  invert: boolean;
  voiLut: string;
}
