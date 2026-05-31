import { create } from 'zustand'

export const useGameStore = create((set, get) => ({
  currentPlayer: {
    id: null,
    name: 'Player',
    elo: 1000
  },
  currentSong: null,
  notes: [],
  score: 0,
  combo: 0,
  maxCombo: 0,
  perfectCount: 0,
  goodCount: 0,
  missCount: 0,
  isPlaying: false,
  isInBattle: false,
  battleRoom: null,
  opponentScore: 0,
  opponentCombo: 0,
  opponentData: null,
  songResults: [],

  setPlayer: (player) => set({ currentPlayer: player }),
  
  setSong: (song) => set({ currentSong: song }),
  
  setNotes: (notes) => set({ notes }),
  
  startGame: () => set({
    score: 0,
    combo: 0,
    maxCombo: 0,
    perfectCount: 0,
    goodCount: 0,
    missCount: 0,
    isPlaying: true
  }),
  
  endGame: () => set({ isPlaying: false }),
  
  addHit: (type) => {
    const state = get()
    const basePoints = { perfect: 100, good: 50 }
    const comboBonus = Math.floor(state.combo / 10) * 10
    const points = (basePoints[type] || 0) + comboBonus
    
    set({
      score: state.score + points,
      combo: state.combo + 1,
      maxCombo: Math.max(state.maxCombo, state.combo + 1),
      [type === 'perfect' ? 'perfectCount' : 'goodCount']: 
        state[type === 'perfect' ? 'perfectCount' : 'goodCount'] + 1
    })
  },
  
  addMiss: () => set((state) => ({
    combo: 0,
    missCount: state.missCount + 1
  })),
  
  joinBattle: (roomData) => set({ isInBattle: true, battleRoom: roomData }),
  
  leaveBattle: () => set({ isInBattle: false, battleRoom: null }),
  
  updateOpponentScore: (score) => set({ opponentScore: score }),
  
  updateOpponentCombo: (combo) => set({ opponentCombo: combo }),
  
  setOpponentData: (data) => set({ opponentData: data }),
  
  addResult: (result) => set((state) => ({
    songResults: [...state.songResults, result]
  }))
}))
