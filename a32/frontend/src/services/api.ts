import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

export interface Sample {
  id: number
  sample_id: string
  name: string
  description: string | null
  reference_genome: string
  bam_object_name: string | null
  bai_object_name: string | null
  bam_file_size: number | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface SampleCreate {
  sample_id: string
  name: string
  description?: string
  reference_genome?: string
  metadata?: Record<string, unknown>
}

export interface SampleList {
  items: Sample[]
  total: number
  page: number
  page_size: number
}

export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'cancelled'
export type TaskType = 'variant_calling' | 'annotation' | 'quality_control'

export interface Task {
  id: number
  task_id: string
  task_type: TaskType
  status: TaskStatus
  sample_id: string
  algorithm: string
  parameters: Record<string, unknown>
  celery_task_id: string | null
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  vcf_object_name: string | null
  created_at: string
  updated_at: string
  result_summary: Record<string, unknown>
}

export interface TaskCreate {
  sample_id: string
  task_type?: TaskType
  algorithm?: string
  parameters?: Record<string, unknown>
}

export interface TaskList {
  items: Task[]
  total: number
  page: number
  page_size: number
}

export type VariantType = 'SNP' | 'INS' | 'DEL' | 'MNP' | 'SV'

export interface Variant {
  id: number
  variant_id: string
  task_id: string
  chromosome: string
  position: number
  ref_allele: string
  alt_allele: string
  variant_type: VariantType
  quality: number | null
  filter_status: string | null
  read_depth: number | null
  alt_depth: number | null
  allele_frequency: number | null
  genotype: string | null
  vcf_info: Record<string, unknown>
  created_at: string
}

export interface PopulationFrequency {
  population: string
  label: string
  af: number | null
  color: string
}

export interface PopulationData {
  database: string
  overall_af: number | null
  populations: PopulationFrequency[]
  hom_count?: number | null
  het_count?: number | null
}

export interface VariantWithAnnotation {
  variant: Variant
  annotation?: {
    dbsnp_rs_id: string | null
    gene: string | null
    transcript: string | null
    consequence: string | null
    clinvar_variation_id: string | null
    clinvar_clinical_significance: string | null
    clinvar_conditions: string | null
    clinvar_review_status: string | null
    sift_prediction: string | null
    sift_score: string | null
    polyphen_prediction: string | null
    polyphen_score: string | null
    allele_frequency_1kg: string | null
    allele_frequency_gnomad: string | null
    allele_frequency_exac: string | null
    gnomad_af: number | null
    gnomad_af_afr: number | null
    gnomad_af_amr: number | null
    gnomad_af_asj: number | null
    gnomad_af_eas: number | null
    gnomad_af_fin: number | null
    gnomad_af_nfe: number | null
    gnomad_af_oth: number | null
    gnomad_af_sas: number | null
    gnomad_hom_count: number | null
    gnomad_het_count: number | null
    exac_af: number | null
    exac_af_afr: number | null
    exac_af_amr: number | null
    exac_af_eas: number | null
    exac_af_fin: number | null
    exac_af_nfe: number | null
    exac_af_sas: number | null
    thousandg_af: number | null
    thousandg_af_afr: number | null
    thousandg_af_amr: number | null
    thousandg_af_eas: number | null
    thousandg_af_eur: number | null
    thousandg_af_sas: number | null
  }
}

export interface VariantList {
  items: Variant[]
  total: number
  page: number
  page_size: number
  filters: Record<string, unknown>
}

export interface CoveragePoint {
  position: number
  depth: number
}

export interface CoverageData {
  sample_id: string
  chromosome: string
  start: number
  end: number
  stats: {
    chromosome: string
    start: number
    end: number
    region_length: number
    bin_size: number
    max_depth: number
    avg_depth: number
    min_depth: number
  }
  coverage: CoveragePoint[]
}

export const sampleApi = {
  list: (page = 1, pageSize = 20) =>
    api.get<SampleList>('/samples', { params: { page, page_size: pageSize } }),

  get: (sampleId: string) =>
    api.get<Sample>(`/samples/${sampleId}`),

  create: (data: SampleCreate) =>
    api.post<Sample>('/samples', data),

  delete: (sampleId: string) =>
    api.delete(`/samples/${sampleId}`),

  uploadBam: (sampleId: string, bamFile: File, baiFile?: File) => {
    const formData = new FormData()
    formData.append('bam_file', bamFile)
    if (baiFile) {
      formData.append('bai_file', baiFile)
    }
    return api.post<Sample>(`/samples/${sampleId}/upload-bam`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

export const taskApi = {
  list: (page = 1, pageSize = 20, status?: TaskStatus, sampleId?: string) =>
    api.get<TaskList>('/tasks', {
      params: { page, page_size: pageSize, status, sample_id: sampleId },
    }),

  get: (taskId: string) =>
    api.get<Task>(`/tasks/${taskId}`),

  create: (data: TaskCreate) =>
    api.post<Task>('/tasks', data),

  cancel: (taskId: string) =>
    api.delete(`/tasks/${taskId}`),
}

export const variantApi = {
  list: (params: {
    page?: number
    page_size?: number
    task_id?: string
    chromosome?: string
    min_quality?: number
    min_read_depth?: number
    min_allele_frequency?: number
    max_allele_frequency?: number
    variant_type?: VariantType
  }) => api.get<VariantList>('/variants', { params }),

  get: (variantId: string) =>
    api.get<VariantWithAnnotation>(`/variants/${variantId}`),

  getAnnotation: (variantId: string) =>
    api.get(`/variants/${variantId}/annotation`),
}

export const visualizationApi = {
  getChromosomes: (sampleId: string, signal?: AbortSignal) =>
    api.get<{ sample_id: string; chromosomes: Record<string, number> }>(
      `/visualization/${sampleId}/chromosomes`,
      { signal }
    ),

  getCoverage: (
    sampleId: string,
    chromosome: string,
    start: number,
    end: number,
    binSize?: number,
    signal?: AbortSignal
  ) =>
    api.get<CoverageData>(`/visualization/${sampleId}/coverage`, {
      params: { chromosome, start, end, bin_size: binSize },
      signal,
    }),

  getReads: (
    sampleId: string,
    chromosome: string,
    start: number,
    end: number,
    limit = 100,
    signal?: AbortSignal
  ) =>
    api.get(`/visualization/${sampleId}/reads`, {
      params: { chromosome, start, end, limit },
      signal,
    }),
}

export type SVType = 'DEL' | 'DUP' | 'INV' | 'BND' | 'INS' | 'CNV'

export interface StructuralVariant {
  id: number
  sv_id: string
  task_id: string
  chromosome_1: string
  position_1: number
  chromosome_2: string | null
  position_2: number | null
  sv_type: SVType
  sv_length: number | null
  quality: number | null
  filter_status: string | null
  read_depth: number | null
  allele_frequency: number | null
  genotype: string | null
  supporting_reads: number | null
  split_reads: number | null
  discordant_pairs: number | null
  gene_1: string | null
  gene_2: string | null
  consequence: string | null
  vcf_info: Record<string, unknown>
  created_at: string
}

export interface SVBreakpoint {
  sv_id: string
  sv_type: SVType
  breakpoint_1: { chromosome: string; position: number }
  breakpoint_2: { chromosome: string; position: number } | null
  quality: number | null
  allele_frequency: number | null
  supporting_reads: number | null
  gene_1: string | null
  gene_2: string | null
}

export interface SVBreakpointsResponse {
  task_id: string
  chromosome: string | null
  breakpoints: SVBreakpoint[]
  total: number
}

export interface SVRead {
  read_id: string
  chromosome_1: string
  position_1: number
  chromosome_2: string | null
  position_2: number | null
  read_length: number
  mapq: number
  is_split: boolean
  is_discordant: boolean
  is_supplementary: boolean
  strand: '+' | '-'
  cigar: string
}

export interface SVReadsResponse {
  sv_id: string
  total_supporting: number | null
  split_reads: number | null
  discordant_pairs: number | null
  reads: SVRead[]
}

export interface SamplePair {
  id: number
  pair_id: string
  tumor_sample_id: string
  normal_sample_id: string
  name: string | null
  description: string | null
  tumor_task_id: string | null
  normal_task_id: string | null
  paired_task_id: string | null
  is_somatic: boolean
  analysis_status: string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface SomaticVariant {
  id: number
  somatic_id: string
  pair_id: string
  chromosome: string
  position: number
  ref_allele: string
  alt_allele: string
  variant_type: string | null
  tumor_af: number | null
  normal_af: number | null
  tumor_depth: number | null
  normal_depth: number | null
  tumor_alt_depth: number | null
  normal_alt_depth: number | null
  quality: number | null
  filter_status: string | null
  somatic_status: string
  vaf_difference: number | null
  vcf_info: Record<string, unknown>
  created_at: string
}

export interface CoveragePoint {
  position: number
  depth: number
}

export interface CoverageComparisonResponse {
  pair_id: string
  chromosome: string
  start: number
  end: number
  bin_size: number
  tumor_coverage: CoveragePoint[]
  normal_coverage: CoveragePoint[]
  stats: {
    tumor_avg: number
    normal_avg: number
    tumor_max: number
    normal_max: number
  }
}

export interface BAFPoint {
  position: number
  baf: number
  depth: number
}

export interface BAFResponse {
  pair_id: string
  chromosome: string
  start: number
  end: number
  tumor_baf: BAFPoint[]
  normal_baf: BAFPoint[]
}

export const structuralVariantApi = {
  list: (params: {
    page?: number
    page_size?: number
    task_id?: string
    chromosome?: string
    sv_type?: SVType
    min_quality?: number
    min_read_depth?: number
    min_allele_frequency?: number
  }) => api.get<{
    items: StructuralVariant[]
    total: number
    page: number
    page_size: number
    filters: Record<string, unknown>
  }>('/structural-variants', { params }),

  get: (svId: string) =>
    api.get<StructuralVariant>(`/structural-variants/${svId}`),

  getSupportingReads: (svId: string) =>
    api.get<SVReadsResponse>(`/structural-variants/${svId}/supporting-reads`),

  getBreakpoints: (taskId: string, chromosome?: string) =>
    api.get<SVBreakpointsResponse>(`/structural-variants/task/${taskId}/breakpoints`, {
      params: { chromosome },
    }),
}

export const comparisonApi = {
  createPair: (tumorSampleId: string, normalSampleId: string, name?: string, description?: string) =>
    api.post<SamplePair>('/comparison/pairs', null, {
      params: { tumor_sample_id: tumorSampleId, normal_sample_id: normalSampleId, name, description },
    }),

  listPairs: (page = 1, pageSize = 20) =>
    api.get<{
      items: SamplePair[]
      total: number
      page: number
      page_size: number
    }>('/comparison/pairs', { params: { page, page_size: pageSize } }),

  getPair: (pairId: string) =>
    api.get<{
      pair: SamplePair
      tumor_sample: Sample
      normal_sample: Sample
    }>(`/comparison/pairs/${pairId}`),

  getSomaticVariants: (pairId: string, params: {
    chromosome?: string
    min_tumor_af?: number
    max_normal_af?: number
    min_quality?: number
    page?: number
    page_size?: number
  }) => api.get<{
    items: SomaticVariant[]
    total: number
    page: number
    page_size: number
    filters: Record<string, unknown>
  }>(`/comparison/pairs/${pairId}/somatic-variants`, { params }),

  getCoverageComparison: (pairId: string, chromosome: string, start: number, end: number, binSize?: number) =>
    api.get<CoverageComparisonResponse>(`/comparison/pairs/${pairId}/coverage-comparison`, {
      params: { chromosome, start, end, bin_size: binSize },
    }),

  getBAFPlot: (pairId: string, chromosome: string, start: number, end: number) =>
    api.get<BAFResponse>(`/comparison/pairs/${pairId}/baf-plot`, {
      params: { chromosome, start, end },
    }),
}

export default api
