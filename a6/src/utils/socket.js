import { io } from 'socket.io-client'

let socket = null
let pendingEvents = []
let reconnecting = false
let reconnectionAttempts = 0
const MAX_RECONNECTION_ATTEMPTS = 10
const RECONNECTION_DELAY = 1000

let playerData = null
let isInRoom = false
let currentRoomId = null

export function initSocket() {
  if (socket) {
    return socket
  }

  socket = io('http://localhost:3001', {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: MAX_RECONNECTION_ATTEMPTS,
    reconnectionDelay: RECONNECTION_DELAY,
    reconnectionDelayMax: 5000,
    timeout: 20000
  })

  socket.on('connect', () => {
    console.log('Connected to server:', socket.id)
    reconnectionAttempts = 0

    if (playerData) {
      socket.emit('register', { name: playerData.name })
      console.log('Reconnected, re-registering player:', playerData.name)
    }

    if (playerData && currentRoomId && isInRoom) {
      setTimeout(() => {
        socket.emit('syncRoomState', { 
          roomId: currentRoomId,
          playerId: playerData.id 
        })
        console.log('Requesting room state sync for room:', currentRoomId)
      }, 500)
    }

    if (pendingEvents.length > 0) {
      console.log('Flushing pending events:', pendingEvents.length)
      pendingEvents.forEach(({ event, data }) => {
        socket.emit(event, data)
      })
      pendingEvents = []
    }
  })

  socket.on('disconnect', (reason) => {
    console.log('Disconnected from server. Reason:', reason)
    reconnecting = true
  })

  socket.on('connect_error', (error) => {
    reconnectionAttempts++
    console.log('Connection error. Attempt:', reconnectionAttempts)
    if (reconnectionAttempts >= MAX_RECONNECTION_ATTEMPTS) {
      console.log('Max reconnection attempts reached')
      reconnecting = false
    }
  })

  socket.on('reconnect', (attemptNumber) => {
    console.log('Reconnected after', attemptNumber, 'attempts')
    reconnecting = false
  })

  socket.on('reconnect_failed', () => {
    console.log('Reconnection failed')
    reconnecting = false
  })

  return socket
}

export function setPlayerData(data) {
  playerData = data
}

export function getPlayerData() {
  return playerData
}

export function setRoomState(roomId, inRoom) {
  currentRoomId = roomId
  isInRoom = inRoom
}

export function clearRoomState() {
  currentRoomId = null
  isInRoom = false
}

export function getSocket() {
  if (!socket) {
    initSocket()
  }
  return socket
}

export function isConnected() {
  return socket && socket.connected
}

export function isReconnecting() {
  return reconnecting
}

export function emit(event, data) {
  const s = getSocket()
  
  if (s.connected) {
    s.emit(event, data)
  } else {
    console.log('Socket not connected, queueing event:', event)
    pendingEvents.push({ event, data })
    
    if (pendingEvents.length > 50) {
      pendingEvents = pendingEvents.slice(-25)
    }
  }
}

export function emitWithAck(event, data) {
  return new Promise((resolve, reject) => {
    const s = getSocket()
    
    if (!s.connected) {
      reject(new Error('Socket not connected'))
      return
    }
    
    s.timeout(5000).emit(event, data, (err, response) => {
      if (err) {
        reject(err)
      } else {
        resolve(response)
      }
    })
  })
}

export function on(event, callback) {
  const s = getSocket()
  s.on(event, callback)
}

export function off(event, callback) {
  const s = getSocket()
  if (callback) {
    s.off(event, callback)
  } else {
    s.off(event)
  }
}

export function once(event, callback) {
  const s = getSocket()
  s.once(event, callback)
}

export function disconnect() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
