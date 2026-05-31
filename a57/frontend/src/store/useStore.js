import { create } from 'zustand';
import dayjs from 'dayjs';

const useStore = create((set, get) => ({
  devices: [],
  sensorTypes: [],
  selectedDevices: [],
  selectedSensors: [],
  timeRange: [
    dayjs().subtract(1, 'hour').toISOString(),
    dayjs().toISOString()
  ],
  realtimeEnabled: false,
  realtimeInterval: 5000,
  
  stats: {
    total_points: 0,
    anomaly_count: 0,
    total_alerts: 0,
    active_alerts: 0
  },
  
  setDevices: (devices) => set({ devices }),
  setSensorTypes: (sensorTypes) => set({ sensorTypes }),
  setSelectedDevices: (selectedDevices) => set({ selectedDevices }),
  setSelectedSensors: (selectedSensors) => set({ selectedSensors }),
  setTimeRange: (timeRange) => set({ timeRange }),
  
  toggleRealtime: () => set((state) => ({
    realtimeEnabled: !state.realtimeEnabled
  })),
  
  updateStats: (stats) => set({ stats }),
  
  addDevice: (device) => set((state) => ({
    devices: [...new Set([...state.devices, device])]
  })),
  
  addSensorType: (sensor) => set((state) => ({
    sensorTypes: [...new Set([...state.sensorTypes, sensor])]
  }))
}));

export default useStore;
