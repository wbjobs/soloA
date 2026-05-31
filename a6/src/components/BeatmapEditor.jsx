import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import { initSocket, emit, on, off, setPlayerData } from '../utils/socket'
import { loadLocalSong, createDemoSong } from '../utils/audioParser'

const LANES = 4
const LANE_COLORS = [
  'bg-purple-500',
  'bg-pink-500',
  'bg-blue-500',
  'bg-green-500'
]
const LANE_DISPLAY = ['D', 'F', 'J', 'K']
const DIFFICULTIES = ['easy', 'normal', 'hard', 'expert']

function BeatmapEditor() {
  const navigate = useNavigate()
  const { beatmapId } = useParams()
  const { currentPlayer, setSong, setNotes, setPlayer } = useGameStore()

  const [notes, setNotesLocal] = useState([])
  const [selectedNote, setSelectedNote] = useState(null)
  const [draggingNote, setDraggingNote] = useState(null)
  const [playerName, setPlayerName] = useState('')

  const [beatmapInfo, setBeatmapInfo] = useState({
    title: '',
    artist: '',
    bpm: 120,
    duration: 60,
    difficulty: 'normal',
    description: '',
    isPublic: true
  })

  const [audioData, setAudioData] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [viewOffset, setViewOffset] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editingBeatmapId, setEditingBeatmapId] = useState(null)

  const audioRef = useRef(null)
  const timelineRef = useRef(null)
  const animationRef = useRef(null)
  const scrollContainerRef = useRef(null)

  useEffect(() => {
    initSocket()

    on('playerRegistered', (player) => {
      setPlayer({ id: player.id, name: player.name, elo: player.elo })
      setPlayerData({ id: player.id, name: player.name })
      
      if (beatmapId) {
        emit('getBeatmap', { beatmapId: parseInt(beatmapId) })
      }
    })

    on('beatmapCreated', (data) => {
      setSaving(false)
      setSaved(true)
      setEditingBeatmapId(data.beatmapId)
      setTimeout(() => setSaved(false), 3000)
    })

    on('beatmapUpdated', (data) => {
      setSaving(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    })

    on('beatmapData', (data) => {
      setBeatmapInfo({
        title: data.title,
        artist: data.artist || '',
        bpm: data.bpm,
        duration: data.duration,
        difficulty: data.difficulty,
        description: data.description || '',
        isPublic: data.isPublic
      })
      setNotesLocal(data.notes)
      setEditingBeatmapId(data.id)
    })

    on('beatmapError', (error) => {
      setSaving(false)
      alert('错误: ' + error.error)
    })

    return () => {
      off('playerRegistered')
      off('beatmapCreated')
      off('beatmapUpdated')
      off('beatmapData')
      off('beatmapError')
    }
  }, [beatmapId, setPlayer])

  useEffect(() => {
    if (beatmapId && currentPlayer?.id) {
      emit('getBeatmap', { beatmapId: parseInt(beatmapId) })
    }
  }, [beatmapId, currentPlayer?.id])

  useEffect(() => {
    if (isPlaying) {
      const updateTime = () => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime)
        }
        animationRef.current = requestAnimationFrame(updateTime)
      }
      animationRef.current = requestAnimationFrame(updateTime)
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPlaying])

  const handleAudioSelect = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const song = await loadLocalSong(file)
      setAudioData(song)
      setBeatmapInfo(prev => ({
        ...prev,
        title: song.title,
        artist: song.artist,
        bpm: song.bpm,
        duration: song.duration
      }))
      setNotesLocal(song.notes)
    } catch (error) {
      console.error('加载音频失败:', error)
      alert('加载音频失败')
    }
  }

  const handleLoadDemo = () => {
    const demo = createDemoSong()
    setBeatmapInfo({
      title: demo.title,
      artist: demo.artist,
      bpm: demo.bpm,
      duration: demo.duration,
      difficulty: 'normal',
      description: '',
      isPublic: true
    })
    setNotesLocal(demo.notes)
    setAudioData(null)
  }

  const handleRegister = () => {
    if (!playerName.trim()) {
      alert('请输入玩家名称')
      return
    }
    emit('register', { name: playerName.trim() })
  }

  const handlePlayPause = () => {
    if (!audioRef.current) return
    
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleSeek = (time) => {
    setCurrentTime(time)
    if (audioRef.current) {
      audioRef.current.currentTime = time
    }
  }

  const handleTimelineClick = (e, lane) => {
    if (draggingNote) return

    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pixelsPerSecond = 200 * zoom
    const time = (x / pixelsPerSecond) + viewOffset

    const newNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      time: Math.max(0, time),
      lane: lane,
      type: 'tap'
    }

    setNotesLocal(prev => [...prev, newNote].sort((a, b) => a.time - b.time))
    setSelectedNote(newNote.id)
  }

  const handleNoteMouseDown = (e, note) => {
    e.stopPropagation()
    setDraggingNote(note.id)
    setSelectedNote(note.id)
  }

  const handleTimelineMouseMove = (e) => {
    if (!draggingNote) return

    const rect = scrollContainerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pixelsPerSecond = 200 * zoom
    let newTime = (x / pixelsPerSecond) + viewOffset
    
    newTime = Math.max(0, Math.min(newTime, beatmapInfo.duration || 1000))

    setNotesLocal(prev => prev.map(note => {
      if (note.id === draggingNote) {
        return { ...note, time: newTime }
      }
      return note
    }).sort((a, b) => a.time - b.time))
  }

  const handleTimelineMouseUp = () => {
    setDraggingNote(null)
  }

  const handleDeleteNote = () => {
    if (!selectedNote) return
    setNotesLocal(prev => prev.filter(note.id !== selectedNote))
    setSelectedNote(null)
  }

  const handleConvertToHold = () => {
    if (!selectedNote) return
    
    setNotesLocal(prev => prev.map(note => {
      if (note.id === selectedNote) {
        const holdDuration = 0.5
        return {
          ...note,
          type: 'hold',
          duration: holdDuration,
          endTime: note.time + holdDuration
        }
      }
      return note
    }))
  }

  const handleConvertToTap = () => {
    if (!selectedNote) return
    
    setNotesLocal(prev => prev.map(note => {
      if (note.id === selectedNote) {
        const { duration, endTime, ...tapNote } = note
        return { ...tapNote, type: 'tap' }
      }
      return note
    }))
  }

  const handleSave = () => {
    if (!currentPlayer?.id) {
      alert('请先登录')
      return
    }

    if (!beatmapInfo.title.trim()) {
      alert('请输入谱面标题')
      return
    }

    setSaving(true)
    setSaved(false)

    const beatmapData = {
      ...beatmapInfo,
      title: beatmapInfo.title.trim()
    }

    if (editingBeatmapId) {
      emit('updateBeatmap', {
        beatmapId: editingBeatmapId,
        ...beatmapData,
        notes: notes
      })
    } else {
      emit('createBeatmap', {
        ...beatmapData,
        notes: notes
      })
    }
  }

  const handleTestPlay = () => {
    if (!beatmapInfo.title) {
      alert('请先设置谱面信息')
      return
    }

    const songData = {
      ...beatmapInfo,
      notes: notes,
      isDemo: true,
      audioUrl: audioData?.audioUrl
    }
    setSong(songData)
    setNotes(notes)
    navigate('/play')
  }

  const handleZoomIn = () => setZoom(prev => Math.min(prev * 1.5, 5))
  const handleZoomOut = () => setZoom(prev => Math.max(prev / 1.5, 0.2))

  const pixelsPerSecond = 200 * zoom
  const visibleDuration = 10 / zoom
  const scrollWidth = Math.max(beatmapInfo.duration * pixelsPerSecond, 1000)

  const getNoteStyle = (note) => {
    const x = (note.time - viewOffset) * pixelsPerSecond
    const width = note.type === 'hold' ? (note.duration || 0.5) * pixelsPerSecond : 30
    const laneHeight = 60
    const lane = note.lane

    return {
      left: x,
      top: lane * laneHeight + 5,
      width: width,
      height: laneHeight - 10
    }
  }

  const renderTimeMarkers = () => {
    const markers = []
    const startBeat = Math.floor(viewOffset)
    const endBeat = Math.ceil(viewOffset + visibleDuration)

    for (let beat = startBeat; beat <= endBeat; beat++) {
      const x = (beat - viewOffset) * pixelsPerSecond
      markers.push(
        <div
          key={beat}
          className="absolute top-0 bottom-0 border-l border-gray-700/50"
          style={{ left: x }}
        >
          <span className="absolute top-1 left-1 text-xs text-gray-500">{beat}s</span>
        </div>
      )
    }
    return markers
  }

  const selectedNoteData = notes.find(n => n.id === selectedNote)

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-game-bg via-emerald-950/20 to-game-bg">
      {audioData?.audioUrl && (
        <audio 
          ref={audioRef} 
          src={audioData.audioUrl} 
          onEnded={() => setIsPlaying(false)}
        />
      )}

      <header className="p-4 flex items-center justify-between border-b border-emerald-500/20">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/beatmaps')}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
          >
            ← 返回
          </button>
          <h1 className="text-xl font-bold text-white">
            {editingBeatmapId ? '编辑谱面' : '新建谱面'}
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {!currentPlayer?.id ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="输入你的名字..."
                className="px-3 py-2 bg-white/10 border border-emerald-500/30 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-400"
              />
              <button
                onClick={handleRegister}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm transition-colors"
              >
                登录
              </button>
            </div>
          ) : (
            <span className="text-emerald-400">登录用户: {currentPlayer.name}</span>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 p-4 border-r border-emerald-500/10 overflow-y-auto">
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-emerald-400 mb-3">导入音乐</h3>
            <div className="space-y-2">
              <label className="block w-full px-4 py-3 bg-white/5 hover:bg-white/10 border border-dashed border-emerald-500/30 rounded-lg text-center text-gray-400 cursor-pointer transition-colors">
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioSelect}
                  className="hidden"
                />
                📁 选择音乐文件
              </label>
              <button
                onClick={handleLoadDemo}
                className="w-full px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-gray-400 text-sm transition-colors"
              >
                🎵 使用演示谱面
              </button>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-semibold text-emerald-400 mb-3">谱面信息</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">标题 *</label>
                <input
                  type="text"
                  value={beatmapInfo.title}
                  onChange={(e) => setBeatmapInfo(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 bg-white/10 border border-emerald-500/30 rounded-lg text-white focus:outline-none focus:border-emerald-400"
                  placeholder="谱面标题"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">艺术家</label>
                <input
                  type="text"
                  value={beatmapInfo.artist}
                  onChange={(e) => setBeatmapInfo(prev => ({ ...prev, artist: e.target.value }))}
                  className="w-full px-3 py-2 bg-white/10 border border-emerald-500/30 rounded-lg text-white focus:outline-none focus:border-emerald-400"
                  placeholder="艺术家"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">BPM</label>
                  <input
                    type="number"
                    value={beatmapInfo.bpm}
                    onChange={(e) => setBeatmapInfo(prev => ({ ...prev, bpm: parseInt(e.target.value) || 120 }))}
                    className="w-full px-3 py-2 bg-white/10 border border-emerald-500/30 rounded-lg text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">时长 (秒)</label>
                  <input
                    type="number"
                    value={beatmapInfo.duration}
                    onChange={(e) => setBeatmapInfo(prev => ({ ...prev, duration: parseFloat(e.target.value) || 60 }))}
                    className="w-full px-3 py-2 bg-white/10 border border-emerald-500/30 rounded-lg text-white focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">难度</label>
                <select
                  value={beatmapInfo.difficulty}
                  onChange={(e) => setBeatmapInfo(prev => ({ ...prev, difficulty: e.target.value }))}
                  className="w-full px-3 py-2 bg-white/10 border border-emerald-500/30 rounded-lg text-white focus:outline-none focus:border-emerald-400"
                >
                  {DIFFICULTIES.map(d => (
                    <option key={d} value={d} className="bg-gray-900">
                      {d === 'easy' ? '简单' : d === 'normal' ? '普通' : d === 'hard' ? '困难' : '专家'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">描述</label>
                <textarea
                  value={beatmapInfo.description}
                  onChange={(e) => setBeatmapInfo(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 bg-white/10 border border-emerald-500/30 rounded-lg text-white focus:outline-none focus:border-emerald-400 resize-none"
                  rows={3}
                  placeholder="谱面描述"
                />
              </div>
              <label className="flex items-center gap-2 text-gray-400">
                <input
                  type="checkbox"
                  checked={beatmapInfo.isPublic}
                  onChange={(e) => setBeatmapInfo(prev => ({ ...prev, isPublic: e.target.checked }))}
                  className="rounded"
                />
                公开谱面
              </label>
            </div>
          </div>

          {selectedNoteData && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-emerald-400 mb-3">选中音符</h3>
              <div className="p-3 bg-white/5 rounded-lg space-y-2">
                <div className="text-sm text-gray-400">
                  时间: <span className="text-white">{selectedNoteData.time.toFixed(2)}s</span>
                </div>
                <div className="text-sm text-gray-400">
                  轨道: <span className="text-white">{LANE_DISPLAY[selectedNoteData.lane]}</span>
                </div>
                <div className="text-sm text-gray-400">
                  类型: <span className="text-white">{selectedNoteData.type === 'tap' ? '单点' : '长按'}</span>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={selectedNoteData.type === 'tap' ? handleConvertToHold : handleConvertToTap}
                    className="flex-1 px-2 py-1 bg-purple-600 hover:bg-purple-500 rounded text-xs text-white"
                  >
                    转为{selectedNoteData.type === 'tap' ? '长按' : '单点'}
                  </button>
                  <button
                    onClick={handleDeleteNote}
                    className="flex-1 px-2 py-1 bg-red-600 hover:bg-red-500 rounded text-xs text-white"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <button
              onClick={handleTestPlay}
              className="w-full px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold rounded-lg transition-all"
            >
              🎮 试玩谱面
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !currentPlayer?.id}
              className={`w-full px-4 py-3 font-semibold rounded-lg transition-all ${
                saved 
                  ? 'bg-green-600 text-white' 
                  : saving
                    ? 'bg-gray-600 text-gray-400 cursor-wait'
                    : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white'
              }`}
            >
              {saving ? '保存中...' : saved ? '✓ 已保存' : '💾 保存到服务器'}
            </button>
          </div>

          <div className="mt-4 text-center text-xs text-gray-500">
            音符数: {notes.length}
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-emerald-500/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePlayPause}
                disabled={!audioData?.audioUrl}
                className="w-12 h-12 flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-full text-white text-xl transition-colors"
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              <span className="text-white font-mono text-lg w-24">
                {currentTime.toFixed(1)}s
              </span>
              <input
                type="range"
                min={0}
                max={beatmapInfo.duration || 60}
                step={0.1}
                value={currentTime}
                onChange={(e) => handleSeek(parseFloat(e.target.value))}
                className="w-64"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleZoomOut}
                className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded text-white"
              >
                −
              </button>
              <span className="text-white text-sm w-16 text-center">
                {(zoom * 100).toFixed(0)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded text-white"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-black/30 p-4" ref={scrollContainerRef}>
            <div
              className="relative"
              style={{ width: scrollWidth + 100, height: LANES * 60 + 100 }}
              onMouseMove={handleTimelineMouseMove}
              onMouseUp={handleTimelineMouseUp}
              onMouseLeave={handleTimelineMouseUp}
            >
              <div className="absolute left-0 top-0 w-16 h-full">
                {[0, 1, 2, 3].map(lane => (
                  <div
                    key={lane}
                    className="h-14 flex items-center justify-center text-gray-500 font-bold text-lg border-b border-gray-800"
                  >
                    {LANE_DISPLAY[lane]}
                  </div>
                ))}
              </div>

              <div className="absolute left-16 top-0" ref={timelineRef}>
                <div className="relative" style={{ width: scrollWidth, height: LANES * 60 }}>
                  {renderTimeMarkers()}

                  {[0, 1, 2, 3].map(lane => (
                    <div
                      key={lane}
                      className="absolute h-14 border-b border-gray-800 cursor-crosshair hover:bg-white/5 transition-colors"
                      style={{ 
                        top: lane * 60, 
                        width: scrollWidth,
                        background: `linear-gradient(90deg, ${LANE_COLORS[lane]}10 0%, transparent 100%)`
                      }}
                      onClick={(e) => handleTimelineClick(e, lane)}
                    >
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/10" />
                    </div>
                  ))}

                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20"
                    style={{ left: (currentTime - viewOffset) * pixelsPerSecond }}
                  >
                    <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 bg-red-500 text-white text-xs px-2 py-0.5 rounded">
                      {currentTime.toFixed(1)}s
                    </div>
                  </div>

                  {notes.map(note => {
                    const style = getNoteStyle(note)
                    const isSelected = selectedNote === note.id
                    const isDragging = draggingNote === note.id

                    if (style.left < -50 || style.left > scrollWidth + 50) return null

                    return (
                      <div
                        key={note.id}
                        className={`absolute rounded cursor-move transition-shadow ${
                          isSelected ? 'ring-2 ring-yellow-400 z-10' : ''
                        } ${isDragging ? 'opacity-80' : ''}`}
                        style={{
                          ...style,
                          background: `${LANE_COLORS[note.lane]}`,
                          boxShadow: `0 0 10px ${LANE_COLORS[note.lane]}80`
                        }}
                        onMouseDown={(e) => handleNoteMouseDown(e, note)}
                      >
                        <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-xs">
                          {note.type === 'hold' ? 'HOLD' : ''}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 border-t border-emerald-500/10 flex items-center justify-between">
            <div className="text-gray-500 text-sm">
              💡 点击轨道添加音符 | 拖拽移动音符 | 选中后可转换类型或删除
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0, (beatmapInfo.duration || 60) - visibleDuration)}
              step={0.1}
              value={viewOffset}
              onChange={(e) => setViewOffset(parseFloat(e.target.value))}
              className="w-64"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default BeatmapEditor
