import axios from 'axios'
import type {
  SimulationTask,
  TaskListEntry,
  SimulationCreate,
  SnapshotInfo,
  SnapshotData,
  SeismogramsResponse,
  GeologyPreviewRequest,
  GeologyPreviewResponse,
  InversionRequest,
  InversionProgressResponse,
  InversionResultResponse,
  AnimationRequest,
  AnimationProgressResponse,
  AnimationResponse
} from '../types'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const simulationApi = {
  async create(simulation: SimulationCreate): Promise<SimulationTask> {
    const response = await api.post<SimulationTask>('/simulations', simulation)
    return response.data
  },

  async list(statusFilter?: string, limit = 100, offset = 0): Promise<TaskListEntry[]> {
    const params: Record<string, any> = { limit, offset }
    if (statusFilter) {
      params.status_filter = statusFilter
    }
    const response = await api.get<TaskListEntry[]>('/simulations', { params })
    return response.data
  },

  async get(taskId: number): Promise<SimulationTask> {
    const response = await api.get<SimulationTask>(`/simulations/${taskId}`)
    return response.data
  },

  async delete(taskId: number): Promise<void> {
    await api.delete(`/simulations/${taskId}`)
  },

  async getProgress(taskId: number): Promise<{
    task_id: number
    status: string
    progress: number
    is_running: boolean
  }> {
    const response = await api.get(`/simulations/${taskId}/progress`)
    return response.data
  },

  async getSnapshots(taskId: number): Promise<SnapshotInfo> {
    const response = await api.get<SnapshotInfo>(`/simulations/${taskId}/snapshots`)
    return response.data
  },

  async getSnapshot(taskId: number, index: number, nx = 64, ny = 64): Promise<SnapshotData> {
    const response = await api.get<SnapshotData>(
      `/simulations/${taskId}/snapshots/${index}`,
      { params: { nx, ny } }
    )
    return response.data
  },

  async getSeismograms(taskId: number, receivers: [number, number][]): Promise<SeismogramsResponse> {
    const response = await api.post<SeismogramsResponse>(
      `/simulations/${taskId}/seismograms`,
      receivers
    )
    return response.data
  },
}


export const geologyApi = {
  async preview(request: GeologyPreviewRequest): Promise<GeologyPreviewResponse> {
    const response = await api.post<GeologyPreviewResponse>('/geology/preview', request)
    return response.data
  },

  async getExampleModels(): Promise<Record<string, any>> {
    const response = await api.get<Record<string, any>>('/utils/example-models')
    return response.data
  }
}


export const inversionApi = {
  async run(request: InversionRequest): Promise<InversionResultResponse> {
    const response = await api.post<InversionResultResponse>('/inversion/run', request)
    return response.data
  },

  async getProgress(taskId: string): Promise<InversionProgressResponse> {
    const response = await api.get<InversionProgressResponse>(`/inversion/${taskId}/progress`)
    return response.data
  },

  async getResult(taskId: string): Promise<InversionResultResponse> {
    const response = await api.get<InversionResultResponse>(`/inversion/${taskId}/result`)
    return response.data
  }
}


export const animationApi = {
  async export(taskId: number, request: AnimationRequest): Promise<AnimationResponse> {
    const response = await api.post<AnimationResponse>(
      `/simulations/${taskId}/export/animation`,
      request
    )
    return response.data
  },

  async getProgress(taskId: string): Promise<AnimationProgressResponse> {
    const response = await api.get<AnimationProgressResponse>(`/animation/${taskId}/progress`)
    return response.data
  },

  getDownloadUrl(taskId: string): string {
    return `/api/animation/${taskId}/download`
  }
}


export const utilsApi = {
  async checkFFmpeg(): Promise<{ available: boolean; path: string | null }> {
    const response = await api.get<{ available: boolean; path: string | null }>('/utils/ffmpeg-check')
    return response.data
  }
}

export default api
