import { useEffect, useRef } from 'react'
import {
  Chart,
  ChartConfiguration,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import type { SeismogramPoint } from '../types'

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
)

interface SeismogramChartProps {
  data: SeismogramPoint
}

export function SeismogramChart({ data }: SeismogramChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return

    if (chartRef.current) {
      chartRef.current.destroy()
    }

    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return

    const labels = data.time.map((t) => t.toFixed(3))

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Ux (X displacement)',
            data: data.ux,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            tension: 0.1,
          },
          {
            label: 'Uy (Y displacement)',
            data: data.uy,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            tension: 0.1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index',
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: '#e2e8f0',
              font: {
                size: 12,
              },
            },
          },
          tooltip: {
            backgroundColor: '#1e293b',
            titleColor: '#f1f5f9',
            bodyColor: '#cbd5e1',
            borderColor: '#334155',
            borderWidth: 1,
          },
        },
        scales: {
          x: {
            display: true,
            title: {
              display: true,
              text: 'Time (s)',
              color: '#94a3b8',
            },
            ticks: {
              color: '#94a3b8',
              maxTicksLimit: 10,
            },
            grid: {
              color: '#334155',
            },
          },
          y: {
            display: true,
            title: {
              display: true,
              text: 'Displacement',
              color: '#94a3b8',
            },
            ticks: {
              color: '#94a3b8',
            },
            grid: {
              color: '#334155',
            },
          },
        },
      },
    }

    chartRef.current = new Chart(ctx, config)

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
      }
    }
  }, [data])

  return (
    <div className="h-64 w-full">
      <canvas ref={canvasRef} />
    </div>
  )
}
