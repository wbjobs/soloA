import Phaser from 'phaser'
import { gameClient } from '../network/GameClient'

const RANK_COLORS = {
  bronze: 0xcd7f32,
  silver: 0xc0c0c0,
  gold: 0xffd700,
  platinum: 0xe5e4e2,
  diamond: 0xb9f2ff,
  master: 0x9932cc,
  champion: 0xff4500
}

const RANK_NAMES = {
  bronze: '青铜',
  silver: '白银',
  gold: '黄金',
  platinum: '铂金',
  diamond: '钻石',
  master: '大师',
  champion: '冠军'
}

const RARITY_COLORS = {
  common: 0x888888,
  uncommon: 0x00ff00,
  rare: 0x0088ff,
  epic: 0x8800ff,
  legendary: 0xff8800
}

export class LeaderboardScene extends Phaser.Scene {
  constructor() {
    super({ key: 'LeaderboardScene' })
    this.leaderboard = []
    this.achievements = []
    this.currentTab = 'leaderboard'
  }

  create() {
    this.cameras.main.setBackgroundColor(0x1a1a2e)

    this.add.text(this.scale.width / 2, 50, '排行榜与成就', {
      fontSize: '32px',
      color: '#00d4ff',
      fontWeight: 'bold'
    }).setOrigin(0.5)

    this.createTabs()
    this.createBackButton()

    this.setupNetworkListeners()

    this.loadingText = this.add.text(this.scale.width / 2, 200, '加载中...', {
      fontSize: '24px',
      color: '#aaaaaa'
    }).setOrigin(0.5)

    if (gameClient.ws && gameClient.ws.readyState === WebSocket.OPEN) {
      gameClient.getLeaderboard()
      gameClient.getAchievements()
    } else {
      this.loadingText.setText('请先连接到服务器')
    }
  }

  createTabs() {
    const leaderboardBtn = this.add.rectangle(
      this.scale.width / 2 - 100,
      100,
      180,
      50,
      0x00d4ff,
      0.8
    ).setInteractive()

    this.add.text(leaderboardBtn.x, leaderboardBtn.y, '排行榜', {
      fontSize: '20px',
      color: '#1a1a2e',
      fontWeight: 'bold'
    }).setOrigin(0.5)

    const achievementsBtn = this.add.rectangle(
      this.scale.width / 2 + 100,
      100,
      180,
      50,
      0x2a2a4e,
      0.8
    ).setInteractive()

    this.add.text(achievementsBtn.x, achievementsBtn.y, '成就系统', {
      fontSize: '20px',
      color: '#aaaaaa'
    }).setOrigin(0.5)

    leaderboardBtn.on('pointerdown', () => {
      this.currentTab = 'leaderboard'
      leaderboardBtn.setFillStyle(0x00d4ff, 0.8)
      achievementsBtn.setFillStyle(0x2a2a4e, 0.8)
      this.renderLeaderboard()
    })

    achievementsBtn.on('pointerdown', () => {
      this.currentTab = 'achievements'
      leaderboardBtn.setFillStyle(0x2a2a4e, 0.8)
      achievementsBtn.setFillStyle(0x00d4ff, 0.8)
      this.renderAchievements()
    })

    this.leaderboardBtn = leaderboardBtn
    this.achievementsBtn = achievementsBtn
  }

  createBackButton() {
    const backBtn = this.add.rectangle(
      this.scale.width - 100,
      this.scale.height - 50,
      150,
      50,
      0xff4444,
      0.8
    ).setInteractive()

    this.add.text(backBtn.x, backBtn.y, '返回主菜单', {
      fontSize: '18px',
      color: '#ffffff',
      fontWeight: 'bold'
    }).setOrigin(0.5)

    backBtn.on('pointerdown', () => {
      this.scene.start('MainMenuScene')
    })
  }

