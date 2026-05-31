import Phaser from 'phaser'
import { gameClient } from '../network/GameClient'

export class MainMenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MainMenuScene' })
    this.uiElements = []
  }

  create() {
    const bg = this.add.rectangle(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      this.cameras.main.width,
      this.cameras.main.height,
      0x1a1a2e
    )

    const title = this.add.text(
      this.cameras.main.width / 2,
      150,
      'Roguelike地牢探险',
      {
        fontSize: '64px',
        fontFamily: 'Arial',
        color: '#00d4ff',
        stroke: '#000000',
        strokeThickness: 4
      }
    ).setOrigin(0.5)

    const subtitle = this.add.text(
      this.cameras.main.width / 2,
      230,
      '多人联机 · 服务端权威 · 地牢探索',
      {
        fontSize: '24px',
        fontFamily: 'Arial',
        color: '#888888'
      }
    ).setOrigin(0.5)

    this.playerNameInput = this.createInputField(
      this.cameras.main.width / 2,
      350,
      '输入角色名称',
      'Hero'
    )

    this.createButton(
      this.cameras.main.width / 2,
      450,
      '创建房间',
      () => this.createRoom()
    )

    this.roomIdInput = this.createInputField(
      this.cameras.main.width / 2,
      550,
      '输入房间ID',
      ''
    )

    this.createButton(
      this.cameras.main.width / 2,
      620,
      '加入房间',
      () => this.joinRoom()
    )

    this.createButton(
      this.cameras.main.width / 2,
      700,
      '排行榜与成就',
      () => this.openLeaderboard(),
      0x8844ff
    )

    this.setupNetworkListeners()

    this.statusText = this.add.text(
      this.cameras.main.width / 2,
      680,
      '连接到服务器...',
      {
        fontSize: '18px',
        fontFamily: 'Arial',
        color: '#ffcc00'
      }
    ).setOrigin(0.5)

    this.connectToServer()
  }

  async connectToServer() {
    try {
      await gameClient.connect()
      this.statusText.setText('已连接到服务器')
      this.statusText.setColor('#00ff00')
    } catch (error) {
      this.statusText.setText('连接服务器失败，请重试')
      this.statusText.setColor('#ff0000')
    }
  }

  createInputField(x, y, placeholder, defaultValue) {
    const bg = this.add.rectangle(x, y, 400, 50, 0x2a2a4e, 0.8)
      .setStrokeStyle(2, 0x00d4ff)

    const text = this.add.text(x, y, defaultValue || placeholder, {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: defaultValue ? '#ffffff' : '#666666'
    }).setOrigin(0.5)

    text.setInteractive()
    text.on('pointerdown', () => {
      const userInput = prompt(placeholder, text.text === placeholder ? '' : text.text)
      if (userInput !== null) {
        text.setText(userInput || placeholder)
        text.setColor(userInput ? '#ffffff' : '#666666')
      }
    })

    this.uiElements.push({ bg, text })
    return text
  }

  createButton(x, y, text, onClick, color = 0x00d4ff) {
    const bg = this.add.rectangle(x, y, 300, 60, color, 0.8)
      .setStrokeStyle(2, color - 0x222222)
      .setInteractive()

    const buttonText = this.add.text(x, y, text, {
      fontSize: '24px',
      fontFamily: 'Arial',
      color: '#1a1a2e',
      fontWeight: 'bold'
    }).setOrigin(0.5)

    bg.on('pointerover', () => {
      bg.setFillStyle(color, 0.9)
      bg.setStrokeStyle(2, color + 0x222222)
    })

    bg.on('pointerout', () => {
      bg.setFillStyle(color, 0.8)
      bg.setStrokeStyle(2, color - 0x222222)
    })

    bg.on('pointerdown', () => {
      bg.setFillStyle(color - 0x444444, 0.9)
      onClick()
    })

    bg.on('pointerup', () => {
      bg.setFillStyle(color, 0.8)
    })

    this.uiElements.push({ bg, text: buttonText })
  }

  openLeaderboard() {
    this.scene.start('LeaderboardScene')
  }

  setupNetworkListeners() {
    gameClient.on('room_created', (roomId) => {
      console.log('Room created:', roomId)
      const playerName = this.playerNameInput.text === '输入角色名称' ? 'Hero' : this.playerNameInput.text
      gameClient.joinRoom(roomId, playerName)
    })

    gameClient.on('joined_room', (data) => {
      console.log('Joined room:', data)
      this.scene.start('GameScene')
      this.scene.start('UIScene')
    })

    gameClient.on('error', (error) => {
      this.statusText.setText('错误: ' + error)
      this.statusText.setColor('#ff0000')
    })
  }

  createRoom() {
    gameClient.createRoom()
  }

  joinRoom() {
    const roomId = this.roomIdInput.text === '输入房间ID' ? '' : this.roomIdInput.text
    const playerName = this.playerNameInput.text === '输入角色名称' ? 'Hero' : this.playerNameInput.text

    if (!roomId) {
      this.statusText.setText('请输入房间ID')
      this.statusText.setColor('#ff0000')
      return
    }

    gameClient.joinRoom(roomId, playerName)
  }
}
