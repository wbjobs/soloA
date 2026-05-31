import { BackupSchedule } from '../types'
import { backupScheduleStore, connectionStore } from '../store'
import { createBackup, getBackupDirectory } from './manager'

const scheduleTimers = new Map<string, NodeJS.Timeout>()

const cronPatterns: Record<string, string> = {
  hourly: '0 * * * *',
  daily: '0 0 * * *',
  weekly: '0 0 * * 0',
  monthly: '0 0 1 * *',
  every6hours: '0 */6 * * *',
  every12hours: '0 */12 * * *',
  every30minutes: '*/30 * * * *'
}

export function getPresetSchedules() {
  return [
    { label: '每 30 分钟', value: 'every30minutes' },
    { label: '每 6 小时', value: 'every6hours' },
    { label: '每 12 小时', value: 'every12hours' },
    { label: '每小时', value: 'hourly' },
    { label: '每天 (00:00)', value: 'daily' },
    { label: '每周 (周日 00:00)', value: 'weekly' },
    { label: '每月 (1号 00:00)', value: 'monthly' },
    { label: '自定义', value: 'custom' }
  ]
}

function parseCronToMs(cron: string): number | null {
  const parts = cron.trim().split(/\s+/)
  
  if (parts.length < 5) {
    if (cronPatterns[cron]) {
      return parseCronToMs(cronPatterns[cron])
    }
    return null
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts

  if (minute === '0' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 60 * 60 * 1000
  }
  if (minute === '0' && hour === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 24 * 60 * 60 * 1000
  }
  if (minute === '*/30' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 30 * 60 * 1000
  }
  if (minute === '0' && hour === '*/6' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 6 * 60 * 60 * 1000
  }
  if (minute === '0' && hour === '*/12' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 12 * 60 * 60 * 1000
  }

  return 24 * 60 * 60 * 1000
}

async function executeSchedule(schedule: BackupSchedule): Promise<void> {
  console.log(`执行定时备份: ${schedule.name}`)

  const config = connectionStore.getById(schedule.connectionId)
  if (!config) {
    console.error(`连接 ${schedule.connectionId} 不存在`)
    return
  }

  try {
    const record = await createBackup(
      config,
      schedule.backupType,
      schedule.saveDirectory,
      schedule.tables,
      schedule.compress
    )

    const updatedSchedule: BackupSchedule = {
      ...schedule,
      lastRun: Date.now(),
      nextRun: Date.now() + (parseCronToMs(schedule.cronExpression) || 24 * 60 * 60 * 1000)
    }
    backupScheduleStore.save(updatedSchedule)

    cleanupOldBackups(schedule)
    console.log(`定时备份完成: ${record.filePath}`)
  } catch (err: any) {
    console.error(`定时备份失败: ${err.message}`)
  }
}

function cleanupOldBackups(schedule: BackupSchedule): void {
  const fs = require('fs')
  const path = require('path')

  if (!fs.existsSync(schedule.saveDirectory)) return

  const files = fs.readdirSync(schedule.saveDirectory)
    .filter((f: string) => f.includes(schedule.connectionName))
    .map((f: string) => ({
      name: f,
      path: path.join(schedule.saveDirectory, f),
      stat: fs.statSync(path.join(schedule.saveDirectory, f))
    }))
    .sort((a: any, b: any) => b.stat.mtime - a.stat.mtime)

  while (files.length > schedule.maxBackups) {
    const toDelete = files.pop()
    if (toDelete) {
      try {
        fs.unlinkSync(toDelete.path)
        console.log(`删除旧备份: ${toDelete.name}`)
      } catch (err) {
        console.error(`删除失败:`, err)
      }
    }
  }
}

export function startSchedule(schedule: BackupSchedule): void {
  if (scheduleTimers.has(schedule.id)) {
    stopSchedule(schedule.id)
  }

  if (!schedule.enabled) return

  const interval = parseCronToMs(schedule.cronExpression) || 24 * 60 * 60 * 1000
  
  const timer = setInterval(() => {
    executeSchedule(schedule)
  }, interval)

  scheduleTimers.set(schedule.id, timer)
  console.log(`启动定时备份任务: ${schedule.name}, 间隔: ${interval}ms`)
}

export function stopSchedule(scheduleId: string): void {
  const timer = scheduleTimers.get(scheduleId)
  if (timer) {
    clearInterval(timer)
    scheduleTimers.delete(scheduleId)
    console.log(`停止定时备份任务: ${scheduleId}`)
  }
}

export function startAllEnabledSchedules(): void {
  const schedules = backupScheduleStore.getEnabled()
  schedules.forEach(schedule => {
    startSchedule(schedule)
  })
  console.log(`已启动 ${schedules.length} 个定时备份任务`)
}

export function stopAllSchedules(): void {
  scheduleTimers.forEach((timer, id) => {
    clearInterval(timer)
    scheduleTimers.delete(id)
  })
  console.log('已停止所有定时备份任务')
}

export function createDefaultSchedule(connectionId: string, connectionName: string): BackupSchedule {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
    connectionId,
    connectionName,
    backupType: 'full',
    name: `每日备份 - ${connectionName}`,
    cronExpression: 'daily',
    enabled: true,
    saveDirectory: getBackupDirectory(),
    maxBackups: 7,
    compress: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}