  setupNetworkListeners() {
    gameClient.on('leaderboard', (leaderboard) => {
      this.leaderboard = leaderboard
      if (this.loadingText) {
        this.loadingText.destroy()
        this.loadingText = null
      }
      this.renderLeaderboard()
    })

    gameClient.on('achievements', (achievements) => {
      this.achievements = achievements
      if (this.loadingText) {
        this.loadingText.destroy()
        this.loadingText = null
      }
    })

    gameClient.on('error', (error) => {
      if (this.loadingText) {
        this.loadingText.setText('加载失败: ' + error)
      }
    })
  }

  renderLeaderboard() {
    if (this.leaderboardContainer) {
      this.leaderboardContainer.destroy()
    }

    this.leaderboardContainer = this.add.container(0, 0)

    const startY = 180
    const padding = 20

    const titleBg = this.add.rectangle(
      this.scale.width / 2,
      startY,
      this.scale.width - padding * 2,
      50,
      0x2a2a4e,
      0.9
    ).setStrokeStyle(2, 0x00d4ff)

    this.leaderboardContainer.add(titleBg)

    const headers = ['排名', '玩家', '段位', '分数', '击杀', '层数', '最佳时间']
    const headerPositions = [80, 220, 420, 580, 720, 860, 1000]

    headers.forEach((header, i) => {
      this.leaderboardContainer.add(
        this.add.text(headerPositions[i], startY, header, {
          fontSize: '16px',
          color: '#00d4ff',
          fontWeight: 'bold'
        }).setOrigin(0.5)
      )
    })

    this.leaderboard.forEach((entry, index) => {
      const y = startY + 60 + index * 55
      const isTop3 = index < 3

      const rowBg = this.add.rectangle(
        this.scale.width / 2,
        y,
        this.scale.width - padding * 2,
        50,
        isTop3 ? 0x1a1a3e : 0x1a1a2e,
        0.9
      ).setStrokeStyle(1, isTop3 ? 0xffd700 : 0x2a2a4e)

      this.leaderboardContainer.add(rowBg)

      const rankColor = isTop3 ? 0xffd700 : 0xaaaaaa
      const rankText = isTop3 ? ['🥇', '🥈', '🥉'][index] : `#${index + 1}`

      this.leaderboardContainer.add(
        this.add.text(headerPositions[0], y, rankText, {
          fontSize: '18px',
          color: Phaser.Display.Color.IntegerToColor(rankColor).rgba
        }).setOrigin(0.5)
      )

      this.leaderboardContainer.add(
        this.add.text(headerPositions[1], y, entry.playerName, {
          fontSize: '16px',
          color: '#ffffff'
        }).setOrigin(0.5)
      )

      const tierColor = RANK_COLORS[entry.tier] || 0x888888
      const tierName = RANK_NAMES[entry.tier] || '未知'

      const tierBadge = this.add.rectangle(
        headerPositions[2],
        y,
        100,
        35,
        tierColor,
        0.3
      ).setStrokeStyle(2, tierColor)

      this.leaderboardContainer.add(tierBadge)

      this.leaderboardContainer.add(
        this.add.text(headerPositions[2], y, `${tierName} ${entry.division}`, {
          fontSize: '14px',
          color: '#ffffff'
        }).setOrigin(0.5)
      )

      this.leaderboardContainer.add(
        this.add.text(headerPositions[3], y, entry.rating.toString(), {
          fontSize: '16px',
          color: '#ffd700'
        }).setOrigin(0.5)
      )

      this.leaderboardContainer.add(
        this.add.text(headerPositions[4], y, entry.totalKills.toString(), {
          fontSize: '16px',
          color: '#ff8888'
        }).setOrigin(0.5)
      )

      this.leaderboardContainer.add(
        this.add.text(headerPositions[5], y, `${entry.bestFloor}层`, {
          fontSize: '16px',
          color: '#00ff88'
        }).setOrigin(0.5)
      )

      const minutes = Math.floor(entry.bestTime / 60)
      const seconds = entry.bestTime % 60
      const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`

      this.leaderboardContainer.add(
        this.add.text(headerPositions[6], y, timeStr, {
          fontSize: '16px',
          color: '#88ccff'
        }).setOrigin(0.5)
      )
    })
  }

  renderAchievements() {
    if (this.leaderboardContainer) {
      this.leaderboardContainer.destroy()
      this.leaderboardContainer = null
    }

    if (this.achievementsContainer) {
      this.achievementsContainer.destroy()
    }

    this.achievementsContainer = this.add.container(0, 0)

    const startY = 180
    const padding = 40
    const itemWidth = 350
    const itemHeight = 120
    const itemsPerRow = 3
    const gapX = 30
    const gapY = 20

    const unlockedAchievements = this.achievements.filter(a => a.unlocked)
    const lockedAchievements = this.achievements.filter(a => !a.unlocked)
    const allAchievements = [...unlockedAchievements, ...lockedAchievements]

    this.achievementsContainer.add(
      this.add.text(this.scale.width / 2, startY - 20, `已解锁: ${unlockedAchievements.length}/${this.achievements.length}`, {
        fontSize: '18px',
        color: '#00ff88'
      }).setOrigin(0.5)
    )

    allAchievements.forEach((achievement, index) => {
      const row = Math.floor(index / itemsPerRow)
      const col = index % itemsPerRow

      const startX = (this.scale.width - (itemsPerRow * itemWidth + (itemsPerRow - 1) * gapX)) / 2
      const x = startX + col * (itemWidth + gapX) + itemWidth / 2
      const y = startY + 40 + row * (itemHeight + gapY)

      const rarityColor = RARITY_COLORS[achievement.rarity] || 0x888888

      const bg = this.add.rectangle(
        x,
        y,
        itemWidth,
        itemHeight,
        achievement.unlocked ? 0x2a2a4e : 0x1a1a2e,
        0.9
      ).setStrokeStyle(2, rarityColor, achievement.unlocked ? 1 : 0.3)

      this.achievementsContainer.add(bg)

      this.achievementsContainer.add(
        this.add.text(x - itemWidth / 2 + 20, y - 35, achievement.icon, {
          fontSize: '32px'
        }).setOrigin(0, 0.5).setAlpha(achievement.unlocked ? 1 : 0.5)
      )

      this.achievementsContainer.add(
        this.add.text(x, y - 35, achievement.name, {
          fontSize: '18px',
          color: Phaser.Display.Color.IntegerToColor(rarityColor).rgba,
          fontWeight: 'bold'
        }).setOrigin(0.5).setAlpha(achievement.unlocked ? 1 : 0.5)
      )

      this.achievementsContainer.add(
        this.add.text(x, y + 10, achievement.description, {
          fontSize: '12px',
          color: '#aaaaaa',
          wordWrap: { width: itemWidth - 40 }
        }).setOrigin(0.5).setAlpha(achievement.unlocked ? 1 : 0.3)
      )

      if (!achievement.unlocked) {
        const progress = Math.min(achievement.progress / achievement.target, 1)

        const barBg = this.add.rectangle(
          x,
          y + 40,
          itemWidth - 40,
          10,
          0x1a1a2e,
          1
        )
        this.achievementsContainer.add(barBg)

        const bar = this.add.rectangle(
          x - (itemWidth - 40) / 2 + (itemWidth - 40) * progress / 2,
          y + 40,
          (itemWidth - 40) * progress,
          10,
          rarityColor,
          0.8
        )
        this.achievementsContainer.add(bar)

        this.achievementsContainer.add(
          this.add.text(x, y + 40, `${achievement.progress}/${achievement.target}`, {
            fontSize: '10px',
            color: '#ffffff'
          }).setOrigin(0.5)
        )
      } else {
        this.achievementsContainer.add(
          this.add.text(x, y + 40, '✓ 已解锁', {
            fontSize: '14px',
            color: '#00ff00'
          }).setOrigin(0.5)
        )
      }
    })
  }
}
