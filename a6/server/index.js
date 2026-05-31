const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const path = require('path')
const Database = require('./database')

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3001'],
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
})

const db = new Database()

const rooms = new Map()
const players = new Map()
const playerIdToSocketId = new Map()

const ELO_K = 32
const DISCONNECT_GRACE_PERIOD = 30000

function calculateElo(player1Elo, player2Elo, result) {
  const expected1 = 1 / (1 + Math.pow(10, (player2Elo - player1Elo) / 400))
  const expected2 = 1 / (1 + Math.pow(10, (player1Elo - player2Elo) / 400))
  
  const newElo1 = Math.round(player1Elo + ELO_K * (result - expected1))
  const newElo2 = Math.round(player2Elo + ELO_K * ((1 - result) - expected2))
  
  return { newElo1, newElo2 }
}

function generateRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

function serializeRoomForClient(room) {
  return {
    id: room.id,
    host: room.host,
    guest: room.guest,
    song: room.song,
    isReady: room.isReady,
    isPlaying: room.isPlaying,
    hostReady: room.hostReady,
    guestReady: room.guestReady,
    gameStartTime: room.gameStartTime
  }
}

io.on('connection', (socket) => {
  console.log('用户连接:', socket.id)
  
  socket.on('register', (data) => {
    let player = db.getPlayerByName(data.name)
    
    if (!player) {
      player = db.createPlayer(data.name)
    }
    
    const existingSocketId = playerIdToSocketId.get(player.id)
    if (existingSocketId && players.has(existingSocketId)) {
      const oldSocket = io.sockets.sockets.get(existingSocketId)
      if (oldSocket) {
        oldSocket.disconnect(true)
      }
      players.delete(existingSocketId)
    }
    
    players.set(socket.id, {
      id: player.id,
      name: player.name,
      elo: player.elo,
      socketId: socket.id,
      inRoom: null,
      disconnectTime: null
    })
    
    playerIdToSocketId.set(player.id, socket.id)
    
    socket.emit('playerRegistered', {
      id: player.id,
      name: player.name,
      elo: player.elo
    })
    
    emitLobbyUpdate()
  })
  
  socket.on('syncRoomState', (data) => {
    const room = rooms.get(data.roomId)
    if (!room) {
      socket.emit('roomSyncFailed', { reason: 'Room not found' })
      return
    }
    
    const player = players.get(socket.id)
    if (!player) {
      socket.emit('roomSyncFailed', { reason: 'Player not found' })
      return
    }
    
    const isHost = room.host && room.host.id === player.id
    const isGuest = room.guest && room.guest.id === player.id
    
    if (!isHost && !isGuest) {
      socket.emit('roomSyncFailed', { reason: 'Not a member of this room' })
      return
    }
    
    player.inRoom = data.roomId
    socket.join(data.roomId)
    
    if (isHost) {
      room.host.socketId = socket.id
      room.host.elo = player.elo
    } else if (isGuest) {
      room.guest.socketId = socket.id
      room.guest.elo = player.elo
    }
    
    socket.emit('roomStateSynced', {
      room: serializeRoomForClient(room),
      isHost: isHost
    })
    
    if (room.guest) {
      io.to(data.roomId).emit('playerReconnected', {
        playerId: player.id,
        name: player.name
      })
    }
  })
  
  socket.on('createRoom', (data) => {
    const roomId = generateRoomId()
    const player = players.get(socket.id)
    
    if (!player) return
    
    const room = {
      id: roomId,
      host: { ...player },
      guest: null,
      song: data.song,
      isReady: false,
      isPlaying: false,
      hostReady: false,
      guestReady: false,
      hostScore: 0,
      guestScore: 0,
      hostCombo: 0,
      guestCombo: 0,
      gameStartTime: null,
      createdTime: Date.now()
    }
    
    rooms.set(roomId, room)
    player.inRoom = roomId
    
    socket.join(roomId)
    socket.emit('roomCreated', serializeRoomForClient(room))
    emitLobbyUpdate()
  })
  
  socket.on('joinRoom', (data) => {
    const room = rooms.get(data.roomId?.toUpperCase())
    const player = players.get(socket.id)
    
    if (!room || !player || room.guest) {
      socket.emit('joinRoomFailed', { 
        reason: !room ? 'Room not found' : (!player ? 'Player error' : 'Room is full') 
      })
      return
    }
    
    room.guest = { ...player }
    player.inRoom = data.roomId.toUpperCase()
    
    socket.join(data.roomId.toUpperCase())
    io.to(data.roomId.toUpperCase()).emit('roomJoined', serializeRoomForClient(room))
    emitLobbyUpdate()
  })
  
  socket.on('leaveRoom', () => {
    const player = players.get(socket.id)
    if (!player || !player.inRoom) return
    
    const room = rooms.get(player.inRoom)
    if (!room) return
    
    socket.leave(player.inRoom)
    
    if (room.host.id === player.id) {
      if (room.guest) {
        io.to(room.guest.socketId).emit('roomClosed')
        const guestPlayer = players.get(room.guest.socketId)
        if (guestPlayer) guestPlayer.inRoom = null
      }
      rooms.delete(player.inRoom)
    } else {
      room.guest = null
      room.guestReady = false
      io.to(player.inRoom).emit('playerLeft', serializeRoomForClient(room))
    }
    
    player.inRoom = null
    emitLobbyUpdate()
  })
  
  socket.on('readyForGame', () => {
    const player = players.get(socket.id)
    if (!player || !player.inRoom) return
    
    const room = rooms.get(player.inRoom)
    if (!room) return
    
    if (room.host.id === player.id) {
      room.hostReady = true
    } else if (room.guest && room.guest.id === player.id) {
      room.guestReady = true
    }
    
    if (room.hostReady && room.guestReady && room.guest) {
      room.isReady = true
      io.to(player.inRoom).emit('gameReady', {
        song: room.song,
        host: room.host,
        guest: room.guest
      })
    } else {
      io.to(player.inRoom).emit('playerReady', {
        hostReady: room.hostReady,
        guestReady: room.guestReady
      })
    }
  })
  
  socket.on('startGame', () => {
    const player = players.get(socket.id)
    if (!player || !player.inRoom) return
    
    const room = rooms.get(player.inRoom)
    if (!room || !room.isReady) return
    
    room.isPlaying = true
    room.gameStartTime = Date.now()
    room.hostScore = 0
    room.guestScore = 0
    room.hostCombo = 0
    room.guestCombo = 0
    
    io.to(player.inRoom).emit('gameStarting', {
      startTime: room.gameStartTime,
      song: room.song
    })
  })
  
  socket.on('updateScore', (data) => {
    const player = players.get(socket.id)
    if (!player || !player.inRoom) return
    
    const room = rooms.get(player.inRoom)
    if (!room || !room.isPlaying) return
    
    if (room.host.id === player.id) {
      room.hostScore = data.score
      room.hostCombo = data.combo
      if (room.guest) {
        io.to(room.guest.socketId).emit('opponentScore', {
          playerId: room.host.id,
          score: data.score,
          combo: data.combo
        })
      }
    } else if (room.guest && room.guest.id === player.id) {
      room.guestScore = data.score
      room.guestCombo = data.combo
      io.to(room.host.socketId).emit('opponentScore', {
        playerId: room.guest.id,
        score: data.score,
        combo: data.combo
      })
    }
  })
  
  socket.on('requestFullScore', () => {
    const player = players.get(socket.id)
    if (!player || !player.inRoom) return
    
    const room = rooms.get(player.inRoom)
    if (!room) return
    
    if (room.host.id === player.id && room.guest) {
      socket.emit('fullScoreSync', {
        opponentScore: room.guestScore,
        opponentCombo: room.guestCombo
      })
    } else if (room.guest && room.guest.id === player.id) {
      socket.emit('fullScoreSync', {
        opponentScore: room.hostScore,
        opponentCombo: room.hostCombo
      })
    }
  })
  
  socket.on('gameEnd', (data) => {
    const player = players.get(socket.id)
    if (!player || !player.inRoom) return
    
    const room = rooms.get(player.inRoom)
    if (!room) return
    
    if (room.host.id === player.id) {
      room.hostFinalScore = data.score
      room.hostResults = data.results
    } else if (room.guest && room.guest.id === player.id) {
      room.guestFinalScore = data.score
      room.guestResults = data.results
    }
    
    if (room.hostFinalScore !== undefined && room.guestFinalScore !== undefined) {
      const hostWon = room.hostFinalScore > room.guestFinalScore
      const result = hostWon ? 1 : (room.hostFinalScore === room.guestFinalScore ? 0.5 : 0)
      
      const { newElo1, newElo2 } = calculateElo(room.host.elo, room.guest.elo, result)
      
      db.updatePlayerElo(room.host.id, newElo1)
      db.updatePlayerElo(room.guest.id, newElo2)
      
      room.host.elo = newElo1
      room.guest.elo = newElo2
      
      const matchRecord = db.createMatch({
        hostId: room.host.id,
        guestId: room.guest.id,
        songTitle: room.song?.title || 'Unknown',
        hostScore: room.hostFinalScore,
        guestScore: room.guestFinalScore,
        winnerId: hostWon ? room.host.id : (room.guestFinalScore > room.hostFinalScore ? room.guest.id : null)
      })
      
      io.to(player.inRoom).emit('matchResult', {
        host: {
          ...room.host,
          finalScore: room.hostFinalScore,
          eloChange: newElo1 - room.host.elo,
          results: room.hostResults
        },
        guest: {
          ...room.guest,
          finalScore: room.guestFinalScore,
          eloChange: newElo2 - room.guest.elo,
          results: room.guestResults
        },
        winner: hostWon ? 'host' : (room.guestFinalScore > room.hostFinalScore ? 'guest' : 'draw'),
        matchId: matchRecord.id
      })
      
      room.isPlaying = false
    }
  })
  
  socket.on('getMatchHistory', (data) => {
    const history = db.getMatchHistory(data.playerId)
    socket.emit('matchHistory', history)
  })
  
  socket.on('getLeaderboard', () => {
    const leaderboard = db.getLeaderboard()
    socket.emit('leaderboard', leaderboard)
  })

  socket.on('createBeatmap', (data) => {
    const player = players.get(socket.id)
    if (!player) {
      socket.emit('beatmapError', { error: 'Player not found' })
      return
    }

    try {
      const beatmapData = {
        title: data.title,
        artist: data.artist,
        creatorId: player.id,
        creatorName: player.name,
        bpm: data.bpm || 120,
        duration: data.duration || 60,
        difficulty: data.difficulty || 'normal',
        description: data.description || '',
        isPublic: data.isPublic !== false,
        audioHash: data.audioHash || null
      }

      const beatmapId = db.createBeatmap(beatmapData, data.notes || [])
      socket.emit('beatmapCreated', { beatmapId })
    } catch (error) {
      console.error('Create beatmap error:', error)
      socket.emit('beatmapError', { error: error.message || 'Failed to create beatmap' })
    }
  })

  socket.on('updateBeatmap', (data) => {
    const player = players.get(socket.id)
    if (!player) {
      socket.emit('beatmapError', { error: 'Player not found' })
      return
    }

    const existingBeatmap = db.getBeatmap(data.beatmapId)
    if (!existingBeatmap) {
      socket.emit('beatmapError', { error: 'Beatmap not found' })
      return
    }

    if (existingBeatmap.creator_id !== player.id) {
      socket.emit('beatmapError', { error: 'Not authorized to update this beatmap' })
      return
    }

    try {
      const beatmapData = {
        title: data.title || existingBeatmap.title,
        artist: data.artist !== undefined ? data.artist : existingBeatmap.artist,
        bpm: data.bpm || existingBeatmap.bpm,
        duration: data.duration !== undefined ? data.duration : existingBeatmap.duration,
        difficulty: data.difficulty || existingBeatmap.difficulty,
        description: data.description !== undefined ? data.description : existingBeatmap.description,
        isPublic: data.isPublic !== undefined ? data.isPublic : existingBeatmap.isPublic
      }

      db.updateBeatmap(data.beatmapId, beatmapData, data.notes || existingBeatmap.notes)
      socket.emit('beatmapUpdated', { beatmapId: data.beatmapId })
    } catch (error) {
      console.error('Update beatmap error:', error)
      socket.emit('beatmapError', { error: error.message || 'Failed to update beatmap' })
    }
  })

  socket.on('getBeatmap', (data) => {
    try {
      const beatmap = db.getBeatmap(data.beatmapId)
      if (!beatmap) {
        socket.emit('beatmapError', { error: 'Beatmap not found' })
        return
      }
      socket.emit('beatmapData', beatmap)
    } catch (error) {
      console.error('Get beatmap error:', error)
      socket.emit('beatmapError', { error: error.message })
    }
  })

  socket.on('getBeatmapList', (data) => {
    try {
      const options = {}
      if (data?.creatorId) options.creatorId = data.creatorId
      if (data?.publicOnly !== undefined) options.publicOnly = data.publicOnly
      if (data?.limit) options.limit = data.limit

      const beatmaps = db.getBeatmapList(options)
      socket.emit('beatmapList', beatmaps)
    } catch (error) {
      console.error('Get beatmap list error:', error)
      socket.emit('beatmapError', { error: error.message })
    }
  })

  socket.on('searchBeatmaps', (data) => {
    try {
      const options = {}
      if (data?.publicOnly !== undefined) options.publicOnly = data.publicOnly

      const beatmaps = db.searchBeatmaps(data.keyword || '', options)
      socket.emit('beatmapSearchResult', beatmaps)
    } catch (error) {
      console.error('Search beatmaps error:', error)
      socket.emit('beatmapError', { error: error.message })
    }
  })

  socket.on('deleteBeatmap', (data) => {
    const player = players.get(socket.id)
    if (!player) {
      socket.emit('beatmapError', { error: 'Player not found' })
      return
    }

    try {
      const deleted = db.deleteBeatmap(data.beatmapId, player.id)
      if (deleted) {
        socket.emit('beatmapDeleted', { beatmapId: data.beatmapId })
      } else {
        socket.emit('beatmapError', { error: 'Failed to delete beatmap' })
      }
    } catch (error) {
      console.error('Delete beatmap error:', error)
      socket.emit('beatmapError', { error: error.message })
    }
  })
  
  socket.on('disconnect', () => {
    const player = players.get(socket.id)
    if (!player) {
      console.log('用户断开 (未知):', socket.id)
      return
    }
    
    console.log('用户断开:', player.name, socket.id)
    
    player.disconnectTime = Date.now()
    
    if (player.inRoom) {
      const room = rooms.get(player.inRoom)
      if (room) {
        if (room.isPlaying) {
          io.to(player.inRoom).emit('playerDisconnected', {
            playerId: player.id,
            name: player.name
          })
        } else {
          if (room.host.id === player.id) {
            if (room.guest) {
              io.to(room.guest.socketId).emit('hostDisconnected', {
                hostName: room.host.name
              })
            }
            rooms.delete(player.inRoom)
          } else {
            room.guest = null
            room.guestReady = false
            io.to(player.inRoom).emit('playerLeft', serializeRoomForClient(room))
          }
        }
      }
    }
    
    setTimeout(() => {
      const currentPlayer = players.get(socket.id)
      if (currentPlayer && currentPlayer.disconnectTime === player.disconnectTime) {
        console.log('玩家超时未重连，清理数据:', player.name)
        
        if (currentPlayer.inRoom) {
          const room = rooms.get(currentPlayer.inRoom)
          if (room && room.isPlaying) {
            const isHost = room.host.id === player.id
            const otherPlayer = isHost ? room.guest : room.host
            
            if (otherPlayer) {
              if (isHost) {
                room.hostFinalScore = room.hostScore || 0
                room.hostResults = room.hostResults || { score: room.hostScore || 0 }
              } else {
                room.guestFinalScore = room.guestScore || 0
                room.guestResults = room.guestResults || { score: room.guestScore || 0 }
              }
              
              if (room.hostFinalScore === undefined) {
                room.hostFinalScore = room.hostScore || 0
                room.hostResults = { score: room.hostScore || 0 }
              }
              if (room.guestFinalScore === undefined) {
                room.guestFinalScore = room.guestScore || 0
                room.guestResults = { score: room.guestScore || 0 }
              }
              
              const hostWon = room.hostFinalScore > room.guestFinalScore
              const result = hostWon ? 1 : (room.hostFinalScore === room.guestFinalScore ? 0.5 : 0)
              
              const { newElo1, newElo2 } = calculateElo(room.host.elo, room.guest.elo, result)
              
              db.updatePlayerElo(room.host.id, newElo1)
              db.updatePlayerElo(room.guest.id, newElo2)
              
              const matchRecord = db.createMatch({
                hostId: room.host.id,
                guestId: room.guest.id,
                songTitle: room.song?.title || 'Unknown',
                hostScore: room.hostFinalScore,
                guestScore: room.guestFinalScore,
                winnerId: hostWon ? room.host.id : (room.guestFinalScore > room.hostFinalScore ? room.guest.id : null)
              })
              
              io.to(otherPlayer.socketId).emit('matchResult', {
                host: {
                  ...room.host,
                  finalScore: room.hostFinalScore,
                  eloChange: newElo1 - room.host.elo,
                  results: room.hostResults
                },
                guest: {
                  ...room.guest,
                  finalScore: room.guestFinalScore,
                  eloChange: newElo2 - room.guest.elo,
                  results: room.guestResults
                },
                winner: hostWon ? 'host' : (room.guestFinalScore > room.hostFinalScore ? 'guest' : 'draw'),
                matchId: matchRecord.id,
                opponentForfeit: isHost ? 'guest' : 'host'
              })
              
              room.isPlaying = false
            }
          }
        }
        
        players.delete(socket.id)
        if (playerIdToSocketId.get(player.id) === socket.id) {
          playerIdToSocketId.delete(player.id)
        }
        emitLobbyUpdate()
      }
    }, DISCONNECT_GRACE_PERIOD)
  })
})

