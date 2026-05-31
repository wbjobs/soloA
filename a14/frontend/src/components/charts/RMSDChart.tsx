import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { RMSDResult } from '../types'
import './Layout.module.css'

interface RMSDChartProps {
  data: RMSDResult
  width?: number
  height?: number
}

export function RMSDChart({ data, width = 800, height = 300 }: RMSDChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !data.times.length) return

    const margin = { top: 20, right: 20, bottom: 40, left: 60 }
    const chartWidth = width - margin.left - margin.right
    const chartHeight = height - margin.top - margin.bottom

    d3.select(containerRef.current).selectAll('*').remove()

    const svg = d3.select(containerRef.current)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`)

    const xScale = d3.scaleLinear()
      .domain([d3.min(data.times) || 0, d3.max(data.times) || 0])
      .range([0, chartWidth])

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data.rmsd_values) || 1])
      .range([chartHeight, 0])
      .nice()

    const line = d3.line<number>()
      .x((_, i) => xScale(data.times[i]))
      .y((d) => yScale(d))
      .curve(d3.curveMonotoneX)

    svg.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0, ${chartHeight})`)
      .call(d3.axisBottom(xScale).ticks(10).tickSize(-chartHeight).tickFormat(() => ''))
      .selectAll('line')
      .style('stroke', '#2d3748')

    svg.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-chartWidth).tickFormat(() => ''))
      .selectAll('line')
      .style('stroke', '#2d3748')

    svg.append('path')
      .datum(data.rmsd_values)
      .attr('fill', 'none')
      .attr('stroke', '#e94560')
      .attr('stroke-width', 2)
      .attr('d', line)

    const area = d3.area<number>()
      .x((_, i) => xScale(data.times[i]))
      .y0(chartHeight)
      .y1((d) => yScale(d))
      .curve(d3.curveMonotoneX)

    svg.append('path')
      .datum(data.rmsd_values)
      .attr('fill', 'url(#gradient)')
      .attr('d', area)

    const gradient = svg.append('defs')
      .append('linearGradient')
      .attr('id', 'gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%')

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#e94560')
      .attr('stop-opacity', 0.3)

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#e94560')
      .attr('stop-opacity', 0)

    svg.append('g')
      .attr('transform', `translate(0, ${chartHeight})`)
      .call(d3.axisBottom(xScale))
      .style('color', '#a0a0a0')
      .selectAll('text')
      .style('fill', '#a0a0a0')
      .style('font-size', '11px')

    svg.append('g')
      .call(d3.axisLeft(yScale))
      .style('color', '#a0a0a0')
      .selectAll('text')
      .style('fill', '#a0a0a0')
      .style('font-size', '11px')

    svg.selectAll('.domain').style('stroke', '#2d3748')
    svg.selectAll('.tick line').style('stroke', '#2d3748')

    svg.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -margin.left + 15)
      .attr('x', -chartHeight / 2)
      .attr('text-anchor', 'middle')
      .style('fill', '#a0a0a0')
      .style('font-size', '12px')
      .text(`RMSD (${data.units})`)

    svg.append('text')
      .attr('y', chartHeight + margin.bottom - 5)
      .attr('x', chartWidth / 2)
      .attr('text-anchor', 'middle')
      .style('fill', '#a0a0a0')
      .style('font-size', '12px')
      .text('Time (ps)')

    const tooltip = d3.select(containerRef.current)
      .append('div')
      .style('position', 'absolute')
      .style('padding', '8px')
      .style('background', 'rgba(0, 0, 0, 0.8)')
      .style('color', '#fff')
      .style('border-radius', '4px')
      .style('font-size', '12px')
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .style('z-index', 10)

    const bisect = d3.bisector((d: number) => data.times[data.rmsd_values.indexOf(d)]).left

    svg.append('rect')
      .attr('width', chartWidth)
      .attr('height', chartHeight)
      .attr('fill', 'transparent')
      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event)
        const x0 = xScale.invert(mx)
        const i = d3.bisect(data.times, x0) - 1
        if (i >= 0 && i < data.rmsd_values.length) {
          tooltip
            .style('opacity', 1)
            .style('left', `${mx + margin.left + 10}px`)
            .style('top', `${yScale(data.rmsd_values[i]) + margin.top - 10}px`)
            .html(`
              <div><strong>Time:</strong> ${data.times[i].toFixed(1)} ps</div>
              <div><strong>RMSD:</strong> ${data.rmsd_values[i].toFixed(3)} ${data.units}</div>
              <div><strong>Frame:</strong> ${data.frame_indices[i]}</div>
            `)
        }
      })
      .on('mouseout', () => tooltip.style('opacity', 0))

  }, [data, width, height])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: height }}>
      {(!data.times || data.times.length === 0) && (
        <div className="empty-state" style={{ height: height }}>
          <div className="icon">📊</div>
          <p>No RMSD data available</p>
        </div>
      )}
    </div>
  )
}
