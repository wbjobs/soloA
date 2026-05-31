import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useGameStore } from '../store/gameStore'
import { 
  initSocket, 
  emit, 
  on, 
  off, 
  setPlayerData, 
  setRoomState, 
  clearRoomState,
  getPlayerData 
} from '../utils/socket'

function BattleRoom() {
  const navigate = useNavigate()
  const { roomId } = useParams()
  const { 
    currentPlayer, 
    currentSong, 
    joinBattle, 
    leaveBattle,
    setSong,
    setNotes,
    updateOpponentScore,
    updateOpponentCombo
  } = useGameStore()

  const [room, setRoom] = useState(null)
  const [isHost, setIsHost] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [bothReady, setBothReady] = useState(false)
  const [countdown, setCountdown] = useState(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [syncError, setSyncError] = useState(null)

  const eventHandlersRef = React.useRef({})

  const handleRoomJoined = useCallback((roomData) => {
    setRoom(roomData)
    setIsHost(roomData.host.id === currentPlayer.id)
    setSyncError(null)
    joinBattle(roomData)
    setRoomState(roomData.id, true)
    
    if (currentPlayer.id) {
      setPlayerData({ id: currentPlayer.id, name: currentPlayer.name })
    }
  }, [currentPlayer, joinBattle])

  const handleRoomStateSynced = useCallback((data) => {
    console.log('Room state synced:', data)
    setRoom(data.room)
    setIsHost(data.isHost)
    setReconnecting(false)
    setSyncError(null)
    
    if (data.room.song) {
      setSong(data.room.song)
      setNotes(data.room.song.notes)
    }
    
    if (data.room.hostReady || data.room.guestReady) {
      setBothReady(data.room.hostReady && data.room.guestReady)
      setIsReady(data.isHost ? data.room.hostReady : data.room.guestReady)
    }
  }, [setSong, setNotes])

  const handleRoomSyncFailed = useCallback((data) => {
    console.log('Room sync failed:', data)
    setSyncError(data.reason)
    setTimeout(() => {
      navigate('/battle')
    }, 2000)
  }, [navigate])

  const handlePlayerReconnected = useCallback((data) => {
    console.log('Player reconnected:', data)
    setReconnecting(false)
  }, [])

  const handlePlayerDisconnected = useCallback((data) => {
    console.log('Player disconnected:', data)
    setReconnecting(true)
  }, [])

  const handleHostDisconnected = useCallback((data) => {
    alert(`房主 ${data.hostName} 已断开连接`)
    leaveBattle()
    clearRoomState()
    navigate('/battle')
  }, [leaveBattle, navigate])

  const handlePlayerLeft = useCallback((roomData) => {
    setRoom(roomData)
    setBothReady(false)
  }, [])

  const handleRoomClosed = useCallback(() => {
    alert('房间已关闭')
    leaveBattle()
    clearRoomState()
    navigate('/battle')
  }, [leaveBattle, navigate])

  const handlePlayerReady = useCallback((data) => {
    setBothReady(data.hostReady && data.guestReady)
    setRoom(prev => prev ? ({
      ...prev,
      hostReady: data.hostReady,
      guestReady: data.guestReady
    }) : prev)
  }, [])

  const handleGameReady = useCallback((data) => {
    setBothReady(true)
    if (data.song) {
      setSong(data.song)
      setNotes(data.song.notes)
    }
  }, [setSong, setNotes])

  const handleGameStarting = useCallback((data) => {
    setCountdown(3)
    const countdownInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval)
          navigate('/play')
          return null
        }
        return prev - 1
      })
    }, 1000)
  }, [navigate])

  const handleOpponentScore = useCallback((data) => {
    if (data.playerId !== currentPlayer.id) {
      updateOpponentScore(data.score)
      updateOpponentCombo(data.combo)
    }
  }, [currentPlayer.id, updateOpponentScore, updateOpponentCombo])

  const handleMatchResult = useCallback((data) => {
    navigate('/result', { state: { matchResult: data } })
  }, [navigate])

  useEffect(() => {
    initSocket()

    eventHandlersRef.current = {
      roomJoined: handleRoomJoined,
      roomStateSynced: handleRoomStateSynced,
      roomSyncFailed: handleRoomSyncFailed,
      playerReconnected: handlePlayerReconnected,
      playerDisconnected: handlePlayerDisconnected,
      hostDisconnected: handleHostDisconnected,
      playerLeft: handlePlayerLeft,
      roomClosed: handleRoomClosed,
      playerReady: handlePlayerReady,
      gameReady: handleGameReady,
      gameStarting: handleGameStarting,
      opponentScore: handleOpponentScore,
      matchResult: handleMatchResult
    }

    on('roomJoined', eventHandlersRef.current.roomJoined)
    on('roomStateSynced', eventHandlersRef.current.roomStateSynced)
    on('roomSyncFailed', eventHandlersRef.current.roomSyncFailed)
    on('playerReconnected', eventHandlersRef.current.playerReconnected)
    on('playerDisconnected', eventHandlersRef.current.playerDisconnected)
    on('hostDisconnected', eventHandlersRef.current.hostDisconnected)
    on('playerLeft', eventHandlersRef.current.playerLeft)
    on('roomClosed', eventHandlersRef.current.roomClosed)
    on('playerReady', eventHandlersRef.current.playerReady)
    on('gameReady', eventHandlersRef.current.gameReady)
    on('gameStarting', eventHandlersRef.current.gameStarting)
    on('opponentScore', eventHandlersRef.current.opponentScore)
    on('matchResult', eventHandlersRef.current.matchResult)

    const socket = initSocket()
    
    if (roomId && !socket.connected) {
      setReconnecting(true)
    }
    
    if (socket.connected && currentPlayer.id) {
      setPlayerData({ id: currentPlayer.id, name: currentPlayer.name })
      if (roomId) {
        setRoomState(roomId, true)
      }
    }

    return () => {
      off('roomJoined', eventHandlersRef.current.roomJoined)
      off('roomStateSynced', eventHandlersRef.current.roomStateSynced)
      off('roomSyncFailed', eventHandlersRef.current.roomSyncFailed)
      off('playerReconnected', eventHandlersRef.current.playerReconnected)
      off('playerDisconnected', eventHandlersRef.current.playerDisconnected)
      off('hostDisconnected', eventHandlersRef.current.hostDisconnected)
      off('playerLeft', eventHandlersRef.current.playerLeft)
      off('roomClosed', eventHandlersRef.current.roomClosed)
      off('playerReady', eventHandlersRef.current.playerReady)
      off('gameReady', eventHandlersRef.current.gameReady)
      off('gameStarting', eventHandlersRef.current.gameStarting)
      off('opponentScore', eventHandlersRef.current.opponentScore)
      off('matchResult', eventHandlersRef.current.matchResult)
    }
  }, [
    roomId,
    currentPlayer.id,
    currentPlayer.name,
    handleRoomJoined,
    handleRoomStateSynced,
    handleRoomSyncFailed,
    handlePlayerReconnected,
    handlePlayerDisconnected,
    handleHostDisconnected,
    handlePlayerLeft,
    handleRoomClosed,
    handlePlayerReady,
    handleGameReady,
    handleGameStarting,
    handleOpponentScore,
    handleMatchResult
  ])

  const handleReady = () => {
    setIsReady(true)
    emit('readyForGame')
  }

  const handleStartGame = () => {
    emit('startGame')
  }

  const handleLeave = () => {
    emit('leaveRoom')
    leaveBattle()
    clearRoomState()
    navigate('/battle')
  }

  if (syncError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-game-bg">
        <div className="text-center">
          <div className="text-red-400 text-2xl mb-4">房间同步失败</div>
          <div className="text-gray-400">{syncError}</div>
          <div className="text-gray-500 mt-4">即将返回大厅...</div>
        </div>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-game-bg">
        <div className="text-center">
          {reconnecting ? (
            <>
              <div className="text-white text-2xl mb-4 animate-pulse">正在重连...</div>
              <div className="text-gray-500">正在恢复房间状态</div>
            </>
          ) : (
            <div className="text-white text-2xl">加载中...</div>
          )}
        </div>
      </div>
    )
  }

  const opponent = isHost ? room.guest : room.host

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-b from-game-bg via-red-950/20 to-game-bg">
      {countdown !== null && (
        <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/80">
          <div className="text-9xl font-bold text-pink-500 text-glow animate-pulse">
            {countdown || 'GO!'}
          </div>
        </div>
      )}

      {reconnecting && (
        <div className="absolute top-24 left-1/2 transform -translate-x-1/2 z-50 px-6 py-3 bg-yellow-500/90 text-black font-bold rounded-lg animate-pulse">
          对手断线，等待重连...
        </div>
      )}

      <header className="p-6 flex items-center justify-between border-b border-pink-500/20">
        <button
          onClick={handleLeave}
          className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
        >
          ← 离开
        </button>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">对战房间</h1>
          <p className="text-pink-400">房间号: {room.id}</p>
        </div>
        <div className="w-20"></div>
      </header>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-4xl">
          <div className="mb-8 p-6 bg-white/5 rounded-xl border border-pink-500/30">
            <h2 className="text-lg text-gray-400 mb-2">比赛曲目</h2>
            <p className="text-2xl font-bold text-white">{room.song?.title}</p>
            <p className="text-gray-400">{room.song?.artist}</p>
            <p className="text-gray-500 text-sm mt-2">
              {room.song?.bpm} BPM | {room.song?.notes?.length} 音符
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 mb-8">
            <div className={`p-6 rounded-xl border-2 ${
              isHost ? 'border-pink-400 bg-pink-500/10' : 'border-white/20 bg-white/5'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-pink-400">房主</span>
                {room.hostReady && (
                  <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">
                    已准备
                  </span>
                )}
              </div>
              <div className="text-3xl font-bold text-white mb-2">{room.host.name}</div>
              <div className="text-gray-400">ELO: {room.host.elo}</div>
            </div>

            <div className={`p-6 rounded-xl border-2 ${
              !isHost && opponent ? 'border-pink-400 bg-pink-500/10' : 'border-white/10 bg-white/5'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-400">对手</span>
                {room.guestReady && (
                  <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm">
                    已准备
                  </span>
                )}
              </div>
              {opponent ? (
                <>
                  <div className="text-3xl font-bold text-white mb-2">{opponent.name}</div>
                  <div className="text-gray-400">ELO: {opponent.elo}</div>
                </>
              ) : (
                <div className="text-gray-500">等待对手加入...</div>
              )}
            </div>
          </div>

          <div className="flex justify-center gap-4">
            {!isReady && (
              <button
                onClick={handleReady}
                disabled={!opponent}
                className="px-8 py-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed text-white text-xl font-semibold rounded-lg transition-all"
              >
                准备就绪
              </button>
            )}

            {isHost && bothReady && (
              <button
                onClick={handleStartGame}
                className="px-8 py-4 bg-gradient-to-r from-pink-600 to-red-600 hover:from-pink-500 hover:to-red-500 text-white text-xl font-semibold rounded-lg shadow-lg hover:shadow-pink-500/50 transform hover:scale-105 transition-all"
              >
                开始对战 ⚔️
              </button>
            )}

            {isReady && !isHost && (
              <div className="px-8 py-4 bg-green-500/20 text-green-400 text-xl font-semibold rounded-lg">
                已准备，等待房主开始...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default BattleRoom
