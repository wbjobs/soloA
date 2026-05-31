"use client";

import { useState } from "react";
import { MoleculeViewer } from "@/components/MoleculeViewer";
import { SmilesInput } from "@/components/SmilesInput";
import { MoleculeData } from "@/lib/api";

export default function MoleculePage() {
  const [molecule, setMolecule] = useState<MoleculeData | null>(null);

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
                <p className="text-sm text-gray-500">Molecular Visualization</p>
              </div>
            </div>
            <nav className="flex items-center gap-2">
              <a href="/" className="px-3 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg">
                Molecules
              </a>
              <a href="/reactions" className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                Reactions
              </a>
              <a href="/docking" className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <SmilesInput onMoleculeParsed={setMolecule} />
          </div>

          <div className="lg:col-span-2">
            <MoleculeViewer molecule={molecule} />
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <span className="text-2xl">🔬</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">SMILES Parser</h3>
                <p className="text-sm text-gray-500">Parse and visualize any molecule</p>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <span className="text-2xl">🧬</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">3D Visualization</h3>
                <p className="text-sm text-gray-500">Interactive ball-and-stick models</p>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <span className="text-2xl">⚛️</span>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Atom Selection</h3>
                <p className="text-sm text-gray-500">Click atoms to inspect properties</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
