import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import { PopulationData } from '@/services/api'

interface PopulationFrequencyChartProps {
  data: PopulationData
  width?: number
  height?: number
}

export function PopulationFrequencyChart({
  data,
  width = 600,
  height = 280,
}: PopulationFrequencyChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !data || !data.populations.length) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const margin = { top: 40, right: 30, bottom: 80, left: 60 }
    const innerWidth = width - margin.left - margin.right
    const innerHeight = height - margin.top - margin.bottom

    const validPopulations = data.populations.filter(
      (p) => p.af !== null && p.af !== undefined
    )

    if (validPopulations.length === 0) {
      svg
        .append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('fill', '#666')
        .text('No population frequency data available')
      return
    }

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const xScale = d3
      .scaleBand()
      .domain(validPopulations.map((p) => p.label))
      .range([0, innerWidth])
      .padding(0.3)

    const maxAf = Math.max(
      ...validPopulations.map((p) => p.af || 0),
      0.0001
    )

    const yScale = d3
      .scaleLog()
      .domain([0.00001, Math.max(maxAf * 1.2, 0.01)])
      .range([innerHeight, 0])

    const yTicks = [0.00001, 0.0001, 0.001, 0.01, 0.1, 0.5].filter(
      (t) => t <= maxAf * 1.2
    )

    const xAxis = d3.axisBottom(xScale)

    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .selectAll('text')
      .style('font-size', '11px')
      .style('fill', '#555')
      .attr('transform', 'rotate(-30)')
      .style('text-anchor', 'end')

    const yAxis = d3.axisLeft(yScale).tickValues(yTicks).tickFormat(d3.format('.1e'))

    g.append('g')
      .call(yAxis)
      .selectAll('text')
      .style('font-size', '11px')

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -50)
      .attr('x', -innerHeight / 2)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('fill', '#666')
      .text('Allele Frequency (log scale)')

    g.selectAll('.bar')
      .data(validPopulations)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (d) => xScale(d.label)!)
      .attr('y', (d) => yScale(d.af || 0.00001))
      .attr('width', xScale.bandwidth())
      .attr('height', (d) => innerHeight - yScale(d.af || 0.00001))
      .attr('fill', (d) => d.color || '#3b82f6')
      .attr('rx', 3)
      .on('mouseover', function () {
        d3.select(this).attr('opacity', 0.8)
      })
      .on('mouseout', function () {
        d3.select(this).attr('opacity', 1)
      })

    g.selectAll('.bar-label')
      .data(validPopulations)
      .enter()
      .append('text')
      .attr('class', 'bar-label')
      .attr('x', (d) => xScale(d.label)! + xScale.bandwidth() / 2)
      .attr('y', (d) => yScale(d.af || 0.00001) - 5)
      .attr('text-anchor', 'middle')
      .style('font-size', '10px')
      .style('fill', '#333')
      .text((d) => {
        const af = d.af
        if (!af) return 'N/A'
        if (af >= 0.01) return (af * 100).toFixed(2) + '%'
        return d3.format('.2e')(af)
      })

    svg
      .append('text')
      .attr('x', width / 2)
      .attr('y', 20)
      .attr('text-anchor', 'middle')
      .style('font-size', '14px')
      .style('font-weight', '600')
      .style('fill', '#333')
      .text(`${data.database} Population Frequencies`)

    if (data.overall_af !== null && data.overall_af !== undefined) {
      svg
        .append('text')
        .attr('x', width / 2)
        .attr('y', height - 5)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('fill', '#666')
        .text(`Overall AF: ${(data.overall_af * 100).toFixed(4)}%`)
    }
  }, [data, width, height])

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-2 overflow-x-auto">
      <svg ref={svgRef} width={width} height={height} />
    </div>
  )
}
