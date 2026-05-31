import { create } from 'zustand';
import type { Star, CoordinateSystem, SpectrumData, FITSMetadata, TabType } from '../types';

interface AppState {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;

  stars: Star[];
  isLoadingStars: boolean;
  starCount: number;
  loadStars: (limit: number, minMag?: number, maxMag?: number) => Promise<void>;

  coordinateSystem: CoordinateSystem;
  setCoordinateSystem: (system: CoordinateSystem) => void;
  observerLocation: { lon: number; lat: number; height: number };
  setObserverLocation: (loc: { lon: number; lat: number; height: number }) => void;

  currentSpectrum: SpectrumData | null;
  loadSpectrum: (starType: string, redshift: number) => Promise<void>;

  fitsFiles: Array<{ id: string; name: string; metadata: FITSMetadata }>;
  currentFits: { id: string; metadata: FITSMetadata } | null;
  addFitsFile: (file: { id: string; name: string; metadata: FITSMetadata }) => void;
  setCurrentFits: (file: { id: string; metadata: FITSMetadata } | null) => void;

  magnitudeRange: [number, number];
  setMagnitudeRange: (range: [number, number]) => void;

  viewerPosition: { x: number; y: number; z: number };
  setViewerPosition: (pos: { x: number; y: number; z: number }) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  activeTab: 'starmap',
  setActiveTab: (tab) => set({ activeTab: tab }),

  stars: [],
  isLoadingStars: false,
  starCount: 0,

  loadStars: async (limit, minMag, maxMag) => {
    set({ isLoadingStars: true });
    try {
      const params = new URLSearchParams({ limit: limit.toString() });
      if (minMag !== undefined) params.append('min_magnitude', minMag.toString());
      if (maxMag !== undefined) params.append('max_magnitude', maxMag.toString());

      const response = await fetch(`/api/catalog/stars?${params.toString()}`);
      const data = await response.json();
      set({ stars: data.stars, starCount: data.count, isLoadingStars: false });
    } catch (error) {
      console.error('Failed to load stars:', error);
      set({ isLoadingStars: false });
    }
  },

  coordinateSystem: 'icrs',
  setCoordinateSystem: (system) => set({ coordinateSystem: system }),
  observerLocation: { lon: 116.397, lat: 39.907, height: 0 },
  setObserverLocation: (loc) => set({ observerLocation: loc }),

  currentSpectrum: null,
  loadSpectrum: async (starType, redshift) => {
    try {
      const params = new URLSearchParams({
        star_type: starType,
        redshift: redshift.toString()
      });
      const response = await fetch(`/api/spectrum/sample?${params.toString()}`);
      const data = await response.json();
      set({ currentSpectrum: data });
    } catch (error) {
      console.error('Failed to load spectrum:', error);
    }
  },

  fitsFiles: [],
  currentFits: null,
  addFitsFile: (file) => set((state) => ({ fitsFiles: [...state.fitsFiles, file] })),
  setCurrentFits: (file) => set({ currentFits: file }),

  magnitudeRange: [6, 22],
  setMagnitudeRange: (range) => set({ magnitudeRange: range }),

  viewerPosition: { x: 0, y: 0, z: 5 },
  setViewerPosition: (pos) => set({ viewerPosition: pos })
}));
