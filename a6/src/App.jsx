import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import MainMenu from './components/MainMenu'
import SongSelect from './components/SongSelect'
import GamePlay from './components/GamePlay'
import BattleRoom from './components/BattleRoom'
import BattleLobby from './components/BattleLobby'
import ResultScreen from './components/ResultScreen'
import BeatmapEditor from './components/BeatmapEditor'
import BeatmapBrowser from './components/BeatmapBrowser'
import { useGameStore } from './store/gameStore'

function App() {
  const { isInBattle } = useGameStore()

  return (
    <div className="w-screen h-screen bg-game-bg overflow-hidden">
      <Routes>
        <Route path="/" element={<MainMenu />} />
        <Route path="/songs" element={<SongSelect />} />
        <Route path="/play" element={<GamePlay />} />
        <Route path="/battle" element={<BattleLobby />} />
        <Route path="/battle/:roomId" element={<BattleRoom />} />
        <Route path="/result" element={<ResultScreen />} />
        <Route path="/editor" element={<BeatmapEditor />} />
        <Route path="/editor/:beatmapId" element={<BeatmapEditor />} />
        <Route path="/beatmaps" element={<BeatmapBrowser />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
