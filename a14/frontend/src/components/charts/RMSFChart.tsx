import { useEffect, useRef } from 'react'
import * as d3 from 'd3'
import type { RMSFResult } from '../types'

interface RMSFChartProps {
  data: RMSFResult
  width?: number
  height?: number
  mode?: 'atom' | 'residue'
}

export function RMSFChart({ data, width = 800, height = 300, mode = 'residue' }: RMSFChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const values = mode === 'residue' ? data.residue_rmsf_values : data.atom_rmsf_values
    const labels = mode === 'residue' ? data.residue_ids : data.atom_indices

    if (!values || values.length === 0) return

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

    const xScale = d3.scaleBand()
      .domain(labels.map((_, i) => i.toString()))
      .range([0, chartWidth])
      .padding(0.1)

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(values) || 1])
      .range([chartHeight, 0])
      .nice()

    svg.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-chartWidth).tickFormat(() => ''))
      .selectAll('line')
      .style('stroke', '#2d3748')

    const barColor = '#4ade80'

    svg.selectAll('.bar')
      .data(values)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', (_, i) => xScale(i.toString()) || 0)
      .attr('y', (d) => yScale(d))
      .attr('width', xScale.bandwidth())
      .attr('height', (d) => chartHeight - yScale(d))
      .attr('fill', barColor)
      .attr('rx', 2)

    svg.append('g')
      .attr('transform', `translate(0, ${chartHeight})`)
      .call(d3.axisBottom(xScale).tickFormat((_, i) => {
        const step = Math.ceil(labels.length / 10)
        return i % step === 0 ? labels[i].toString() : ''
      }))
      .style('color', '#a0a0a0')
      .selectAll('text')
      .style('fill', '#a0a0a0')
      .style('font-size', '10px')

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
      .text(`RMSF (${data.units})`)

    svg.append('text')
      .attr('y', chartHeight + margin.bottom - 5)
      .attr('x', chartWidth / 2)
      .attr('text-anchor', 'middle')
      .style('fill', '#a0a0a0')
      .style('font-size', '12px')
      .text(mode === 'residue' ? 'Residue ID' : 'Atom Index')

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

    svg.selectAll('.bar')
      .on('mousemove', function (event, d, i) {
        const idx = i
        const extraInfo = mode === 'residue'
          ? `<div><strong>Residue:</strong> ${data.residue_names?.[idx] || labels[idx]}</div>`
          : `<div><strong>Atom:</strong> ${data.atom_names?.[idx] || labels[idx]}</div>`

        tooltip
          .style('opacity', 1)
          .style('left', `${event.offsetX + margin.left + 10}px`)
          .style('top', `${yScale(d) + margin.top - 10}px`)
          .html(`
            ${extraInfo}
            <div><strong>ID:</strong> ${labels[idx]}</div>
            <div><strong>RMSF:</strong> ${d.toFixed(3)} ${data.units}</div>
          `)
      })
      .on('mouseout', () => tooltip.style('opacity', 0))

  }, [data, width, height, mode])

  const values = mode === 'residue' ? data.residue_rmsf_values : data.atom_rmsf_values

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: height }}>
      {(!values || values.length === 0) && (
        <div className="empty-state" style={{ height: height }}>
          <div className="icon">📊</div>
          <p>No RMSF data available</p>
        </div>
      )}
    </div>
  )
}
