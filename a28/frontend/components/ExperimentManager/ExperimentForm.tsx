"use client";

import { useState } from "react";
import { FiX, FiSave, FiUpload } from "react-icons/fi";
import { experimentsApi } from "@/lib/api";
import { Experiment } from "@/lib/api";
import { EXPERIMENT_STATUSES } from "@/lib/utils";

interface ExperimentFormProps {
  experiment?: Experiment | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ExperimentForm({ experiment, onClose, onSaved }: ExperimentFormProps) {
  const isEdit = !!experiment;
  const [formData, setFormData] = useState({
    title: experiment?.title || "",
    researcher: experiment?.researcher || "",
    experiment_date: experiment?.experiment_date || new Date().toISOString().split("T")[0],
    status: experiment?.status || "planned",
    temperature: experiment?.temperature?.toString() || "",
    pressure: experiment?.pressure?.toString() || "",
    solvent: experiment?.solvent || "",
    catalyst: experiment?.catalyst || "",
    reaction_time: experiment?.reaction_time?.toString() || "",
    yield_percent: experiment?.yield_percent?.toString() || "",
    notes: experiment?.notes || "",
  });

  const [files, setFiles] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!formData.title.trim() || !formData.researcher.trim()) {
      setError("Title and Researcher are required");
      return;
    }

    setIsSaving(true);
    try {
      const experimentData = {
        ...formData,
        temperature: formData.temperature ? parseFloat(formData.temperature) : undefined,
        pressure: formData.pressure ? parseFloat(formData.pressure) : undefined,
        reaction_time: formData.reaction_time ? parseFloat(formData.reaction_time) : undefined,
        yield_percent: formData.yield_percent ? parseFloat(formData.yield_percent) : undefined,
      };

      let savedExp: Experiment;
      if (isEdit) {
        const response = await experimentsApi.update(experiment!.id, experimentData);
        savedExp = response.data;
      } else {
        const response = await experimentsApi.create(experimentData);
        savedExp = response.data;
      }

      if (files.length > 0) {
        await experimentsApi.uploadFiles(savedExp.id, files);
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to save experiment");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900">
            {isEdit ? "Edit Experiment" : "New Experiment"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <FiX size={20} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label">Experiment Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => updateField("title", e.target.value)}
                className="input-field"
                placeholder="e.g., Esterification of Ethanol with Acetic Acid"
                required
              />
            </div>

            <div>
              <label className="label">Researcher *</label>
              <input
                type="text"
                value={formData.researcher}
                onChange={(e) => updateField("researcher", e.target.value)}
                className="input-field"
                placeholder="Researcher name"
                required
              />
            </div>

            <div>
              <label className="label">Date</label>
              <input
                type="date"
                value={formData.experiment_date}
                onChange={(e) => updateField("experiment_date", e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label className="label">Status</label>
              <select
                value={formData.status}
                onChange={(e) => updateField("status", e.target.value)}
                className="input-field"
              >
                {EXPERIMENT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Temperature (°C)</label>
              <input
                type="number"
                value={formData.temperature}
                onChange={(e) => updateField("temperature", e.target.value)}
                className="input-field"
                placeholder="80"
              />
            </div>

            <div>
              <label className="label">Pressure (atm)</label>
              <input
                type="number"
                value={formData.pressure}
                onChange={(e) => updateField("pressure", e.target.value)}
                className="input-field"
                placeholder="1.0"
                step="0.1"
              />
            </div>

            <div>
              <label className="label">Reaction Time (h)</label>
              <input
                type="number"
                value={formData.reaction_time}
                onChange={(e) => updateField("reaction_time", e.target.value)}
                className="input-field"
                placeholder="4.0"
                step="0.1"
              />
            </div>

            <div>
              <label className="label">Yield (%)</label>
              <input
                type="number"
                value={formData.yield_percent}
                onChange={(e) => updateField("yield_percent", e.target.value)}
                className="input-field"
                placeholder="75"
                step="0.1"
                min="0"
                max="100"
              />
            </div>

            <div>
              <label className="label">Solvent</label>
              <input
                type="text"
                value={formData.solvent}
                onChange={(e) => updateField("solvent", e.target.value)}
                className="input-field"
                placeholder="e.g., Toluene"
              />
            </div>

            <div>
              <label className="label">Catalyst</label>
              <input
                type="text"
                value={formData.catalyst}
                onChange={(e) => updateField("catalyst", e.target.value)}
                className="input-field"
                placeholder="e.g., H2SO4"
              />
            </div>

            <div className="md:col-span-2">
              <label className="label">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                className="input-field h-24 resize-none"
                placeholder="Additional notes about the experiment..."
              />
            </div>

            {!isEdit && (
              <div className="md:col-span-2">
                <label className="label">Attach Files</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary-400 transition-colors">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <FiUpload className="mx-auto text-gray-400 mb-2" size={32} />
                    <p className="text-sm text-gray-600">
                      {files.length > 0
                        ? `${files.length} file(s) selected`
                        : "Click to select files or drag and drop"}
                    </p>
                  </label>
                </div>
              </div>
            )}
          </div>
        </form>

        <div className="flex justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="btn-primary flex items-center gap-2"
            disabled={isSaving}
          >
            <FiSave size={16} />
            {isSaving ? "Saving..." : isEdit ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
