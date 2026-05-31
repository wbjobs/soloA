import Phaser from 'phaser'
import { gameClient } from '../network/GameClient'

const TILE_SIZE = 32
const TILE_COLORS = {
  wall: 0x1a1a2e,
  floor: 0x2a2a4e,
  door: 0x4a4a6e,
  stairs: 0xffd700
}

const TRAP_COLORS = {
  pressure_plate: 0xffaa00,
  poison_fog: 0x00ff00,
  falling_rock: 0x884400
}

const RANK_COLORS = {
  bronze: 0xcd7f32,
  silver: 0xc0c0c0,
  gold: 0xffd700,
  platinum: 0xe5e4e2,
  diamond: 0xb9f2ff,
  master: 0x9932cc,
  champion: 0xff4500
}

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' })
    this.tiles = []
    this.players = new Map()
    this.enemies = new Map()
    this.items = []
    this.traps = new Map()
    this.markers = new Map()
    this.gameState = null
    this.currentPlayer = null
    this.cameraSpeed = 5
    this.playerRenderPositions = new Map()
    this.MAX_POSITION_DEVIATION = 2
    this.isGhostMode = false
    this.ghostModeHint = null
    this.trapEffects = []
    this.markedEnemies = new Set()
  }

  create() {
    this.graphics = this.add.graphics()
    this.playerGraphics = this.add.graphics()
    this.enemyGraphics = this.add.graphics()
    this.itemGraphics = this.add.graphics()
    this.trapGraphics = this.add.graphics()
    this.effectGraphics = this.add.graphics()
    this.markerGraphics = this.add.graphics()

    this.setupNetworkListeners()
    this.setupInput()

    this.cameras.main.setBackgroundColor(0x0a0a1e)

    this.zoomText = this.add.text(20, 20, '缩放: 1x', {
      fontSize: '16px',
      color: '#ffffff'
    }).setScrollFactor(0).setDepth(100)

    this.zoomLevel = 1

    gameClient.getState()
  }

  setupNetworkListeners() {
    gameClient.on('state_update', (state) => {
      this.updateGameState(state)
    })

    gameClient.on('attack_result', (data) => {
      this.updateGameState(data.state)
      this.showAttackEffect(data.enemy)
    })

    gameClient.on('player_joined', (data) => {
      if (this.gameState) {
        this.gameState.players = data.players
        this.updateGameState(this.gameState)
      }
    })

    gameClient.on('player_left', (playerId) => {
      if (this.gameState) {
        this.gameState.players = this.gameState.players.filter(p => p.id !== playerId)
        this.players.delete(playerId)
        this.updateGameState(this.gameState)
      }
    })

    gameClient.on('enemy_marked', (data) => {
      this.markedEnemies.add(data.enemyId)
      this.updateGameState(data.state)
      this.showMarkerEffect(data.enemyId)
    })
  }

  setupInput() {
    this.input.keyboard.on('keydown-W', () => this.movePlayer(0, -1))
    this.input.keyboard.on('keydown-S', () => this.movePlayer(0, 1))
    this.input.keyboard.on('keydown-A', () => this.movePlayer(-1, 0))
    this.input.keyboard.on('keydown-D', () => this.movePlayer(1, 0))
    this.input.keyboard.on('keydown-UP', () => this.movePlayer(0, -1))
    this.input.keyboard.on('keydown-DOWN', () => this.movePlayer(0, 1))
    this.input.keyboard.on('keydown-LEFT', () => this.movePlayer(-1, 0))
    this.input.keyboard.on('keydown-RIGHT', () => this.movePlayer(1, 0))

    this.input.keyboard.on('keydown-SPACE', () => this.attackNearestEnemy())

    this.input.keyboard.on('keydown-E', () => this.markNearestEnemy())

    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
      if (deltaY < 0) {
        this.zoomLevel = Math.min(this.zoomLevel + 0.1, 2)
      } else {
        this.zoomLevel = Math.max(this.zoomLevel - 0.1, 0.5)
      }
      this.cameras.main.setZoom(this.zoomLevel)
      this.zoomText.setText(`缩放: ${this.zoomLevel.toFixed(1)}x`)
    })
  }

  markNearestEnemy() {
    if (!this.currentPlayer || !this.gameState) return

    if (this.currentPlayer.state !== 'ghost') {
      return
    }

    const playerPos = this.currentPlayer.position
    let nearestEnemy = null
    let nearestDistance = Infinity

    if (this.gameState.floor && this.gameState.floor.enemies) {
      for (const enemy of this.gameState.floor.enemies) {
        if (!enemy.isAlive || this.markedEnemies.has(enemy.id)) continue
        const distance = this.getDistance(playerPos, enemy.position)
        if (distance <= 10 && distance < nearestDistance) {
          nearestDistance = distance
          nearestEnemy = enemy
        }
      }
    }

    if (nearestEnemy) {
      gameClient.markEnemy(nearestEnemy.id)
    }
  }

  movePlayer(dx, dy) {
    if (!this.currentPlayer) return

    const newX = this.currentPlayer.position.x + dx
    const newY = this.currentPlayer.position.y + dy

    if (this.canMoveTo(newX, newY)) {
      gameClient.move(newX, newY)
    }
  }

  canMoveTo(x, y) {
    if (!this.gameState || !this.gameState.floor) return false
    const floor = this.gameState.floor
    if (x < 0 || x >= floor.width || y < 0 || y >= floor.height) return false
    return floor.tiles[y] && floor.tiles[y][x] && floor.tiles[y][x].walkable
  }

  attackNearestEnemy() {
    if (!this.currentPlayer || !this.gameState) return

    const playerPos = this.currentPlayer.position
    let nearestEnemy = null
    let nearestDistance = Infinity

    if (this.gameState.floor && this.gameState.floor.enemies) {
      for (const enemy of this.gameState.floor.enemies) {
        if (!enemy.isAlive) continue
        const distance = this.getDistance(playerPos, enemy.position)
        if (distance <= 1.5 && distance < nearestDistance) {
          nearestDistance = distance
          nearestEnemy = enemy
        }
      }
    }

    if (nearestEnemy) {
      gameClient.attack(nearestEnemy.id)
    }
  }

  getDistance(a, b) {
    return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2))
  }

  updateGameState(state) {
    this.gameState = state

    if (state.players) {
      for (const player of state.players) {
        if (player.id === gameClient.playerId) {
          this.currentPlayer = player
        }
        this.players.set(player.id, player)
      }
    }

    this.render()
    this.centerCameraOnPlayer()
  }

  centerCameraOnPlayer() {
    if (!this.currentPlayer) return

    const targetX = this.currentPlayer.position.x * TILE_SIZE + TILE_SIZE / 2
    const targetY = this.currentPlayer.position.y * TILE_SIZE + TILE_SIZE / 2

    const currentCamX = this.cameras.main.scrollX + this.cameras.main.width / 2
    const currentCamY = this.cameras.main.scrollY + this.cameras.main.height / 2

    const deviationX = Math.abs(targetX - currentCamX) / TILE_SIZE
    const deviationY = Math.abs(targetY - currentCamY) / TILE_SIZE
    const maxDeviation = Math.max(deviationX, deviationY)

    if (maxDeviation <= this.MAX_POSITION_DEVIATION) {
      this.cameras.main.pan(targetX, targetY, 200, 'Power2')
    } else {
      this.logPositionCorrection(maxDeviation)
      this.cameras.main.stopFollow()
      this.cameras.main.scrollX = targetX - this.cameras.main.width / 2
      this.cameras.main.scrollY = targetY - this.cameras.main.height / 2
    }
  }

  logPositionCorrection(deviation) {
    if (deviation > this.MAX_POSITION_DEVIATION) {
      console.warn(`[Sync] Position correction: deviation=${deviation.toFixed(2)} tiles, teleporting to authority position`)
    }
  }

  showAttackEffect(enemy) {
    if (!enemy) return
    const x = enemy.position.x * TILE_SIZE + TILE_SIZE / 2
    const y = enemy.position.y * TILE_SIZE + TILE_SIZE / 2

    const effect = this.add.circle(x, y, 20, 0xff0000, 0.5)
    this.tweens.add({
      targets: effect,
      alpha: 0,
      scale: 1.5,
      duration: 300,
      onComplete: () => effect.destroy()
    })
  }

  render() {
    this.graphics.clear()
    this.playerGraphics.clear()
    this.enemyGraphics.clear()
    this.itemGraphics.clear()
    this.trapGraphics.clear()
    this.effectGraphics.clear()
    this.markerGraphics.clear()

    if (!this.gameState || !this.gameState.floor) return

    const floor = this.gameState.floor

    this.checkGhostMode()
    this.renderFloor(floor)
    this.renderTraps(floor)
    this.renderItems(floor)
    this.renderEnemies(floor)
    this.renderPlayers()
    this.renderMarkers(floor)
  }

  checkGhostMode() {
    if (this.currentPlayer && this.currentPlayer.state === 'ghost') {
      if (!this.isGhostMode) {
        this.isGhostMode = true
        this.showGhostModeHint()
      }
    } else {
      if (this.isGhostMode) {
        this.isGhostMode = false
        this.hideGhostModeHint()
      }
    }
  }

  showGhostModeHint() {
    if (this.ghostModeHint) return

    this.ghostModeHint = this.add.text(
      this.cameras.main.width / 2,
      100,
      '幽灵模式 - 按E标记敌人位置',
      {
        fontSize: '24px',
        color: '#88ff88',
        stroke: '#000000',
        strokeThickness: 3
      }
    ).setOrigin(0.5).setScrollFactor(0).setDepth(1000).setAlpha(0.8)

    this.tweens.add({
      targets: this.ghostModeHint,
      alpha: 0.3,
      duration: 1000,
      yoyo: true,
      repeat: -1
    })
  }

  hideGhostModeHint() {
    if (this.ghostModeHint) {
      this.ghostModeHint.destroy()
      this.ghostModeHint = null
    }
  }

  renderFloor(floor) {
    for (let y = 0; y < floor.height; y++) {
      for (let x = 0; x < floor.width; x++) {
        if (!floor.tiles[y] || !floor.tiles[y][x]) continue

        const tile = floor.tiles[y][x]
        const px = x * TILE_SIZE
        const py = y * TILE_SIZE

        let color = TILE_COLORS.wall
        if (tile.type === 'floor') color = TILE_COLORS.floor
        else if (tile.type === 'door') color = TILE_COLORS.door
        else if (tile.type === 'stairs') color = TILE_COLORS.stairs

        this.graphics.fillStyle(color, 1)
        this.graphics.fillRect(px, py, TILE_SIZE - 1, TILE_SIZE - 1)

        if (tile.type === 'floor') {
          this.graphics.lineStyle(1, 0x1a1a2e, 0.3)
          this.graphics.strokeRect(px, py, TILE_SIZE - 1, TILE_SIZE - 1)
        }

        if (tile.type === 'stairs') {
          this.graphics.fillStyle(0x000000, 0.5)
          this.graphics.fillRect(px + 4, py + 4, TILE_SIZE - 8, TILE_SIZE - 8)
        }
      }
    }
  }

  renderItems(floor) {
    if (!floor.items) return

    for (const item of floor.items) {
      if (!item.position) continue
      const x = item.position.x * TILE_SIZE + TILE_SIZE / 2
      const y = item.position.y * TILE_SIZE + TILE_SIZE / 2

      let color = 0x888888
      if (item.rarity === 'uncommon') color = 0x00ff00
      else if (item.rarity === 'rare') color = 0x0088ff
      else if (item.rarity === 'epic') color = 0x8800ff
      else if (item.rarity === 'legendary') color = 0xff8800

      this.itemGraphics.fillStyle(color, 1)
      this.itemGraphics.fillRect(x - 8, y - 8, 16, 16)
      this.itemGraphics.lineStyle(2, 0xffffff, 0.5)
      this.itemGraphics.strokeRect(x - 8, y - 8, 16, 16)
    }
  }

  renderEnemies(floor) {
    if (!floor.enemies) return

    for (const enemy of floor.enemies) {
      if (!enemy.isAlive) continue

      const x = enemy.position.x * TILE_SIZE + TILE_SIZE / 2
      const y = enemy.position.y * TILE_SIZE + TILE_SIZE / 2

      this.enemyGraphics.fillStyle(0xff4444, 1)
      this.enemyGraphics.fillCircle(x, y, TILE_SIZE / 2 - 2)

      this.enemyGraphics.fillStyle(0x000000, 1)
      this.enemyGraphics.fillCircle(x - 5, y - 3, 3)
      this.enemyGraphics.fillCircle(x + 5, y - 3, 3)

      const healthPercent = enemy.health / enemy.maxHealth
      const barWidth = TILE_SIZE - 4
      const barHeight = 4
      const barX = x - barWidth / 2
      const barY = y - TILE_SIZE / 2 - 6

      this.enemyGraphics.fillStyle(0x440000, 1)
      this.enemyGraphics.fillRect(barX, barY, barWidth, barHeight)
      this.enemyGraphics.fillStyle(0xff0000, 1)
      this.enemyGraphics.fillRect(barX, barY, barWidth * healthPercent, barHeight)
    }
  }

  renderPlayers() {
    let index = 0
    const colors = [0x00d4ff, 0x00ff88, 0xff8800, 0xff00ff]

    for (const [playerId, player] of this.players) {
      const x = player.position.x * TILE_SIZE + TILE_SIZE / 2
      const y = player.position.y * TILE_SIZE + TILE_SIZE / 2
      const color = colors[index % colors.length]

      if (player.state === 'ghost') {
        this.renderGhostPlayer(x, y, player.name, color, playerId === gameClient.playerId)
      } else if (player.isAlive) {
        this.renderAlivePlayer(x, y, player, color, playerId === gameClient.playerId)
      }

      index++
    }
  }

  renderAlivePlayer(x, y, player, color, isCurrentPlayer) {
    this.playerGraphics.fillStyle(color, 1)
    this.playerGraphics.fillCircle(x, y, TILE_SIZE / 2 - 2)

    this.playerGraphics.fillStyle(0x000000, 1)
    this.playerGraphics.fillCircle(x - 5, y - 3, 3)
    this.playerGraphics.fillCircle(x + 5, y - 3, 3)

    const nameText = this.add.text(x, y - TILE_SIZE / 2 - 15, player.name, {
      fontSize: '12px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5)

    const barWidth = TILE_SIZE - 4
    const barHeight = 4
    const barX = x - barWidth / 2
    const barY = y - TILE_SIZE / 2 - 6

    this.playerGraphics.fillStyle(0x440000, 1)
    this.playerGraphics.fillRect(barX, barY, barWidth, barHeight)
    this.playerGraphics.fillStyle(0x00ff00, 1)
    this.playerGraphics.fillRect(barX, barY, barWidth * (player.health / player.maxHealth), barHeight)

    if (isCurrentPlayer) {
      this.playerGraphics.lineStyle(2, 0xffffff, 1)
      this.playerGraphics.strokeCircle(x, y, TILE_SIZE / 2 + 2)
    }
  }

  renderGhostPlayer(x, y, playerName, color, isCurrentPlayer) {
    this.playerGraphics.fillStyle(color, 0.4)
    this.playerGraphics.fillCircle(x, y, TILE_SIZE / 2 - 2)

    this.playerGraphics.lineStyle(2, color, 0.8)
    this.playerGraphics.strokeCircle(x, y, TILE_SIZE / 2 - 2)

    this.playerGraphics.fillStyle(0x000000, 0.4)
    this.playerGraphics.fillCircle(x - 5, y - 3, 3)
    this.playerGraphics.fillCircle(x + 5, y - 3, 3)

    const nameText = this.add.text(x, y - TILE_SIZE / 2 - 15, `${playerName} (幽灵)`, {
      fontSize: '12px',
      color: '#88ff88',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5)

    if (isCurrentPlayer) {
      this.playerGraphics.lineStyle(2, 0x88ff88, 0.8)
      this.playerGraphics.strokeCircle(x, y, TILE_SIZE / 2 + 2)
    }
  }

  renderTraps(floor) {
    if (!floor.traps) return

    for (const trap of floor.traps) {
      const x = trap.position.x * TILE_SIZE + TILE_SIZE / 2
      const y = trap.position.y * TILE_SIZE + TILE_SIZE / 2

      if (!trap.visible && trap.status === 'active') {
        continue
      }

      const color = TRAP_COLORS[trap.type] || 0x888888
      let alpha = 1
      if (trap.status === 'triggered' || trap.status === 'cooldown') {
        alpha = 0.5
      }

      this.renderTrap(x, y, trap.type, color, alpha, trap.radius)
    }
  }

  renderTrap(x, y, trapType, color, alpha, radius) {
    switch (trapType) {
      case 'pressure_plate':
        this.trapGraphics.fillStyle(color, alpha)
        this.trapGraphics.fillRect(x - 12, y - 12, 24, 24)
        this.trapGraphics.lineStyle(2, 0xffffff, alpha * 0.7)
        this.trapGraphics.strokeRect(x - 12, y - 12, 24, 24)
        this.trapGraphics.fillStyle(0x000000, alpha)
        this.trapGraphics.fillRect(x - 8, y - 8, 16, 16)
        break

      case 'poison_fog':
        for (let i = 0; i < 3; i++) {
          const fogX = x + (Math.random() - 0.5) * 20
          const fogY = y + (Math.random() - 0.5) * 20
          const fogRadius = 10 + Math.random() * 10
          this.trapGraphics.fillStyle(color, alpha * 0.3)
          this.trapGraphics.fillCircle(fogX, fogY, fogRadius)
        }
        break

      case 'falling_rock':
        this.trapGraphics.fillStyle(color, alpha)
        this.trapGraphics.beginPath()
        this.trapGraphics.moveTo(x - 10, y + 10)
        this.trapGraphics.lineTo(x + 10, y + 10)
        this.trapGraphics.lineTo(x, y - 12)
        this.trapGraphics.closePath()
        this.trapGraphics.fillPath()
        break

      default:
        this.trapGraphics.fillStyle(color, alpha)
        this.trapGraphics.fillCircle(x, y, 10)
    }
  }

  renderMarkers(floor) {
    if (!this.markedEnemies || this.markedEnemies.size === 0) return

    if (!floor.enemies) return

    for (const enemy of floor.enemies) {
      if (!enemy.isAlive) continue

      if (this.markedEnemies.has(enemy.id)) {
        const x = enemy.position.x * TILE_SIZE + TILE_SIZE / 2
        const y = enemy.position.y * TILE_SIZE + TILE_SIZE / 2

        this.markerGraphics.lineStyle(3, 0xffff00, 1)
        this.markerGraphics.strokeCircle(x, y, TILE_SIZE / 2 + 5)

        this.markerGraphics.fillStyle(0xffff00, 1)
        const markerText = this.add.text(x, y - TILE_SIZE / 2 - 20, '⚠️ 标记', {
          fontSize: '10px',
          color: '#ffff00',
          stroke: '#000000',
          strokeThickness: 1
        }).setOrigin(0.5)
      }
    }
  }

  showMarkerEffect(enemyId) {
    if (!this.gameState || !this.gameState.floor || !this.gameState.floor.enemies) return

    const enemy = this.gameState.floor.enemies.find(e => e.id === enemyId)
    if (!enemy) return

    const x = enemy.position.x * TILE_SIZE + TILE_SIZE / 2
    const y = enemy.position.y * TILE_SIZE + TILE_SIZE / 2

    const effect = this.add.circle(x, y, 30, 0xffff00, 0.5)
    this.tweens.add({
      targets: effect,
      alpha: 0,
      scale: 1.5,
      duration: 500,
      onComplete: () => effect.destroy()
    })
  }

  update() {
  }
}
