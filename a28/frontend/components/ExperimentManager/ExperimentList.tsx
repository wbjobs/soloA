"use client";

import { useState, useEffect } from "react";
import { FiPlus, FiEdit2, FiTrash2, FiFileText, FiSearch, FiLoader, FiGitBranch } from "react-icons/fi";
import { experimentsApi } from "@/lib/api";
import { Experiment } from "@/lib/api";
import { formatDate, getStatusBadge, cn } from "@/lib/utils";
import { ExperimentForm } from "./ExperimentForm";
import { VersionControl } from "./VersionControl";

export function ExperimentList() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [editingExperiment, setEditingExperiment] = useState<Experiment | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [versionControlExperiment, setVersionControlExperiment] = useState<Experiment | null>(null);

  const loadExperiments = async () => {
    setLoading(true);
    try {
      const response = await experimentsApi.list(0, 100, searchTerm, filterStatus || undefined);
      setExperiments(response.data);
    } catch (error) {
      console.error("Failed to load experiments:", error);
      setExperiments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const debounce = setTimeout(() => {
      loadExperiments();
    }, 300);
    return () => clearTimeout(debounce);
  }, [searchTerm, filterStatus]);

  const handleDelete = async (id: number) => {
    try {
      await experimentsApi.delete(id);
      setExperiments((prev) => prev.filter((e) => e.id !== id));
    } catch (error) {
      console.error("Failed to delete experiment:", error);
    } finally {
      setDeleteConfirm(null);
    }
  };

  const openEdit = (exp: Experiment) => {
    setEditingExperiment(exp);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingExperiment(null);
  };

  const filtered = experiments;

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <h3 className="section-title mb-0">Experiments</h3>
          <button
            onClick={() => {
              setEditingExperiment(null);
              setShowForm(true);
            }}
            className="btn-primary flex items-center gap-2 self-start sm:self-auto"
          >
            <FiPlus size={16} />
            New Experiment
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search by researcher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field pl-10"
            />
          </div>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input-field sm:w-40"
          >
            <option value="">All Statuses</option>
            <option value="planned">Planned</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <FiLoader className="animate-spin text-primary-500" size={32} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <FiFileText className="mx-auto text-gray-300 mb-3" size={48} />
            <p className="text-gray-500">No experiments found</p>
            <button
              onClick={() => {
                setEditingExperiment(null);
                setShowForm(true);
              }}
              className="mt-4 text-primary-600 hover:text-primary-700 font-medium"
            >
              Create your first experiment
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Title</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Researcher</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Date</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Status</th>
                  <th className="text-left py-3 px-2 text-sm font-semibold text-gray-700">Yield</th>
                  <th className="text-right py-3 px-2 text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((exp) => {
                  const statusBadge = getStatusBadge(exp.status);
                  return (
                    <tr key={exp.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-2">
                        <span className="font-medium text-gray-900">{exp.title}</span>
                      </td>
                      <td className="py-3 px-2 text-gray-600">{exp.researcher}</td>
                      <td className="py-3 px-2 text-gray-600">{formatDate(exp.experiment_date)}</td>
                      <td className="py-3 px-2">
                        <span className={cn("px-2 py-1 rounded-full text-xs font-medium", statusBadge.color)}>
                          {statusBadge.label}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-gray-600">
                        {exp.yield_percent !== undefined && exp.yield_percent !== null
                          ? `${exp.yield_percent}%`
                          : "-"}
                      </td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {deleteConfirm === exp.id ? (
                            <>
                              <button
                                onClick={() => handleDelete(exp.id)}
                                className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                                title="Confirm Delete"
                              >
                                ✓
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => openEdit(exp)}
                                className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                                title="Edit"
                              >
                                <FiEdit2 size={16} />
                              </button>
                              <button
                                onClick={() => setVersionControlExperiment(exp)}
                                className="p-1.5 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
                                title="Version Control"
                              >
                                <FiGitBranch size={16} />
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(exp.id)}
                                className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                title="Delete"
                              >
                                <FiTrash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <ExperimentForm
          experiment={editingExperiment}
          onClose={closeForm}
          onSaved={loadExperiments}
        />
      )}

      {versionControlExperiment && (
        <VersionControl
          experiment={versionControlExperiment}
          onClose={() => setVersionControlExperiment(null)}
          onVersionCreated={loadExperiments}
        />
      )}
    </div>
  );
}
