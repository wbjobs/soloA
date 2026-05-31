import axios from 'axios'
import type {
  Project,
  ProjectCreate,
  ProjectUpdate,
  TrajectoryFile,
  TrajectoryMetadata,
  FrameData,
  FrameInfo,
  AnalysisResult,
  UploadResponse,
  AnalysisConfig,
  RDFConfig
} from '../types'

const API_BASE = '/api'

const api = axios.create({
  baseURL: API_BASE
})

export const projectApi = {
  getAll: () => api.get<Project[]>('/projects'),
  getById: (id: number) => api.get<Project>(`/projects/${id}`),
  create: (data: ProjectCreate) => api.post<Project>('/projects', data),
  update: (id: number, data: ProjectUpdate) => api.put<Project>(`/projects/${id}`, data),
  delete: (id: number) => api.delete(`/projects/${id}`),
  getFiles: (id: number) => api.get<TrajectoryFile[]>(`/projects/${id}/files`),
  getAnalysis: (id: number) => api.get<AnalysisResult[]>(`/projects/${id}/analysis`)
}

export const fileApi = {
  upload: async (
    projectId: number,
    file: File,
    topologyId?: number
  ): Promise<UploadResponse> => {
    const formData = new FormData()
    formData.append('file', file)
    if (topologyId !== undefined) {
      formData.append('topology_id', String(topologyId))
    }
    
    const response = await api.post<UploadResponse>(
      `/files/upload/${projectId}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }
    )
    return response.data
  },
  
  getById: (id: number) => api.get<TrajectoryFile>(`/files/${id}`),
  
  getInfo: (id: number) => api.get<TrajectoryMetadata>(`/files/${id}/info`),
  
  getFrame: (fileId: number, frameIndex: number) =>
    api.get<FrameData>(`/files/${fileId}/frame/${frameIndex}`),
  
  getFrames: (fileId: number, start = 0, stop?: number, step = 1) =>
    api.get<FrameInfo[]>(`/files/${fileId}/frames`, {
      params: { start, stop, step }
    }),
  
  delete: (id: number) => api.delete(`/files/${id}`)
}

export const analysisApi = {
  runRMSD: (
    fileId: number,
    config: AnalysisConfig & { reference_selection?: string } = {},
    save = true,
    projectId?: number,
    name = 'RMSD Analysis'
  ) =>
    api.post(`/analysis/rmsd/${fileId}`, null, {
      params: {
        start: config.start ?? 0,
        stop: config.stop ?? undefined,
        step: config.step ?? 1,
        selection: config.selection ?? 'backbone',
        reference_selection: config.reference_selection ?? undefined,
        save,
        project_id: projectId,
        name
      }
    }),
  
  runRMSF: (
    fileId: number,
    config: AnalysisConfig = {},
    save = true,
    projectId?: number,
    name = 'RMSF Analysis'
  ) =>
    api.post(`/analysis/rmsf/${fileId}`, null, {
      params: {
        start: config.start ?? 0,
        stop: config.stop ?? undefined,
        step: config.step ?? 1,
        selection: config.selection ?? 'name CA',
        save,
        project_id: projectId,
        name
      }
    }),
  
  runRDF: (
    fileId: number,
    config: RDFConfig = {},
    save = true,
    projectId?: number,
    name = 'RDF Analysis'
  ) =>
    api.post(`/analysis/rdf/${fileId}`, null, {
      params: {
        start: config.start ?? 0,
        stop: config.stop ?? undefined,
        step: config.step ?? 1,
        nbins: config.nbins ?? 75,
        range_start: config.range_start ?? 0.0,
        range_end: config.range_end ?? 15.0,
        g1: config.g1 ?? 'name O',
        g2: config.g2 ?? 'name O',
        save,
        project_id: projectId,
        name
      }
    }),
  
  getResult: (id: number) => api.get<AnalysisResult>(`/analysis/result/${id}`),
  deleteResult: (id: number) => api.delete(`/analysis/result/${id}`)
}

export const exportApi = {
  exportProject: (projectId: number) =>
    api.get(`/export/project/${projectId}`, {
      responseType: 'blob'
    }),
  
  exportAnalysis: (resultId: number) =>
    api.get(`/export/analysis/${resultId}`, {
      responseType: 'blob'
    })
}

export default api
