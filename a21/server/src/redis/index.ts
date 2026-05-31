import { createClient } from 'redis'
import { config } from '../config'

let client: ReturnType<typeof createClient> | null = null

export async function initRedis() {
  client = createClient({
    socket: {
      host: config.redis.host,
      port: config.redis.port
    },
    password: config.redis.password
  })

  client.on('error', (err) => console.error('Redis 客户端错误:', err))
  
  await client.connect()
  console.log('Redis 连接成功')
}

export function getRedisClient() {
  if (!client) {
    throw new Error('Redis 客户端未初始化')
  }
  return client
}

export async function setUserOnline(userId: string, socketId: string) {
  const redis = getRedisClient()
  await redis.hSet('online_users', userId, socketId)
  await redis.expire('online_users', 3600)
}

export async function setUserOffline(userId: string) {
  const redis = getRedisClient()
  await redis.hDel('online_users', userId)
}

export async function getOnlineUsers(): Promise<Map<string, string>> {
  const redis = getRedisClient()
  const result = await redis.hGetAll('online_users')
  return new Map(Object.entries(result))
}

export async function addUserToDocument(documentId: string, userId: string, data: {
  socketId: string
  username: string
  color: string
}) {
  const redis = getRedisClient()
  const key = `doc:${documentId}:users`
  await redis.hSet(key, userId, JSON.stringify(data))
  await redis.expire(key, 3600)
}

export async function removeUserFromDocument(documentId: string, userId: string) {
  const redis = getRedisClient()
  const key = `doc:${documentId}:users`
  await redis.hDel(key, userId)
}

export async function getDocumentUsers(documentId: string): Promise<Map<string, any>> {
  const redis = getRedisClient()
  const key = `doc:${documentId}:users`
  const result = await redis.hGetAll(key)
  const map = new Map<string, any>()
  for (const [userId, data] of Object.entries(result)) {
    map.set(userId, JSON.parse(data))
  }
  return map
}

export async function acquireDocumentLock(documentId: string, userId: string, ttl: number = 10): Promise<boolean> {
  const redis = getRedisClient()
  const key = `doc:${documentId}:lock`
  const result = await redis.set(key, userId, { EX: ttl, NX: true })
  return result === 'OK'
}

export async function releaseDocumentLock(documentId: string, userId: string): Promise<boolean> {
  const redis = getRedisClient()
  const key = `doc:${documentId}:lock`
  const current = await redis.get(key)
  if (current === userId) {
    await redis.del(key)
    return true
  }
  return false
}

export async function getDocumentLockOwner(documentId: string): Promise<string | null> {
  const redis = getRedisClient()
  const key = `doc:${documentId}:lock`
  return redis.get(key)
}
