import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { CoverageData } from '@/services/api'

interface CoverageTrackProps {
  data: CoverageData | null
  width?: number
  height?: number
  isLoading?: boolean
}

export function CoverageTrack({ data, width = 800, height = 120, isLoading = false }: CoverageTrackProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [displayData, setDisplayData] = useState<CoverageData | null>(data)

  useEffect(() => {
    if (data) {
      setDisplayData(data)
    }
  }, [data])

  useEffect(() => {
    if (!svgRef.current || !displayData || !displayData.coverage.length) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 20, right: 10, bottom: 30, left: 50 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    const coverageData = displayData.coverage

    const xScale = d3
      .scaleLinear()
      .domain([displayData.stats.start, displayData.stats.end])
      .range([0, innerWidth])

    const yMax = Math.max(displayData.stats.max_depth * 1.1, 10)
    const yScale = d3.scaleLinear().domain([0, yMax]).range([innerHeight, 0])

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(5)
      .tickFormat((d) => d3.format(',.0f')(d as number))

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .selectAll('text')
      .style('font-size', '10px')

    const yAxis = d3.axisLeft(yScale).ticks(4)

    g.append('g')
      .call(yAxis)
      .selectAll('text')
      .style('font-size', '10px')

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -40)
      .attr('x', -innerHeight / 2)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px')
      .style('fill', '#666')
      .text('Coverage')

    const binWidth = Math.max(
      1,
      innerWidth / coverageData.length
    )

    const area = d3
      .area<{ position: number; depth: number }>()
      .x((d) => xScale(d.position) + binWidth / 2)
      .y0(innerHeight)
      .y1((d) => yScale(d.depth))
      .curve(d3.curveStepAfter)

    g.append('path')
      .datum(coverageData)
      .attr('fill', '#38bdf8')
      .attr('fill-opacity', 0.7)
      .attr('d', area)

    const line = d3
      .line<{ position: number; depth: number }>()
      .x((d) => xScale(d.position) + binWidth / 2)
      .y((d) => yScale(d.depth))
      .curve(d3.curveStepAfter)

    g.append('path')
      .datum(coverageData)
      .attr('fill', 'none')
      .attr('stroke', '#0284c7')
      .attr('stroke-width', 1.5)
      .attr('d', line)

    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', -8)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('font-weight', '600')
      .style('fill', '#333')
      .text(
        `Coverage (max: ${displayData.stats.max_depth}, avg: ${displayData.stats.avg_depth})${isLoading ? ' (Loading...)' : ''}`
      )
  }, [displayData, width, height, isLoading])

  if (!displayData) {
    return (
      <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center">
        <p className="text-gray-500 text-sm">Select a region to view coverage</p>
      </div>
    )
  }

  if (displayData.coverage.length === 0) {
    return (
      <div className="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center">
        <p className="text-gray-500 text-sm">No coverage data for this region</p>
      </div>
    )
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-2 ${isLoading ? 'opacity-80' : ''}`}>
      <svg ref={svgRef} width={width} height={height} />
    </div>
  )
}
