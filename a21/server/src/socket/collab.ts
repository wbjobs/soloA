import { Server, Socket } from 'socket.io'
import * as Y from 'yjs'
import {
  setUserOnline,
  setUserOffline,
  addUserToDocument,
  removeUserFromDocument
} from '../redis'
import { verifyToken } from '../middleware/auth'
import { db } from '../db'

interface SocketUser {
  userId: string
  username: string
  color: string
  socketId: string
}

interface DocumentRoom {
  ydoc: Y.Doc
  users: Map<string, SocketUser>
  pendingUpdates: Buffer[]
  lastSaveTime: number
  version: number
  updateLock: Promise<void>
}

const documentRooms = new Map<string, DocumentRoom>()
const SAVE_INTERVAL_MS = 30000
const MAX_PENDING_UPDATES = 100

function generateClientId(): number {
  return Math.floor(Math.random() * 4294967295)
}

async function withLock(room: DocumentRoom, fn: () => Promise<void>): Promise<void> {
  room.updateLock = room.updateLock.then(async () => {
    try {
      await fn()
    } catch (e) {
      console.error('锁内操作失败:', e)
    }
  })
  await room.updateLock
}

function getOrCreateDocumentRoom(documentId: string): DocumentRoom {
  let room = documentRooms.get(documentId)
  if (!room) {
    room = {
      ydoc: new Y.Doc(),
      users: new Map(),
      pendingUpdates: [],
      lastSaveTime: Date.now(),
      version: 0,
      updateLock: Promise.resolve()
    }
    documentRooms.set(documentId, room)
  }
  return room
}

async function loadDocumentState(documentId: string, ydoc: Y.Doc): Promise<boolean> {
  try {
    const result = await db.query(
      'SELECT ydoc_state FROM documents WHERE id = $1',
      [documentId]
    )

    if (result.rows.length > 0 && result.rows[0].ydoc_state) {
      const state = result.rows[0].ydoc_state
      try {
        Y.applyUpdate(ydoc, Buffer.from(state))
        console.log(`文档 ${documentId} 状态从数据库加载成功`)
        return true
      } catch (e) {
        console.error('应用数据库文档状态失败:', e)
        return false
      }
    }
    return false
  } catch (e) {
    console.error('从数据库加载文档状态失败:', e)
    return false
  }
}

async function saveDocumentState(documentId: string, room: DocumentRoom): Promise<boolean> {
  try {
    const state = Y.encodeStateAsUpdate(room.ydoc)
    await db.query(
      'UPDATE documents SET ydoc_state = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [Buffer.from(state), documentId]
    )
    room.lastSaveTime = Date.now()
    room.pendingUpdates = []
    console.log(`文档 ${documentId} 状态已保存到数据库`)
    return true
  } catch (e) {
    console.error('保存文档状态到数据库失败:', e)
    return false
  }
}

function shouldSave(room: DocumentRoom): boolean {
  const timeElapsed = Date.now() - room.lastSaveTime > SAVE_INTERVAL_MS
  const updatesFull = room.pendingUpdates.length >= MAX_PENDING_UPDATES
  return timeElapsed || updatesFull
}

async function broadcastAndProcessUpdate(
  io: Server,
  socket: Socket,
  documentId: string,
  room: DocumentRoom,
  update: Buffer,
  excludeUserId?: string
): Promise<void> {
  await withLock(room, async () => {
    try {
      Y.applyUpdate(room.ydoc, update)
      room.pendingUpdates.push(update)
      room.version++

      socket.to(`doc:${documentId}`).emit('doc-update', update)

      if (shouldSave(room)) {
        await saveDocumentState(documentId, room)
      }
    } catch (e) {
      console.error('处理更新失败:', e)
    }
  })
}

async function handleUserRejoin(
  io: Server,
  socket: Socket,
  documentId: string,
  room: DocumentRoom,
  user: { userId: string; username: string },
  userData?: { color: string }
): Promise<void> {
  const existingUser = room.users.get(user.userId)
  if (existingUser) {
    socket.to(`doc:${documentId}`).emit('user-left', {
      userId: user.userId
    })
  }

  const newUser: SocketUser = {
    userId: user.userId,
    username: user.username,
    color: userData?.color || '#3b82f6',
    socketId: socket.id
  }
  room.users.set(user.userId, newUser)

  await addUserToDocument(documentId, user.userId, {
    socketId: socket.id,
    username: newUser.username,
    color: newUser.color
  })
}

