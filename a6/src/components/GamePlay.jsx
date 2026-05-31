import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import { 
  getLaneForKey, 
  judgeNote, 
  JUDGEMENT,
  LANE_DISPLAY,
  LANE_KEYS,
  calculateGrade,
  calculateAccuracy,
  FALL_SPEED,
  JUDGEMENT_LINE_Y
} from '../utils/gameLogic'
import { emit, on, off, isConnected } from '../utils/socket'

const GAME_LOGIC_INTERVAL = 16

function GamePlay() {
  const navigate = useNavigate()
  const { 
    currentSong, 
    notes, 
    score, 
    combo, 
    perfectCount,
    goodCount,
    missCount,
    maxCombo,
    isPlaying,
    startGame,
    endGame,
    addHit,
    addMiss,
    isInBattle,
    addResult
  } = useGameStore()

  const [activeNotes, setActiveNotes] = useState([])
  const [pressedLanes, setPressedLanes] = useState([false, false, false, false])
  const [hitEffects, setHitEffects] = useState([])
  const [lastJudgement, setLastJudgement] = useState(null)
  const [countdown, setCountdown] = useState(3)
  const [gameStarted, setGameStarted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [reconnecting, setReconnecting] = useState(false)

  const gameRef = useRef(null)
  const audioRef = useRef(null)
  const animationRef = useRef(null)
  const gameIntervalRef = useRef(null)
  const noteIndexRef = useRef(0)
  const startTimeRef = useRef(0)
  const processedNotesRef = useRef(new Set())
  const activeNotesRef = useRef([])
  const holdNotesRef = useRef({})
  const lastFrameTimeRef = useRef(0)
  const accumulatedTimeRef = useRef(0)
  const gameEndedRef = useRef(false)
  const pendingMissCheckRef = useRef(null)

  useEffect(() => {
    if (!currentSong) {
      navigate('/songs')
      return
    }

    gameEndedRef.current = false

    let countdownTimer
    if (countdown > 0) {
      countdownTimer = setTimeout(() => {
        setCountdown(countdown - 1)
      }, 1000)
    } else if (countdown === 0 && !gameStarted) {
      startGame()
      setGameStarted(true)
      startTimeRef.current = performance.now()
      lastFrameTimeRef.current = performance.now()
      accumulatedTimeRef.current = 0
      noteIndexRef.current = 0
      processedNotesRef.current = new Set()
      activeNotesRef.current = []
      
      if (audioRef.current && !currentSong.isDemo) {
        audioRef.current.currentTime = 0
        audioRef.current.play().catch(e => console.log('音频播放失败:', e))
      }
      
      startGameLoop()
    }

    return () => {
      if (countdownTimer) clearTimeout(countdownTimer)
    }
  }, [countdown, gameStarted, currentSong])

  useEffect(() => {
    if (!isInBattle) return

    on('fullScoreSync', (data) => {
      console.log('Received full score sync:', data)
    })

    on('playerDisconnected', (data) => {
      setReconnecting(true)
      console.log('Opponent disconnected:', data.name)
    })

    on('playerReconnected', (data) => {
      setReconnecting(false)
      emit('requestFullScore')
      console.log('Opponent reconnected:', data.name)
    })

    return () => {
      off('fullScoreSync')
      off('playerDisconnected')
      off('playerReconnected')
    }
  }, [isInBattle])

  const updateGameLogic = useCallback((deltaTime) => {
    if (!currentSong || gameEndedRef.current) return

    const elapsed = (performance.now() - startTimeRef.current) / 1000
    setCurrentTime(elapsed)

    const newActiveNotes = []
    
    while (
      noteIndexRef.current < notes.length &&
      notes[noteIndexRef.current].time <= elapsed + 2
    ) {
      const note = notes[noteIndexRef.current]
      if (!processedNotesRef.current.has(note.id)) {
        newActiveNotes.push({
          ...note,
          hit: false,
          missed: false,
          addedTime: elapsed
        })
      }
      noteIndexRef.current++
    }

    if (newActiveNotes.length > 0) {
      activeNotesRef.current = [...activeNotesRef.current, ...newActiveNotes]
    }

    const missWindow = 0.2
    let hasMisses = false
    
    activeNotesRef.current = activeNotesRef.current.map(note => {
      if (note.hit || note.missed) return note
      
      const noteAge = elapsed - note.time
      if (noteAge > missWindow) {
        if (!processedNotesRef.current.has(note.id)) {
          processedNotesRef.current.add(note.id)
          hasMisses = true
          addMiss()
          setLastJudgement(JUDGEMENT.MISS)
          const judgementTimeout = setTimeout(() => setLastJudgement(null), 500)
          return { ...note, missed: true, judgementTimeout }
        }
        return { ...note, missed: true }
      }
      return note
    })

    activeNotesRef.current = activeNotesRef.current.filter(note => 
      elapsed - note.time < 1
    )

    setActiveNotes([...activeNotesRef.current])

    if (elapsed >= currentSong.duration + 2) {
      finishGame()
      return
    }

    if (isInBattle && isConnected()) {
      const { score: currentScore, combo: currentCombo } = useGameStore.getState()
      emit('updateScore', { score: currentScore, combo: currentCombo })
    }
  }, [currentSong, notes, addMiss, isInBattle])

  const renderLoop = useCallback(() => {
    if (gameEndedRef.current) return

    const now = performance.now()
    const frameTime = now - lastFrameTimeRef.current
    lastFrameTimeRef.current = now

    accumulatedTimeRef.current += frameTime

    while (accumulatedTimeRef.current >= GAME_LOGIC_INTERVAL) {
      updateGameLogic(GAME_LOGIC_INTERVAL)
      accumulatedTimeRef.current -= GAME_LOGIC_INTERVAL
    }

    animationRef.current = requestAnimationFrame(renderLoop)
  }, [updateGameLogic])

  const startGameLoop = useCallback(() => {
    lastFrameTimeRef.current = performance.now()
    animationRef.current = requestAnimationFrame(renderLoop)
  }, [renderLoop])

  const finishGame = useCallback(() => {
    if (gameEndedRef.current) return
    gameEndedRef.current = true

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }
    if (gameIntervalRef.current) {
      clearInterval(gameIntervalRef.current)
    }
    if (audioRef.current) {
      audioRef.current.pause()
    }
    
    endGame()
    
    const finalState = useGameStore.getState()
    const result = {
      score: finalState.score,
      maxCombo: finalState.maxCombo,
      perfectCount: finalState.perfectCount,
      goodCount: finalState.goodCount,
      missCount: finalState.missCount,
      grade: calculateGrade(finalState.perfectCount, finalState.goodCount, finalState.missCount),
      accuracy: calculateAccuracy(finalState.perfectCount, finalState.goodCount, finalState.missCount)
    }
    addResult(result)
    
    if (isInBattle) {
      emit('gameEnd', { score: finalState.score, results: result })
    }
    
    navigate('/result')
  }, [endGame, addResult, isInBattle])

  const handleKeyDown = useCallback((e) => {
    if (!gameStarted || countdown > 0) return
    
    const lane = getLaneForKey(e.code)
    if (lane === null) return
    
    if (e.repeat) return
    
    setPressedLanes(prev => {
      const newPressed = [...prev]
      newPressed[lane] = true
      return newPressed
    })

    const elapsed = (performance.now() - startTimeRef.current) / 1000

    let hitNote = null
    let bestTime = Infinity
    let judgement = null

    for (const note of activeNotesRef.current) {
      if (note.lane !== lane || note.hit || note.missed) continue
      
      const timeDiff = Math.abs(note.time - elapsed)
      const j = judgeNote(note.time, elapsed)
      
      if (j && timeDiff < bestTime) {
        bestTime = timeDiff
        judgement = j
        hitNote = note
      }
    }

    if (hitNote && judgement !== JUDGEMENT.MISS) {
      processedNotesRef.current.add(hitNote.id)
      addHit(judgement)
      
      setLastJudgement(judgement)
      setTimeout(() => setLastJudgement(null), 300)
      
      setHitEffects(prev => [...prev, {
        id: Date.now(),
        lane,
        type: judgement
      }])
      
      activeNotesRef.current = activeNotesRef.current.map(note => 
        note.id === hitNote.id ? { ...note, hit: true } : note
      )
      setActiveNotes([...activeNotesRef.current])
    }
  }, [gameStarted, countdown, addHit])

  const handleKeyUp = useCallback((e) => {
    const lane = getLaneForKey(e.code)
    if (lane === null) return
    
    setPressedLanes(prev => {
      const newPressed = [...prev]
      newPressed[lane] = false
      return newPressed
    })
  }, [])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      if (gameIntervalRef.current) {
        clearInterval(gameIntervalRef.current)
      }
    }
  }, [handleKeyDown, handleKeyUp])

  useEffect(() => {
    const timer = setTimeout(() => {
      setHitEffects(prev => prev.slice(-10))
    }, 500)
    return () => clearTimeout(timer)
  }, [hitEffects])

  const getNotePosition = (note, gameHeight) => {
    const elapsed = (performance.now() - startTimeRef.current) / 1000
    const timeUntilHit = note.time - elapsed
    const y = (JUDGEMENT_LINE_Y - timeUntilHit * (FALL_SPEED / gameHeight)) * gameHeight
    return y
  }

  const getJudgementColor = (type) => {
    switch (type) {
      case 'perfect': return 'text-game-perfect'
      case 'good': return 'text-game-good'
      case 'miss': return 'text-game-miss'
      default: return 'text-white'
    }
  }

  const getJudgementText = (type) => {
    switch (type) {
      case 'perfect': return 'PERFECT!'
      case 'good': return 'GOOD'
      case 'miss': return 'MISS'
      default: return ''
    }
  }

  return (
    <div className="w-full h-full bg-game-bg relative overflow-hidden" ref={gameRef}>
      {!currentSong?.isDemo && (
        <audio ref={audioRef} src={currentSong?.audioUrl} />
      )}

      {countdown > 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/50">
          <div className="text-8xl font-bold text-white text-glow animate-pulse">
            {countdown}
          </div>
        </div>
      )}

      {reconnecting && (
        <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 bg-yellow-500/90 text-black font-bold rounded-lg animate-pulse">
          对手断线，等待重连...
        </div>
      )}

      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-40">
        <div className="text-white">
          <div className="text-lg text-gray-400">得分</div>
          <div className="text-4xl font-bold text-purple-400">{score.toLocaleString()}</div>
        </div>

        {lastJudgement && (
          <div className={`text-3xl font-bold ${getJudgementColor(lastJudgement)} combo-popup text-glow`}>
            {getJudgementText(lastJudgement)}
          </div>
        )}

        <div className="text-right">
          <div className="text-lg text-gray-400">连击</div>
          <div className={`text-4xl font-bold ${combo > 10 ? 'text-yellow-400 text-glow' : 'text-white'}`}>
            {combo}
          </div>
        </div>
      </div>

      {isInBattle && (
        <div className="absolute top-24 right-6 z-40 text-right bg-black/30 rounded-lg p-3">
          <div className="text-sm text-pink-400">对手</div>
          <div className="text-2xl font-bold text-white">{useGameStore.getState().opponentScore.toLocaleString()}</div>
          <div className="text-sm text-gray-400">连击: {useGameStore.getState().opponentCombo}</div>
        </div>
      )}

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-96 h-full" style={{ background: 'linear-gradient(180deg, rgba(99,102,241,0.1) 0%, rgba(99,102,241,0.2) 100%)' }}>
          <div className="absolute inset-0 flex">
            {[0, 1, 2, 3].map(lane => (
              <div 
                key={lane}
                className={`flex-1 border-r border-purple-500/20 last:border-r-0 ${
                  pressedLanes[lane] ? 'bg-white/10' : ''
                } transition-colors duration-75`}
              />
            ))}
          </div>

          {activeNotes.map(note => {
            const gameHeight = window.innerHeight
            const y = getNotePosition(note, gameHeight)
            if (y < -50 || y > gameHeight + 50) return null
            
            const laneWidth = 384 / 4
            const x = note.lane * laneWidth
            
            if (note.type === 'hold') {
              const height = (note.duration / (FALL_SPEED / gameHeight)) * 100
              return (
                <div
                  key={note.id}
                  className={`absolute rounded transition-opacity ${note.hit ? 'opacity-0' : 'opacity-100'}`}
                  style={{
                    left: x + 4,
                    top: y - height,
                    width: laneWidth - 8,
                    height: height,
                    background: `linear-gradient(180deg, rgba(168,85,247,0.3) 0%, rgba(168,85,247,0.8) 100%)`,
                    boxShadow: '0 0 10px rgba(168,85,247,0.5)'
                  }}
                />
              )
            }
            
            return (
              <div
                key={note.id}
                className={`absolute rounded-lg transition-opacity ${note.hit ? 'opacity-0' : 'opacity-100'}`}
                style={{
                  left: x + 4,
                  top: y - 15,
                  width: laneWidth - 8,
                  height: 30,
                  background: 'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
                  boxShadow: '0 0 15px rgba(168,85,247,0.6)'
                }}
              />
            )
          })}

          {hitEffects.map(effect => (
            <div
              key={effect.id}
              className={`absolute hit-effect rounded-full ${
                effect.type === 'perfect' ? 'bg-game-perfect' : 'bg-game-good'
              }`}
              style={{
                left: effect.lane * (384 / 4),
                top: window.innerHeight * JUDGEMENT_LINE_Y - 30,
                width: 384 / 4,
                height: 60,
                opacity: 0.5
              }}
            />
          ))}

          <div 
            className="absolute left-0 right-0 h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500"
            style={{ top: `${JUDGEMENT_LINE_Y * 100}%` }}
          />

          <div 
            className="absolute left-0 right-0 h-16 flex"
            style={{ top: `${JUDGEMENT_LINE_Y * 100}%`, marginTop: '-32px' }}
          >
            {[0, 1, 2, 3].map(lane => (
              <div 
                key={lane}
                className={`flex-1 flex items-center justify-center border border-purple-500/30 ${
                  pressedLanes[lane] 
                    ? 'bg-purple-500/40 scale-95' 
                    : 'bg-purple-500/20'
                } transition-all duration-75`}
              >
                <span className={`text-2xl font-bold ${
                  pressedLanes[lane] ? 'text-white' : 'text-purple-300'
                }`}>
                  {LANE_DISPLAY[lane]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 left-6 text-gray-500 text-sm">
        <div>P: {perfectCount} | G: {goodCount} | M: {missCount}</div>
        <div>Max Combo: {maxCombo}</div>
      </div>

      <div className="absolute bottom-6 right-6 text-gray-500 text-sm">
        <div>{currentTime.toFixed(1)}s / {currentSong?.duration.toFixed(1)}s</div>
      </div>
    </div>
  )
}

export default GamePlay
