const API_BASE = '/api';

export interface PresetInfo {
  name: string;
  description: string;
}

export interface SimulationInfo {
  id: number;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export const apiService = {
  async getPresets(): Promise<PresetInfo[]> {
    const response = await fetch(`${API_BASE}/simulations/presets`);
    return response.json();
  },

  async createFromPreset(presetName: string): Promise<any> {
    const response = await fetch(`${API_BASE}/simulations/preset/${presetName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return response.json();
  },

  async createSimulation(config: any): Promise<any> {
    const response = await fetch(`${API_BASE}/simulations/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    return response.json();
  },

  async listSimulations(): Promise<SimulationInfo[]> {
    const response = await fetch(`${API_BASE}/simulations/`);
    return response.json();
  },

  async getSimulation(id: number): Promise<any> {
    const response = await fetch(`${API_BASE}/simulations/${id}`);
    return response.json();
  },

  async loadSimulation(id: number): Promise<any> {
    const response = await fetch(`${API_BASE}/simulations/${id}/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    return response.json();
  },

  async deleteSimulation(id: number): Promise<any> {
    const response = await fetch(`${API_BASE}/simulations/${id}`, {
      method: 'DELETE'
    });
    return response.json();
  },

  async getState(id: number): Promise<any> {
    const response = await fetch(`${API_BASE}/simulations/${id}/state`);
    return response.json();
  },

  async stepSimulation(id: number, steps: number = 1): Promise<any> {
    const response = await fetch(`${API_BASE}/simulations/${id}/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps })
    });
    return response.json();
  },

  async exportJSON(id: number): Promise<void> {
    window.location.href = `${API_BASE}/exports/${id}/json`;
  },

  async exportCSV(id: number): Promise<void> {
    window.location.href = `${API_BASE}/exports/${id}/csv`;
  }
};
