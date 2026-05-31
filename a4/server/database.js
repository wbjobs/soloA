import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import path from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let db = null

const defaultData = {
  sessions: [],
  stationStats: [],
  ballEvents: [],
  heatmapData: []
}

let nextSessionId = 1
let nextStationStatId = 1
let nextBallEventId = 1
let nextHeatmapDataId = 1

const initDatabase = async () => {
  const dbPath = path.join(__dirname, 'simulation.json')
  console.log('Initializing database at:', dbPath)

  const adapter = new JSONFile(dbPath)
  db = new Low(adapter, defaultData)

  await db.read()

  if (db.data.sessions.length > 0) {
    nextSessionId = Math.max(...db.data.sessions.map(s => s.id)) + 1
  }
  if (db.data.stationStats.length > 0) {
    nextStationStatId = Math.max(...db.data.stationStats.map(s => s.id)) + 1
  }
  if (db.data.ballEvents.length > 0) {
    nextBallEventId = Math.max(...db.data.ballEvents.map(e => e.id)) + 1
  }
  if (db.data.heatmapData.length > 0) {
    nextHeatmapDataId = Math.max(...db.data.heatmapData.map(h => h.id)) + 1
  }

  await db.write()
  console.log('Database initialized successfully')
}

const getDb = () => db

const getNextSessionId = () => nextSessionId++
const getNextStationStatId = () => nextStationStatId++
const getNextBallEventId = () => nextBallEventId++
const getNextHeatmapDataId = () => nextHeatmapDataId++

export { initDatabase, getDb, getNextSessionId, getNextStationStatId, getNextBallEventId, getNextHeatmapDataId }
