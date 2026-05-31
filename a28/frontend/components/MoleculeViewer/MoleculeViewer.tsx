"use client";

import { useState } from "react";
import { FiZoomIn, FiZoomOut, FiRotateCw, FiEye, FiEyeOff } from "react-icons/fi";
import { MoleculeScene } from "./MoleculeScene";
import { Atom as AtomType, Bond as BondType, MoleculeData } from "@/lib/api";
import { cn } from "@/lib/utils";

interface MoleculeViewerProps {
  molecule: MoleculeData | null;
  className?: string;
}

export function MoleculeViewer({ molecule, className }: MoleculeViewerProps) {
  const [selectedAtom, setSelectedAtom] = useState<AtomType | null>(null);
  const [showHydrogens, setShowHydrogens] = useState(true);
  const [showBonds, setShowBonds] = useState(true);
  const [showBondOrder, setShowBondOrder] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);

  if (!molecule) {
    return (
      <div className={cn("flex items-center justify-center h-96 bg-gray-50 rounded-xl border border-dashed border-gray-300", className)}>
        <div className="text-center text-gray-500">
          <div className="text-6xl mb-4">🧪</div>
          <p className="text-lg font-medium">Enter a SMILES string</p>
          <p className="text-sm mt-1">to visualize the molecule</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("relative rounded-xl overflow-hidden border border-gray-200", className)}>
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <button
          onClick={() => setShowHydrogens(!showHydrogens)}
          className={cn(
            "p-2 rounded-lg bg-white shadow-md hover:bg-gray-50 transition-colors",
            showHydrogens ? "text-primary-600" : "text-gray-400"
          )}
          title={showHydrogens ? "Hide Hydrogens" : "Show Hydrogens"}
        >
          {showHydrogens ? <FiEye size={18} /> : <FiEyeOff size={18} />}
        </button>

        <button
          onClick={() => setShowBonds(!showBonds)}
          className={cn(
            "p-2 rounded-lg bg-white shadow-md hover:bg-gray-50 transition-colors",
            showBonds ? "text-primary-600" : "text-gray-400"
          )}
          title={showBonds ? "Hide Bonds" : "Show Bonds"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="12" x2="20" y2="12" />
          </svg>
        </button>

        <button
          onClick={() => setShowBondOrder(!showBondOrder)}
          className={cn(
            "p-2 rounded-lg bg-white shadow-md hover:bg-gray-50 transition-colors",
            showBondOrder ? "text-primary-600" : "text-gray-400"
          )}
          title={showBondOrder ? "Single Bonds Only" : "Show Bond Order"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="4" y1="10" x2="20" y2="10" />
            <line x1="4" y1="14" x2="20" y2="14" />
          </svg>
        </button>

        <button
          onClick={() => setAutoRotate(!autoRotate)}
          className={cn(
            "p-2 rounded-lg bg-white shadow-md hover:bg-gray-50 transition-colors",
            autoRotate ? "text-primary-600" : "text-gray-400"
          )}
          title="Auto Rotate"
        >
          <FiRotateCw size={18} />
        </button>
      </div>

      <div className="absolute top-4 right-4 z-10 bg-white rounded-lg shadow-md p-3 max-w-xs">
        <h3 className="font-semibold text-gray-900">{molecule.name}</h3>
        <p className="text-sm text-gray-500 font-mono mt-1">{molecule.canonical_smiles}</p>
        <div className="flex gap-4 mt-2 text-xs text-gray-600">
          <span>Atoms: {molecule.num_atoms}</span>
          <span>Bonds: {molecule.num_bonds}</span>
          {molecule.molecular_weight && (
            <span>MW: {molecule.molecular_weight.toFixed(1)}</span>
          )}
        </div>
      </div>

      {selectedAtom && (
        <div className="absolute bottom-4 left-4 z-10 bg-white rounded-lg shadow-md p-3">
          <h4 className="font-medium text-gray-900">
            {selectedAtom.symbol} (Atom #{selectedAtom.index + 1})
          </h4>
          <div className="text-xs text-gray-600 mt-1 space-y-0.5">
            <p>Position: ({selectedAtom.x.toFixed(2)}, {selectedAtom.y.toFixed(2)}, {selectedAtom.z.toFixed(2)})</p>
            <p>Atomic Number: {selectedAtom.atomic_number}</p>
            {selectedAtom.charge !== undefined && selectedAtom.charge !== 0 && (
              <p>Charge: {selectedAtom.charge}</p>
            )}
          </div>
          <button
            onClick={() => setSelectedAtom(null)}
            className="mt-2 text-xs text-primary-600 hover:text-primary-700"
          >
            Click anywhere to deselect
          </button>
        </div>
      )}

      <div className="h-96 md:h-[500px]">
        <MoleculeScene
          atoms={molecule.atoms}
          bonds={molecule.bonds}
          selectedAtomIndex={selectedAtom?.index}
          onAtomSelect={setSelectedAtom}
          showHydrogens={showHydrogens}
          showBonds={showBonds}
          showBondOrder={showBondOrder}
          autoRotate={autoRotate}
        />
      </div>
    </div>
  );
}
