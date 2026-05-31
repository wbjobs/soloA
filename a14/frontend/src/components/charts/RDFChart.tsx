import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { RDFResult } from '../types'

interface RDFChartProps {
  data: RDFResult
  width?: number
  height?: number
}

export function RDFChart({ data, width = 800, height = 300 }: RDFChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !data.r_values.length) return

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
      .domain([d3.min(data.r_values) || 0, d3.max(data.r_values) || 15])
      .range([0, chartWidth])

    const yMax = Math.max(d3.max(data.gofr) || 1, 1.1)
    const yScale = d3.scaleLinear()
      .domain([0, yMax])
      .range([chartHeight, 0])
      .nice()

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

    svg.append('line')
      .attr('x1', 0)
      .attr('x2', chartWidth)
      .attr('y1', yScale(1))
      .attr('y2', yScale(1))
      .attr('stroke', '#666')
      .attr('stroke-width', 1)
      .attr('stroke-dasharray', '4,4')

    const line = d3.line<{ r: number; g: number }>()
      .x((d) => xScale(d.r))
      .y((d) => yScale(d.g))
      .curve(d3.curveMonotoneX)

    const lineData = data.r_values.map((r, i) => ({ r, g: data.gofr[i] }))

    const area = d3.area<{ r: number; g: number }>()
      .x((d) => xScale(d.r))
      .y0(chartHeight)
      .y1((d) => yScale(d.g))
      .curve(d3.curveMonotoneX)

    svg.append('path')
      .datum(lineData)
      .attr('fill', 'url(#rdf-gradient)')
      .attr('d', area)

    svg.append('path')
      .datum(lineData)
      .attr('fill', 'none')
      .attr('stroke', '#60a5fa')
      .attr('stroke-width', 2)
      .attr('d', line)

    const gradient = svg.append('defs')
      .append('linearGradient')
      .attr('id', 'rdf-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%')

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#60a5fa')
      .attr('stop-opacity', 0.3)

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#60a5fa')
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
      .text('g(r)')

    svg.append('text')
      .attr('y', chartHeight + margin.bottom - 5)
      .attr('x', chartWidth / 2)
      .attr('text-anchor', 'middle')
      .style('fill', '#a0a0a0')
      .style('font-size', '12px')
      .text(`r (${data.units})`)

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

    svg.append('rect')
      .attr('width', chartWidth)
      .attr('height', chartHeight)
      .attr('fill', 'transparent')
      .on('mousemove', function (event) {
        const [mx] = d3.pointer(event)
        const x0 = xScale.invert(mx)
        const i = d3.bisect(data.r_values, x0) - 1
        if (i >= 0 && i < data.gofr.length) {
          tooltip
            .style('opacity', 1)
            .style('left', `${mx + margin.left + 10}px`)
            .style('top', `${yScale(data.gofr[i]) + margin.top - 10}px`)
            .html(`
              <div><strong>r:</strong> ${data.r_values[i].toFixed(2)} ${data.units}</div>
              <div><strong>g(r):</strong> ${data.gofr[i].toFixed(3)}</div>
              <div><strong>Count:</strong> ${data.histogram[i]}</div>
            `)
        }
      })
      .on('mouseout', () => tooltip.style('opacity', 0))

  }, [data, width, height])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: height }}>
      {(!data.r_values || data.r_values.length === 0) && (
        <div className="empty-state" style={{ height: height }}>
          <div className="icon">📊</div>
          <p>No RDF data available</p>
        </div>
      )}
    </div>
  )
}
