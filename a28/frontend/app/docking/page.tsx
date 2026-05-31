"use client";

import { useState, useEffect } from "react";
import { FiLoader } from "react-icons/fi";
import { DockingViewer } from "@/components/DockingViewer";
import { apiClient } from "@/lib/api";

interface PredefinedDocking {
  id: string;
  name: string;
  description: string;
  protein_name: string;
  protein_pdb_id: string;
  ligand_name: string;
  ligand_smiles: string;
  binding_affinity: number;
  score: number;
}

interface DockingResult {
  id?: string;
  name: string;
  description?: string;
  protein_name: string;
  protein_pdb_id?: string;
  ligand_name: string;
  ligand_smiles: string;
  binding_affinity: number;
  rmsd?: number;
  score?: number;
  protein_coords: {
    atoms: any[];
    center?: number[];
    size?: number;
  };
  ligand_coords: {
    atoms: any[];
    bonds: any[];
  };
  pocket_center?: number[];
  pocket_size?: number;
  hydrogen_bonds?: any[];
  hydrophobic_interactions?: any[];
  pi_interactions?: any[];
  salt_bridges?: any[];
}

export default function DockingPage() {
  const [dockings, setDockings] = useState<PredefinedDocking[]>([]);
  const [selectedDocking, setSelectedDocking] = useState<DockingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDocking, setLoadingDocking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDockings();
  }, []);

  const loadDockings = async () => {
    try {
      const response = await apiClient.get("/api/docking/predefined");
      setDockings(response.data);
    } catch (err) {
      setError("Failed to load docking results");
    } finally {
      setLoading(false);
    }
  };

  const selectDocking = async (dockingId: string) => {
    setLoadingDocking(true);
    setError("");
    setSelectedDocking(null);

    try {
      const response = await apiClient.get(`/api/docking/predefined/${dockingId}`);
      setSelectedDocking(response.data);
    } catch (err) {
      setError("Failed to load docking details");
    } finally {
      setLoadingDocking(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">🧪</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">ChemViz</h1>
                <p className="text-sm text-gray-500">Molecular Docking</p>
              </div>
            </div>
            <nav className="flex items-center gap-2">
              <a href="/" className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                Molecules
              </a>
              <a href="/reactions" className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                Reactions
              </a>
              <a href="/docking" className="px-3 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg">
                Docking
              </a>
              <a href="/optimization" className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                Optimization
              </a>
              <a href="/experiments" className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                Experiments
              </a>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="card">
              <h2 className="section-title">Predefined Dockings</h2>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <FiLoader className="animate-spin text-primary-500" size={24} />
                </div>
              ) : error ? (
                <p className="text-red-500 text-sm">{error}</p>
              ) : dockings.length === 0 ? (
                <p className="text-gray-500 text-sm">No docking results available</p>
              ) : (
                <div className="space-y-2">
                  {dockings.map((docking) => (
                    <button
                      key={docking.id}
                      onClick={() => selectDocking(docking.id)}
                      className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors"
                    >
                      <div className="font-medium text-gray-900 text-sm">{docking.name}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {docking.ligand_name} • {docking.binding_affinity.toFixed(1)} kcal/mol
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="card mt-4">
              <h3 className="font-semibold text-gray-900 mb-2">Legend</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-1 bg-blue-500 rounded-full"></span>
                  <span className="text-gray-600">Hydrogen Bonds</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-1 bg-amber-500 rounded-full"></span>
                  <span className="text-gray-600">Hydrophobic Interactions</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-1 bg-purple-500 rounded-full"></span>
                  <span className="text-gray-600">π-π Stacking</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-1 bg-emerald-500 rounded-full"></span>
                  <span className="text-gray-600">Salt Bridges</span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">
            {loadingDocking ? (
              <div className="flex items-center justify-center h-[500px] bg-gray-800 rounded-xl border border-dashed border-gray-600">
                <div className="text-center">
                  <FiLoader className="animate-spin text-blue-500 mx-auto mb-3" size={32} />
                  <p className="text-gray-400">Loading docking result...</p>
                </div>
              </div>
            ) : (
              <DockingViewer docking={selectedDocking} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
