import { create } from 'zustand';

const useStore = create((set, get) => ({
  cases: [],
  currentCase: null,
  currentCaseData: null,
  loading: false,
  error: null,
  
  viewMode: 'mesh',
  field: 'p',
  timeStep: null,
  slice: { enabled: false, axis: 'z', position: 0.5 },
  isoSurface: { enabled: false, value: 0.5, field: 'p' },
  representation: 'surface',
  
  residuals: [],
  progress: null,
  
  setCases: (cases) => set({ cases }),
  setCurrentCase: (caseData) => set({ currentCase: caseData }),
  setCurrentCaseData: (data) => set({ currentCaseData: data }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  
  setViewMode: (mode) => set({ viewMode: mode }),
  setField: (field) => set({ field }),
  setTimeStep: (time) => set({ timeStep: time }),
  setSlice: (slice) => set({ slice: { ...get().slice, ...slice } }),
  setIsoSurface: (iso) => set({ isoSurface: { ...get().isoSurface, ...iso } }),
  setRepresentation: (rep) => set({ representation: rep }),
  
  addResidual: (entry) => set({ residuals: [...get().residuals, entry] }),
  clearResiduals: () => set({ residuals: [] }),
  setProgress: (progress) => set({ progress }),
}));

export default useStore;
