import Phaser from 'phaser'
import { MainMenuScene } from './scenes/MainMenuScene'
import { GameScene } from './scenes/GameScene'
import { UIScene } from './scenes/UIScene'
import { LeaderboardScene } from './scenes/LeaderboardScene'

const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-container',
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#1a1a2e',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  scene: [MainMenuScene, GameScene, UIScene, LeaderboardScene]
}

new Phaser.Game(config)