function emitLobbyUpdate() {
  const availableRooms = Array.from(rooms.values())
    .filter(r => !r.guest && !r.isPlaying)
    .map(serializeRoomForClient)
  
  io.emit('lobbyUpdate', {
    rooms: availableRooms,
    playerCount: players.size
  })
}

app.use(express.json())

app.get('/api/leaderboard', (req, res) => {
  const leaderboard = db.getLeaderboard()
  res.json(leaderboard)
})

app.get('/api/matches/:playerId', (req, res) => {
  const history = db.getMatchHistory(req.params.playerId)
  res.json(history)
})

app.get('/api/beatmaps', (req, res) => {
  try {
    const options = {}
    if (req.query.creatorId) options.creatorId = parseInt(req.query.creatorId)
    if (req.query.publicOnly !== undefined) options.publicOnly = req.query.publicOnly === 'true'
    if (req.query.limit) options.limit = parseInt(req.query.limit)

    const beatmaps = db.getBeatmapList(options)
    res.json(beatmaps)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/beatmaps/:id', (req, res) => {
  try {
    const beatmap = db.getBeatmap(parseInt(req.params.id))
    if (!beatmap) {
      res.status(404).json({ error: 'Beatmap not found' })
      return
    }
    res.json(beatmap)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/beatmaps/search/:keyword', (req, res) => {
  try {
    const options = {}
    if (req.query.publicOnly !== undefined) options.publicOnly = req.query.publicOnly === 'true'

    const beatmaps = db.searchBeatmaps(req.params.keyword, options)
    res.json(beatmaps)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

const PORT = 3001
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`)
})
