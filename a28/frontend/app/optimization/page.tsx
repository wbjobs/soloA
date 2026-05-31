"use client";

import { useState } from "react";
import { FiTrendingUp, FiTarget, FiBarChart2, FiLoader } from "react-icons/fi";
import { apiClient } from "@/lib/api";

interface YieldPrediction {
  status: string;
  predicted_yield?: number;
  model_r2?: number;
  sample_count?: number;
  message?: string;
  min_required?: number;
  current_count?: number;
  input_conditions?: {
    temperature: number;
    reaction_time: number;
    pressure: number;
    solvent: string | null;
    catalyst: string | null;
  };
  top_factors?: Array<{
    feature: string;
    importance: number;
  }>;
}

interface OptimizationResult {
  status: string;
  best_conditions?: {
    temperature: number;
    reaction_time: number;
    solvent: string | null;
    catalyst: string | null;
  };
  best_predicted_yield?: number;
  top_recommendations?: Array<{
    temperature: number;
    reaction_time: number;
    solvent: string | null;
    catalyst: string | null;
    predicted_yield: number;
  }>;
  model_r2?: number;
  sample_count?: number;
  message?: string;
  min_required?: number;
  current_count?: number;
}

const SOLVENTS = [
  { value: "", label: "Any" },
  { value: "Water", label: "Water" },
  { value: "Ethanol", label: "Ethanol" },
  { value: "Methanol", label: "Methanol" },
  { value: "Toluene", label: "Toluene" },
  { value: "THF", label: "THF" },
  { value: "Dichloromethane", label: "Dichloromethane" },
  { value: "Diethyl Ether", label: "Diethyl Ether" },
  { value: "DMF", label: "DMF" },
  { value: "DMSO", label: "DMSO" },
];

const CATALYSTS = [
  { value: "", label: "Any/None" },
  { value: "H2SO4", label: "H2SO4 (Sulfuric Acid)" },
  { value: "HCl", label: "HCl (Hydrochloric Acid)" },
  { value: "NaOH", label: "NaOH (Sodium Hydroxide)" },
  { value: "Pyridine", label: "Pyridine" },
  { value: "Triethylamine", label: "Triethylamine" },
  { value: "Pd/C", label: "Pd/C" },
];

