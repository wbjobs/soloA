import { create } from 'zustand'
import type {
  Project,
  TrajectoryFile,
  AnalysisResult,
  FrameData,
  TrajectoryMetadata
} from '../types'

interface AppState {
  projects: Project[]
  currentProject: Project | null
  currentFile: TrajectoryFile | null
  fileMetadata: TrajectoryMetadata | null
  currentFrame: FrameData | null
  currentAnalysis: AnalysisResult | null
  analysisResults: AnalysisResult[]
  projectFiles: TrajectoryFile[]
  
  isLoading: boolean
  error: string | null
  
  setProjects: (projects: Project[]) => void
  setCurrentProject: (project: Project | null) => void
  setCurrentFile: (file: TrajectoryFile | null) => void
  setFileMetadata: (metadata: TrajectoryMetadata | null) => void
  setCurrentFrame: (frame: FrameData | null) => void
  setCurrentAnalysis: (analysis: AnalysisResult | null) => void
  setAnalysisResults: (results: AnalysisResult[]) => void
  setProjectFiles: (files: TrajectoryFile[]) => void
  
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  
  clearCurrentProject: () => void
}

export const useAppStore = create<AppState>((set) => ({
  projects: [],
  currentProject: null,
  currentFile: null,
  fileMetadata: null,
  currentFrame: null,
  currentAnalysis: null,
  analysisResults: [],
  projectFiles: [],
  
  isLoading: false,
  error: null,
  
  setProjects: (projects) => set({ projects }),
  setCurrentProject: (project) => set({ currentProject: project }),
  setCurrentFile: (file) => set({ currentFile: file }),
  setFileMetadata: (metadata) => set({ fileMetadata: metadata }),
  setCurrentFrame: (frame) => set({ currentFrame: frame }),
  setCurrentAnalysis: (analysis) => set({ currentAnalysis: analysis }),
  setAnalysisResults: (results) => set({ analysisResults: results }),
  setProjectFiles: (files) => set({ projectFiles: files }),
  
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  
  clearCurrentProject: () => set({
    currentProject: null,
    currentFile: null,
    fileMetadata: null,
    currentFrame: null,
    currentAnalysis: null,
    analysisResults: [],
    projectFiles: []
  })
}))
