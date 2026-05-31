import { getDb } from './database.js'

const generateReport = async (sessionId) => {
  const db = getDb()
  if (!db) return null

  await db.read()
  const data = db.data

  const session = data.sessions.find(s => s.id === sessionId)

  if (!session) {
    return null
  }

  const stationStats = data.stationStats.filter(s => s.session_id === sessionId)
  const events = data.ballEvents
    .filter(e => e.session_id === sessionId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

  const heatmapData = data.heatmapData.filter(h => h.session_id === sessionId)
  
  const heatmapSummary = []
  for (let stationId = 0; stationId < 3; stationId++) {
    const stationData = heatmapData.filter(h => h.station_id === stationId)
    if (stationData.length > 0) {
      const avgUtilization = stationData.reduce((sum, h) => sum + h.utilization, 0) / stationData.length
      const maxQueue = Math.max(...stationData.map(h => h.queue_length))
      heatmapSummary.push({
        station_id: stationId,
        avg_utilization: avgUtilization,
        max_queue: maxQueue,
        data_points: stationData.length
      })
    }
  }

  const totalProcessed = stationStats.reduce((sum, s) => sum + (s.total_processed || 0), 0)
  const avgUtilization = stationStats.length > 0 
    ? stationStats.reduce((sum, s) => sum + (s.utilization || 0), 0) / stationStats.length 
    : 0

  const bottleneckStation = stationStats.length > 0 
    ? stationStats.reduce((max, s) => (s.utilization || 0) > (max.utilization || 0) ? s : max, { utilization: 0 })
    : { utilization: 0, station_id: 0 }

  const avgWaitTimeAll = stationStats.length > 0
    ? stationStats.reduce((sum, s) => sum + (s.avg_wait_time || 0), 0) / stationStats.length
    : 0

  const report = {
    sessionId: session.id,
    sessionInfo: {
      startTime: session.start_time,
      endTime: session.end_time,
      duration: session.end_time 
        ? (new Date(session.end_time) - new Date(session.start_time)) / 1000 
        : null,
      totalBalls: session.total_balls,
      completedBalls: session.completed_balls,
      completionRate: session.total_balls > 0 
        ? (session.completed_balls / session.total_balls) * 100 
        : 0
    },
    summary: {
      totalProcessed,
      avgUtilization: avgUtilization * 100,
      bottleneckStation: bottleneckStation.station_id,
      bottleneckUtilization: bottleneckStation.utilization * 100,
      avgWaitTime: avgWaitTimeAll
    },
    stationDetails: stationStats.map(station => ({
      stationId: station.station_id,
      utilization: station.utilization * 100,
      totalProcessed: station.total_processed,
      avgWaitTime: station.avg_wait_time,
      maxQueueLength: station.max_queue_length,
      processTime: station.process_time
    })),
    heatmapSummary: heatmapSummary.map(h => ({
      stationId: h.station_id,
      avgUtilization: h.avg_utilization * 100,
      maxQueue: h.max_queue,
      dataPoints: h.data_points
    })),
    recommendations: generateRecommendations(stationStats, bottleneckStation)
  }

  return report
}

const generateRecommendations = (stationStats, bottleneck) => {
  const recommendations = []

  if (bottleneck.utilization > 0.8) {
    recommendations.push({
      priority: 'high',
      type: 'bottleneck',
      message: `工位 ${bottleneck.station_id + 1} 是瓶颈工位，利用率达到 ${(bottleneck.utilization * 100).toFixed(1)}%，建议增加该工位或优化处理流程。`
    })
  }

  const lowUtilization = stationStats.filter(s => s.utilization < 0.3)
  if (lowUtilization.length > 0) {
    recommendations.push({
      priority: 'medium',
      type: 'underutilized',
      message: `工位 ${lowUtilization.map(s => s.station_id + 1).join(', ')} 利用率低于 30%，考虑优化任务分配或减少工位数量。`
    })
  }

  const longWaitTime = stationStats.filter(s => s.avg_wait_time > 5000)
  if (longWaitTime.length > 0) {
    recommendations.push({
      priority: 'high',
      type: 'wait_time',
      message: `工位 ${longWaitTime.map(s => s.station_id + 1).join(', ')} 平均等待时间超过 5 秒，建议增加并行处理能力。`
    })
  }

  const avgUtil = stationStats.length > 0 
    ? stationStats.reduce((sum, s) => sum + s.utilization, 0) / stationStats.length 
    : 0

  if (avgUtil < 0.5) {
    recommendations.push({
      priority: 'low',
      type: 'efficiency',
      message: `整体生产线利用率为 ${(avgUtil * 100).toFixed(1)}%，可以考虑增加物料投放速度。`
    })
  } else if (avgUtil > 0.8) {
    recommendations.push({
      priority: 'medium',
      type: 'efficiency',
      message: `整体生产线利用率较高 (${(avgUtil * 100).toFixed(1)}%)，系统运行高效但需要关注潜在瓶颈。`
    })
  }

  return recommendations
}

export { generateReport }
