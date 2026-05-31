export const JUDGEMENT = {
  PERFECT: 'perfect',
  GOOD: 'good',
  MISS: 'miss'
}

export const JUDGEMENT_WINDOWS = {
  perfect: 0.05,
  good: 0.12,
  miss: 0.2
}

export const LANE_KEYS = ['KeyD', 'KeyF', 'KeyJ', 'KeyK']
export const LANE_DISPLAY = ['D', 'F', 'J', 'K']

export function judgeNote(noteTime, currentTime) {
  const timeDiff = Math.abs(noteTime - currentTime)
  
  if (timeDiff <= JUDGEMENT_WINDOWS.perfect) {
    return JUDGEMENT.PERFECT
  } else if (timeDiff <= JUDGEMENT_WINDOWS.good) {
    return JUDGEMENT.GOOD
  } else if (timeDiff <= JUDGEMENT_WINDOWS.miss) {
    return JUDGEMENT.MISS
  }
  
  return null
}

export function getLaneForKey(keyCode) {
  const index = LANE_KEYS.indexOf(keyCode)
  return index !== -1 ? index : null
}

export function calculateGrade(perfectCount, goodCount, missCount) {
  const total = perfectCount + goodCount + missCount
  if (total === 0) return 'F'
  
  const accuracy = (perfectCount * 1 + goodCount * 0.5) / total
  
  if (accuracy >= 0.95) return 'S'
  if (accuracy >= 0.90) return 'A'
  if (accuracy >= 0.80) return 'B'
  if (accuracy >= 0.70) return 'C'
  if (accuracy >= 0.60) return 'D'
  return 'F'
}

export function calculateAccuracy(perfectCount, goodCount, missCount) {
  const total = perfectCount + goodCount + missCount
  if (total === 0) return 0
  
  const points = perfectCount * 100 + goodCount * 50
  const maxPoints = total * 100
  
  return (points / maxPoints * 100).toFixed(2)
}

export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export const FALL_SPEED = 300
export const JUDGEMENT_LINE_Y = 0.85
