"use client";

import { useState, useEffect } from "react";
import { reactionsApi } from "@/lib/api";
import { PredefinedReaction, ReactionDetail } from "@/lib/api";
import { ReactionViewer } from "@/components/ReactionViewer";
import { FiLoader } from "react-icons/fi";

export default function ReactionsPage() {
  const [reactions, setReactions] = useState<PredefinedReaction[]>([]);
  const [selectedReaction, setSelectedReaction] = useState<ReactionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingReaction, setLoadingReaction] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadReactions();
  }, []);

  const loadReactions = async () => {
    try {
      const response = await reactionsApi.listPredefined();
      setReactions(response.data);
    } catch (err) {
      setError("Failed to load reactions");
    } finally {
      setLoading(false);
    }
  };

  const selectReaction = async (reactionId: string) => {
    setLoadingReaction(true);
    setError("");
    setSelectedReaction(null);

    try {
      const response = await reactionsApi.getPredefined(reactionId);
      await new Promise((resolve) => setTimeout(resolve, 50));
      setSelectedReaction(response.data);
    } catch (err) {
      setError("Failed to load reaction details");
    } finally {
      setLoadingReaction(false);
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
                <p className="text-sm text-gray-500">Reaction Simulation</p>
              </div>
            </div>
            <nav className="flex items-center gap-2">
              <a href="/" className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                Molecules
              </a>
              <a href="/reactions" className="px-3 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg">
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
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="card">
              <h2 className="section-title">Predefined Reactions</h2>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <FiLoader className="animate-spin text-primary-500" size={24} />
                </div>
              ) : error ? (
                <p className="text-red-500 text-sm">{error}</p>
              ) : reactions.length === 0 ? (
                  <p className="text-gray-500 text-sm">No reactions available</p>
                ) : (
                  <div className="space-y-2">
                    {reactions.map((reaction) => (
                      <button
                        key={reaction.id}
                        onClick={() => selectReaction(reaction.id)}
                        className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-primary-400 hover:bg-primary-50 transition-colors"
                      >
                        <div className="font-medium text-gray-900 text-sm">{reaction.name}</div>
                        <div className="text-xs text-gray-500 mt-1">{reaction.reaction_type}</div>
                      </button>
                    ))}
                  </div>
                )}
            </div>

            <div className="card mt-4">
              <h3 className="font-semibold text-gray-900 mb-2">About</h3>
              <p className="text-sm text-gray-600">
                Select a reaction from the list above to view an animated visualization of the
                reaction mechanism, including bond breaking and formation.
              </p>
            </div>
          </div>

          <div className="lg:col-span-3">
            {loadingReaction ? (
              <div className="flex items-center justify-center h-[500px] bg-gray-50 rounded-xl border border-dashed border-gray-300">
                <div className="text-center">
                  <FiLoader className="animate-spin text-primary-500 mx-auto mb-3" size={32} />
                  <p className="text-gray-500">Loading reaction...</p>
                </div>
              </div>
            ) : (
              <ReactionViewer reaction={selectedReaction} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
