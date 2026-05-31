import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Database,
  Activity,
  Dna,
  ArrowRight,
  Play,
  CheckCircle,
  AlertCircle,
  Clock,
} from 'lucide-react'
import { sampleApi, taskApi } from '@/services/api'
import { TaskStatus } from '@/services/api'

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  color: string
  link?: string
}

function StatCard({ title, value, icon, color, link }: StatCardProps) {
  const card = (
    <div className={`card flex items-center gap-4 ${link ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}>
      <div className={`p-3 rounded-lg ${color}`}>{icon}</div>
      <div className="flex-1">
        <p className="text-sm text-gray-500">{title}</p>
        <p className="text-2xl font-bold text-gray-800">{value}</p>
      </div>
      {link && <ArrowRight className="text-gray-400" size={20} />}
    </div>
  )

  if (link) {
    return <Link to={link}>{card}</Link>
  }
  return card
}

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
      icon: <AlertCircle size={14} />,
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

export function HomePage() {
  const { data: samplesData } = useQuery({
    queryKey: ['samples', 1, 5],
    queryFn: () => sampleApi.list(1, 5),
  })

  const { data: tasksData } = useQuery({
    queryKey: ['tasks', 1, 5],
    queryFn: () => taskApi.list(1, 5),
  })

  const samples = samplesData?.data.items || []
  const tasks = tasksData?.data.items || []

  const totalSamples = samplesData?.data.total || 0
  const totalTasks = tasksData?.data.total || 0
  const completedTasks = tasks.filter((t) => t.status === 'success').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500">Welcome to the Bioinformatics Analysis Platform</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Total Samples"
          value={totalSamples}
          icon={<Database className="text-genomic-600" size={24} />}
          color="bg-genomic-50"
          link="/samples"
        />
        <StatCard
          title="Total Tasks"
          value={totalTasks}
          icon={<Activity className="text-purple-600" size={24} />}
          color="bg-purple-50"
          link="/tasks"
        />
        <StatCard
          title="Completed Tasks"
          value={completedTasks}
          icon={<Dna className="text-green-600" size={24} />}
          color="bg-green-50"
          link="/variants"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Recent Samples</h2>
            <Link
              to="/samples"
              className="text-sm text-genomic-600 hover:text-genomic-700 font-medium"
            >
              View all
            </Link>
          </div>
          {samples.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Database className="mx-auto mb-2 text-gray-300" size={40} />
              <p>No samples yet</p>
              <Link to="/samples" className="text-genomic-600 hover:underline">
                Create your first sample
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {samples.map((sample) => (
                <div
                  key={sample.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-800">{sample.name}</p>
                    <p className="text-sm text-gray-500">{sample.sample_id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {sample.bam_object_name ? (
                      <Link
                        to={`/browser/${sample.sample_id}`}
                        className="text-sm text-genomic-600 hover:underline"
                      >
                        View
                      </Link>
                    ) : (
                      <span className="text-sm text-gray-400">No BAM</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Recent Tasks</h2>
            <Link
              to="/tasks"
              className="text-sm text-genomic-600 hover:text-genomic-700 font-medium"
            >
              View all
            </Link>
          </div>
          {tasks.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Activity className="mx-auto mb-2 text-gray-300" size={40} />
              <p>No tasks yet</p>
              <Link to="/tasks" className="text-genomic-600 hover:underline">
                Submit a task
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-800">{task.task_id}</p>
                    <p className="text-sm text-gray-500">{task.sample_id}</p>
                  </div>
                  <StatusBadge status={task.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Quick Start</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="w-8 h-8 bg-genomic-100 text-genomic-600 rounded-lg flex items-center justify-center mb-2 font-bold">
              1
            </div>
            <h3 className="font-medium text-gray-800 mb-1">Upload Sample</h3>
            <p className="text-sm text-gray-500">Create a sample and upload your BAM file</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="w-8 h-8 bg-genomic-100 text-genomic-600 rounded-lg flex items-center justify-center mb-2 font-bold">
              2
            </div>
            <h3 className="font-medium text-gray-800 mb-1">Run Analysis</h3>
            <p className="text-sm text-gray-500">Submit a variant calling task</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="w-8 h-8 bg-genomic-100 text-genomic-600 rounded-lg flex items-center justify-center mb-2 font-bold">
              3
            </div>
            <h3 className="font-medium text-gray-800 mb-1">View Results</h3>
            <p className="text-sm text-gray-500">Explore variants in the genome browser</p>
          </div>
        </div>
      </div>
    </div>
  )
}
