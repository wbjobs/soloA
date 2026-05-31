import { create } from 'zustand';
import {
  SimulationState,
  SimulationConfig,
  CameraTarget,
  ViewSettings
} from '../types';

interface SimulationStore {
  currentSimulationId: number | null;
  simulationConfig: SimulationConfig | null;
  currentState: SimulationState | null;
  isRunning: boolean;
  isPaused: boolean;
  timeScale: number;
  cameraTarget: CameraTarget;
  viewSettings: ViewSettings;
  wsConnected: boolean;
  error: string | null;

  setCurrentSimulationId: (id: number | null) => void;
  setSimulationConfig: (config: SimulationConfig | null) => void;
  setCurrentState: (state: SimulationState | null) => void;
  setRunning: (running: boolean) => void;
  setPaused: (paused: boolean) => void;
  setTimeScale: (scale: number) => void;
  setCameraTarget: (target: CameraTarget) => void;
  setViewSettings: (settings: Partial<ViewSettings>) => void;
  setWsConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const defaultViewSettings: ViewSettings = {
  showTrails: true,
  trailLength: 50,
  showLabels: false,
  particleScale: 1.0,
  background: '#000008',
  showHabitableZone: false
};

export const useSimulationStore = create<SimulationStore>((set) => ({
  currentSimulationId: null,
  simulationConfig: null,
  currentState: null,
  isRunning: false,
  isPaused: false,
  timeScale: 1.0,
  cameraTarget: { mode: 'free', followBodyIndex: -1 },
  viewSettings: defaultViewSettings,
  wsConnected: false,
  error: null,

  setCurrentSimulationId: (id) => set({ currentSimulationId: id }),
  setSimulationConfig: (config) => set({ simulationConfig: config }),
  setCurrentState: (state) => set({ currentState: state }),
  setRunning: (running) => set({ isRunning: running }),
  setPaused: (paused) => set({ isPaused: paused }),
  setTimeScale: (scale) => set({ timeScale: scale }),
  setCameraTarget: (target) => set({ cameraTarget: target }),
  setViewSettings: (settings) => set((state) => ({
    viewSettings: { ...state.viewSettings, ...settings }
  })),
  setWsConnected: (connected) => set({ wsConnected: connected }),
  setError: (error) => set({ error }),
  reset: () => set({
    currentSimulationId: null,
    simulationConfig: null,
    currentState: null,
    isRunning: false,
    isPaused: false,
    timeScale: 1.0,
    cameraTarget: { mode: 'free', followBodyIndex: -1 },
    viewSettings: defaultViewSettings,
    error: null
  })
}));
