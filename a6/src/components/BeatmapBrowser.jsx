import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import { initSocket, emit, on, off, setPlayerData } from '../utils/socket'

function BeatmapBrowser() {
  const navigate = useNavigate()
  const { currentPlayer, setSong, setNotes, setPlayer } = useGameStore()

  const [beatmaps, setBeatmaps] = useState([])
  const [myBeatmaps, setMyBeatmaps] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('public')
  const [selectedBeatmap, setSelectedBeatmap] = useState(null)
  const [playerName, setPlayerName] = useState('')

  const loadBeatmaps = useCallback(() => {
    setLoading(true)
    emit('getBeatmapList', { publicOnly: true, limit: 50 })
  }, [])

  const loadMyBeatmaps = useCallback(() => {
    if (currentPlayer?.id) {
      emit('getBeatmapList', { creatorId: currentPlayer.id, publicOnly: false })
    }
  }, [currentPlayer?.id])

  useEffect(() => {
    initSocket()

    on('beatmapList', (data) => {
      if (activeTab === 'public') {
        setBeatmaps(data)
      } else {
        setMyBeatmaps(data)
      }
      setLoading(false)
    })

    on('beatmapSearchResult', (data) => {
      setBeatmaps(data)
      setLoading(false)
    })

    on('beatmapData', (data) => {
      setSelectedBeatmap(data)
    })

    on('beatmapDeleted', () => {
      loadMyBeatmaps()
    })

    on('beatmapError', (error) => {
      console.error('Beatmap error:', error)
      setLoading(false)
    })

    on('playerRegistered', (player) => {
      setPlayer({ id: player.id, name: player.name, elo: player.elo })
      setPlayerData({ id: player.id, name: player.name })
      if (activeTab === 'my') {
        loadMyBeatmaps()
      }
    })

    return () => {
      off('beatmapList')
      off('beatmapSearchResult')
      off('beatmapData')
      off('beatmapDeleted')
      off('beatmapError')
      off('playerRegistered')
    }
  }, [activeTab, loadMyBeatmaps, setPlayer])

  useEffect(() => {
    if (activeTab === 'public') {
      loadBeatmaps()
    } else if (currentPlayer?.id) {
      loadMyBeatmaps()
    }
  }, [activeTab, loadBeatmaps, loadMyBeatmaps, currentPlayer?.id])

  const handleSearch = () => {
    if (searchQuery.trim()) {
      setLoading(true)
      emit('searchBeatmaps', { keyword: searchQuery.trim() })
    } else {
      loadBeatmaps()
    }
  }

  const handleRegister = () => {
    if (!playerName.trim()) {
      alert('请输入玩家名称')
      return
    }
    initSocket()
    emit('register', { name: playerName.trim() })
  }

  const handleEdit = (beatmap) => {
    navigate(`/editor/${beatmap.id}`)
  }

  const handlePlay = (beatmap) => {
    emit('getBeatmap', { beatmapId: beatmap.id })
  }

  const handleDelete = (beatmap) => {
    if (confirm(`确定要删除谱面 "${beatmap.title}" 吗？`)) {
      emit('deleteBeatmap', { beatmapId: beatmap.id })
    }
  }

  useEffect(() => {
    if (selectedBeatmap) {
      const songData = {
        id: selectedBeatmap.id,
        title: selectedBeatmap.title,
        artist: selectedBeatmap.artist,
        bpm: selectedBeatmap.bpm,
        duration: selectedBeatmap.duration,
        notes: selectedBeatmap.notes,
        isDemo: false,
        isServerBeatmap: true
      }
      setSong(songData)
      setNotes(selectedBeatmap.notes)
      navigate('/play')
    }
  }, [selectedBeatmap, setSong, setNotes])

  const currentBeatmaps = activeTab === 'public' ? beatmaps : myBeatmaps

  const getDifficultyColor = (difficulty) => {
    switch (difficulty) {
      case 'easy': return 'text-green-400'
      case 'normal': return 'text-blue-400'
      case 'hard': return 'text-orange-400'
      case 'expert': return 'text-red-400'
      default: return 'text-gray-400'
    }
  }

  const formatDifficulty = (difficulty) => {
    switch (difficulty) {
      case 'easy': return '简单'
      case 'normal': return '普通'
      case 'hard': return '困难'
      case 'expert': return '专家'
      default: return difficulty
    }
  }

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-game-bg via-emerald-950/20 to-game-bg">
      <header className="p-6 flex items-center justify-between border-b border-emerald-500/20">
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
        >
          ← 返回
        </button>
        <h1 className="text-2xl font-bold text-white">谱面管理</h1>
        <button
          onClick={() => navigate('/editor')}
          className="px-6 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold rounded-lg transition-all"
        >
          + 新建谱面
        </button>
      </header>

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-emerald-500/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('public')}
                className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                  activeTab === 'public'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white/10 text-gray-400 hover:bg-white/20'
                }`}
              >
                公开谱面
              </button>
              <button
                onClick={() => setActiveTab('my')}
                className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                  activeTab === 'my'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white/10 text-gray-400 hover:bg-white/20'
                }`}
              >
                我的谱面
              </button>
            </div>

            <div className="flex items-center gap-3">
              {activeTab === 'public' && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="搜索谱面..."
                    className="px-4 py-2 bg-white/10 border border-emerald-500/30 rounded-lg text-white focus:outline-none focus:border-emerald-400"
                  />
                  <button
                    onClick={handleSearch}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
                  >
                    搜索
                  </button>
                </div>
              )}

              {activeTab === 'my' && !currentPlayer?.id && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="输入你的名字..."
                    className="px-4 py-2 bg-white/10 border border-emerald-500/30 rounded-lg text-white focus:outline-none focus:border-emerald-400"
                  />
                  <button
                    onClick={handleRegister}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
                  >
                    登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-gray-400 text-xl">加载中...</div>
            </div>
          ) : currentBeatmaps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <div className="text-6xl mb-4">🎼</div>
              <div className="text-xl">暂无谱面</div>
              <div className="mt-2">点击"新建谱面"来创建你的第一个谱面</div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentBeatmaps.map((beatmap) => (
                <div
                  key={beatmap.id}
                  className="p-6 bg-white/5 rounded-xl border border-emerald-500/20 hover:bg-white/10 hover:border-emerald-400/50 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-white truncate">
                        {beatmap.title}
                      </h3>
                      <p className="text-gray-400">{beatmap.artist}</p>
                    </div>
                    <span className={`text-sm font-semibold ${getDifficultyColor(beatmap.difficulty)}`}>
                      {formatDifficulty(beatmap.difficulty)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm text-gray-500 mb-4">
                    <div>
                      <span className="text-emerald-400">🎼</span> {beatmap.bpm} BPM
                    </div>
                    <div>
                      <span className="text-emerald-400">🎯</span> {beatmap.notes_count} 音符
                    </div>
                    <div>
                      <span className="text-emerald-400">⏱️</span> {Math.floor(beatmap.duration / 60)}:{Math.floor(beatmap.duration % 60).toString().padStart(2, '0')}
                    </div>
                  </div>

                  <div className="text-sm text-gray-600 mb-4">
                    作者: {beatmap.creator_name}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePlay(beatmap)}
                      className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
                    >
                      试玩
                    </button>
                    {activeTab === 'my' && (
                      <>
                        <button
                          onClick={() => handleEdit(beatmap)}
                          className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(beatmap)}
                          className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
                        >
                          删除
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default BeatmapBrowser
