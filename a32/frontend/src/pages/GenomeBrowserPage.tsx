import { useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Loader2, ArrowLeft, AlertTriangle } from 'lucide-react'
import { sampleApi, visualizationApi, CoverageData } from '@/services/api'
import { GenomeBrowser } from '@/components/GenomeBrowser'
import { CoverageTrack } from '@/components/CoverageTrack'

export function GenomeBrowserPage() {
  const { sampleId } = useParams<{ sampleId: string }>()

  const [chromosome, setChromosome] = useState('chr1')
  const [start, setStart] = useState(1000000)
  const [end, setEnd] = useState(2000000)

  const { data: sampleData, isLoading: sampleLoading } = useQuery({
    queryKey: ['sample', sampleId],
    queryFn: () => sampleApi.get(sampleId!),
    enabled: !!sampleId,
  })

  const { data: chromosomesData } = useQuery({
    queryKey: ['chromosomes', sampleId],
    queryFn: () => visualizationApi.getChromosomes(sampleId!),
    enabled: !!sampleId && !!sampleData?.data?.bam_object_name,
  })

  const chromosomes = chromosomesData?.data.chromosomes || {
    chr1: 248956422,
    chr2: 242193529,
    chr3: 198295559,
    chr4: 190214555,
    chr5: 181538259,
    chr6: 170805979,
    chr7: 159345973,
    chr8: 145138636,
    chr9: 138394717,
    chr10: 133797422,
    chr11: 135086622,
    chr12: 133275309,
    chr13: 114364328,
    chr14: 107043718,
    chr15: 101991189,
    chr16: 90338345,
    chr17: 83257441,
    chr18: 80373285,
    chr19: 58617616,
    chr20: 64444167,
    chr21: 46709983,
    chr22: 50818468,
    chrX: 156040895,
    chrY: 57227415,
  }

  const hasBamFile = !!sampleData?.data?.bam_object_name

  const { data: coverageData, isFetching } = useQuery<
    CoverageData | null
  >({
    queryKey: ['coverage', sampleId, chromosome, start, end],
    queryFn: async ({ signal }) => {
      if (!hasBamFile) {
        return null
      }
      try {
        const response = await visualizationApi.getCoverage(
          sampleId!,
          chromosome,
          start,
          end,
          undefined,
          signal
        )
        return response.data
      } catch (error: unknown) {
        if ((error as { code?: string })?.code === 'ERR_CANCELED') {
          return null
        }
        console.error('Coverage fetch error:', error)
        return null
      }
    },
    enabled: !!sampleId && hasBamFile,
    retry: false,
    staleTime: 0,
  })

  const handleNavigate = useCallback(
    (newChromosome: string, newStart: number, newEnd: number) => {
      setChromosome(newChromosome)
      setStart(newStart)
      setEnd(newEnd)
    },
    []
  )

  const containerWidth = typeof window !== 'undefined' ? window.innerWidth - 80 - 300 : 1000
  const plotWidth = Math.max(800, containerWidth)

  if (sampleLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-genomic-600" size={40} />
      </div>
    )
  }

  if (!sampleData) {
    return (
      <div className="text-center py-20">
        <AlertTriangle className="mx-auto mb-4 text-yellow-500" size={40} />
        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          Sample not found
        </h2>
        <p className="text-gray-500 mb-4">
          The requested sample could not be found.
        </p>
        <Link to="/samples" className="btn btn-primary">
          Back to Samples
        </Link>
      </div>
    )
  }

  const sample = sampleData.data

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          to="/samples"
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Genome Browser</h1>
          <p className="text-gray-500">
            {sample.name} ({sample.sample_id})
          </p>
        </div>
      </div>

      {!hasBamFile && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-yellow-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <h3 className="font-medium text-yellow-800">
                No BAM file available
              </h3>
              <p className="text-sm text-yellow-700">
                This sample has no BAM file uploaded. Please upload a BAM file
                to view the genome browser.
              </p>
            </div>
          </div>
        </div>
      )}

      <GenomeBrowser
        chromosomes={chromosomes}
        currentChromosome={chromosome}
        currentStart={start}
        currentEnd={end}
        onNavigate={handleNavigate}
      >
        {isFetching && !coverageData ? (
          <div className="card flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-genomic-600" size={24} />
            <span className="ml-2 text-gray-600">Loading coverage data...</span>
          </div>
        ) : (
          <CoverageTrack
            data={coverageData ?? null}
            width={plotWidth}
            height={150}
            isLoading={isFetching}
          />
        )}

        <div className="card">
          <h3 className="font-semibold text-gray-800 mb-3">Tracks</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-genomic-400 rounded"></div>
                <span className="text-sm font-medium text-gray-700">Coverage</span>
              </div>
              <span className="text-xs text-gray-500">Active</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-400 rounded"></div>
                <span className="text-sm font-medium text-gray-700">Variants</span>
              </div>
              <span className="text-xs text-gray-400">Coming soon</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-purple-400 rounded"></div>
                <span className="text-sm font-medium text-gray-700">Genes</span>
              </div>
              <span className="text-xs text-gray-400">Coming soon</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-orange-400 rounded"></div>
                <span className="text-sm font-medium text-gray-700">Alignments (Reads)</span>
              </div>
              <span className="text-xs text-gray-400">Coming soon</span>
            </div>
          </div>
        </div>

        {coverageData && (
          <div className="card">
            <h3 className="font-semibold text-gray-800 mb-3">Region Statistics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Region</p>
                <p className="font-mono text-sm font-medium text-gray-800">
                  {coverageData.chromosome}:{coverageData.start.toLocaleString()}-
                  {coverageData.end.toLocaleString()}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Region Length</p>
                <p className="font-mono text-sm font-medium text-gray-800">
                  {(coverageData.stats.region_length / 1000).toFixed(1)} kb
                </p>
              </div>
              <div className="p-3 bg-genomic-50 rounded-lg">
                <p className="text-xs text-gray-500">Average Coverage</p>
                <p className="font-mono text-sm font-medium text-genomic-700">
                  {coverageData.stats.avg_depth}x
                </p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-xs text-gray-500">Max Coverage</p>
                <p className="font-mono text-sm font-medium text-green-700">
                  {coverageData.stats.max_depth}x
                </p>
              </div>
            </div>
          </div>
        )}
      </GenomeBrowser>
    </div>
  )
}
