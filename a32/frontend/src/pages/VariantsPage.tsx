import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Dna,
  Search,
  Filter,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { variantApi, Variant, VariantType } from '@/services/api'

function VariantTypeBadge({ type }: { type: VariantType }) {
  const colors: Record<VariantType, string> = {
    SNP: 'bg-blue-100 text-blue-800',
    INS: 'bg-green-100 text-green-800',
    DEL: 'bg-red-100 text-red-800',
    MNP: 'bg-purple-100 text-purple-800',
    SV: 'bg-orange-100 text-orange-800',
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${colors[type]}`}
    >
      {type}
    </span>
  )
}

function ClinicalSignificanceBadge({ significance }: { significance: string | null | undefined }) {
  if (!significance) {
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        Unknown
      </span>
    )
  }

  const colorMap: Record<string, string> = {
    Pathogenic: 'bg-red-100 text-red-800',
    'Likely pathogenic': 'bg-orange-100 text-orange-800',
    'Uncertain significance': 'bg-yellow-100 text-yellow-800',
    'Likely benign': 'bg-green-100 text-green-800',
    Benign: 'bg-emerald-100 text-emerald-800',
    'Benign/Likely benign': 'bg-emerald-100 text-emerald-800',
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
        colorMap[significance] || 'bg-gray-100 text-gray-600'
      }`}
    >
      {significance}
    </span>
  )
}

