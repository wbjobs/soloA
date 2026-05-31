"use client";

import { useState, useEffect } from "react";
import { FiGitBranch, FiPlus, FiClock, FiMerge, FiAlertTriangle, FiCheck, FiX, FiLoader, FiDiff } from "react-icons/fi";
import { versionControlApi, ExperimentBranch, ExperimentVersion, ExperimentMerge, Experiment } from "@/lib/api";
import { formatDate } from "@/lib/utils";

interface VersionControlProps {
  experiment: Experiment;
  onClose: () => void;
  onVersionCreated?: () => void;
}

type TabType = "branches" | "versions" | "merges";

export function VersionControl({ experiment, onClose, onVersionCreated }: VersionControlProps) {
  const [activeTab, setActiveTab] = useState<TabType>("branches");
  const [branches, setBranches] = useState<ExperimentBranch[]>([]);
  const [versions, setVersions] = useState<ExperimentVersion[]>([]);
  const [merges, setMerges] = useState<ExperimentMerge[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("main");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showNewBranch, setShowNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchSource, setNewBranchSource] = useState("main");
  const [newBranchDesc, setNewBranchDesc] = useState("");

  const [showNewVersion, setShowNewVersion] = useState(false);
  const [versionBranch, setVersionBranch] = useState("main");
  const [commitMessage, setCommitMessage] = useState("");

  const [showNewMerge, setShowNewMerge] = useState(false);
  const [mergeSource, setMergeSource] = useState("");
  const [mergeTarget, setMergeTarget] = useState("main");

  const [selectedMerge, setSelectedMerge] = useState<ExperimentMerge | null>(null);
  const [resolvingConflict, setResolvingConflict] = useState<string>("");
  const [resolutionValue, setResolutionValue] = useState("");

  const loadBranches = async () => {
    try {
      const response = await versionControlApi.listBranches(experiment.id);
      setBranches(response.data.branches);
      if (!response.data.branches.find(b => b.name === selectedBranch)) {
        setSelectedBranch("main");
      }
    } catch (err: any) {
      console.error("Failed to load branches:", err);
    }
  };

  const loadVersions = async (branchName: string = selectedBranch) => {
    try {
      const response = await versionControlApi.listVersions(experiment.id, branchName);
      setVersions(response.data.versions);
    } catch (err: any) {
      console.error("Failed to load versions:", err);
    }
  };

  const loadMerges = async () => {
    try {
      const response = await versionControlApi.listMerges(experiment.id);
      setMerges(response.data.merges);
    } catch (err: any) {
      console.error("Failed to load merges:", err);
    }
  };

  useEffect(() => {
    loadBranches();
    loadMerges();
  }, [experiment.id]);

  useEffect(() => {
    if (activeTab === "versions" && branches.length > 0) {
      loadVersions(selectedBranch);
    }
  }, [activeTab, selectedBranch, branches.length]);

  const createBranch = async () => {
    if (!newBranchName.trim()) {
      setError("Branch name is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await versionControlApi.createBranch(
        experiment.id,
        newBranchName,
        newBranchSource,
        "user",
        newBranchDesc
      );
      await loadBranches();
      setShowNewBranch(false);
      setNewBranchName("");
      setNewBranchDesc("");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create branch");
    } finally {
      setLoading(false);
    }
  };

  const createVersion = async () => {
    if (!commitMessage.trim()) {
      setError("Commit message is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await versionControlApi.createVersion(
        experiment.id,
        versionBranch,
        commitMessage,
        "user",
        {}
      );
      await loadVersions(versionBranch);
      setShowNewVersion(false);
      setCommitMessage("");
      onVersionCreated?.();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create version");
    } finally {
      setLoading(false);
    }
  };

  const createMerge = async () => {
    if (!mergeSource || !mergeTarget) {
      setError("Source and target branches are required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await versionControlApi.createMerge(
        experiment.id,
        mergeSource,
        mergeTarget,
        "user"
      );
      await loadMerges();
      setShowNewMerge(false);
      setMergeSource("");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create merge request");
    } finally {
      setLoading(false);
    }
  };

  const resolveConflict = async (mergeId: number, field: string, resolution: string) => {
    try {
      await versionControlApi.resolveConflict(experiment.id, mergeId, field, resolution, "user");
      await loadMerges();
      setResolvingConflict("");
      setResolutionValue("");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to resolve conflict");
    }
  };

  const executeMerge = async (mergeId: number) => {
    try {
      await versionControlApi.executeMerge(
        experiment.id,
        mergeId,
        `Merge ${selectedMerge?.source_branch_name} into ${selectedMerge?.target_branch_name}`,
        "user"
      );
      await loadMerges();
      setSelectedMerge(null);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to execute merge");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "conflict": return "bg-red-100 text-red-800";
      case "resolved": return "bg-blue-100 text-blue-800";
      case "completed": return "bg-green-100 text-green-800";
      case "failed": return "bg-gray-100 text-gray-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <FiGitBranch className="text-primary-600" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Version Control</h2>
              <p className="text-sm text-gray-500">{experiment.title}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <FiX size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="flex border-b border-gray-200">
          {[
            { id: "branches" as TabType, label: "Branches", icon: FiGitBranch },
            { id: "versions" as TabType, label: "Versions", icon: FiClock },
            { id: "merges" as TabType, label: "Merges", icon: FiMerge },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary-600 text-primary-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <tab.icon size={18} />
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "branches" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-700">Experiment Branches</h3>
                <button
                  onClick={() => setShowNewBranch(true)}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  <FiPlus size={14} />
                  New Branch
                </button>
              </div>

              {showNewBranch && (
                <div className="p-4 bg-gray-50 rounded-xl space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Branch Name</label>
                      <input
                        type="text"
                        value={newBranchName}
                        onChange={(e) => setNewBranchName(e.target.value)}
                        className="input-field"
                        placeholder="feature/new-condition"
                      />
                    </div>
                    <div>
                      <label className="label">Source Branch</label>
                      <select
                        value={newBranchSource}
                        onChange={(e) => setNewBranchSource(e.target.value)}
                        className="input-field"
                      >
                        {branches.map((b) => (
                          <option key={b.id} value={b.name}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="label">Description (optional)</label>
                    <input
                      type="text"
                      value={newBranchDesc}
                      onChange={(e) => setNewBranchDesc(e.target.value)}
                      className="input-field"
                      placeholder="Describe the purpose of this branch"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowNewBranch(false)} className="btn-secondary text-sm">
                      Cancel
                    </button>
                    <button onClick={createBranch} disabled={loading} className="btn-primary text-sm">
                      {loading ? <FiLoader className="animate-spin" size={14} /> : "Create"}
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {branches.map((branch) => (
                  <div
                    key={branch.id}
                    className="p-4 border border-gray-200 rounded-xl hover:border-primary-300 hover:bg-primary-50/30 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FiGitBranch className={branch.name === "main" ? "text-primary-600" : "text-gray-400"} size={20} />
                        <div>
                          <div className="font-medium text-gray-900">
                            {branch.name}
                            {branch.name === "main" && (
                              <span className="ml-2 px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-full">
                                main
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">{branch.description}</div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-400">
                        {formatDate(branch.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "versions" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <label className="label mb-0">Branch:</label>
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="input-field"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.name}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => {
                    setVersionBranch(selectedBranch);
                    setShowNewVersion(true);
                  }}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  <FiPlus size={14} />
                  New Version
                </button>
              </div>

              {showNewVersion && (
                <div className="p-4 bg-gray-50 rounded-xl space-y-4">
                  <div>
                    <label className="label">Branch</label>
                    <select
                      value={versionBranch}
                      onChange={(e) => setVersionBranch(e.target.value)}
                      className="input-field"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.name}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Commit Message</label>
                    <textarea
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      className="input-field h-20 resize-none"
                      placeholder="Describe what changed in this version..."
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowNewVersion(false)} className="btn-secondary text-sm">
                      Cancel
                    </button>
                    <button onClick={createVersion} disabled={loading} className="btn-primary text-sm">
                      {loading ? <FiLoader className="animate-spin" size={14} /> : "Commit"}
                    </button>
                  </div>
                </div>
              )}

              <div className="relative">
                {versions.length > 0 && (
                  <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gray-200" />
                )}
                <div className="space-y-3">
                  {versions.map((version, idx) => (
                    <div key={version.id} className="relative pl-8">
                      <div className="absolute left-1 top-2 w-5 h-5 bg-white border-2 border-primary-500 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-primary-500 rounded-full" />
                      </div>
                      <div className="p-4 border border-gray-200 rounded-xl">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-mono rounded">
                              v{version.version_number}
                            </span>
                            <span className="font-medium text-gray-900">{version.commit_message}</span>
                          </div>
                          <span className="text-xs text-gray-400">{formatDate(version.created_at)}</span>
                        </div>
                        <div className="text-sm text-gray-500">
                          <span className="font-medium">{version.created_by}</span>
                          {version.yield_percent !== null && version.yield_percent !== undefined && (
                            <span className="ml-4">Yield: <span className="text-green-600 font-medium">{version.yield_percent}%</span></span>
                          )}
                          {version.temperature !== null && version.temperature !== undefined && (
                            <span className="ml-4">Temp: {version.temperature}°C</span>
                          )}
                        </div>
                        {idx === 0 && (
                          <span className="mt-2 inline-block px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                            latest
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {versions.length === 0 && (
                  <div className="text-center py-12">
                    <FiClock className="mx-auto text-gray-300 mb-3" size={48} />
                    <p className="text-gray-500">No versions yet</p>
                    <p className="text-sm text-gray-400 mt-1">Create your first version to track changes</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "merges" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-700">Merge Requests</h3>
                <button
                  onClick={() => setShowNewMerge(true)}
                  className="btn-primary flex items-center gap-2 text-sm"
                >
                  <FiMerge size={14} />
                  New Merge
                </button>
              </div>

              {showNewMerge && (
                <div className="p-4 bg-gray-50 rounded-xl space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Source Branch</label>
                      <select
                        value={mergeSource}
                        onChange={(e) => setMergeSource(e.target.value)}
                        className="input-field"
                      >
                        <option value="">Select source...</option>
                        {branches.filter(b => b.name !== mergeTarget).map((b) => (
                          <option key={b.id} value={b.name}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Target Branch</label>
                      <select
                        value={mergeTarget}
                        onChange={(e) => setMergeTarget(e.target.value)}
                        className="input-field"
                      >
                        {branches.map((b) => (
                          <option key={b.id} value={b.name}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowNewMerge(false)} className="btn-secondary text-sm">
                      Cancel
                    </button>
                    <button onClick={createMerge} disabled={loading} className="btn-primary text-sm">
                      {loading ? <FiLoader className="animate-spin" size={14} /> : "Create Merge"}
                    </button>
                  </div>
                </div>
              )}

              {merges.length === 0 ? (
                <div className="text-center py-12">
                  <FiMerge className="mx-auto text-gray-300 mb-3" size={48} />
                  <p className="text-gray-500">No merge requests</p>
                  <p className="text-sm text-gray-400 mt-1">Merge branches to combine experiment changes</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {merges.map((merge) => (
                    <div
                      key={merge.id}
                      className="p-4 border border-gray-200 rounded-xl hover:border-primary-300 transition-colors cursor-pointer"
                      onClick={() => setSelectedMerge(merge)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <FiMerge className="text-gray-400" size={20} />
                          <div>
                            <div className="font-medium text-gray-900">
                              {merge.source_branch || merge.source_branch_name} → {merge.target_branch || merge.target_branch_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              Created by {merge.created_by} • {formatDate(merge.created_at)}
                            </div>
                          </div>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(merge.status)}`}>
                          {merge.status}
                        </span>
                      </div>
                      {merge.conflict_count > 0 && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-amber-600">
                          <FiAlertTriangle size={14} />
                          {merge.conflict_count} conflict(s) need resolution
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {selectedMerge && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between p-6 border-b border-gray-100">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Merge: {selectedMerge.source_branch || selectedMerge.source_branch_name} → {selectedMerge.target_branch || selectedMerge.target_branch_name}
                      </h3>
                      <button
                        onClick={() => setSelectedMerge(null)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                      >
                        <FiX size={20} className="text-gray-500" />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(selectedMerge.status)}`}>
                          Status: {selectedMerge.status}
                        </span>
                        <span className="text-sm text-gray-500">
                          {selectedMerge.conflict_count} conflict(s)
                        </span>
                      </div>

                      {selectedMerge.conflicts && selectedMerge.conflicts.length > 0 && (
                        <div className="space-y-3">
                          <h4 className="font-medium text-gray-700 flex items-center gap-2">
                            <FiAlertTriangle className="text-amber-500" size={18} />
                            Conflicts ({selectedMerge.conflict_count})
                          </h4>
                          {selectedMerge.conflicts.map((conflict: any) => (
                            <div key={conflict.field} className="p-4 border border-amber-200 bg-amber-50 rounded-xl">
                              <div className="flex items-center justify-between mb-2">
                                <div className="font-medium text-gray-900">{conflict.field}</div>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  conflict.type === 'modified_both' ? 'bg-red-100 text-red-700' :
                                  conflict.type === 'modified_source_only' ? 'bg-blue-100 text-blue-700' :
                                  'bg-green-100 text-green-700'
                                }`}>
                                  {conflict.type}
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <div className="text-gray-500 mb-1">Source ({selectedMerge.source_branch || selectedMerge.source_branch_name}):</div>
                                  <div className="font-mono bg-white p-2 rounded border text-xs break-all">
                                    {String(conflict.source_value ?? 'null')}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-gray-500 mb-1">Target ({selectedMerge.target_branch || selectedMerge.target_branch_name}):</div>
                                  <div className="font-mono bg-white p-2 rounded border text-xs break-all">
                                    {String(conflict.target_value ?? 'null')}
                                  </div>
                                </div>
                              </div>

                              {resolvingConflict === conflict.field ? (
                                <div className="mt-3 space-y-2">
                                  <input
                                    type="text"
                                    value={resolutionValue}
                                    onChange={(e) => setResolutionValue(e.target.value)}
                                    className="input-field"
                                    placeholder="Enter custom resolution value..."
                                  />
                                  <div className="flex gap-2 flex-wrap">
                                    <button
                                      onClick={() => resolveConflict(selectedMerge.id, conflict.field, "source")}
                                      className="text-xs px-3 py-1.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                    >
                                      Use Source
                                    </button>
                                    <button
                                      onClick={() => resolveConflict(selectedMerge.id, conflict.field, "target")}
                                      className="text-xs px-3 py-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200"
                                    >
                                      Use Target
                                    </button>
                                    <button
                                      onClick={() => resolveConflict(selectedMerge.id, conflict.field, resolutionValue)}
                                      disabled={!resolutionValue}
                                      className="text-xs px-3 py-1.5 bg-primary-100 text-primary-700 rounded hover:bg-primary-200 disabled:opacity-50"
                                    >
                                      Use Custom
                                    </button>
                                    <button
                                      onClick={() => {
                                        setResolvingConflict("");
                                        setResolutionValue("");
                                      }}
                                      className="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-2">
                                  <button
                                    onClick={() => {
                                      setResolvingConflict(conflict.field);
                                      setResolutionValue(String(conflict.source_value ?? ""));
                                    }}
                                    className="text-sm text-primary-600 hover:text-primary-700"
                                  >
                                    Resolve conflict →
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {selectedMerge.conflict_count === 0 && (
                        <div className="flex items-center gap-2 p-4 bg-green-50 text-green-700 rounded-xl">
                          <FiCheck size={20} />
                          <span>No conflicts. Ready to merge.</span>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50">
                      <button
                        onClick={() => setSelectedMerge(null)}
                        className="btn-secondary"
                      >
                        Close
                      </button>
                      {selectedMerge.status !== "completed" && (
                        <button
                          onClick={() => executeMerge(selectedMerge.id)}
                          disabled={selectedMerge.conflict_count > 0}
                          className="btn-primary flex items-center gap-2 disabled:opacity-50"
                        >
                          <FiMerge size={16} />
                          Execute Merge
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
