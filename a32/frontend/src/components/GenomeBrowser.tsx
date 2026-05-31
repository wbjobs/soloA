import { useState, useCallback } from 'react'
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

interface GenomeBrowserProps {
  chromosomes: Record<string, number>
  currentChromosome: string
  currentStart: number
  currentEnd: number
  onNavigate: (chromosome: string, start: number, end: number) => void
  children?: React.ReactNode
}

export function GenomeBrowser({
  chromosomes,
  currentChromosome,
  currentStart,
  currentEnd,
  onNavigate,
  children,
}: GenomeBrowserProps) {
  const [navInput, setNavInput] = useState('')
  const [regionInput, setRegionInput] = useState(
    `${currentChromosome}:${currentStart}-${currentEnd}`
  )

  const chromosomeNames = Object.keys(chromosomes).sort((a, b) => {
    const aNum = a.replace('chr', '')
    const bNum = b.replace('chr', '')

    if (!isNaN(Number(aNum)) && !isNaN(Number(bNum))) {
      return Number(aNum) - Number(bNum)
    }
    return a.localeCompare(b)
  })

  const span = currentEnd - currentStart
  const center = (currentStart + currentEnd) / 2

  const handleZoomIn = useCallback(() => {
    const newSpan = span / 2
    const newStart = Math.max(1, Math.floor(center - newSpan / 2))
    const newEnd = Math.floor(center + newSpan / 2)
    onNavigate(currentChromosome, newStart, newEnd)
  }, [center, span, currentChromosome, onNavigate])

  const handleZoomOut = useCallback(() => {
    const newSpan = span * 2
    const maxEnd = chromosomes[currentChromosome] || currentEnd
    const newStart = Math.max(1, Math.floor(center - newSpan / 2))
    const newEnd = Math.min(maxEnd, Math.ceil(center + newSpan / 2))
    onNavigate(currentChromosome, newStart, newEnd)
  }, [center, span, currentChromosome, chromosomes, onNavigate])

  const handlePanLeft = useCallback(() => {
    const panAmount = span * 0.25
    const newStart = Math.max(1, Math.floor(currentStart - panAmount))
    const newEnd = Math.floor(newStart + span)
    onNavigate(currentChromosome, newStart, newEnd)
  }, [currentStart, span, currentChromosome, onNavigate])

  const handlePanRight = useCallback(() => {
    const panAmount = span * 0.25
    const maxEnd = chromosomes[currentChromosome] || currentEnd
    const newEnd = Math.min(maxEnd, Math.ceil(currentEnd + panAmount))
    const newStart = Math.ceil(newEnd - span)
    onNavigate(currentChromosome, newStart, newEnd)
  }, [currentEnd, span, currentChromosome, chromosomes, onNavigate])

  const handleGoTo = useCallback(() => {
    const input = navInput.trim()

    const positionMatch = input.match(/^([a-zA-Z0-9]+):?(\d+)?-?(\d+)?$/)
    if (positionMatch) {
      let chrom = positionMatch[1]
      if (!chrom.startsWith('chr')) {
        chrom = 'chr' + chrom
      }

      if (!chromosomes[chrom]) {
        alert(`Chromosome ${chrom} not found`)
        return
      }

      const chromLength = chromosomes[chrom]
      let start: number
      let end: number

      if (positionMatch[2] && positionMatch[3]) {
        start = parseInt(positionMatch[2], 10)
        end = parseInt(positionMatch[3], 10)
      } else if (positionMatch[2]) {
        const pos = parseInt(positionMatch[2], 10)
        const defaultSpan = Math.min(10000, Math.floor(chromLength / 100))
        start = Math.max(1, pos - Math.floor(defaultSpan / 2))
        end = Math.min(chromLength, pos + Math.floor(defaultSpan / 2))
      } else {
        start = 1
        end = Math.min(chromLength, 100000)
      }

      if (start < 1) start = 1
      if (end > chromLength) end = chromLength
      if (start >= end) {
        end = Math.min(chromLength, start + 1000)
      }

      onNavigate(chrom, start, end)
    } else {
      alert(
        'Invalid format. Use format: "chr1:1000-2000" or "chr1" or just "1:1000"'
      )
    }
  }, [navInput, chromosomes, onNavigate])

  const formatPosition = (pos: number) => {
    return pos.toLocaleString()
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Chromosome:</label>
            <select
              value={currentChromosome}
              onChange={(e) => {
                const chrom = e.target.value
                const chromLength = chromosomes[chrom]
                const defaultSpan = Math.min(100000, Math.floor(chromLength / 100))
                onNavigate(chrom, 1, defaultSpan)
              }}
              className="input max-w-xs"
            >
              {chromosomeNames.map((chrom) => (
                <option key={chrom} value={chrom}>
                  {chrom} ({(chromosomes[chrom] / 1000000).toFixed(2)} Mb)
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Region:</span>
            <span className="font-mono text-sm bg-gray-100 px-3 py-1.5 rounded-lg">
              {currentChromosome}:{formatPosition(currentStart)}-
              {formatPosition(currentEnd)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Span:</span>
            <span className="font-mono text-sm bg-gray-100 px-3 py-1.5 rounded-lg">
              {(span / 1000).toFixed(1)} kb
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePanLeft}
              className="btn btn-secondary p-2"
              title="Pan Left"
            >
              <ChevronLeft size={20} />
            </button>

            <button
              onClick={handleZoomOut}
              className="btn btn-secondary p-2"
              title="Zoom Out"
            >
              <ZoomOut size={20} />
            </button>

            <button
              onClick={handleZoomIn}
              className="btn btn-secondary p-2"
              title="Zoom In"
            >
              <ZoomIn size={20} />
            </button>

            <button
              onClick={handlePanRight}
              className="btn btn-secondary p-2"
              title="Pan Right"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="flex-1 flex items-center gap-2">
            <input
              type="text"
              value={regionInput}
              onChange={(e) => setRegionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setNavInput(regionInput)
                  setTimeout(() => handleGoTo(), 0)
                }
              }}
              onFocus={(e) => {
                setNavInput(e.target.value)
              }}
              className="input flex-1 max-w-md"
              placeholder="e.g., chr1:1000000-2000000"
            />
            <button
              onClick={() => {
                setNavInput(regionInput)
                handleGoTo()
              }}
              className="btn btn-primary"
            >
              Go
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-4">
          <div className="flex gap-2">
            <button
              onClick={() => {
                const newSpan = 1000
                const newCenter = (currentStart + currentEnd) / 2
                onNavigate(
                  currentChromosome,
                  Math.max(1, Math.floor(newCenter - newSpan / 2)),
                  Math.ceil(newCenter + newSpan / 2)
                )
              }}
              className="btn btn-secondary text-xs"
            >
              1 kb
            </button>
            <button
              onClick={() => {
                const newSpan = 10000
                const newCenter = (currentStart + currentEnd) / 2
                onNavigate(
                  currentChromosome,
                  Math.max(1, Math.floor(newCenter - newSpan / 2)),
                  Math.ceil(newCenter + newSpan / 2)
                )
              }}
              className="btn btn-secondary text-xs"
            >
              10 kb
            </button>
            <button
              onClick={() => {
                const newSpan = 100000
                const newCenter = (currentStart + currentEnd) / 2
                onNavigate(
                  currentChromosome,
                  Math.max(1, Math.floor(newCenter - newSpan / 2)),
                  Math.ceil(newCenter + newSpan / 2)
                )
              }}
              className="btn btn-secondary text-xs"
            >
              100 kb
            </button>
            <button
              onClick={() => {
                const newSpan = 1000000
                const newCenter = (currentStart + currentEnd) / 2
                onNavigate(
                  currentChromosome,
                  Math.max(1, Math.floor(newCenter - newSpan / 2)),
                  Math.ceil(newCenter + newSpan / 2)
                )
              }}
              className="btn btn-secondary text-xs"
            >
              1 Mb
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2">{children}</div>
    </div>
  )
}
