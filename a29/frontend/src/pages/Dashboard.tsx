import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useSimulationStore } from '../store/useSimulationStore'
import { Play, CheckCircle, Clock, XCircle, Trash2, Eye } from 'lucide-react'
import type { TaskStatus } from '../types'

const statusConfig: Record<TaskStatus, { icon: any; color: string; label: string }> = {
  pending: { icon: Clock, color: 'text-yellow-400 bg-yellow-400/10', label: 'Pending' },
  running: { icon: Play, color: 'text-blue-400 bg-blue-400/10', label: 'Running' },
  completed: { icon: CheckCircle, color: 'text-green-400 bg-green-400/10', label: 'Completed' },
  failed: { icon: XCircle, color: 'text-red-400 bg-red-400/10', label: 'Failed' },
  cancelled: { icon: XCircle, color: 'text-gray-400 bg-gray-400/10', label: 'Cancelled' },
}

export function Dashboard() {
  const { tasks, fetchTasks, deleteTask, isLoading } = useSimulationStore()

  useEffect(() => {
    fetchTasks()
    const interval = setInterval(fetchTasks, 5000)
    return () => clearInterval(interval)
  }, [])

  const stats = {
    total: tasks.length,
    running: tasks.filter((t) => t.status === 'running').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    failed: tasks.filter((t) => t.status === 'failed').length,
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Simulations', value: stats.total, color: 'text-blue-400' },
          { label: 'Running', value: stats.running, color: 'text-yellow-400' },
          { label: 'Completed', value: stats.completed, color: 'text-green-400' },
          { label: 'Failed', value: stats.failed, color: 'text-red-400' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-seismic-card rounded-xl p-6 border border-seismic-border"
          >
            <p className="text-sm text-gray-400">{stat.label}</p>
            <p className={`text-3xl font-bold mt-2 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-seismic-card rounded-xl border border-seismic-border">
        <div className="p-6 border-b border-seismic-border flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Recent Simulations</h3>
          <Link
            to="/create"
            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            New Simulation
          </Link>
        </div>

        {isLoading && tasks.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : tasks.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-seismic-border rounded-full flex items-center justify-center mx-auto mb-4">
              <Waves className="w-8 h-8 text-gray-500" />
            </div>
            <p className="text-gray-400 mb-4">No simulations yet</p>
            <Link
              to="/create"
              className="inline-block px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
            >
              Create your first simulation
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-seismic-border/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Progress
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-seismic-border">
                {tasks.map((task) => {
                  const config = statusConfig[task.status]
                  const StatusIcon = config.icon
                  return (
                    <tr key={task.id} className="hover:bg-seismic-border/20">
                      <td className="px-6 py-4">
                        <p className="text-white font-medium">{task.name}</p>
                        <p className="text-sm text-gray-500">ID: #{task.id}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium ${config.color}`}
                        >
                          <StatusIcon className="w-3 h-3" />
                          {config.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-seismic-border rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary-500 transition-all"
                              style={{ width: `${task.progress * 100}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-400">
                            {Math.round(task.progress * 100)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-400">
                        {task.created_at
                          ? new Date(task.created_at).toLocaleString()
                          : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/simulation/${task.id}`}
                            className="p-2 text-gray-400 hover:text-white hover:bg-seismic-border rounded-lg transition-colors"
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => deleteTask(task.id)}
                            className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Waves({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
      <path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />
    </svg>
  )
}
