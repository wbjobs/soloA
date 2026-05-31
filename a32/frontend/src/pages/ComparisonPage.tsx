import { useState, useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { useQuery } from '@tanstack/react-query'
import { comparisonApi } from '@/services/api'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

const CHROMOSOMES = [
  ...Array.from({ length: 22 }, (_, i) => `chr${i + 1}`),
  'chrX',
  'chrY',
]

export function ComparisonPage() {
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null)
  const [chromosome, setChromosome] = useState('chr1')
  const [start, setStart] = useState(1000000)
  const [end, setEnd] = useState(2000000)
  const [minTumorAF, setMinTumorAF] = useState<number | undefined>(undefined)
  const [maxNormalAF, setMaxNormalAF] = useState<number | undefined>(undefined)
  const [minQuality, setMinQuality] = useState<number | undefined>(undefined)
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedSomaticId, setSelectedSomaticId] = useState<string | null>(null)

  const coverageSvgRef = useRef<SVGSVGElement>(null)
  const bafSvgRef = useRef<SVGSVGElement>(null)

  const { data: pairs, isLoading: pairsLoading } = useQuery({
    queryKey: ['sample-pairs'],
    queryFn: () => comparisonApi.listPairs(1, 20),
  })

  const { data: coverageData, isLoading: coverageLoading } = useQuery({
    queryKey: ['coverage-comparison', selectedPairId, chromosome, start, end],
    queryFn: () =>
      selectedPairId
        ? comparisonApi.getCoverageComparison(
            selectedPairId,
            chromosome,
            start,
            end
          )
        : null,
    enabled: !!selectedPairId,
  })

  const { data: bafData, isLoading: bafLoading } = useQuery({
    queryKey: ['baf-plot', selectedPairId, chromosome, start, end],
    queryFn: () =>
      selectedPairId
        ? comparisonApi.getBAFPlot(selectedPairId, chromosome, start, end)
        : null,
    enabled: !!selectedPairId,
  })

  const { data: somaticVariants, isLoading: variantsLoading } = useQuery({
    queryKey: [
      'somatic-variants',
      selectedPairId,
      currentPage,
      chromosome,
      minTumorAF,
      maxNormalAF,
      minQuality,
    ],
    queryFn: () =>
      selectedPairId
        ? comparisonApi.getSomaticVariants(selectedPairId, {
            chromosome,
            min_tumor_af: minTumorAF,
            max_normal_af: maxNormalAF,
            min_quality: minQuality,
            page: currentPage,
            page_size: 10,
          })
        : null,
    enabled: !!selectedPairId,
  })

  useEffect(() => {
    if (!coverageSvgRef.current || !coverageData?.data) return

    const cov = coverageData.data
    const svg = d3.select(coverageSvgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 30, right: 30, bottom: 50, left: 60 }
    const width = 800
    const height = 250
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const xScale = d3
      .scaleLinear()
      .domain([cov.start, cov.end])
      .range([0, innerWidth])

    const allDepths = [
      ...cov.tumor_coverage.map((d) => d.depth),
      ...cov.normal_coverage.map((d) => d.depth),
    ]
    const yScale = d3
      .scaleLinear()
      .domain([0, Math.max(...allDepths) * 1.2])
      .range([innerHeight, 0])

    const tumorLine = d3
      .line<{ position: number; depth: number }>()
      .x((d) => xScale(d.position))
      .y((d) => yScale(d.depth))
      .curve(d3.curveMonotoneX)

    const normalLine = d3
      .line<{ position: number; depth: number }>()
      .x((d) => xScale(d.position))
      .y((d) => yScale(d.depth))
      .curve(d3.curveMonotoneX)

    g.append('path')
      .datum(cov.tumor_coverage)
      .attr('d', tumorLine)
      .attr('fill', 'none')
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 2)

    g.append('path')
      .datum(cov.normal_coverage)
      .attr('d', normalLine)
      .attr('fill', 'none')
      .attr('stroke', '#22c55e')
      .attr('stroke-width', 2)

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(6)
      .tickFormat((d) => d3.format(',.0f')(d as number))

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)

    g.append('g').call(d3.axisLeft(yScale))

    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 40)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('fill', '#666')
      .text('Position')

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -45)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('fill', '#666')
      .text('Coverage Depth')

    const legend = svg.append('g').attr('transform', 'translate(60, 10)')
    legend.append('circle').attr('cx', 0).attr('cy', 0).attr('r', 6).attr('fill', '#ef4444')
    legend.append('text').attr('x', 12).attr('y', 4).style('font-size', '11px').text('Tumor')

    legend.append('circle').attr('cx', 80).attr('cy', 0).attr('r', 6).attr('fill', '#22c55e')
    legend.append('text').attr('x', 92).attr('y', 4).style('font-size', '11px').text('Normal')
  }, [coverageData])

  useEffect(() => {
    if (!bafSvgRef.current || !bafData?.data) return

    const baf = bafData.data
    const svg = d3.select(bafSvgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 30, right: 30, bottom: 50, left: 60 }
    const width = 800
    const height = 250
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const xScale = d3
      .scaleLinear()
      .domain([baf.start, baf.end])
      .range([0, innerWidth])

    const yScale = d3.scaleLinear().domain([0, 1]).range([innerHeight, 0])

    g.append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', yScale(0.5))
      .attr('y2', yScale(0.5))
      .attr('stroke', '#cbd5e1')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '5,5')

    g.selectAll('.tumor-point')
      .data(baf.tumor_baf)
      .enter()
      .append('circle')
      .attr('class', 'tumor-point')
      .attr('cx', (d) => xScale(d.position))
      .attr('cy', (d) => yScale(d.baf))
      .attr('r', 3)
      .attr('fill', '#ef4444')
      .attr('opacity', 0.7)

    g.selectAll('.normal-point')
      .data(baf.normal_baf)
      .enter()
      .append('circle')
      .attr('class', 'normal-point')
      .attr('cx', (d) => xScale(d.position))
      .attr('cy', (d) => yScale(d.baf))
      .attr('r', 2)
      .attr('fill', '#22c55e')
      .attr('opacity', 0.7)

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(6)
      .tickFormat((d) => d3.format(',.0f')(d as number))

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)

    g.append('g').call(d3.axisLeft(yScale))

    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 40)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('fill', '#666')
      .text('Position')

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -innerHeight / 2)
      .attr('y', -45)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('fill', '#666')
      .text('BAF')

    const legend = svg.append('g').attr('transform', 'translate(60, 10)')
    legend.append('circle').attr('cx', 0).attr('cy', 0).attr('r', 6).attr('fill', '#ef4444')
    legend.append('text').attr('x', 12).attr('y', 4).style('font-size', '11px').text('Tumor BAF')

    legend.append('circle').attr('cx', 110).attr('cy', 0).attr('r', 4).attr('fill', '#22c55e')
    legend.append('text').attr('x', 122).attr('y', 4).style('font-size', '11px').text('Normal BAF')
  }, [bafData])

  const zoomOut = () => {
    const center = (start + end) / 2
    const newRange = (end - start) * 2
    setStart(Math.max(1, Math.floor(center - newRange / 2)))
    setEnd(Math.floor(center + newRange / 2))
  }

  const zoomIn = () => {
    const center = (start + end) / 2
    const newRange = (end - start) / 2
    setStart(Math.floor(center - newRange / 2))
    setEnd(Math.floor(center + newRange / 2))
  }

  const panLeft = () => {
    const range = end - start
    setStart(Math.max(1, start - range * 0.3))
    setEnd(end - range * 0.3)
  }

  const panRight = () => {
    const range = end - start
    setStart(start + range * 0.3)
    setEnd(end + range * 0.3)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Tumor-Normal Comparison</h1>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Select Sample Pair & Region</h2>
        {pairsLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sample Pair</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                value={selectedPairId || ''}
                onChange={(e) => {
                  setSelectedPairId(e.target.value || null)
                  setCurrentPage(1)
                }}
              >
                <option value="">Select pair...</option>
                {pairs?.data.items.map((p) => (
                  <option key={p.pair_id} value={p.pair_id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chromosome</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                value={chromosome}
                onChange={(e) => setChromosome(e.target.value)}
              >
                {CHROMOSOMES.map((chr) => (
                  <option key={chr} value={chr}>
                    {chr}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Position</label>
              <input
                type="number"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                value={start}
                onChange={(e) => setStart(parseInt(e.target.value) || 0)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Position</label>
              <input
                type="number"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                value={end}
                onChange={(e) => setEnd(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        )}

        {selectedPairId && (
          <div className="flex items-center gap-2 pt-2">
            <button className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50" onClick={panLeft}>
              <ChevronLeft className="h-4 w-4 inline mr-1" />
              Left
            </button>
            <button className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50" onClick={zoomOut}>
              Zoom Out
            </button>
            <button className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50" onClick={zoomIn}>
              Zoom In
            </button>
            <button className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50" onClick={panRight}>
              Right
              <ChevronRight className="h-4 w-4 inline ml-1" />
            </button>
            <span className="ml-4 text-sm text-gray-500">
              Region: {d3.format(',.0f')(start)} - {d3.format(',.0f')(end)} (
              {d3.format(',.0f')(end - start)} bp)
            </span>
          </div>
        )}
      </div>

      {selectedPairId && (
        <>
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4">Coverage Comparison (Tumor vs Normal)</h2>
              {coverageLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <svg ref={coverageSvgRef} width={800} height={250} />
              )}
              {coverageData?.data.stats && (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="p-3 bg-red-50 rounded-lg">
                    <div className="text-gray-500">Tumor Avg Coverage</div>
                    <div className="text-lg font-semibold text-red-600">
                      {coverageData.data.stats.tumor_avg.toFixed(1)}x
                    </div>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <div className="text-gray-500">Normal Avg Coverage</div>
                    <div className="text-lg font-semibold text-green-600">
                      {coverageData.data.stats.normal_avg.toFixed(1)}x
                    </div>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg">
                    <div className="text-gray-500">Tumor Max Coverage</div>
                    <div className="text-lg font-semibold text-red-600">
                      {coverageData.data.stats.tumor_max}x
                    </div>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <div className="text-gray-500">Normal Max Coverage</div>
                    <div className="text-lg font-semibold text-green-600">
                      {coverageData.data.stats.normal_max}x
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold mb-4">B Allele Frequency (BAF) Plot</h2>
              {bafLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              ) : (
                <svg ref={bafSvgRef} width={800} height={250} />
              )}
              <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm">
                <strong>Note:</strong> Tumor BAF deviating from 0.5 may indicate LOH (Loss of Heterozygosity).
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold mb-4">Somatic Variants</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Tumor AF</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  placeholder="0.0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  value={minTumorAF ?? ''}
                  onChange={(e) => {
                    setMinTumorAF(e.target.value ? parseFloat(e.target.value) : undefined)
                    setCurrentPage(1)
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Normal AF</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  placeholder="0.05"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  value={maxNormalAF ?? ''}
                  onChange={(e) => {
                    setMaxNormalAF(e.target.value ? parseFloat(e.target.value) : undefined)
                    setCurrentPage(1)
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min Quality (QUAL)</label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  placeholder="50"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  value={minQuality ?? ''}
                  onChange={(e) => {
                    setMinQuality(e.target.value ? parseFloat(e.target.value) : undefined)
                    setCurrentPage(1)
                  }}
                />
              </div>
            </div>

            {variantsLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Chr</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Position</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ref</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Alt</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tumor AF</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Normal AF</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">VAF Diff</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">QUAL</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {somaticVariants?.data.items.map((variant) => (
                        <tr
                          key={variant.somatic_id}
                          className={selectedSomaticId === variant.somatic_id ? 'bg-blue-50' : 'hover:bg-gray-50'}
                          onClick={() => setSelectedSomaticId(variant.somatic_id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className="px-4 py-2 border-t font-mono text-sm">{variant.chromosome}</td>
                          <td className="px-4 py-2 border-t font-mono text-sm">
                            {d3.format(',.0f')(variant.position)}
                          </td>
                          <td className="px-4 py-2 border-t font-mono text-sm font-bold text-gray-900">
                            {variant.ref_allele}
                          </td>
                          <td className="px-4 py-2 border-t font-mono text-sm font-bold text-red-600">
                            {variant.alt_allele}
                          </td>
                          <td className="px-4 py-2 border-t text-sm">
                            <span
                              className={`px-2 py-1 rounded-full text-xs ${
                                variant.variant_type === 'SNP'
                                  ? 'bg-blue-100 text-blue-800'
                                  : variant.variant_type === 'INS'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-orange-100 text-orange-800'
                              }`}
                            >
                              {variant.variant_type}
                            </span>
                          </td>
                          <td className="px-4 py-2 border-t font-mono text-sm text-red-600">
                            {((variant.tumor_af ?? 0) * 100).toFixed(1)}%
                          </td>
                          <td className="px-4 py-2 border-t font-mono text-sm text-green-600">
                            {((variant.normal_af ?? 0) * 100).toFixed(1)}%
                          </td>
                          <td className="px-4 py-2 border-t font-mono text-sm">
                            {((variant.vaf_difference ?? 0) * 100).toFixed(1)}%
                          </td>
                          <td className="px-4 py-2 border-t font-mono text-sm">{variant.quality?.toFixed(0)}</td>
                          <td className="px-4 py-2 border-t text-sm">
                            <span
                              className={`px-2 py-1 rounded-full text-xs ${
                                variant.somatic_status === 'somatic'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}
                            >
                              {variant.somatic_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {somaticVariants && somaticVariants.data.total > 0 && (
                  <div className="flex items-center justify-between pt-4">
                    <div className="text-sm text-gray-500">
                      Showing {(currentPage - 1) * 10 + 1} -{' '}
                      {Math.min(currentPage * 10, somaticVariants.data.total)} of{' '}
                      {somaticVariants.data.total} variants
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4 inline mr-1" />
                        Prev
                      </button>
                      <button
                        className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
                        onClick={() =>
                          setCurrentPage((p) =>
                            Math.min(
                              Math.ceil(somaticVariants.data.total / 10),
                              p + 1
                            )
                          )
                        }
                        disabled={
                          currentPage >= Math.ceil(somaticVariants.data.total / 10)
                        }
                      >
                        Next
                        <ChevronRight className="h-4 w-4 inline ml-1" />
                      </button>
                    </div>
                  </div>
                )}

                {somaticVariants && somaticVariants.data.total === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No somatic variants found with the current filters.
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
