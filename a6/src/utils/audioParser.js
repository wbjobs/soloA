import * as mm from 'music-metadata/lib/core'
import { parseBuffer } from 'music-metadata/lib/core'

const LANES = 4
const NOTE_TYPES = ['tap', 'hold']

export async function parseAudioFile(file) {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    const metadata = await parseBuffer(buffer, file.type)
    const audioContext = new (window.AudioContext || window.webkitAudioContext)()
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    
    const bpm = estimateBPM(audioBuffer)
    const duration = audioBuffer.duration
    
    const notes = generateNotesFromAudio(audioBuffer, bpm, duration)
    
    return {
      title: metadata.common.title || file.name.replace(/\.[^/.]+$/, ''),
      artist: metadata.common.artist || 'Unknown Artist',
      bpm: bpm,
      duration: duration,
      notes: notes,
      audioUrl: URL.createObjectURL(file),
      file: file
    }
  } catch (error) {
    console.error('解析音频文件失败:', error)
    throw error
  }
}

function estimateBPM(audioBuffer) {
  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  const windowSize = sampleRate * 0.05
  const steps = Math.floor(channelData.length / windowSize)
  
  let peaks = []
  
  for (let i = 0; i < steps; i++) {
    let sum = 0
    for (let j = 0; j < windowSize; j++) {
      const index = i * windowSize + j
      if (index < channelData.length) {
        sum += Math.abs(channelData[index])
      }
    }
    const average = sum / windowSize
    if (average > 0.1) {
      peaks.push(i * 0.05)
    }
  }
  
  if (peaks.length < 2) return 120
  
  let intervals = []
  for (let i = 1; i < peaks.length; i++) {
    const interval = peaks[i] - peaks[i - 1]
    if (interval > 0.2 && interval < 2) {
      intervals.push(interval)
    }
  }
  
  if (intervals.length === 0) return 120
  
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
  const bpm = Math.round(60 / avgInterval)
  
  return Math.max(60, Math.min(200, bpm))
}

function generateNotesFromAudio(audioBuffer, bpm, duration) {
  const notes = []
  const beatInterval = 60 / bpm
  const totalBeats = Math.floor(duration / beatInterval)
  
  const channelData = audioBuffer.getChannelData(0)
  const sampleRate = audioBuffer.sampleRate
  
  for (let beat = 0; beat < totalBeats; beat++) {
    const time = beat * beatInterval
    
    const sampleIndex = Math.floor(time * sampleRate)
    const windowSize = Math.floor(beatInterval * sampleRate)
    
    let energy = 0
    for (let i = 0; i < windowSize && sampleIndex + i < channelData.length; i++) {
      energy += Math.abs(channelData[sampleIndex + i])
    }
    energy /= windowSize
    
    if (energy > 0.05) {
      const lane = Math.floor(Math.random() * LANES)
      const type = Math.random() > 0.8 ? 'hold' : 'tap'
      
      if (type === 'hold') {
        const holdDuration = beatInterval * (Math.floor(Math.random() * 3) + 1)
        notes.push({
          id: `note_${beat}_${lane}`,
          time: time,
          lane: lane,
          type: 'hold',
          duration: holdDuration,
          endTime: time + holdDuration
        })
      } else {
        notes.push({
          id: `note_${beat}_${lane}`,
          time: time,
          lane: lane,
          type: 'tap'
        })
      }
    }
    
    if (beat % 2 === 0 && Math.random() > 0.6) {
      const lane = Math.floor(Math.random() * LANES)
      notes.push({
        id: `note_${beat}_extra_${lane}`,
        time: time + beatInterval * 0.5,
        lane: lane,
        type: 'tap'
      })
    }
  }
  
  notes.sort((a, b) => a.time - b.time)
  
  return notes
}

export function loadLocalSong(file) {
  return parseAudioFile(file)
}

export function createDemoSong() {
  const bpm = 120
  const duration = 30
  const beatInterval = 60 / bpm
  const notes = []
  
  for (let i = 0; i < 120; i++) {
    const time = i * beatInterval * 0.5
    const lane = i % LANES
    
    if (i % 4 === 0 && i > 0) {
      notes.push({
        id: `hold_${i}`,
        time: time,
        lane: lane,
        type: 'hold',
        duration: beatInterval,
        endTime: time + beatInterval
      })
    } else {
      notes.push({
        id: `tap_${i}`,
        time: time,
        lane: lane,
        type: 'tap'
      })
    }
  }
  
  return {
    title: 'Demo Song',
    artist: 'Rhythm Battle',
    bpm: bpm,
    duration: duration,
    notes: notes,
    isDemo: true
  }
}
