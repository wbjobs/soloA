import { create } from 'zustand'

interface GenomeViewState {
  sampleId: string | null
  chromosome: string
  start: number
  end: number
  chromosomes: Record<string, number>
  selectedVariant: string | null
  zoomIn: () => void
  zoomOut: () => void
  panLeft: () => void
  panRight: () => void
  setRegion: (chromosome: string, start: number, end: number) => void
  setSample: (sampleId: string) => void
  setChromosomes: (chromosomes: Record<string, number>) => void
  setSelectedVariant: (variantId: string | null) => void
}

const DEFAULT_CHROMOSOMES: Record<string, number> = {
  chr1: 248956422,
  chr2: 242193529,
  chr3: 198295559,
  chr4: 190214555,
  chr5: 181538259,
  chr6: 170805979,
  chr7: 159345973,
  chr8: 145138636,
  chr9: 138394717,
  chr10: 133797422,
  chr11: 135086622,
  chr12: 133275309,
  chr13: 114364328,
  chr14: 107043718,
  chr15: 101991189,
  chr16: 90338345,
  chr17: 83257441,
  chr18: 80373285,
  chr19: 58617616,
  chr20: 64444167,
  chr21: 46709983,
  chr22: 50818468,
  chrX: 156040895,
  chrY: 57227415,
}

export const useGenomeStore = create<GenomeViewState>((set, get) => ({
  sampleId: null,
  chromosome: 'chr1',
  start: 1000000,
  end: 2000000,
  chromosomes: DEFAULT_CHROMOSOMES,
  selectedVariant: null,

  zoomIn: () => {
    const { start, end } = get()
    const center = (start + end) / 2
    const newSpan = (end - start) / 2
    set({
      start: Math.floor(center - newSpan / 2),
      end: Math.ceil(center + newSpan / 2),
    })
  },

  zoomOut: () => {
    const { start, end, chromosomes, chromosome } = get()
    const center = (start + end) / 2
    const newSpan = (end - start) * 2
    const maxEnd = chromosomes[chromosome] || end
    const newStart = Math.max(1, Math.floor(center - newSpan / 2))
    const newEnd = Math.min(maxEnd, Math.ceil(center + newSpan / 2))
    set({ start: newStart, end: newEnd })
  },

  panLeft: () => {
    const { start, end } = get()
    const span = end - start
    const panAmount = span * 0.25
    const newStart = Math.max(1, Math.floor(start - panAmount))
    const newEnd = Math.floor(newStart + span)
    set({ start: newStart, end: newEnd })
  },

  panRight: () => {
    const { start, end, chromosomes, chromosome } = get()
    const span = end - start
    const panAmount = span * 0.25
    const maxEnd = chromosomes[chromosome] || end
    const newEnd = Math.min(maxEnd, Math.ceil(end + panAmount))
    const newStart = Math.ceil(newEnd - span)
    set({ start: newStart, end: newEnd })
  },

  setRegion: (chromosome: string, start: number, end: number) => {
    set({ chromosome, start, end })
  },

  setSample: (sampleId: string) => {
    set({ sampleId })
  },

  setChromosomes: (chromosomes: Record<string, number>) => {
    set({ chromosomes })
  },

  setSelectedVariant: (variantId: string | null) => {
    set({ selectedVariant: variantId })
  },
}))
