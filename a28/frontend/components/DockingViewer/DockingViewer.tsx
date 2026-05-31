"use client";

import { useState } from "react";
import {
  FiEye,
  FiEyeOff,
  FiInfo,
  FiLink2,
} from "react-icons/fi";
import { DockingScene } from "./DockingScene";
import { cn } from "@/lib/utils";

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

interface DockingViewerProps {
  docking: DockingResult | null;
  className?: string;
}

export function DockingViewer({ docking, className }: DockingViewerProps) {
  const [showProtein, setShowProtein] = useState(true);
  const [showLigand, setShowLigand] = useState(true);
  const [showHydrogenBonds, setShowHydrogenBonds] = useState(true);
  const [showHydrophobic, setShowHydrophobic] = useState(true);
  const [showPiStacking, setShowPiStacking] = useState(true);
  const [showSaltBridges, setShowSaltBridges] = useState(true);

  if (!docking) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-96 bg-gray-800 rounded-xl border border-dashed border-gray-600",
          className
        )}
      >
        <div className="text-center text-gray-400">
          <div className="text-6xl mb-4">🔬</div>
          <p className="text-lg font-medium">Select a Docking Result</p>
          <p className="text-sm mt-1">
            Choose a predefined docking or upload your own
          </p>
        </div>
      </div>
    );
  }

  const hbCount = docking.hydrogen_bonds?.length || 0;
  const hydroCount = docking.hydrophobic_interactions?.length || 0;
  const piCount = docking.pi_interactions?.length || 0;
  const saltCount = docking.salt_bridges?.length || 0;

  return (
    <div className={cn("relative rounded-xl overflow-hidden border border-gray-700", className)}>
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <button
          onClick={() => setShowProtein(!showProtein)}
          className={cn(
            "p-2 rounded-lg bg-gray-800/80 backdrop-blur hover:bg-gray-700/80 transition-colors",
            showProtein ? "text-gray-100" : "text-gray-500"
          )}
          title={showProtein ? "Hide Protein" : "Show Protein"}
        >
          {showProtein ? <FiEye size={18} /> : <FiEyeOff size={18} />}
          <span className="ml-1 text-xs">Protein</span>
        </button>

        <button
          onClick={() => setShowLigand(!showLigand)}
          className={cn(
            "p-2 rounded-lg bg-gray-800/80 backdrop-blur hover:bg-gray-700/80 transition-colors",
            showLigand ? "text-blue-400" : "text-gray-500"
          )}
          title={showLigand ? "Hide Ligand" : "Show Ligand"}
        >
          {showLigand ? <FiEye size={18} /> : <FiEyeOff size={18} />}
          <span className="ml-1 text-xs">Ligand</span>
        </button>
      </div>

      <div className="absolute top-4 right-4 z-10 flex flex-col gap-1 bg-gray-800/90 backdrop-blur rounded-lg p-2">
        <span className="text-xs text-gray-400 px-2 py-1">Interactions</span>

        <button
          onClick={() => setShowHydrogenBonds(!showHydrogenBonds)}
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 transition-colors text-left text-xs",
            showHydrogenBonds ? "text-blue-400" : "text-gray-500"
          )}
        >
          <span className="w-3 h-1 bg-blue-500 rounded-full inline-block"></span>
          H-Bonds ({hbCount})
        </button>

        <button
          onClick={() => setShowHydrophobic(!showHydrophobic)}
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 transition-colors text-left text-xs",
            showHydrophobic ? "text-amber-400" : "text-gray-500"
          )}
        >
          <span className="w-3 h-1 bg-amber-500 rounded-full inline-block"></span>
          Hydrophobic ({hydroCount})
        </button>

        <button
          onClick={() => setShowPiStacking(!showPiStacking)}
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 transition-colors text-left text-xs",
            showPiStacking ? "text-purple-400" : "text-gray-500"
          )}
        >
          <span className="w-3 h-1 bg-purple-500 rounded-full inline-block"></span>
          π-Stacking ({piCount})
        </button>

        <button
          onClick={() => setShowSaltBridges(!showSaltBridges)}
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-700 transition-colors text-left text-xs",
            showSaltBridges ? "text-emerald-400" : "text-gray-500"
          )}
        >
          <span className="w-3 h-1 bg-emerald-500 rounded-full inline-block"></span>
          Salt Bridges ({saltCount})
        </button>
      </div>

      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-gray-800/90 backdrop-blur rounded-lg px-4 py-2">
        <h3 className="font-semibold text-white text-center">{docking.name}</h3>
        <p className="text-xs text-gray-400 text-center mt-1">
          {docking.protein_name} {docking.protein_pdb_id ? `(${docking.protein_pdb_id})` : ""}
        </p>
      </div>

      <div className="absolute bottom-4 left-4 right-4 z-10 flex justify-between items-center">
        <div className="flex gap-4">
          <div className="bg-gray-800/90 backdrop-blur rounded-lg px-3 py-2">
            <div className="text-xs text-gray-400">Binding Affinity</div>
            <div className="text-lg font-bold text-blue-400">
              {docking.binding_affinity.toFixed(1)} kcal/mol
            </div>
          </div>
          {docking.rmsd !== undefined && (
            <div className="bg-gray-800/90 backdrop-blur rounded-lg px-3 py-2">
              <div className="text-xs text-gray-400">RMSD</div>
              <div className="text-lg font-bold text-amber-400">
                {docking.rmsd.toFixed(2)} Å
              </div>
            </div>
          )}
          {docking.score !== undefined && (
            <div className="bg-gray-800/90 backdrop-blur rounded-lg px-3 py-2">
              <div className="text-xs text-gray-400">Score</div>
              <div className="text-lg font-bold text-emerald-400">
                {docking.score.toFixed(1)}
              </div>
            </div>
          )}
        </div>

        <div className="bg-gray-800/90 backdrop-blur rounded-lg px-3 py-2">
          <div className="text-xs text-gray-400">Ligand</div>
          <div className="text-sm font-medium text-white">
            {docking.ligand_name}
          </div>
        </div>
      </div>

      <div className="h-96 md:h-[500px]">
        <DockingScene
          proteinAtoms={docking.protein_coords.atoms || []}
          ligandAtoms={docking.ligand_coords.atoms || []}
          ligandBonds={docking.ligand_coords.bonds || []}
          hydrogenBonds={docking.hydrogen_bonds || []}
          hydrophobicInteractions={docking.hydrophobic_interactions || []}
          piInteractions={docking.pi_interactions || []}
          saltBridges={docking.salt_bridges || []}
          showProtein={showProtein}
          showLigand={showLigand}
          showHydrogenBonds={showHydrogenBonds}
          showHydrophobic={showHydrophobic}
          showPiStacking={showPiStacking}
          showSaltBridges={showSaltBridges}
        />
      </div>
    </div>
  );
}
