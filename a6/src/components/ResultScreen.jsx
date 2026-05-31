import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import { calculateGrade, calculateAccuracy } from '../utils/gameLogic'

function ResultScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { 
    score, 
    maxCombo, 
    perfectCount, 
    goodCount, 
    missCount,
    currentSong,
    isInBattle,
    songResults
  } = useGameStore()

  const [matchResult, setMatchResult] = useState(null)

  useEffect(() => {
    if (location.state?.matchResult) {
      setMatchResult(location.state.matchResult)
    }
  }, [location])

  const latestResult = songResults[songResults.length - 1]
  const grade = latestResult?.grade || calculateGrade(perfectCount, goodCount, missCount)
  const accuracy = latestResult?.accuracy || calculateAccuracy(perfectCount, goodCount, missCount)

  const getGradeColor = (g) => {
    switch (g) {
      case 'S': return 'text-yellow-400'
      case 'A': return 'text-green-400'
      case 'B': return 'text-blue-400'
      case 'C': return 'text-orange-400'
      case 'D': return 'text-red-400'
      default: return 'text-gray-400'
    }
  }

  const handleBackToMenu = () => {
    if (isInBattle) {
      navigate('/battle')
    } else {
      navigate('/songs')
    }
  }

  const handlePlayAgain = () => {
    navigate('/play')
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-game-bg via-indigo-950 to-game-bg">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-20 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20"></div>
      </div>

      <div className="relative z-10 w-full max-w-4xl p-8">
        {matchResult ? (
          <div className="text-center mb-8">
            <div className={`text-6xl font-bold mb-4 ${
              matchResult.winner === 'draw' ? 'text-yellow-400' :
              (matchResult.winner === 'host' && matchResult.host.name === matchResult.guest.name) ? 'text-purple-400' :
              (matchResult.host.name === matchResult.host.name ? 
                (matchResult.winner === 'host' ? 'text-green-400' : 'text-red-400') :
                (matchResult.winner === 'guest' ? 'text-green-400' : 'text-red-400')
              )
            }`}>
              {matchResult.winner === 'draw' ? '平局!' : '对战结束!'}
            </div>

            <div className="grid grid-cols-2 gap-8 mb-8">
              <div className={`p-6 rounded-xl ${
                matchResult.winner === 'host' ? 'bg-green-500/20 border-2 border-green-400' :
                matchResult.winner === 'draw' ? 'bg-yellow-500/10 border-2 border-yellow-400' :
                'bg-red-500/10 border-2 border-red-400/30'
              }`}>
                <div className="text-pink-400 text-sm mb-2">{matchResult.host.name}</div>
                <div className="text-4xl font-bold text-white mb-2">
                  {matchResult.host.finalScore?.toLocaleString()}
                </div>
                <div className="text-lg">
                  {matchResult.host.eloChange > 0 ? '+' : ''}{matchResult.host.eloChange} ELO
                </div>
              </div>

              <div className={`p-6 rounded-xl ${
                matchResult.winner === 'guest' ? 'bg-green-500/20 border-2 border-green-400' :
                matchResult.winner === 'draw' ? 'bg-yellow-500/10 border-2 border-yellow-400' :
                'bg-red-500/10 border-2 border-red-400/30'
              }`}>
                <div className="text-pink-400 text-sm mb-2">{matchResult.guest.name}</div>
                <div className="text-4xl font-bold text-white mb-2">
                  {matchResult.guest.finalScore?.toLocaleString()}
                </div>
                <div className="text-lg">
                  {matchResult.guest.eloChange > 0 ? '+' : ''}{matchResult.guest.eloChange} ELO
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">游戏结束</h1>
            <p className="text-gray-400">{currentSong?.title}</p>
          </div>
        )}

        <div className="bg-white/5 rounded-xl border border-purple-500/30 p-8 mb-8">
          <div className="grid grid-cols-3 gap-8 text-center">
            <div>
              <div className={`text-8xl font-bold ${getGradeColor(grade)} text-glow`}>
                {grade}
              </div>
              <div className="text-gray-400 mt-2">评级</div>
            </div>

            <div>
              <div className="text-5xl font-bold text-purple-400">
                {score.toLocaleString()}
              </div>
              <div className="text-gray-400 mt-2">得分</div>
            </div>

            <div>
              <div className="text-3xl font-bold text-white">
                {accuracy}%
              </div>
              <div className="text-gray-400 mt-2">准确率</div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 mt-8 pt-8 border-t border-white/10">
            <div className="text-center">
              <div className="text-3xl font-bold text-game-perfect">{perfectCount}</div>
              <div className="text-gray-400">Perfect</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-game-good">{goodCount}</div>
              <div className="text-gray-400">Good</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-game-miss">{missCount}</div>
              <div className="text-gray-400">Miss</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-400">{maxCombo}</div>
              <div className="text-gray-400">Max Combo</div>
            </div>
          </div>
        </div>

        <div className="flex justify-center gap-4">
          {!matchResult && (
            <button
              onClick={handlePlayAgain}
              className="px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xl font-semibold rounded-lg transition-all"
            >
              再玩一次
            </button>
          )}
          <button
            onClick={handleBackToMenu}
            className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white text-xl font-semibold rounded-lg transition-all"
          >
            {isInBattle ? '返回大厅' : '选择歌曲'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ResultScreen
