export interface Document {
  id: number;
  title: string;
  author?: string;
  dynasty?: string;
  description?: string;
  original_image_path?: string;
  processed_image_path?: string;
  inpainted_image_path?: string;
  status: string;
  created_at: string;
  updated_at?: string;
  layout_analysis: LayoutRegion[];
  ocr_results: OCRResult[];
  entities: Entity[];
  relations: EntityRelation[];
}

export interface LayoutRegion {
  id: number;
  document_id: number;
  region_type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
  is_vertical: boolean;
  metadata?: Record<string, any>;
}

export interface OCRResult {
  id: number;
  document_id: number;
  layout_region_id?: number;
  text: string;
  confidence?: number;
  is_vertical: boolean;
  is_corrected: boolean;
  corrected_text?: string;
  metadata?: Record<string, any>;
}

export interface Entity {
  id: number;
  document_id: number;
  entity_type: string;
  entity_text: string;
  start_index?: number;
  end_index?: number;
  confidence?: number;
  metadata?: Record<string, any>;
}

export interface EntityRelation {
  id: number;
  document_id: number;
  source_entity_id: number;
  target_entity_id: number;
  relation_type: string;
  confidence?: number;
  evidence_text?: string;
}

export interface ProcessingStatus {
  document_id: number;
  status: string;
  step?: string;
  progress?: number;
  message?: string;
}

export interface PipelineResult {
  document_id: number;
  status: string;
  layout_regions: number;
  ocr_results: number;
  entities: number;
  relations: number;
  message?: string;
}

export interface DocumentImages {
  original?: string;
  processed?: string;
  inpainted?: string;
}

export interface Annotation {
  id: number;
  document_id: number;
  annotation_type: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  linked_text_region_id?: number;
  linked_layout_region_id?: number;
  confidence?: number;
  proximity_score?: number;
  semantic_score?: number;
  is_verified: boolean;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, any>;
}

export interface StyleInfo {
  key: string;
  name: string;
  description: string;
}

export interface StyleTransferRequest {
  text: string;
  style_name: string;
  strength: number;
  font_size?: number;
  generate_image?: boolean;
}

export interface StyleTransferResponse {
  original_text: string;
  styled_text: string;
  style_name: string;
  transfer_strength: number;
  has_image: boolean;
  metadata?: Record<string, any>;
}

export interface AnnotationAnalysisResult {
  total_annotations: number;
  linked_annotations: number;
  link_rate: number;
  type_distribution: Record<string, number>;
  average_confidence: number;
  high_confidence_count: number;
}

export interface AnnotationGroup {
  ocr_result_id: number;
  text: string;
  annotations: Annotation[];
}

export interface StyleTransferHistory {
  id: number;
  ocr_result_id?: number;
  original_text: string;
  styled_text?: string;
  style_name: string;
  transfer_strength: number;
  image_path?: string;
  created_at: string;
}
