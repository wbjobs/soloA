import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import { initSocket, emit, on, off } from '../utils/socket'
import { loadLocalSong, createDemoSong } from '../utils/audioParser'

function BattleLobby() {
  const navigate = useNavigate()
  const { currentPlayer, setSong, setNotes } = useGameStore()
  const [rooms, setRooms] = useState([])
  const [playerCount, setPlayerCount] = useState(0)
  const [selectedSong, setSelectedSong] = useState(null)
  const [joinRoomId, setJoinRoomId] = useState('')
  const [leaderboard, setLeaderboard] = useState([])
  const [serverBeatmaps, setServerBeatmaps] = useState([])
  const [beatmapTab, setBeatmapTab] = useState('local')

  useEffect(() => {
    initSocket()

    on('lobbyUpdate', (data) => {
      setRooms(data.rooms)
      setPlayerCount(data.playerCount)
    })

    on('playerRegistered', (player) => {
      console.log('玩家已注册:', player)
    })

    on('roomCreated', (room) => {
      navigate(`/battle/${room.id}`)
    })

    on('leaderboard', (data) => {
      setLeaderboard(data)
    })

    on('beatmapList', (data) => {
      setServerBeatmaps(data)
    })

    on('beatmapData', (data) => {
      const songData = {
        id: data.id,
        title: data.title,
        artist: data.artist,
        bpm: data.bpm,
        duration: data.duration,
        notes: data.notes,
        isServerBeatmap: true
      }
      setSelectedSong(songData)
      setBeatmapTab('server')
    })

    emit('getLeaderboard')
    emit('getBeatmapList', { publicOnly: true })

    return () => {
      off('lobbyUpdate')
      off('playerRegistered')
      off('roomCreated')
      off('leaderboard')
      off('beatmapList')
      off('beatmapData')
    }
  }, [])

  const handleCreateRoom = async () => {
    if (!selectedSong) {
      alert('请先选择一首歌曲')
      return
    }

    setSong(selectedSong)
    setNotes(selectedSong.notes)

    emit('createRoom', {
      song: {
        title: selectedSong.title,
        artist: selectedSong.artist,
        bpm: selectedSong.bpm,
        duration: selectedSong.duration,
        notes: selectedSong.notes,
        isDemo: selectedSong.isDemo
      }
    })
  }

  const handleJoinRoom = () => {
    if (!joinRoomId.trim()) {
      alert('请输入房间号')
      return
    }
    emit('joinRoom', { roomId: joinRoomId.trim().toUpperCase() })
  }

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const song = await loadLocalSong(file)
      setSelectedSong(song)
    } catch (error) {
      alert('加载歌曲失败')
    }
  }

  const handleDemoSong = () => {
    const demo = createDemoSong()
    setSelectedSong(demo)
  }

  const handleBack = () => {
    navigate('/')
  }

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-game-bg via-red-950/20 to-game-bg">
      <header className="p-6 flex items-center justify-between border-b border-pink-500/20">
        <button
          onClick={handleBack}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
        >
          ← 返回
        </button>
        <h1 className="text-2xl font-bold text-white">对战大厅</h1>
        <div className="text-pink-400">在线: {playerCount}</div>
      </header>

      <div className="flex-1 flex gap-8 p-8 overflow-hidden">
        <div className="flex-1 flex flex-col gap-6 overflow-y-auto">
          <div className="p-6 bg-white/5 rounded-xl border border-pink-500/30">
            <h2 className="text-xl font-semibold text-white mb-4">创建房间</h2>
            
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setBeatmapTab('local')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  beatmapTab === 'local'
                    ? 'bg-pink-600 text-white'
                    : 'bg-white/10 text-gray-400 hover:bg-white/20'
                }`}
              >
                本地
              </button>
              <button
                onClick={() => setBeatmapTab('server')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  beatmapTab === 'server'
                    ? 'bg-pink-600 text-white'
                    : 'bg-white/10 text-gray-400 hover:bg-white/20'
                }`}
              >
                服务器谱面
              </button>
            </div>

            {beatmapTab === 'local' && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div
                  onClick={handleDemoSong}
                  className={`p-4 rounded-lg border cursor-pointer transition-all ${
                    selectedSong?.isDemo
                      ? 'border-pink-400 bg-pink-500/20'
                      : 'border-pink-500/30 hover:border-pink-400/50'
                  }`}
                >
                  <div className="text-2xl mb-2">🎵</div>
                  <h3 className="text-white">Demo 歌曲</h3>
                </div>

                <label className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  selectedSong && !selectedSong.isDemo && !selectedSong.isServerBeatmap
                    ? 'border-pink-400 bg-pink-500/20'
                    : 'border-pink-500/30 hover:border-pink-400/50'
                }`}>
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <div className="text-2xl mb-2">📁</div>
                  <h3 className="text-white">本地音乐</h3>
                </label>
              </div>
            )}

            {beatmapTab === 'server' && (
              <div className="mb-4 max-h-48 overflow-y-auto">
                {serverBeatmaps.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">暂无服务器谱面</p>
                ) : (
                  <div className="space-y-2">
                    {serverBeatmaps.map(beatmap => (
                      <div
                        key={beatmap.id}
                        onClick={() => emit('getBeatmap', { beatmapId: beatmap.id })}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          selectedSong?.id === beatmap.id
                            ? 'border-pink-400 bg-pink-500/20'
                            : 'border-pink-500/30 hover:border-pink-400/50 hover:bg-white/5'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-white font-semibold">{beatmap.title}</p>
                            <p className="text-gray-400 text-sm">{beatmap.artist}</p>
                          </div>
                          <span className="text-xs text-gray-500">
                            {beatmap.bpm} BPM
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedSong && (
              <div className="mb-4 p-4 bg-white/5 rounded-lg">
                <p className="text-white font-semibold">{selectedSong.title}</p>
                <p className="text-gray-400 text-sm">{selectedSong.artist}</p>
                <p className="text-gray-500 text-xs mt-1">
                  {selectedSong.bpm} BPM | {selectedSong.notes.length} 音符
                </p>
              </div>
            )}

            <button
              onClick={handleCreateRoom}
              className="w-full px-6 py-3 bg-gradient-to-r from-pink-600 to-red-600 hover:from-pink-500 hover:to-red-500 text-white font-semibold rounded-lg transition-all"
            >
              创建房间
            </button>
          </div>

          <div className="p-6 bg-white/5 rounded-xl border border-pink-500/30">
            <h2 className="text-xl font-semibold text-white mb-4">加入房间</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                placeholder="输入房间号"
                className="flex-1 px-4 py-3 bg-white/10 border border-pink-500/30 rounded-lg text-white focus:outline-none focus:border-pink-400"
                maxLength={6}
              />
              <button
                onClick={handleJoinRoom}
                className="px-6 py-3 bg-pink-600 hover:bg-pink-500 text-white font-semibold rounded-lg transition-colors"
              >
                加入
              </button>
            </div>
          </div>

          <div className="p-6 bg-white/5 rounded-xl border border-pink-500/30">
            <h2 className="text-xl font-semibold text-white mb-4">可用房间</h2>
            {rooms.length === 0 ? (
              <p className="text-gray-500 text-center py-8">暂无可用房间</p>
            ) : (
              <div className="space-y-2">
                {rooms.map(room => (
                  <div
                    key={room.id}
                    className="p-4 bg-white/5 rounded-lg flex items-center justify-between hover:bg-white/10 transition-colors"
                  >
                    <div>
                      <p className="text-white font-semibold">{room.id}</p>
                      <p className="text-gray-400 text-sm">房主: {room.host.name}</p>
                    </div>
                    <button
                      onClick={() => emit('joinRoom', { roomId: room.id })}
                      className="px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-lg transition-colors"
                    >
                      加入
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="w-80 p-6 bg-white/5 rounded-xl border border-pink-500/30 h-full overflow-y-auto">
          <h2 className="text-xl font-semibold text-white mb-4">排行榜</h2>
          {leaderboard.length === 0 ? (
            <p className="text-gray-500 text-center py-4">暂无数据</p>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((player, index) => (
                <div
                  key={player.id}
                  className={`p-3 rounded-lg flex items-center gap-3 ${
                    index === 0 ? 'bg-yellow-500/20 border border-yellow-500/50' :
                    index === 1 ? 'bg-gray-400/20 border border-gray-400/50' :
                    index === 2 ? 'bg-orange-500/20 border border-orange-500/50' :
                    'bg-white/5'
                  }`}
                >
                  <span className={`text-2xl font-bold ${
                    index === 0 ? 'text-yellow-400' :
                    index === 1 ? 'text-gray-300' :
                    index === 2 ? 'text-orange-400' :
                    'text-gray-500'
                  }`}>
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-white font-medium">{player.name}</p>
                    <p className="text-gray-400 text-sm">{player.matches_played} 场</p>
                  </div>
                  <div className="text-pink-400 font-bold">{player.elo}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default BattleLobby
