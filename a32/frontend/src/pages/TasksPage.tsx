import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Play,
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  Loader2,
  X,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { taskApi, sampleApi, Task, TaskStatus, TaskType } from '@/services/api'

function StatusBadge({ status }: { status: TaskStatus }) {
  const config: Record<TaskStatus, { bg: string; text: string; icon: React.ReactNode }> = {
    pending: {
      bg: 'bg-yellow-100 text-yellow-800',
      text: 'Pending',
      icon: <Clock size={14} />,
    },
    running: {
      bg: 'bg-blue-100 text-blue-800',
      text: 'Running',
      icon: <Play size={14} />,
    },
    success: {
      bg: 'bg-green-100 text-green-800',
      text: 'Success',
      icon: <CheckCircle size={14} />,
    },
    failed: {
      bg: 'bg-red-100 text-red-800',
      text: 'Failed',
      icon: <AlertCircle size={14} />,
    },
    cancelled: {
      bg: 'bg-gray-100 text-gray-800',
      text: 'Cancelled',
      icon: <XCircle size={14} />,
    },
  }

  const { bg, text, icon } = config[status]

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${bg}`}>
      {icon}
      {text}
    </span>
  )
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return 'N/A'
  return new Date(dateStr).toLocaleString()
}

export function TasksPage() {
  const [page, setPage] = useState(1)
  const [filterStatus, setFilterStatus] = useState<TaskStatus | undefined>()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tasks', page, filterStatus],
    queryFn: () => taskApi.list(page, 10, filterStatus),
    refetchInterval: (query) => {
      const data = query.state.data
      if (data?.data.items.some((t) => t.status === 'running' || t.status === 'pending')) {
        return 5000
      }
      return false
    },
  })

  const { data: samplesData } = useQuery({
    queryKey: ['samples'],
    queryFn: () => sampleApi.list(1, 100),
  })

  const { data: selectedTask } = useQuery({
    queryKey: ['task', selectedTaskId],
    queryFn: () => taskApi.get(selectedTaskId!),
    enabled: !!selectedTaskId,
    refetchInterval: 3000,
  })

  const createMutation = useMutation({
    mutationFn: ({ sampleId }: { sampleId: string }) =>
      taskApi.create({
        sample_id: sampleId,
        task_type: 'variant_calling' as TaskType,
        algorithm: 'gatk_haplotypecaller',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
      setShowCreateModal(false)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: (taskId: string) => taskApi.cancel(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })

  const samples = samplesData?.data.items || []
  const tasks = data?.data.items || []
  const total = data?.data.total || 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-genomic-600" size={40} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Analysis Tasks</h1>
          <p className="text-gray-500">Manage variant detection and analysis tasks</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="btn btn-secondary flex items-center gap-2"
          >
            <RefreshCw size={20} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary flex items-center gap-2"
          >
            <Plus size={20} />
            New Task
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Filter by status:</span>
          <select
            value={filterStatus || ''}
            onChange={(e) => setFilterStatus(e.target.value as TaskStatus || undefined)}
            className="input max-w-xs"
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="running">Running</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      <div className="card">
        {tasks.length === 0 ? (
          <div className="text-center py-12">
            <Play className="mx-auto mb-4 text-gray-300" size={60} />
            <h3 className="text-lg font-medium text-gray-800 mb-2">
              No tasks yet
            </h3>
            <p className="text-gray-500 mb-4">
              Create a new task to start variant calling
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary"
            >
              Create Task
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                    Task ID
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                    Sample
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                    Algorithm
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                    Created
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                    Completed
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr
                    key={task.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="py-3 px-4">
                      <button
                        onClick={() => setSelectedTaskId(task.task_id)}
                        className="font-mono text-sm text-genomic-600 hover:underline"
                      >
                        {task.task_id}
                      </button>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-700">
                        {task.sample_id}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-600">
                        {task.algorithm}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-500">
                        {formatDateTime(task.created_at)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-500">
                        {formatDateTime(task.completed_at)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedTaskId(task.task_id)}
                          className="p-2 text-genomic-600 hover:bg-genomic-50 rounded-lg"
                          title="View details"
                        >
                          <RefreshCw size={18} />
                        </button>
                        {(task.status === 'pending' || task.status === 'running') && (
                          <button
                            onClick={() => {
                              if (window.confirm('Cancel this task?')) {
                                cancelMutation.mutate(task.task_id)
                              }
                            }}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                            title="Cancel"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 10 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
            <span className="text-sm text-gray-500">
              Showing {tasks.length} of {total} tasks
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn btn-secondary text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">Page {page}</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page * 10 >= total}
                className="btn btn-secondary text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateTaskModal
          samples={samples}
          onClose={() => setShowCreateModal(false)}
          onSubmit={({ sampleId }) => createMutation.mutate({ sampleId })}
          isLoading={createMutation.isPending}
        />
      )}

      {selectedTask && selectedTaskId && (
        <TaskDetailModal
          task={selectedTask.data}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  )
}

function CreateTaskModal({
  samples,
  onClose,
  onSubmit,
  isLoading,
}: {
  samples: { sample_id: string; name: string; bam_object_name: string | null }[]
  onClose: () => void
  onSubmit: (data: { sampleId: string }) => void
  isLoading: boolean
}) {
  const [sampleId, setSampleId] = useState('')

  const samplesWithBam = samples.filter((s) => s.bam_object_name)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (sampleId) {
      onSubmit({ sampleId })
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">
            Create Variant Calling Task
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="label">Select Sample</label>
            {samplesWithBam.length === 0 ? (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  No samples with BAM files available. Please upload a BAM file
                  first.
                </p>
              </div>
            ) : (
              <select
                value={sampleId}
                onChange={(e) => setSampleId(e.target.value)}
                className="input"
                required
              >
                <option value="">Select a sample...</option>
                {samplesWithBam.map((sample) => (
                  <option key={sample.sample_id} value={sample.sample_id}>
                    {sample.name} ({sample.sample_id})
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="p-4 bg-gray-50 rounded-lg space-y-2">
            <p className="text-sm font-medium text-gray-700">Task Configuration</p>
            <p className="text-sm text-gray-500">
              <strong>Type:</strong> Variant Calling
            </p>
            <p className="text-sm text-gray-500">
              <strong>Algorithm:</strong> GATK HaplotypeCaller
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !sampleId || samplesWithBam.length === 0}
              className="btn btn-primary disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                'Submit Task'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function TaskDetailModal({
  task,
  onClose,
}: {
  task: Task
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">
            Task Details
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Task ID</p>
              <p className="font-mono text-sm text-gray-800">{task.task_id}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <StatusBadge status={task.status} />
            </div>
            <div>
              <p className="text-sm text-gray-500">Sample</p>
              <p className="text-sm text-gray-800">{task.sample_id}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Algorithm</p>
              <p className="text-sm text-gray-800">{task.algorithm}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Created</p>
              <p className="text-sm text-gray-800">
                {formatDateTime(task.created_at)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Completed</p>
              <p className="text-sm text-gray-800">
                {formatDateTime(task.completed_at)}
              </p>
            </div>
          </div>

          {task.status === 'running' && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 text-blue-700">
                <Loader2 className="animate-spin" size={20} />
                <span className="font-medium">Task is running...</span>
              </div>
            </div>
          )}

          {task.error_message && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm font-medium text-red-700 mb-1">Error</p>
              <p className="text-sm text-red-600 font-mono">
                {task.error_message}
              </p>
            </div>
          )}

          {task.result_summary && Object.keys(task.result_summary).length > 0 && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm font-medium text-green-700 mb-2">Results</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(task.result_summary).map(([key, value]) => (
                  <div key={key}>
                    <p className="text-xs text-green-600 capitalize">
                      {key.replace(/_/g, ' ')}
                    </p>
                    <p className="text-sm text-green-800 font-medium">
                      {String(value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4">
            <button onClick={onClose} className="btn btn-secondary">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
