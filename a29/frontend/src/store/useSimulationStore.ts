import { create } from 'zustand'
import type { SimulationTask, TaskListEntry, SnapshotData, SnapshotInfo } from '../types'
import { simulationApi } from '../api/client'

interface SimulationState {
  tasks: TaskListEntry[]
  selectedTask: SimulationTask | null
  snapshotInfo: SnapshotInfo | null
  currentSnapshot: SnapshotData | null
  isLoading: boolean
  error: string | null

  fetchTasks: () => Promise<void>
  fetchTask: (taskId: number) => Promise<void>
  createSimulation: (data: any) => Promise<SimulationTask>
  deleteTask: (taskId: number) => Promise<void>
  pollProgress: (taskId: number, onUpdate?: (progress: number) => void) => () => void
  fetchSnapshots: (taskId: number) => Promise<void>
  fetchSnapshot: (taskId: number, index: number) => Promise<void>
  setSelectedTask: (task: SimulationTask | null) => void
  clearError: () => void
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  tasks: [],
  selectedTask: null,
  snapshotInfo: null,
  currentSnapshot: null,
  isLoading: false,
  error: null,

  fetchTasks: async () => {
    set({ isLoading: true })
    try {
      const tasks = await simulationApi.list()
      set({ tasks, isLoading: false, error: null })
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
    }
  },

  fetchTask: async (taskId: number) => {
    set({ isLoading: true })
    try {
      const task = await simulationApi.get(taskId)
      set({ selectedTask: task, isLoading: false, error: null })
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
    }
  },

  createSimulation: async (data: any) => {
    set({ isLoading: true })
    try {
      const task = await simulationApi.create(data)
      await get().fetchTasks()
      set({ selectedTask: task, isLoading: false, error: null })
      return task
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
      throw err
    }
  },

  deleteTask: async (taskId: number) => {
    try {
      await simulationApi.delete(taskId)
      await get().fetchTasks()
      if (get().selectedTask?.id === taskId) {
        set({ selectedTask: null })
      }
    } catch (err: any) {
      set({ error: err.message })
    }
  },

  pollProgress: (taskId: number, onUpdate?: (progress: number) => void) => {
    let intervalId: number

    const poll = async () => {
      try {
        const progress = await simulationApi.getProgress(taskId)
        if (onUpdate) {
          onUpdate(progress.progress)
        }

        if (get().selectedTask?.id === taskId) {
          set(state => ({
            selectedTask: state.selectedTask
              ? { ...state.selectedTask, progress: progress.progress, status: progress.status as any }
              : null
          }))
        }

        if (!progress.is_running) {
          clearInterval(intervalId)
          await get().fetchTask(taskId)
        }
      } catch (err) {
        console.error('Polling error:', err)
      }
    }

    poll()
    intervalId = window.setInterval(poll, 2000)

    return () => clearInterval(intervalId)
  },

  fetchSnapshots: async (taskId: number) => {
    set({ isLoading: true })
    try {
      const info = await simulationApi.getSnapshots(taskId)
      set({ snapshotInfo: info, isLoading: false, error: null })
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
    }
  },

  fetchSnapshot: async (taskId: number, index: number) => {
    set({ isLoading: true })
    try {
      const snapshot = await simulationApi.getSnapshot(taskId, index, 64, 64)
      set({ currentSnapshot: snapshot, isLoading: false, error: null })
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
    }
  },

  setSelectedTask: (task: SimulationTask | null) => {
    set({ selectedTask: task, snapshotInfo: null, currentSnapshot: null })
  },

  clearError: () => set({ error: null }),
}))