export function VariantsPage() {
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)

  const [filters, setFilters] = useState({
    task_id: '',
    chromosome: '',
    min_quality: '',
    min_read_depth: '',
    min_allele_frequency: '',
    max_allele_frequency: '',
    variant_type: '' as VariantType | '',
  })

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['variants', page, filters],
    queryFn: () => {
      const params: Record<string, unknown> = { page, page_size: 20 }
      if (filters.task_id) params.task_id = filters.task_id
      if (filters.chromosome) params.chromosome = filters.chromosome
      if (filters.min_quality) params.min_quality = Number(filters.min_quality)
      if (filters.min_read_depth) params.min_read_depth = Number(filters.min_read_depth)
      if (filters.min_allele_frequency)
        params.min_allele_frequency = Number(filters.min_allele_frequency)
      if (filters.max_allele_frequency)
        params.max_allele_frequency = Number(filters.max_allele_frequency)
      if (filters.variant_type) params.variant_type = filters.variant_type
      return variantApi.list(params)
    },
  })

  const { data: variantDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['variant', selectedVariantId],
    queryFn: () => variantApi.get(selectedVariantId!),
    enabled: !!selectedVariantId,
  })

  const variants = data?.data.items || []
  const total = data?.data.total || 0

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const clearFilters = () => {
    setFilters({
      task_id: '',
      chromosome: '',
      min_quality: '',
      min_read_depth: '',
      min_allele_frequency: '',
      max_allele_frequency: '',
      variant_type: '',
    })
    setPage(1)
  }

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
          <h1 className="text-2xl font-bold text-gray-800">Variants</h1>
          <p className="text-gray-500">
            Browse and filter detected variants with annotations
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Search size={20} />
            Refresh
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="btn btn-secondary flex items-center gap-2"
          >
            <Filter size={20} />
            Filters
            {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">Filter Variants</h3>
            <button
              onClick={clearFilters}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Clear all
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div>
              <label className="label">Task ID</label>
              <input
                type="text"
                value={filters.task_id}
                onChange={(e) => handleFilterChange('task_id', e.target.value)}
                className="input"
                placeholder="e.g., task_123"
              />
            </div>
            <div>
              <label className="label">Chromosome</label>
              <input
                type="text"
                value={filters.chromosome}
                onChange={(e) => handleFilterChange('chromosome', e.target.value)}
                className="input"
                placeholder="e.g., chr1"
              />
            </div>
            <div>
              <label className="label">Min Quality</label>
              <input
                type="number"
                value={filters.min_quality}
                onChange={(e) => handleFilterChange('min_quality', e.target.value)}
                className="input"
                placeholder="e.g., 30"
              />
            </div>
            <div>
              <label className="label">Min Read Depth</label>
              <input
                type="number"
                value={filters.min_read_depth}
                onChange={(e) => handleFilterChange('min_read_depth', e.target.value)}
                className="input"
                placeholder="e.g., 10"
              />
            </div>
            <div>
              <label className="label">Min Allele Frequency</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={filters.min_allele_frequency}
                onChange={(e) =>
                  handleFilterChange('min_allele_frequency', e.target.value)
                }
                className="input"
                placeholder="e.g., 0.1"
              />
            </div>
            <div>
              <label className="label">Max Allele Frequency</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={filters.max_allele_frequency}
                onChange={(e) =>
                  handleFilterChange('max_allele_frequency', e.target.value)
                }
                className="input"
                placeholder="e.g., 1.0"
              />
            </div>
            <div>
              <label className="label">Variant Type</label>
              <select
                value={filters.variant_type}
                onChange={(e) =>
                  handleFilterChange('variant_type', e.target.value)
                }
                className="input"
              >
                <option value="">All</option>
                <option value="SNP">SNP</option>
                <option value="INS">Insertion</option>
                <option value="DEL">Deletion</option>
                <option value="MNP">MNP</option>
                <option value="SV">Structural Variant</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="card">
            {variants.length === 0 ? (
              <div className="text-center py-12">
                <Dna className="mx-auto mb-4 text-gray-300" size={60} />
                <h3 className="text-lg font-medium text-gray-800 mb-2">
                  No variants found
                </h3>
                <p className="text-gray-500">
                  Run a variant calling task to see results here
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                        Position
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                        Ref/Alt
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                        Type
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                        Qual
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                        Depth
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                        AF
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {variants.map((variant) => (
                      <tr
                        key={variant.variant_id}
                        onClick={() => setSelectedVariantId(variant.variant_id)}
                        className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                          selectedVariantId === variant.variant_id
                            ? 'bg-genomic-50'
                            : ''
                        }`}
                      >
                        <td className="py-3 px-4">
                          <span className="font-mono text-sm text-gray-700">
                            {variant.chromosome}:{variant.position.toLocaleString()}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-sm">
                            <span className="text-blue-600">{variant.ref_allele}</span>
                            <span className="text-gray-400"> → </span>
                            <span className="text-red-600">{variant.alt_allele}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <VariantTypeBadge type={variant.variant_type} />
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-sm ${
                              (variant.quality || 0) >= 30
                                ? 'text-green-600'
                                : 'text-yellow-600'
                            }`}
                          >
                            {variant.quality?.toFixed(1) || 'N/A'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-gray-600">
                            {variant.read_depth || 'N/A'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-gray-600">
                            {variant.allele_frequency !== null
                              ? (variant.allele_frequency * 100).toFixed(1) + '%'
                              : 'N/A'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {total > 20 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200">
                <span className="text-sm text-gray-500">
                  Showing {variants.length} of {total} variants
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
                    disabled={page * 20 >= total}
                    className="btn btn-secondary text-sm disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="card sticky top-6">
            <h3 className="font-semibold text-gray-800 mb-4">Variant Details</h3>
            {selectedVariantId && detailLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="animate-spin text-genomic-600" size={24} />
              </div>
            ) : selectedVariantId && variantDetail ? (
              <VariantDetailsPanel
                variant={variantDetail.data.variant}
                annotation={variantDetail.data.annotation}
                onClose={() => setSelectedVariantId(null)}
              />
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Dna className="mx-auto mb-2 text-gray-300" size={40} />
                <p className="text-sm">Click a variant to see details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function VariantDetailsPanel({
  variant,
  annotation,
  onClose,
}: {
  variant: Variant
  annotation?: {
    dbsnp_rs_id: string | null
    gene: string | null
    transcript: string | null
    consequence: string | null
    clinvar_variation_id: string | null
    clinvar_clinical_significance: string | null
    clinvar_conditions: string | null
    clinvar_review_status: string | null
    sift_prediction: string | null
    sift_score: string | null
    polyphen_prediction: string | null
    polyphen_score: string | null
    allele_frequency_1kg: string | null
    allele_frequency_gnomad: string | null
    allele_frequency_exac: string | null
  }
  onClose: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm text-genomic-600">
          {variant.variant_id.slice(0, 16)}...
        </span>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-3 bg-gray-50 rounded-lg space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Position</span>
          <span className="font-mono">
            {variant.chromosome}:{variant.position.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Change</span>
          <span className="font-mono">
            <span className="text-blue-600">{variant.ref_allele}</span>
            <span className="text-gray-400"> → </span>
            <span className="text-red-600">{variant.alt_allele}</span>
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Type</span>
          <VariantTypeBadge type={variant.variant_type} />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Genotype</span>
          <span className="font-mono">{variant.genotype || 'N/A'}</span>
        </div>
      </div>

      <div className="p-3 bg-gray-50 rounded-lg space-y-2">
        <h4 className="text-sm font-medium text-gray-700">Quality Metrics</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-500 block text-xs">Quality</span>
            <span className="font-medium">
              {variant.quality?.toFixed(1) || 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">Depth</span>
            <span className="font-medium">{variant.read_depth || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">Alt Depth</span>
            <span className="font-medium">{variant.alt_depth || 'N/A'}</span>
          </div>
          <div>
            <span className="text-gray-500 block text-xs">Allele Freq</span>
            <span className="font-medium">
              {variant.allele_frequency !== null
                ? (variant.allele_frequency * 100).toFixed(1) + '%'
                : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {annotation && (
        <>
          {annotation.gene && (
            <div className="p-3 bg-genomic-50 rounded-lg space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Gene Annotation</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Gene</span>
                  <span className="font-medium text-genomic-700">
                    {annotation.gene}
                  </span>
                </div>
                {annotation.consequence && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Consequence</span>
                    <span className="text-gray-700">{annotation.consequence}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="p-3 bg-gray-50 rounded-lg space-y-2">
            <h4 className="text-sm font-medium text-gray-700">Clinical Significance</h4>
            <div className="space-y-1 text-sm">
              {annotation.clinvar_clinical_significance && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">ClinVar</span>
                  <ClinicalSignificanceBadge
                    significance={annotation.clinvar_clinical_significance}
                  />
                </div>
              )}
              {annotation.clinvar_conditions && (
                <div className="text-xs text-gray-600">
                  <span className="text-gray-500">Conditions: </span>
                  {annotation.clinvar_conditions}
                </div>
              )}
              {annotation.dbsnp_rs_id && (
                <div className="flex justify-between">
                  <span className="text-gray-500">dbSNP</span>
                  <span className="font-mono text-blue-600">
                    {annotation.dbsnp_rs_id}
                  </span>
                </div>
              )}
            </div>
          </div>

          {(annotation.sift_prediction || annotation.polyphen_prediction) && (
            <div className="p-3 bg-gray-50 rounded-lg space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Functional Impact</h4>
              <div className="space-y-1 text-sm">
                {annotation.sift_prediction && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">SIFT</span>
                    <span
                      className={
                        annotation.sift_prediction === 'deleterious'
                          ? 'text-red-600'
                          : 'text-green-600'
                      }
                    >
                      {annotation.sift_prediction}
                      {annotation.sift_score && ` (${annotation.sift_score})`}
                    </span>
                  </div>
                )}
                {annotation.polyphen_prediction && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">PolyPhen</span>
                    <span
                      className={
                        annotation.polyphen_prediction.includes('damaging')
                          ? 'text-red-600'
                          : 'text-green-600'
                      }
                    >
                      {annotation.polyphen_prediction}
                      {annotation.polyphen_score && ` (${annotation.polyphen_score})`}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {(annotation.allele_frequency_gnomad ||
            annotation.allele_frequency_1kg) && (
            <div className="p-3 bg-gray-50 rounded-lg space-y-2">
              <h4 className="text-sm font-medium text-gray-700">Population Frequencies</h4>
              <div className="space-y-1 text-sm">
                {annotation.allele_frequency_gnomad && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">gnomAD</span>
                    <span>{annotation.allele_frequency_gnomad}</span>
                  </div>
                )}
                {annotation.allele_frequency_1kg && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">1000 Genomes</span>
                    <span>{annotation.allele_frequency_1kg}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
