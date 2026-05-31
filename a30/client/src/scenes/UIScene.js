import Phaser from 'phaser'
import { gameClient } from '../network/GameClient'

export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' })
    this.uiElements = []
  }

  create() {
    this.playerPanel = this.createPlayerPanel()
    this.roomInfoPanel = this.createRoomInfoPanel()
    this.controlsPanel = this.createControlsPanel()
    this.inventoryPanel = this.createInventoryPanel()

    this.setupNetworkListeners()
  }

  createPlayerPanel() {
    const panel = this.add.rectangle(20, 20, 250, 200, 0x1a1a2e, 0.9)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setStrokeStyle(2, 0x00d4ff)

    this.add.text(30, 30, '角色信息', {
      fontSize: '18px',
      color: '#00d4ff',
      fontWeight: 'bold'
    }).setScrollFactor(0).setDepth(1001)

    this.playerNameText = this.add.text(30, 60, '', {
      fontSize: '14px',
      color: '#ffffff'
    }).setScrollFactor(0).setDepth(1001)

    this.healthText = this.add.text(30, 85, '', {
      fontSize: '14px',
      color: '#00ff00'
    }).setScrollFactor(0).setDepth(1001)

    this.levelText = this.add.text(30, 110, '', {
      fontSize: '14px',
      color: '#ffcc00'
    }).setScrollFactor(0).setDepth(1001)

    this.statsText = this.add.text(30, 135, '', {
      fontSize: '12px',
      color: '#aaaaaa'
    }).setScrollFactor(0).setDepth(1001)

    this.floorText = this.add.text(30, 180, '', {
      fontSize: '14px',
      color: '#ff8800'
    }).setScrollFactor(0).setDepth(1001)

    return panel
  }

  createRoomInfoPanel() {
    const panel = this.add.rectangle(this.scale.width - 20, 20, 250, 150, 0x1a1a2e, 0.9)
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setStrokeStyle(2, 0x00d4ff)

    this.add.text(this.scale.width - 240, 30, '房间信息', {
      fontSize: '18px',
      color: '#00d4ff',
      fontWeight: 'bold'
    }).setScrollFactor(0).setDepth(1001)

    this.roomIdText = this.add.text(this.scale.width - 240, 60, '', {
      fontSize: '12px',
      color: '#ffffff'
    }).setScrollFactor(0).setDepth(1001)

    this.playersListText = this.add.text(this.scale.width - 240, 90, '', {
      fontSize: '12px',
      color: '#aaaaaa'
    }).setScrollFactor(0).setDepth(1001)

    return panel
  }

  createControlsPanel() {
    const panel = this.add.rectangle(20, this.scale.height - 20, 400, 80, 0x1a1a2e, 0.9)
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(1000)
      .setStrokeStyle(2, 0x00d4ff)

    this.add.text(30, this.scale.height - 90, '操作说明', {
      fontSize: '14px',
      color: '#00d4ff',
      fontWeight: 'bold'
    }).setScrollFactor(0).setDepth(1001)

    this.add.text(30, this.scale.height - 70, 'WASD/方向键: 移动  |  空格: 攻击  |  滚轮: 缩放', {
      fontSize: '12px',
      color: '#aaaaaa'
    }).setScrollFactor(0).setDepth(1001)

    this.add.text(30, this.scale.height - 50, '黄金楼梯: 进入下一层', {
      fontSize: '12px',
      color: '#ffd700'
    }).setScrollFactor(0).setDepth(1001)

    return panel
  }

  createInventoryPanel() {
    const panel = this.add.rectangle(this.scale.width - 20, this.scale.height - 20, 300, 150, 0x1a1a2e, 0.9)
      .setOrigin(1, 1)
      .setScrollFactor(0)
      .setDepth(1000)
      .setStrokeStyle(2, 0x00d4ff)

    this.add.text(this.scale.width - 290, this.scale.height - 160, '背包', {
      fontSize: '14px',
      color: '#00d4ff',
      fontWeight: 'bold'
    }).setScrollFactor(0).setDepth(1001)

    this.inventoryText = this.add.text(this.scale.width - 290, this.scale.height - 135, '', {
      fontSize: '11px',
      color: '#aaaaaa'
    }).setScrollFactor(0).setDepth(1001)

    return panel
  }

  setupNetworkListeners() {
    gameClient.on('state_update', (state) => {
      this.updateUI(state)
    })

    gameClient.on('joined_room', (data) => {
      this.roomIdText.setText(`房间ID: ${gameClient.roomId}`)
    })
  }

  updateUI(state) {
    if (!state) return

    const player = state.players?.find(p => p.id === gameClient.playerId)
    if (player) {
      this.updatePlayerUI(player)
    }

    if (state.players) {
      this.updatePlayersList(state.players)
    }

    if (player?.inventory) {
      this.updateInventoryUI(player.inventory)
    }
  }

  updatePlayerUI(player) {
    this.playerNameText.setText(`名称: ${player.name}`)
    this.healthText.setText(`生命: ${player.health}/${player.maxHealth}`)
    this.levelText.setText(`等级: ${player.level}  |  金币: ${player.gold}`)
    
    let totalAttack = player.attack
    let totalDefense = player.defense
    if (player.equipment?.weapon) {
      totalAttack += player.equipment.weapon.stats.attackBonus || 0
    }
    if (player.equipment?.armor) {
      totalDefense += player.equipment.armor.stats.defenseBonus || 0
    }
    if (player.equipment?.helmet) {
      totalDefense += player.equipment.helmet.stats.defenseBonus || 0
    }

    this.statsText.setText(`攻击: ${totalAttack}  |  防御: ${totalDefense}  |  经验: ${player.exp}`)
    this.floorText.setText(`当前楼层: ${player.floor + 1} 层`)

    const healthPercent = player.health / player.maxHealth
    if (healthPercent < 0.3) {
      this.healthText.setColor('#ff0000')
    } else if (healthPercent < 0.6) {
      this.healthText.setColor('#ffcc00')
    } else {
      this.healthText.setColor('#00ff00')
    }
  }

  updatePlayersList(players) {
    let text = '玩家列表:\n'
    players.forEach((p, i) => {
      const status = p.isAlive ? '●' : '○'
      const color = p.isAlive ? '#00ff00' : '#ff0000'
      text += `  ${status} ${p.name} (Lv.${p.level})\n`
    })
    this.playersListText.setText(text)
  }

  updateInventoryUI(inventory) {
    if (!inventory || inventory.length === 0) {
      this.inventoryText.setText('背包是空的')
      return
    }

    let text = ''
    inventory.slice(0, 6).forEach(item => {
      let color = '#888888'
      if (item.rarity === 'uncommon') color = '#00ff00'
      else if (item.rarity === 'rare') color = '#0088ff'
      else if (item.rarity === 'epic') color = '#8800ff'
      else if (item.rarity === 'legendary') color = '#ff8800'

      const stats = []
      if (item.stats.attackBonus) stats.push(`攻+${item.stats.attackBonus}`)
      if (item.stats.defenseBonus) stats.push(`防+${item.stats.defenseBonus}`)
      if (item.stats.healthBonus) stats.push(`血+${item.stats.healthBonus}`)

      text += `${item.name} (${stats.join(', ') || '无属性'})\n`
    })

    if (inventory.length > 6) {
      text += `... 还有 ${inventory.length - 6} 件物品`
    }

    this.inventoryText.setText(text)
  }
}
