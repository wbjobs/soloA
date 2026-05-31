const API_BASE_URL = 'http://localhost:3001'

export interface BallEvent {
  session_id: number
  ball_id: number
  event_type: 'spawn' | 'arrive_station' | 'start_process' | 'end_process' | 'complete'
  station_id?: number
  details?: Record<string, any>
  timestamp?: string
}

export interface HeatmapRecord {
  session_id: number
  station_id: number
  utilization: number
  queue_length: number
  is_processing: boolean
  timestamp?: string
}

export interface StationStat {
  station_id: number
  utilization: number
  total_processed: number
  total_wait_time: number
  avg_wait_time: number
  max_queue_length: number
  process_time: number
}

export interface SimulationReport {
  sessionId: number
  sessionInfo: {
    startTime: string
    endTime: string | null
    duration: number | null
    totalBalls: number
    completedBalls: number
    completionRate: number
  }
  summary: {
    totalProcessed: number
    avgUtilization: number
    bottleneckStation: number
    bottleneckUtilization: number
    avgWaitTime: number
  }
  stationDetails: {
    stationId: number
    utilization: number
    totalProcessed: number
    avgWaitTime: number
    maxQueueLength: number
    processTime: number
  }[]
  heatmapSummary: {
    stationId: number
    avgUtilization: number
    maxQueue: number
    dataPoints: number
  }[]
  recommendations: {
    priority: 'high' | 'medium' | 'low'
    type: string
    message: string
  }[]
}

const api = {
  async createSession(avgSpeed: number = 1.0): Promise<number> {
    const response = await fetch(`${API_BASE_URL}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avg_speed: avgSpeed })
    })
    const data = await response.json()
    return data.sessionId
  },

  async updateSession(sessionId: number, totalBalls: number, completedBalls: number, avgSpeed: number): Promise<void> {
    await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ total_balls: totalBalls, completed_balls: completedBalls, avg_speed: avgSpeed })
    })
  },

  async completeSession(sessionId: number, totalBalls: number, completedBalls: number): Promise<void> {
    await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ total_balls: totalBalls, completed_balls: completedBalls })
    })
  },

  async logBallEvent(event: BallEvent): Promise<void> {
    await fetch(`${API_BASE_URL}/api/logs/ball-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    })
  },

  async logBatch(events: BallEvent[], heatmapData: HeatmapRecord[]): Promise<void> {
    await fetch(`${API_BASE_URL}/api/logs/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events, heatmapData })
    })
  },

  async logHeatmap(record: HeatmapRecord): Promise<void> {
    await fetch(`${API_BASE_URL}/api/logs/heatmap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    })
  },

  async saveStationStats(sessionId: number, stats: StationStat[]): Promise<void> {
    await fetch(`${API_BASE_URL}/api/station-stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, stations: stats })
    })
  },

  async getReport(sessionId: number): Promise<SimulationReport | null> {
    const response = await fetch(`${API_BASE_URL}/api/report/${sessionId}`)
    if (!response.ok) return null
    return response.json()
  },

  async getSessions(): Promise<any[]> {
    const response = await fetch(`${API_BASE_URL}/api/sessions`)
    return response.json()
  },

  async deleteSession(sessionId: number): Promise<void> {
    await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
      method: 'DELETE'
    })
  }
}

export default api
