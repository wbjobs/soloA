import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSimulationStore } from '../store/useSimulationStore'
import { Play, AlertCircle } from 'lucide-react'
import type {
  GridParams,
  MaterialParams,
  SourceParams,
  SolverParams,
} from '../types'

interface FormState {
  name: string
  grid_params: GridParams
  material_params: MaterialParams
  source_params: SourceParams
  solver_params: SolverParams
}

const defaultForm: FormState = {
  name: '2D Uniform Medium Simulation',
  grid_params: {
    width: 1000,
    height: 1000,
    element_size: 20,
  },
  material_params: {
    vp: 3000,
    vs: 1732,
    density: 2700,
  },
  source_params: {
    x: 500,
    y: 500,
    frequency: 10,
    amplitude: 1,
    source_type: 'ricker',
  },
  solver_params: {
    total_time: 0.5,
    time_step: null,
    output_interval: 10,
    courant_number: 0.4,
  },
}

export function SimulationCreate() {
  const navigate = useNavigate()
  const { createSimulation, isLoading, error, clearError } = useSimulationStore()
  const [form, setForm] = useState<FormState>(defaultForm)

  const updateForm = <K extends keyof FormState>(
    section: K,
    field: keyof FormState[K],
    value: number | string
  ) => {
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [field]: value,
      },
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const task = await createSimulation(form)
      navigate(`/simulation/${task.id}`)
    } catch (err) {
      console.error('Failed to create simulation:', err)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-red-400 font-medium">Error</p>
              <p className="text-red-300 text-sm">{error}</p>
              <button
                type="button"
                onClick={clearError}
                className="text-red-400 text-sm underline mt-2"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <div className="bg-seismic-card rounded-xl border border-seismic-border p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Basic Information</h3>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Simulation Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Enter simulation name"
            />
          </div>
        </div>

        <div className="bg-seismic-card rounded-xl border border-seismic-border p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Grid Parameters</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Width (m)
              </label>
              <input
                type="number"
                value={form.grid_params.width}
                onChange={(e) =>
                  updateForm('grid_params', 'width', parseFloat(e.target.value) || 0)
                }
                className="w-full px-4 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Height (m)
              </label>
              <input
                type="number"
                value={form.grid_params.height}
                onChange={(e) =>
                  updateForm('grid_params', 'height', parseFloat(e.target.value) || 0)
                }
                className="w-full px-4 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Element Size (m)
              </label>
              <input
                type="number"
                value={form.grid_params.element_size}
                onChange={(e) =>
                  updateForm('grid_params', 'element_size', parseFloat(e.target.value) || 0)
                }
                className="w-full px-4 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-seismic-card rounded-xl border border-seismic-border p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Material Properties</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                P-wave Velocity (m/s)
              </label>
              <input
                type="number"
                value={form.material_params.vp}
                onChange={(e) =>
                  updateForm('material_params', 'vp', parseFloat(e.target.value) || 0)
                }
                className="w-full px-4 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                S-wave Velocity (m/s)
              </label>
              <input
                type="number"
                value={form.material_params.vs}
                onChange={(e) =>
                  updateForm('material_params', 'vs', parseFloat(e.target.value) || 0)
                }
                className="w-full px-4 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Density (kg/m³)
              </label>
              <input
                type="number"
                value={form.material_params.density}
                onChange={(e) =>
                  updateForm('material_params', 'density', parseFloat(e.target.value) || 0)
                }
                className="w-full px-4 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-seismic-card rounded-xl border border-seismic-border p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Source Parameters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">X (m)</label>
              <input
                type="number"
                value={form.source_params.x}
                onChange={(e) =>
                  updateForm('source_params', 'x', parseFloat(e.target.value) || 0)
                }
                className="w-full px-4 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Y (m)</label>
              <input
                type="number"
                value={form.source_params.y}
                onChange={(e) =>
                  updateForm('source_params', 'y', parseFloat(e.target.value) || 0)
                }
                className="w-full px-4 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Frequency (Hz)
              </label>
              <input
                type="number"
                value={form.source_params.frequency}
                onChange={(e) =>
                  updateForm('source_params', 'frequency', parseFloat(e.target.value) || 0)
                }
                className="w-full px-4 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Amplitude
              </label>
              <input
                type="number"
                step="0.1"
                value={form.source_params.amplitude}
                onChange={(e) =>
                  updateForm('source_params', 'amplitude', parseFloat(e.target.value) || 0)
                }
                className="w-full px-4 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-seismic-card rounded-xl border border-seismic-border p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Solver Parameters</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Total Time (s)
              </label>
              <input
                type="number"
                step="0.1"
                value={form.solver_params.total_time}
                onChange={(e) =>
                  updateForm('solver_params', 'total_time', parseFloat(e.target.value) || 0)
                }
                className="w-full px-4 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Output Interval
              </label>
              <input
                type="number"
                value={form.solver_params.output_interval}
                onChange={(e) =>
                  updateForm('solver_params', 'output_interval', parseInt(e.target.value) || 0)
                }
                className="w-full px-4 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Courant Number
              </label>
              <input
                type="number"
                step="0.1"
                value={form.solver_params.courant_number}
                onChange={(e) =>
                  updateForm('solver_params', 'courant_number', parseFloat(e.target.value) || 0)
                }
                className="w-full px-4 py-2 bg-seismic-dark border border-seismic-border rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="px-6 py-3 border border-seismic-border rounded-lg text-gray-300 hover:bg-seismic-border transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            <Play className="w-5 h-5" />
            {isLoading ? 'Submitting...' : 'Start Simulation'}
          </button>
        </div>
      </form>
    </div>
  )
}