export function setupCollaboration(io: Server) {
  io.on('connection', async (socket: Socket) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token

    if (!token) {
      socket.disconnect(true)
      return
    }

    let user: { userId: string; username: string }
    try {
      user = verifyToken(token as string)
    } catch (e) {
      socket.disconnect(true)
      return
    }

    await setUserOnline(user.userId, socket.id)

    let currentDocumentId: string | null = null

    socket.on('join-document', async (documentId: string, userData?: { color: string }) => {
      try {
        const room = getOrCreateDocumentRoom(documentId)

        if (room.users.size === 0) {
          await loadDocumentState(documentId, room.ydoc)
        }

        await handleUserRejoin(io, socket, documentId, room, user, userData)

        socket.join(`doc:${documentId}`)
        currentDocumentId = documentId

        const fullState = Y.encodeStateAsUpdate(room.ydoc)
        socket.emit('doc-full-state', {
          state: Buffer.from(fullState),
          version: room.version
        })

        const users = Array.from(room.users.values()).map(u => ({
          userId: u.userId,
          username: u.username,
          color: u.color
        }))
        io.to(`doc:${documentId}`).emit('users-update', users)

        socket.on('doc-update', async (update: ArrayBuffer) => {
          await broadcastAndProcessUpdate(io, socket, documentId, room, Buffer.from(update))
        })

        socket.on('doc-updates-batch', async (updates: ArrayBuffer[]) => {
          for (const update of updates) {
            await broadcastAndProcessUpdate(io, socket, documentId, room, Buffer.from(update))
          }
        })

        socket.on('sync-request', async () => {
          const fullState = Y.encodeStateAsUpdate(room.ydoc)
          socket.emit('doc-full-state', {
            state: Buffer.from(fullState),
            version: room.version
          })
        })

        socket.on('sync-delta', (clientStateVector: ArrayBuffer) => {
          try {
            const delta = Y.encodeStateAsUpdate(room.ydoc, new Uint8Array(clientStateVector))
            socket.emit('doc-delta', {
              state: Buffer.from(delta),
              version: room.version
            })
          } catch (e) {
            console.error('生成 delta 更新失败:', e)
          }
        })

        socket.on('apply-client-state', async (clientUpdate: ArrayBuffer) => {
          await broadcastAndProcessUpdate(io, socket, documentId, room, Buffer.from(clientUpdate))
        })

        socket.on('cursor-update', (cursorData: {
          anchor: number
          head: number
        }) => {
          const userInfo = room.users.get(user.userId)
          if (userInfo) {
            socket.to(`doc:${documentId}`).emit('cursor-update', {
              userId: user.userId,
              username: userInfo.username,
              color: userInfo.color,
              ...cursorData
            })
          }
        })

        socket.on('cursor-selection', (selectionData: {
          from: number
          to: number
          text?: string
        }) => {
          const userInfo = room.users.get(user.userId)
          if (userInfo) {
            socket.to(`doc:${documentId}`).emit('cursor-selection', {
              userId: user.userId,
              username: userInfo.username,
              color: userInfo.color,
              ...selectionData
            })
          }
        })

        socket.on('awareness-update', (awarenessUpdate: any) => {
          socket.to(`doc:${documentId}`).emit('awareness-update', {
            userId: user.userId,
            ...awarenessUpdate
          })
        })

        socket.on('request-save', async () => {
          await withLock(room, async () => {
            await saveDocumentState(documentId, room)
            socket.emit('save-confirm', { 
              success: true,
              version: room.version
            })
          })
        })

        socket.on('heartbeat', () => {
          socket.emit('heartbeat-ack', { timestamp: Date.now() })
        })

      } catch (error) {
        console.error('加入文档失败:', error)
        socket.emit('error', { message: '加入文档失败', retry: true })
      }
    })

    socket.on('leave-document', async () => {
      if (currentDocumentId) {
        await handleLeaveDocument(socket, currentDocumentId, user.userId, io)
        currentDocumentId = null
      }
    })

    socket.on('disconnect', async (reason: string) => {
      console.log(`用户 ${user.userId} 断开连接: ${reason}`)
      await setUserOffline(user.userId)
      if (currentDocumentId) {
        await handleLeaveDocument(socket, currentDocumentId, user.userId, io)
      }
    })

    socket.on('error', (error: any) => {
      console.error('Socket 错误:', error)
    })
  })
}

async function handleLeaveDocument(
  socket: Socket,
  documentId: string,
  userId: string,
  io: Server
) {
  const room = documentRooms.get(documentId)
  if (!room) return

  const userLeft = room.users.get(userId)
  room.users.delete(userId)
  await removeUserFromDocument(documentId, userId)
  socket.leave(`doc:${documentId}`)

  if (userLeft) {
    io.to(`doc:${documentId}`).emit('user-left', {
      userId,
      username: userLeft.username
    })
  }

  if (room.users.size === 0) {
    await withLock(room, async () => {
      await saveDocumentState(documentId, room)
    })
    documentRooms.delete(documentId)
    console.log(`文档 ${documentId} 已从内存卸载`)
  } else {
    const users = Array.from(room.users.values()).map(u => ({
      userId: u.userId,
      username: u.username,
      color: u.color
    }))
    io.to(`doc:${documentId}`).emit('users-update', users)
  }
}

process.on('SIGTERM', async () => {
  console.log('收到 SIGTERM，正在保存所有文档...')
  for (const [documentId, room] of documentRooms) {
    await saveDocumentState(documentId, room)
  }
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('收到 SIGINT，正在保存所有文档...')
  for (const [documentId, room] of documentRooms) {
    await saveDocumentState(documentId, room)
  }
  process.exit(0)
})
