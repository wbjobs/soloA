import { useEffect, useRef, useMemo } from 'react';
import * as d3 from 'd3';
import type { SpectrumData } from '../types';

interface SpectrumChartProps {
  data: SpectrumData | null;
  identifiedLines?: Array<{
    observed_wavelength: number;
    name: string;
    line_type: 'emission' | 'absorption';
  }>;
}

export default function SpectrumChart({ data, identifiedLines = [] }: SpectrumChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const dimensions = useMemo(() => ({
    margin: { top: 40, right: 30, bottom: 60, left: 60 },
    width: 800,
    height: 400
  }), []);

  useEffect(() => {
    if (!svgRef.current || !data || !data.wavelengths.length) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const { margin, width, height } = dimensions;
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    const x = d3.scaleLinear()
      .domain([d3.min(data.wavelengths)!, d3.max(data.wavelengths)!])
      .range([0, chartWidth]);

    const yMin = d3.min(data.fluxes)!;
    const yMax = d3.max(data.fluxes)!;
    const yPadding = (yMax - yMin) * 0.1;
    const y = d3.scaleLinear()
      .domain([yMin - yPadding, yMax + yPadding])
      .range([chartHeight, 0]);

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x)
        .ticks(10)
        .tickSize(-chartHeight)
        .tickFormat('')
      )
      .selectAll('line')
      .style('stroke', 'rgba(255,255,255,0.1)');

    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y)
        .ticks(6)
        .tickSize(-chartWidth)
        .tickFormat('')
      )
      .selectAll('line')
      .style('stroke', 'rgba(255,255,255,0.1)');

    const line = d3.line<number>()
      .x((d, i) => x(data.wavelengths[i]))
      .y((d) => y(d))
      .curve(d3.curveMonotoneX);

    const gradient = svg.append('defs')
      .append('linearGradient')
      .attr('id', 'spectrum-gradient')
      .attr('x1', '0%')
      .attr('x2', '100%');

    gradient.append('stop').attr('offset', '0%').attr('stop-color', '#6666ff');
    gradient.append('stop').attr('offset', '30%').attr('stop-color', '#aaffff');
    gradient.append('stop').attr('offset', '50%').attr('stop-color', '#ffffaa');
    gradient.append('stop').attr('offset', '70%').attr('stop-color', '#ffaa66');
    gradient.append('stop').attr('offset', '100%').attr('stop-color', '#ff6666');

    g.append('path')
      .datum(data.fluxes)
      .attr('fill', 'none')
      .attr('stroke', 'url(#spectrum-gradient)')
      .attr('stroke-width', 1.5)
      .attr('d', line);

    g.append('g')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(d3.axisBottom(x)
        .ticks(10)
        .tickFormat((d) => d.toFixed(0))
      )
      .selectAll('text')
      .style('fill', '#9ca3af')
      .style('font-size', '11px');

    g.append('g')
      .call(d3.axisLeft(y)
        .ticks(6)
        .tickFormat((d) => d.toFixed(2))
      )
      .selectAll('text')
      .style('fill', '#9ca3af')
      .style('font-size', '11px');

    g.append('text')
      .attr('transform', `translate(${chartWidth / 2},${chartHeight + 40})`)
      .attr('text-anchor', 'middle')
      .style('fill', '#d1d5db')
      .style('font-size', '12px')
      .text(`波长 (${data.wavelength_unit})`);

    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', -margin.left + 15)
      .attr('x', -chartHeight / 2)
      .attr('text-anchor', 'middle')
      .style('fill', '#d1d5db')
      .style('font-size', '12px')
      .text('相对流量');

    identifiedLines.forEach((lineInfo) => {
      if (lineInfo.observed_wavelength < x.domain()[0] || lineInfo.observed_wavelength > x.domain()[1]) return;

      const xPos = x(lineInfo.observed_wavelength);
      const isEmission = lineInfo.line_type === 'emission';
      const color = isEmission ? '#ff6b6b' : '#4ecdc4';

      g.append('line')
        .attr('x1', xPos)
        .attr('y1', 0)
        .attr('x2', xPos)
        .attr('y2', chartHeight)
        .attr('stroke', color)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,4')
        .attr('opacity', 0.6);

      g.append('text')
        .attr('x', xPos)
        .attr('y', -8)
        .attr('text-anchor', 'middle')
        .style('fill', color)
        .style('font-size', '10px')
        .text(lineInfo.name);
    });

    if (data.redshift) {
      g.append('text')
        .attr('x', chartWidth - 10)
        .attr('y', 20)
        .attr('text-anchor', 'end')
        .style('fill', '#fbbf24')
        .style('font-size', '12px')
        .style('font-weight', 'bold')
        .text(`z = ${data.redshift.toFixed(4)}`);
    }

  }, [data, identifiedLines, dimensions]);

  if (!data) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-space-900 rounded-lg">
        <div className="text-gray-500">
          请选择一颗恒星查看光谱
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full overflow-x-auto">
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="bg-space-900 rounded-lg"
      />
    </div>
  );
}
