"use client";

import { ExperimentList } from "@/components/ExperimentManager";

export default function ExperimentsPage() {
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
                <p className="text-sm text-gray-500">Experiment Management</p>
              </div>
            </div>
            <nav className="flex items-center gap-2">
              <a href="/" className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
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
              <a href="/experiments" className="px-3 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg">
                Experiments
              </a>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <ExperimentList />
      </main>
    </div>
  );
}
