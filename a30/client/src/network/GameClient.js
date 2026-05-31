export class GameClient {
  constructor() {
    this.ws = null
    this.roomId = null
    this.playerId = null
    this.player = null
    this.gameState = null
    this.listeners = {}
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
  }

  connect(serverUrl = 'ws://localhost:8080/ws') {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(serverUrl)

      this.ws.onopen = () => {
        console.log('Connected to server')
        this.reconnectAttempts = 0
        resolve(true)
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data)
      }

      this.ws.onclose = () => {
        console.log('Disconnected from server')
        this.attemptReconnect(serverUrl)
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        reject(error)
      }
    })
  }

  attemptReconnect(serverUrl) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`Reconnecting... attempt ${this.reconnectAttempts}`)
      setTimeout(() => {
        this.connect(serverUrl).then(() => {
          if (this.roomId && this.player) {
            this.emit('reconnected')
          }
        }).catch(() => {
          console.log('Reconnection failed')
        })
      }, 2000 * this.reconnectAttempts)
    }
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data)
      console.log('Received:', message.type)

      switch (message.type) {
        case 'room_created':
          this.roomId = message.roomId
          this.emit('room_created', message.roomId)
          break

        case 'joined_room':
          this.player = message.player
          this.playerId = message.player.id
          this.gameState = {
            players: message.players,
            room: { id: this.roomId }
          }
          this.emit('joined_room', { player: message.player, players: message.players })
          break

        case 'player_joined':
          if (this.gameState) {
            this.gameState.players = message.players
          }
          this.emit('player_joined', { player: message.player, players: message.players })
          break

        case 'player_left':
          if (this.gameState) {
            this.gameState.players = this.gameState.players.filter(
              p => p.id !== message.playerId
            )
          }
          this.emit('player_left', message.playerId)
          break

        case 'state_update':
        case 'game_state':
          this.gameState = message.state
          this.emit('state_update', message.state)
          break

        case 'attack_result':
          this.gameState = message.state
          this.emit('attack_result', { enemy: message.enemy, state: message.state })
          break

        case 'error':
          console.error('Server error:', message.error)
          this.emit('error', message.error)
          break

        case 'enemy_marked':
          this.gameState = message.state
          this.emit('enemy_marked', { enemyId: message.enemyId, state: message.state })
          break

        case 'leaderboard':
          this.emit('leaderboard', message.leaderboard)
          break

        case 'achievements':
          this.emit('achievements', message.achievements)
          break

        default:
          this.emit(message.type, message)
      }
    } catch (error) {
      console.error('Message parse error:', error)
    }
  }

  send(type, payload = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({ type, payload })
      this.ws.send(message)
      console.log('Sent:', type)
    } else {
      console.warn('Cannot send message: WebSocket not connected')
    }
  }

  createRoom() {
    this.send('create_room')
  }

  joinRoom(roomId, playerName) {
    this.send('join_room', { roomId, name: playerName })
  }

  move(x, y) {
    this.send('move', { x, y })
  }

  attack(enemyId) {
    this.send('attack', { enemyId })
  }

  getState() {
    this.send('get_state')
  }

  markEnemy(enemyId) {
    this.send('mark_enemy', { enemyId })
  }

  getLeaderboard() {
    this.send('get_leaderboard')
  }

  getAchievements() {
    this.send('get_achievements')
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }
    this.listeners[event].push(callback)
  }

  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback)
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data))
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
    }
  }
}

export const gameClient = new GameClient()
