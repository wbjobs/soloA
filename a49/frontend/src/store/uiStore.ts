import { create } from 'zustand';

interface UiStore {
  showSidebar: boolean;
  showOrbitPanel: boolean;
  selectedBodyIndex: number;
  activeTab: 'simulations' | 'settings' | 'export';

  setShowSidebar: (show: boolean) => void;
  setShowOrbitPanel: (show: boolean) => void;
  setSelectedBodyIndex: (index: number) => void;
  setActiveTab: (tab: 'simulations' | 'settings' | 'export') => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiStore>((set, get) => ({
  showSidebar: true,
  showOrbitPanel: false,
  selectedBodyIndex: -1,
  activeTab: 'simulations',

  setShowSidebar: (show) => set({ showSidebar: show }),
  setShowOrbitPanel: (show) => set({ showOrbitPanel: show }),
  setSelectedBodyIndex: (index) => set({ selectedBodyIndex: index }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleSidebar: () => set({ showSidebar: !get().showSidebar })
}));
