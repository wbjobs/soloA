import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import { initSocket, emit } from '../utils/socket'

function MainMenu() {
  const navigate = useNavigate()
  const [playerName, setPlayerName] = useState('')
  const { setPlayer, currentPlayer } = useGameStore()

  const handleStartGame = () => {
    if (!playerName.trim()) {
      alert('请输入玩家名称')
      return
    }
    
    initSocket()
    
    emit('register', { name: playerName.trim() })
    
    setPlayer({
      ...currentPlayer,
      name: playerName.trim()
    })
    
    navigate('/songs')
  }

  const handleBattleMode = () => {
    if (!playerName.trim()) {
      alert('请输入玩家名称')
      return
    }
    
    initSocket()
    
    emit('register', { name: playerName.trim() })
    
    setPlayer({
      ...currentPlayer,
      name: playerName.trim()
    })
    
    navigate('/battle')
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-game-bg via-indigo-950 to-game-bg">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-20 w-64 h-64 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-64 h-64 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '1s' }}></div>
      </div>
      
      <div className="relative z-10 text-center">
        <h1 className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 mb-4 text-glow">
          RHYTHM BATTLE
        </h1>
        <p className="text-xl text-gray-400 mb-12">节奏对战 - 1v1 音游对决</p>
        
        <div className="mb-8">
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="输入你的名字..."
            className="w-64 px-6 py-3 bg-white/10 border border-purple-500/30 rounded-lg text-white text-center text-lg placeholder-gray-500 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/50"
            maxLength={20}
          />
        </div>
        
        <div className="space-y-4">
          <button
            onClick={handleStartGame}
            className="w-64 px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xl font-semibold rounded-lg shadow-lg hover:shadow-purple-500/50 transform hover:scale-105 transition-all duration-300"
          >
            🎵 单人模式
          </button>
          
          <button
            onClick={handleBattleMode}
            className="w-64 px-8 py-4 bg-gradient-to-r from-pink-600 to-red-600 hover:from-pink-500 hover:to-red-500 text-white text-xl font-semibold rounded-lg shadow-lg hover:shadow-pink-500/50 transform hover:scale-105 transition-all duration-300"
          >
            ⚔️ 对战模式
          </button>
          
          <button
            onClick={() => navigate('/beatmaps')}
            className="w-64 px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xl font-semibold rounded-lg shadow-lg hover:shadow-emerald-500/50 transform hover:scale-105 transition-all duration-300"
          >
            🎼 谱面编辑器
          </button>
        </div>
        
        <div className="mt-12 text-gray-500 text-sm">
          <p>按键: D F J K</p>
          <p className="mt-2">支持本地音乐文件 (MP3, WAV, OGG, FLAC, M4A)</p>
        </div>
      </div>
    </div>
  )
}

export default MainMenu
