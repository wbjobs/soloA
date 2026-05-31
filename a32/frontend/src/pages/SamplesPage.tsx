import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Plus,
  Upload,
  Trash2,
  Eye,
  Database,
  Loader2,
  X,
} from 'lucide-react'
import { sampleApi, Sample, SampleCreate } from '@/services/api'

function formatFileSize(bytes: number | null): string {
  if (!bytes) return 'N/A'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB'
}

export function SamplesPage() {
  const [page, setPage] = useState(1)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [selectedSample, setSelectedSample] = useState<Sample | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['samples', page],
    queryFn: () => sampleApi.list(page, 10),
  })

  const createMutation = useMutation({
    mutationFn: (data: SampleCreate) => sampleApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['samples'] })
      setShowCreateModal(false)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (sampleId: string) => sampleApi.delete(sampleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['samples'] })
    },
  })

  const uploadMutation = useMutation({
    mutationFn: ({
      sampleId,
      bamFile,
      baiFile,
    }: {
      sampleId: string
      bamFile: File
      baiFile?: File
    }) => sampleApi.uploadBam(sampleId, bamFile, baiFile),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['samples'] })
      setShowUploadModal(false)
      setSelectedSample(null)
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-genomic-600" size={40} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-20 text-red-600">
        <p>Error loading samples: {(error as Error).message}</p>
      </div>
    )
  }

  const samples = data?.data.items || []
  const total = data?.data.total || 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Samples</h1>
          <p className="text-gray-500">Manage your genomic samples</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={20} />
          New Sample
        </button>
      </div>

      <div className="card">
        {samples.length === 0 ? (
          <div className="text-center py-12">
            <Database className="mx-auto mb-4 text-gray-300" size={60} />
            <h3 className="text-lg font-medium text-gray-800 mb-2">
              No samples yet
            </h3>
            <p className="text-gray-500 mb-4">
              Create your first sample to get started
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary"
            >
              Create Sample
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                    Sample ID
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                    Name
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                    Reference
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                    BAM Status
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                    Size
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                    Created
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {samples.map((sample) => (
                  <tr
                    key={sample.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="py-3 px-4">
                      <span className="font-mono text-sm text-gray-700">
                        {sample.sample_id}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-gray-800">
                        {sample.name}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-600">
                        {sample.reference_genome}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {sample.bam_object_name ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Uploaded
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          No BAM
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-600">
                        {formatFileSize(sample.bam_file_size)}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-500">
                        {new Date(sample.created_at).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-2">
                        {sample.bam_object_name && (
                          <Link
                            to={`/browser/${sample.sample_id}`}
                            className="p-2 text-genomic-600 hover:bg-genomic-50 rounded-lg"
                            title="View in Browser"
                          >
                            <Eye size={18} />
                          </Link>
                        )}
                        <button
                          onClick={() => {
                            setSelectedSample(sample)
                            setShowUploadModal(true)
                          }}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                          title="Upload BAM"
                        >
                          <Upload size={18} />
                        </button>
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete sample ${sample.name}?`
                              )
                            ) {
                              deleteMutation.mutate(sample.sample_id)
                            }
                          }}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
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
              Showing {samples.length} of {total} samples
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
        <CreateSampleModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={(data) => createMutation.mutate(data)}
          isLoading={createMutation.isPending}
        />
      )}

      {showUploadModal && selectedSample && (
        <UploadBamModal
          sample={selectedSample}
          onClose={() => {
            setShowUploadModal(false)
            setSelectedSample(null)
          }}
          onSubmit={({ bamFile, baiFile }) =>
            uploadMutation.mutate({
              sampleId: selectedSample.sample_id,
              bamFile,
              baiFile,
            })
          }
          isLoading={uploadMutation.isPending}
        />
      )}
    </div>
  )
}

function CreateSampleModal({
  onClose,
  onSubmit,
  isLoading,
}: {
  onClose: () => void
  onSubmit: (data: SampleCreate) => void
  isLoading: boolean
}) {
  const [sampleId, setSampleId] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [referenceGenome, setReferenceGenome] = useState('hg38')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      sample_id: sampleId,
      name,
      description: description || undefined,
      reference_genome: referenceGenome,
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Create Sample</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="label">Sample ID</label>
            <input
              type="text"
              value={sampleId}
              onChange={(e) => setSampleId(e.target.value)}
              className="input"
              placeholder="e.g., sample_001"
              required
            />
          </div>
          <div>
            <label className="label">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="e.g., Patient 1 - Blood Sample"
              required
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              rows={2}
              placeholder="Optional description..."
            />
          </div>
          <div>
            <label className="label">Reference Genome</label>
            <select
              value={referenceGenome}
              onChange={(e) => setReferenceGenome(e.target.value)}
              className="input"
            >
              <option value="hg38">hg38 (GRCh38)</option>
              <option value="hg19">hg19 (GRCh37)</option>
            </select>
          </div>
          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !sampleId || !name}
              className="btn btn-primary disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                'Create'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function UploadBamModal({
  sample,
  onClose,
  onSubmit,
  isLoading,
}: {
  sample: Sample
  onClose: () => void
  onSubmit: (data: { bamFile: File; baiFile?: File }) => void
  isLoading: boolean
}) {
  const [bamFile, setBamFile] = useState<File | null>(null)
  const [baiFile, setBaiFile] = useState<File | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (bamFile) {
      onSubmit({ bamFile, baiFile: baiFile || undefined })
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Upload BAM File</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4">
          <p className="text-sm text-gray-600 mb-4">
            Upload BAM file for sample: <strong>{sample.name}</strong>
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">BAM File (Required)</label>
              <input
                type="file"
                accept=".bam"
                onChange={(e) => setBamFile(e.target.files?.[0] || null)}
                className="input"
                required
              />
              {bamFile && (
                <p className="text-sm text-gray-500 mt-1">
                  Selected: {bamFile.name}
                </p>
              )}
            </div>
            <div>
              <label className="label">BAI Index File (Recommended)</label>
              <input
                type="file"
                accept=".bai"
                onChange={(e) => setBaiFile(e.target.files?.[0] || null)}
                className="input"
              />
              {baiFile && (
                <p className="text-sm text-gray-500 mt-1">
                  Selected: {baiFile.name}
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || !bamFile}
                className="btn btn-primary disabled:opacity-50"
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  'Upload'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
