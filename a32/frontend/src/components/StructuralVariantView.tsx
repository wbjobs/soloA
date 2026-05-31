import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { SVBreakpoint } from '@/services/api'

interface StructuralVariantViewProps {
  breakpoints: SVBreakpoint[]
  chromosome: string
  start: number
  end: number
  width?: number
  height?: number
}

export function StructuralVariantView({
  breakpoints,
  chromosome,
  start,
  end,
  width = 800,
  height = 400,
}: StructuralVariantViewProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedSvId, setSelectedSvId] = useState<string | null>(null)

  useEffect(() => {
    if (!svgRef.current) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 60, right: 30, bottom: 80, left: 60 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)

    const xScale = d3
      .scaleLinear()
      .domain([start, end])
      .range([0, innerWidth])

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(6)
      .tickFormat((d) => d3.format(',.0f')(d as number))

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .selectAll('text')
      .style('font-size', '10px')

    g.append('text')
      .attr('x', innerWidth / 2)
      .attr('y', innerHeight + 50)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('fill', '#666')
      .text(`Position on ${chromosome}`)

    g.append('text')
      .attr('x', -40)
      .attr('y', innerHeight / 2)
      .attr('text-anchor', 'middle')
      .attr('transform', 'rotate(-90)')
      .style('font-size', '12px')
      .style('fill', '#666')
      .text('Reads / Arcs')

    const relevantBreakpoints = breakpoints.filter(
      (bp) =>
        bp.breakpoint_1.chromosome === chromosome &&
        bp.breakpoint_1.position >= start &&
        bp.breakpoint_1.position <= end
    )

    if (relevantBreakpoints.length === 0) {
      g.append('text')
        .attr('x', innerWidth / 2)
        .attr('y', innerHeight / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('fill', '#999')
        .text('No structural variants in this region')
      return
    }

    const svTypeColors: Record<string, string> = {
      DEL: '#ef4444',
      DUP: '#22c55e',
      INV: '#f59e0b',
      BND: '#8b5cf6',
      INS: '#06b6d4',
      CNV: '#ec4899',
    }

    g.append('line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', innerHeight - 20)
      .attr('y2', innerHeight - 20)
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', 3)

    const arcHeightScale = d3
      .scaleLinear()
      .domain([0, Math.max(...relevantBreakpoints.map((bp) => {
        if (bp.breakpoint_2 && bp.breakpoint_2.chromosome === chromosome) {
          return Math.abs(bp.breakpoint_2.position - bp.breakpoint_1.position)
        }
        return end - start
      }))])
      .range([30, innerHeight - 100])

    relevantBreakpoints.forEach((bp) => {
      const x1 = xScale(bp.breakpoint_1.position)
      const isIntraChr =
        bp.breakpoint_2 && bp.breakpoint_2.chromosome === chromosome
      const x2 = isIntraChr
        ? xScale(bp.breakpoint_2!.position)
        : innerWidth + 50

      const arcHeight = isIntraChr
        ? arcHeightScale(Math.abs(bp.breakpoint_2!.position - bp.breakpoint_1.position))
        : 150

      const color = svTypeColors[bp.sv_type] || '#6b7280'

      const pathData = d3.line()(
        isIntraChr
          ? [
              [x1, innerHeight - 20],
              [(x1 + x2) / 2, innerHeight - 20 - arcHeight],
              [x2, innerHeight - 20],
            ]
          : [
              [x1, innerHeight - 20],
              [x1 + 30, innerHeight - 20 - arcHeight],
            ]
      )

      g.append('path')
        .attr('d', pathData + (isIntraChr ? '' : 'L 0 0'))
        .attr('fill', 'none')
        .attr('stroke', color)
        .attr('stroke-width', bp.allele_frequency ? Math.max(1.5, bp.allele_frequency * 6) : 2)
        .attr('opacity', 0.7)
        .attr('cursor', 'pointer')
        .on('click', () => {
          setSelectedSvId(bp.sv_id)
        })

      g.append('circle')
        .attr('cx', x1)
        .attr('cy', innerHeight - 20)
        .attr('r', 6)
        .attr('fill', color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 2)
        .attr('cursor', 'pointer')
        .on('mouseover', function () {
          d3.select(this).attr('r', 8)
        })
        .on('mouseout', function () {
          d3.select(this).attr('r', 6)
        })

      if (isIntraChr) {
        g.append('circle')
          .attr('cx', x2)
          .attr('cy', innerHeight - 20)
          .attr('r', 6)
          .attr('fill', color)
          .attr('stroke', '#fff')
          .attr('stroke-width', 2)
      }

      g.append('text')
        .attr('x', (x1 + (isIntraChr ? x2 : x1)) / 2)
        .attr('y', innerHeight - 20 - arcHeight - 5)
        .attr('text-anchor', 'middle')
        .style('font-size', '10px')
        .style('fill', color)
        .style('font-weight', '600')
        .text(`${bp.sv_type}${bp.gene_1 ? ` (${bp.gene_1})` : ''}`)
    })

    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 25)
      .attr('text-anchor', 'middle')
      .style('font-size', '14px')
      .style('font-weight', '600')
      .style('fill', '#333')
      .text(`Structural Variants on ${chromosome}`)

    const legend = svg
      .append('g')
      .attr('transform', `translate(${margin.left}, 35)`)

    Object.entries(svTypeColors).forEach(([type, color], i) => {
      legend
        .append('rect')
        .attr('x', i * 100)
        .attr('y', 0)
        .attr('width', 12)
        .attr('height', 12)
        .attr('fill', color)
        .attr('rx', 2)

      legend
        .append('text')
        .attr('x', i * 100 + 18)
        .attr('y', 10)
        .style('font-size', '11px')
        .style('fill', '#666')
        .text(type)
    })
  }, [breakpoints, chromosome, start, end, width, height, selectedSvId])

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <svg ref={svgRef} width={width} height={height} />
      {selectedSvId && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            Selected SV: <span className="font-mono font-medium">{selectedSvId}</span>
          </p>
        </div>
      )}
    </div>
  )
}