export default function OptimizationPage() {
  const [activeTab, setActiveTab] = useState<"predict" | "optimize">("predict");

  const [temperature, setTemperature] = useState(80);
  const [reactionTime, setReactionTime] = useState(4);
  const [pressure, setPressure] = useState(1);
  const [solvent, setSolvent] = useState("");
  const [catalyst, setCatalyst] = useState("");

  const [minTemp, setMinTemp] = useState(20);
  const [maxTemp, setMaxTemp] = useState(120);
  const [minTime, setMinTime] = useState(0.5);
  const [maxTime, setMaxTime] = useState(24);

  const [predictionResult, setPredictionResult] = useState<YieldPrediction | null>(null);
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runPrediction = async () => {
    setLoading(true);
    setError("");
    setPredictionResult(null);

    try {
      const params = new URLSearchParams();
      params.append("temperature", temperature.toString());
      params.append("reaction_time", reactionTime.toString());
      params.append("pressure", pressure.toString());
      if (solvent) params.append("solvent", solvent);
      if (catalyst) params.append("catalyst", catalyst);

      const response = await apiClient.get(`/api/optimization/predict?${params.toString()}`);
      setPredictionResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Prediction failed");
    } finally {
      setLoading(false);
    }
  };

  const runOptimization = async () => {
    setLoading(true);
    setError("");
    setOptimizationResult(null);

    try {
      const params = new URLSearchParams();
      params.append("min_temp", minTemp.toString());
      params.append("max_temp", maxTemp.toString());
      params.append("min_time", minTime.toString());
      params.append("max_time", maxTime.toString());

      const response = await apiClient.get(`/api/optimization/optimize?${params.toString()}`);
      setOptimizationResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Optimization failed");
    } finally {
      setLoading(false);
    }
  };

  const featureLabels: Record<string, string> = {
    temperature: "Temperature",
    reaction_time: "Reaction Time",
    pressure: "Pressure",
    solvent_encoded: "Solvent",
    catalyst_encoded: "Catalyst",
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
                <p className="text-sm text-gray-500">Reaction Optimization</p>
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
              <a href="/optimization" className="px-3 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-lg">
                Optimization
              </a>
              <a href="/experiments" className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors">
                Experiments
              </a>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab("predict")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === "predict"
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <FiTarget size={18} />
            Predict Yield
          </button>
          <button
            onClick={() => setActiveTab("optimize")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === "optimize"
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            <FiTrendingUp size={18} />
            Optimize Conditions
          </button>
        </div>

        {activeTab === "predict" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h2 className="section-title flex items-center gap-2">
                <FiTarget className="text-primary-600" />
                Reaction Conditions
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="label">Temperature (°C)</label>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    className="w-full accent-primary-600"
                  />
                  <div className="text-center text-sm text-gray-600 font-medium">{temperature}°C</div>
                </div>

                <div>
                  <label className="label">Reaction Time (hours)</label>
                  <input
                    type="range"
                    min={0.1}
                    max={48}
                    step={0.1}
                    value={reactionTime}
                    onChange={(e) => setReactionTime(Number(e.target.value))}
                    className="w-full accent-primary-600"
                  />
                  <div className="text-center text-sm text-gray-600 font-medium">{reactionTime} h</div>
                </div>

                <div>
                  <label className="label">Pressure (atm)</label>
                  <input
                    type="range"
                    min={0.1}
                    max={10}
                    step={0.1}
                    value={pressure}
                    onChange={(e) => setPressure(Number(e.target.value))}
                    className="w-full accent-primary-600"
                  />
                  <div className="text-center text-sm text-gray-600 font-medium">{pressure} atm</div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Solvent</label>
                    <select
                      value={solvent}
                      onChange={(e) => setSolvent(e.target.value)}
                      className="input-field"
                    >
                      {SOLVENTS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="label">Catalyst</label>
                    <select
                      value={catalyst}
                      onChange={(e) => setCatalyst(e.target.value)}
                      className="input-field"
                    >
                      {CATALYSTS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={runPrediction}
                  disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <FiLoader className="animate-spin" size={18} />
                      Predicting...
                    </>
                  ) : (
                    <>
                      <FiBarChart2 size={18} />
                      Predict Yield
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="card">
              <h2 className="section-title flex items-center gap-2">
                <FiBarChart2 className="text-green-600" />
                Prediction Result
              </h2>

              {predictionResult ? (
                predictionResult.status === "success" ? (
                  <div className="space-y-6">
                    <div className="text-center py-8 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl">
                      <div className="text-sm text-gray-500 mb-1">Predicted Yield</div>
                      <div className="text-5xl font-bold text-green-600">
                        {predictionResult.predicted_yield}%
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-gray-50 rounded-lg text-center">
                        <div className="text-xs text-gray-500">Model R² Score</div>
                        <div className="text-xl font-semibold text-gray-900">
                          {predictionResult.model_r2?.toFixed(4)}
                        </div>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg text-center">
                        <div className="text-xs text-gray-500">Training Samples</div>
                        <div className="text-xl font-semibold text-gray-900">
                          {predictionResult.sample_count}
                        </div>
                      </div>
                    </div>

                    {predictionResult.top_factors && predictionResult.top_factors.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Influencing Factors</h3>
                        <div className="space-y-2">
                          {predictionResult.top_factors.map((factor, i) => (
                            <div key={i} className="flex items-center gap-3">
                              <span className="text-sm text-gray-600 w-28">
                                {featureLabels[factor.feature] || factor.feature}
                              </span>
                              <div className="flex-1 bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-primary-500 h-2 rounded-full"
                                  style={{ width: `${Math.min(100, factor.importance * 10)}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500 w-16 text-right">
                                {factor.importance.toFixed(3)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-5xl mb-4">📊</div>
                    <p className="text-gray-500">{predictionResult.message}</p>
                    <p className="text-sm text-gray-400 mt-2">
                      Need at least {predictionResult.min_required} experiments with yield data.
                      <br />
                      Current: {predictionResult.current_count} experiments
                    </p>
                  </div>
                )
              ) : (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">🔬</div>
                  <p className="text-gray-500">Set reaction conditions and click Predict</p>
                  <p className="text-sm text-gray-400 mt-2">
                    Model uses linear regression trained on historical experiment data
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "optimize" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card">
              <h2 className="section-title flex items-center gap-2">
                <FiTrendingUp className="text-orange-600" />
                Optimization Parameters
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="label">Temperature Range (°C)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={0}
                      max={200}
                      value={minTemp}
                      onChange={(e) => setMinTemp(Number(e.target.value))}
                      className="input-field w-24"
                    />
                    <span className="text-gray-400">to</span>
                    <input
                      type="number"
                      min={0}
                      max={200}
                      value={maxTemp}
                      onChange={(e) => setMaxTemp(Number(e.target.value))}
                      className="input-field w-24"
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Reaction Time Range (hours)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={0.1}
                      max={48}
                      step={0.1}
                      value={minTime}
                      onChange={(e) => setMinTime(Number(e.target.value))}
                      className="input-field w-24"
                    />
                    <span className="text-gray-400">to</span>
                    <input
                      type="number"
                      min={0.1}
                      max={48}
                      step={0.1}
                      value={maxTime}
                      onChange={(e) => setMaxTime(Number(e.target.value))}
                      className="input-field w-24"
                    />
                  </div>
                </div>

                <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
                  <p className="font-medium text-gray-700 mb-1">Optimization scope:</p>
                  <p>• Solvents: Water, Ethanol, Methanol, Toluene, THF, None</p>
                  <p>• Catalysts: None, H2SO4, NaOH, Pyridine, Triethylamine, Pd/C</p>
                  <p>• Pressure: 1 atm</p>
                </div>

                <button
                  onClick={runOptimization}
                  disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <FiLoader className="animate-spin" size={18} />
                      Optimizing...
                    </>
                  ) : (
                    <>
                      <FiTrendingUp size={18} />
                      Find Optimal Conditions
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="card">
              <h2 className="section-title flex items-center gap-2">
                <FiTarget className="text-green-600" />
                Optimization Results
              </h2>

              {optimizationResult ? (
                optimizationResult.status === "success" ? (
                  <div className="space-y-4">
                    <div className="text-center py-6 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl">
                      <div className="text-sm text-gray-500 mb-1">Best Predicted Yield</div>
                      <div className="text-5xl font-bold text-green-600">
                        {optimizationResult.best_predicted_yield}%
                      </div>
                    </div>

                    {optimizationResult.best_conditions && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <div className="text-xs text-gray-500">Temperature</div>
                          <div className="font-semibold text-gray-900">
                            {optimizationResult.best_conditions.temperature}°C
                          </div>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <div className="text-xs text-gray-500">Time</div>
                          <div className="font-semibold text-gray-900">
                            {optimizationResult.best_conditions.reaction_time} h
                          </div>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <div className="text-xs text-gray-500">Solvent</div>
                          <div className="font-semibold text-gray-900">
                            {optimizationResult.best_conditions.solvent || "None"}
                          </div>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-lg">
                          <div className="text-xs text-gray-500">Catalyst</div>
                          <div className="font-semibold text-gray-900">
                            {optimizationResult.best_conditions.catalyst || "None"}
                          </div>
                        </div>
                      </div>
                    )}

                    {optimizationResult.top_recommendations && optimizationResult.top_recommendations.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-700 mb-2">Top Recommendations</h3>
                        <div className="space-y-2">
                          {optimizationResult.top_recommendations.map((rec, i) => (
                            <div
                              key={i}
                              className="p-3 border border-gray-200 rounded-lg flex items-center justify-between"
                            >
                              <div className="text-sm">
                                <span className="font-medium text-gray-900">#{i + 1}</span>
                                <span className="text-gray-500 mx-2">•</span>
                                <span>{rec.temperature}°C</span>
                                <span className="text-gray-500 mx-2">•</span>
                                <span>{rec.reaction_time}h</span>
                                <span className="text-gray-500 mx-2">•</span>
                                <span>{rec.solvent || "None"}</span>
                              </div>
                              <div className="font-bold text-green-600">{rec.predicted_yield}%</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="text-5xl mb-4">📊</div>
                    <p className="text-gray-500">{optimizationResult.message}</p>
                    <p className="text-sm text-gray-400 mt-2">
                      Need at least {optimizationResult.min_required} experiments with yield data.
                    </p>
                  </div>
                )
              ) : (
                <div className="text-center py-12">
                  <div className="text-5xl mb-4">⚡</div>
                  <p className="text-gray-500">Set optimization parameters and run optimization</p>
                  <p className="text-sm text-gray-400 mt-2">
                    System will search for conditions that maximize predicted yield
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
