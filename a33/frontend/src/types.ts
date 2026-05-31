export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: string
  citations?: Citation[]
}

export interface Citation {
  index: number
  title: string
  authors: string[]
  snippet: string
  score: number
}

export interface Answer {
  content: string
  citations: Citation[]
  graph_hops: any[]
  source_documents: SearchResult[]
}

export interface DocumentChunk {
  id: string
  document_id: string
  content: string
  chunk_index: number
  metadata: Record<string, any>
}

export interface SearchResult {
  chunk: DocumentChunk
  score: number
}

export interface GraphNode {
  id: string
  name: string
  type: string
}

export interface GraphEdge {
  source: string
  target: string
  relation: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface FilterOptions {
  years: number[]
  conferences: string[]
  authors: string[]
  keywords: string[]
  min_citations: number | null
}

export interface UploadResponse {
  document_id: string
  title: string
  authors: string[]
  abstract: string | null
  keywords: string[]
  chunk_count: number
}

export interface MissingLink {
  source_name: string
  source_type: string
  target_name: string
  target_type: string
  missing_relation: string
  confidence: number
  evidence: string[]
}

export interface ResearchHypothesis {
  id?: string
  statement: string
  confidence: number
  based_on: string[]
  experiments: string[]
  related_work: string[]
  created_at?: string
}

export interface HypothesisResponse {
  missing_links: MissingLink[]
  hypotheses: ResearchHypothesis[]
  summary: string
}

export interface TopicCluster {
  topic_name: string
  keywords: string[]
  paper_count: number
  papers: Array<{
    title: string
    authors: string[]
    year?: number
    summary: string
  }>
  dominant_authors: string[]
  trend_data: Record<number, number>
}

export interface LiteratureReview {
  id?: string
  query: string
  title: string
  summary: string
  clusters: TopicCluster[]
  research_trends: Array<{
    year: number
    count: number
    keywords: string[]
  }>
  future_directions: string[]
  citations: Array<{
    title: string
    authors: string[]
    year?: number
    conference?: string
  }>
  created_at?: string
}

export interface Annotation {
  id?: string
  document_id: string
  chunk_index: number
  start_offset: number
  end_offset: number
  highlighted_text: string
  user_id: string
  user_name: string
  content: string
  parent_id?: string
  mentions: string[]
  created_at?: string
  updated_at?: string
  resolved: boolean
  votes: number
  voters: string[]
}

export interface Notification {
  id?: string
  user_id: string
  from_user: string
  annotation_id: string
  document_id: string
  document_title: string
  highlighted_text: string
  message: string
  read: boolean
  created_at?: string
}
