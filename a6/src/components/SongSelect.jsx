import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import { loadLocalSong, createDemoSong } from '../utils/audioParser'

function SongSelect() {
  const navigate = useNavigate()
  const { setSong, setNotes, currentPlayer } = useGameStore()
  const [selectedSong, setSelectedSong] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    setLoading(true)
    try {
      const song = await loadLocalSong(file)
      setSelectedSong(song)
    } catch (error) {
      console.error('加载歌曲失败:', error)
      alert('加载歌曲失败，请尝试其他文件')
    } finally {
      setLoading(false)
    }
  }

  const handleDemoSong = () => {
    const demoSong = createDemoSong()
    setSelectedSong(demoSong)
  }

  const handleStartPlay = () => {
    if (!selectedSong) return
    
    setSong(selectedSong)
    setNotes(selectedSong.notes)
    navigate('/play')
  }

  const handleBack = () => {
    navigate('/')
  }

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-game-bg via-indigo-950 to-game-bg">
      <header className="p-6 flex items-center justify-between border-b border-purple-500/20">
        <button
          onClick={handleBack}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
        >
          ← 返回
        </button>
        <h1 className="text-2xl font-bold text-white">选择歌曲</h1>
        <div className="w-24"></div>
      </header>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-4xl">
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div
              onClick={handleDemoSong}
              className={`p-6 rounded-xl border-2 cursor-pointer transition-all duration-300 ${
                selectedSong?.isDemo
                  ? 'border-purple-400 bg-purple-500/20'
                  : 'border-purple-500/30 bg-white/5 hover:bg-white/10 hover:border-purple-400/50'
              }`}
            >
              <div className="text-4xl mb-4">🎵</div>
              <h3 className="text-xl font-semibold text-white mb-2">Demo 歌曲</h3>
              <p className="text-gray-400">预设的演示曲目，120 BPM</p>
            </div>

            <label className={`p-6 rounded-xl border-2 cursor-pointer transition-all duration-300 ${
              selectedSong && !selectedSong.isDemo
                ? 'border-purple-400 bg-purple-500/20'
                : 'border-purple-500/30 bg-white/5 hover:bg-white/10 hover:border-purple-400/50'
            }`}>
              <input
                type="file"
                accept="audio/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="text-4xl mb-4">📁</div>
              <h3 className="text-xl font-semibold text-white mb-2">本地音乐</h3>
              <p className="text-gray-400">选择 MP3, WAV, OGG, FLAC 等文件</p>
              {loading && <p className="text-purple-400 mt-2">解析中...</p>}
            </label>
          </div>

          {selectedSong && (
            <div className="p-8 bg-white/5 rounded-xl border border-purple-500/30">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-3xl font-bold text-white mb-2">
                    {selectedSong.title}
                  </h2>
                  <p className="text-gray-400 text-lg mb-4">
                    {selectedSong.artist}
                  </p>
                  <div className="flex gap-6 text-gray-300">
                    <div className="flex items-center gap-2">
                      <span className="text-purple-400">🎼</span>
                      <span>{selectedSong.bpm} BPM</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-purple-400">⏱️</span>
                      <span>{Math.floor(selectedSong.duration / 60)}:{Math.floor(selectedSong.duration % 60).toString().padStart(2, '0')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-purple-400">🎯</span>
                      <span>{selectedSong.notes.length} 音符</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleStartPlay}
                  className="px-8 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xl font-semibold rounded-lg shadow-lg hover:shadow-purple-500/50 transform hover:scale-105 transition-all duration-300"
                >
                  开始游戏
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SongSelect
