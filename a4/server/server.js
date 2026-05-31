import express from 'express'
import cors from 'cors'
import { initDatabase, getDb, getNextSessionId, getNextStationStatId, getNextBallEventId, getNextHeatmapDataId } from './database.js'
import { generateReport } from './reportGenerator.js'

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json({ limit: '50mb' }))

app.get('/', (req, res) => {
  res.json({ message: 'Factory Simulation API is running' })
})

app.post('/api/sessions', async (req, res) => {
  const db = getDb()
  await db.read()

  const session = {
    id: getNextSessionId(),
    start_time: new Date().toISOString(),
    end_time: null,
    total_balls: 0,
    completed_balls: 0,
    avg_speed: req.body.avg_speed || 1.0
  }

  db.data.sessions.push(session)
  await db.write()

  res.json({ sessionId: session.id })
})

app.put('/api/sessions/:id', async (req, res) => {
  const db = getDb()
  await db.read()

  const sessionId = parseInt(req.params.id)
  const { total_balls, completed_balls, avg_speed } = req.body

  const session = db.data.sessions.find(s => s.id === sessionId)
  if (session) {
    session.total_balls = total_balls || 0
    session.completed_balls = completed_balls || 0
    session.avg_speed = avg_speed || 1.0
    await db.write()
  }

  res.json({ success: true })
})

app.post('/api/sessions/:id/complete', async (req, res) => {
  const db = getDb()
  await db.read()

  const sessionId = parseInt(req.params.id)
  const { total_balls, completed_balls } = req.body

  const session = db.data.sessions.find(s => s.id === sessionId)
  if (session) {
    session.end_time = new Date().toISOString()
    session.total_balls = total_balls || 0
    session.completed_balls = completed_balls || 0
    await db.write()
  }

  res.json({ success: true })
})

app.post('/api/logs/ball-event', async (req, res) => {
  const db = getDb()
  await db.read()

  const { session_id, ball_id, event_type, station_id, details } = req.body

  const event = {
    id: getNextBallEventId(),
    session_id,
    ball_id,
    event_type,
    station_id: station_id || null,
    timestamp: new Date().toISOString(),
    details: JSON.stringify(details || {})
  }

  db.data.ballEvents.push(event)
  await db.write()

  res.json({ success: true })
})

app.post('/api/logs/batch', async (req, res) => {
  const db = getDb()
  await db.read()

  const { events, heatmapData } = req.body

  let eventsSaved = 0
  let heatmapSaved = 0

  if (events && events.length > 0) {
    for (const event of events) {
      db.data.ballEvents.push({
        id: getNextBallEventId(),
        session_id: event.session_id,
        ball_id: event.ball_id,
        event_type: event.event_type,
        station_id: event.station_id || null,
        timestamp: new Date().toISOString(),
        details: JSON.stringify(event.details || {})
      })
      eventsSaved++
    }
  }

  if (heatmapData && heatmapData.length > 0) {
    for (const data of heatmapData) {
      db.data.heatmapData.push({
        id: getNextHeatmapDataId(),
        session_id: data.session_id,
        station_id: data.station_id,
        timestamp: new Date().toISOString(),
        utilization: data.utilization,
        queue_length: data.queue_length,
        is_processing: data.is_processing ? 1 : 0
      })
      heatmapSaved++
    }
  }

  await db.write()
  res.json({ success: true, eventsSaved, heatmapSaved })
})

app.post('/api/logs/heatmap', async (req, res) => {
  const db = getDb()
  await db.read()

  const { session_id, station_id, utilization, queue_length, is_processing } = req.body

  const heatmap = {
    id: getNextHeatmapDataId(),
    session_id,
    station_id,
    timestamp: new Date().toISOString(),
    utilization,
    queue_length,
    is_processing: is_processing ? 1 : 0
  }

  db.data.heatmapData.push(heatmap)
  await db.write()

  res.json({ success: true })
})

app.post('/api/station-stats', async (req, res) => {
  const db = getDb()
  await db.read()

  const { session_id, stations } = req.body

  for (const stat of stations) {
    db.data.stationStats.push({
      id: getNextStationStatId(),
      session_id,
      station_id: stat.station_id,
      utilization: stat.utilization,
      total_processed: stat.total_processed,
      total_wait_time: stat.total_wait_time,
      avg_wait_time: stat.avg_wait_time,
      max_queue_length: stat.max_queue_length,
      process_time: stat.process_time
    })
  }

  await db.write()
  res.json({ success: true, saved: stations.length })
})

app.get('/api/report/:sessionId', async (req, res) => {
  const report = await generateReport(parseInt(req.params.sessionId))
  if (!report) {
    return res.status(404).json({ error: 'Session not found' })
  }
  res.json(report)
})

app.get('/api/sessions', async (req, res) => {
  const db = getDb()
  await db.read()

  const sessions = db.data.sessions
    .map(session => ({
      ...session,
      event_count: db.data.ballEvents.filter(e => e.session_id === session.id).length,
      heatmap_count: db.data.heatmapData.filter(h => h.session_id === session.id).length
    }))
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
    .slice(0, 50)

  res.json(sessions)
})

app.get('/api/heatmap/:sessionId', async (req, res) => {
  const db = getDb()
  await db.read()

  const sessionId = parseInt(req.params.sessionId)
  const data = db.data.heatmapData
    .filter(h => h.session_id === sessionId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

  res.json(data)
})

app.get('/api/heatmap/:sessionId/realtime', async (req, res) => {
  const db = getDb()
  await db.read()

  const sessionId = parseInt(req.params.sessionId)
  const heatmapData = db.data.heatmapData.filter(h => h.session_id === sessionId)
  
  const result = []
  for (let stationId = 0; stationId < 3; stationId++) {
    const stationData = heatmapData.filter(h => h.station_id === stationId)
    if (stationData.length > 0) {
      result.push({
        station_id: stationId,
        avg_utilization: stationData.reduce((sum, h) => sum + h.utilization, 0) / stationData.length,
        max_queue: Math.max(...stationData.map(h => h.queue_length)),
        is_active: Math.max(...stationData.map(h => h.is_processing)),
        sample_count: stationData.length
      })
    }
  }

  res.json(result)
})

app.delete('/api/sessions/:id', async (req, res) => {
  const db = getDb()
  await db.read()

  const sessionId = parseInt(req.params.id)

  db.data.heatmapData = db.data.heatmapData.filter(h => h.session_id !== sessionId)
  db.data.ballEvents = db.data.ballEvents.filter(e => e.session_id !== sessionId)
  db.data.stationStats = db.data.stationStats.filter(s => s.session_id !== sessionId)
  db.data.sessions = db.data.sessions.filter(s => s.id !== sessionId)

  await db.write()
  res.json({ success: true })
})

const startServer = async () => {
  await initDatabase()
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
}

startServer().catch(console.error)
