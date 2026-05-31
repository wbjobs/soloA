import { create } from 'zustand'
import { ConnectionConfig, QueryResult, QueryHistory } from '../types/electron'

interface AppState {
  connections: ConnectionConfig[]
  activeConnectionId: string | null
  queryResult: QueryResult | null
  queryHistory: QueryHistory[]
  loading: boolean
  error: string | null
  darkMode: boolean

  setConnections: (connections: ConnectionConfig[]) => void
  addConnection: (connection: ConnectionConfig) => void
  removeConnection: (id: string) => void
  updateConnection: (connection: ConnectionConfig) => void
  setActiveConnection: (id: string | null) => void
  setQueryResult: (result: QueryResult | null) => void
  setQueryHistory: (history: QueryHistory[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  toggleDarkMode: () => void
  loadConnections: () => Promise<void>
  loadHistory: () => Promise<void>
}

const getAPI = () => window.electronAPI

export const useAppStore = create<AppState>((set, get) => ({
  connections: [],
  activeConnectionId: null,
  queryResult: null,
  queryHistory: [],
  loading: false,
  error: null,
  darkMode: false,

  setConnections: (connections) => set({ connections }),
  addConnection: (connection) => set((state) => ({
    connections: [...state.connections, connection]
  })),
  removeConnection: (id) => set((state) => ({
    connections: state.connections.filter(c => c.id !== id),
    activeConnectionId: state.activeConnectionId === id ? null : state.activeConnectionId
  })),
  updateConnection: (connection) => set((state) => ({
    connections: state.connections.map(c => c.id === connection.id ? connection : c)
  })),
  setActiveConnection: (id) => set({ activeConnectionId: id }),
  setQueryResult: (result) => set({ queryResult: result }),
  setQueryHistory: (history) => set({ queryHistory: history }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),

  loadConnections: async () => {
    const api = getAPI()
    if (!api) return
    
    set({ loading: true })
    try {
      const response = await api.connection.list()
      if (response.success) {
        set({ connections: response.data || [], loading: false })
      } else {
        set({ error: response.error, loading: false })
      }
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  loadHistory: async () => {
    const api = getAPI()
    if (!api) return
    
    try {
      const response = await api.history.list()
      if (response.success) {
        set({ queryHistory: response.data || [] })
      }
    } catch (err: any) {
      console.error('加载历史失败:', err)
    }
  }
}))
