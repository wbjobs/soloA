import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { io, Socket, ManagerOptions, SocketOptions } from 'socket.io-client'
import * as Y from 'yjs'
import { RemoteUser, RemoteCursor } from '../types'
import { useAuthStore } from '../store/authStore'

interface UseCollaborationProps {
  documentId: string
  onYDocUpdate?: (ydoc: Y.Doc) => void
  onStateChange?: (state: 'connecting' | 'connected' | 'disconnected' | 'synchronizing') => void
}

interface PendingUpdate {
  update: Uint8Array
  timestamp: number
}

interface CachedState {
  ydocUpdate: Uint8Array | null
  pendingUpdates: PendingUpdate[]
  lastSyncVersion: number
  clientId: number
}

const YDOC_STORAGE_KEY = 'ydoc-cache-'

function getCachedState(documentId: string): CachedState | null {
  try {
    const key = YDOC_STORAGE_KEY + documentId
    const data = sessionStorage.getItem(key)
    if (data) {
      return JSON.parse(data)
    }
  } catch (e) {
    console.warn('读取缓存状态失败:', e)
  }
  return null
}

function setCachedState(documentId: string, state: CachedState): void {
  try {
    const key = YDOC_STORAGE_KEY + documentId
    sessionStorage.setItem(key, JSON.stringify({
      ydocUpdate: state.ydocUpdate ? Array.from(state.ydocUpdate) : null,
      pendingUpdates: state.pendingUpdates.map(u => ({
        ...u,
        update: Array.from(u.update)
      })),
      lastSyncVersion: state.lastSyncVersion,
      clientId: state.clientId
    }))
  } catch (e) {
    console.warn('保存缓存状态失败:', e)
  }
}

function clearCachedState(documentId: string): void {
  try {
    const key = YDOC_STORAGE_KEY + documentId
    sessionStorage.removeItem(key)
  } catch (e) {
    console.warn('清除缓存状态失败:', e)
  }
}

export function useCollaboration({ 
  documentId, 
  onYDocUpdate,
  onStateChange 
}: UseCollaborationProps) {
  const socketRef = useRef<Socket | null>(null)
  const ydocRef = useRef<Y.Doc | null>(null)
  const pendingUpdatesRef = useRef<PendingUpdate[]>([])
  const isSynchronizingRef = useRef(false)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 10
  const cachedStateRef = useRef<CachedState | null>(null)

  const [isConnected, setIsConnected] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState<RemoteUser[]>([])
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(new Map())
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null)
  const [serverVersion, setServerVersion] = useState(0)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced'>('idle')

  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)

  const setupYdoc = useCallback(() => {
    if (!ydocRef.current) {
      ydocRef.current = new Y.Doc()
      setYdoc(ydocRef.current)
      console.log('创建新的 Y.Doc 实例')
    }
    return ydocRef.current
  }, [])

  const flushPendingUpdates = useCallback(() => {
    if (!socketRef.current || !socketRef.current.connected) return
    if (pendingUpdatesRef.current.length === 0) return

    const updates = [...pendingUpdatesRef.current]
    pendingUpdatesRef.current = []
    
    if (updates.length === 1) {
      socketRef.current.emit('doc-update', updates[0].update)
      console.log(`发送单个待处理更新`)
    } else {
      socketRef.current.emit('doc-updates-batch', updates.map(u => u.update))
      console.log(`批量发送 ${updates.length} 个待处理更新`)
    }
  }, [])

  const synchronizeWithServer = useCallback(async () => {
    if (!socketRef.current || !ydocRef.current || isSynchronizingRef.current) return
    
    isSynchronizingRef.current = true
    setSyncStatus('syncing')
    onStateChange?.('synchronizing')

    try {
      const cached = cachedStateRef.current
      if (cached && cached.ydocUpdate) {
        try {
          Y.applyUpdate(ydocRef.current, cached.ydocUpdate, 'local-cache')
          console.log('从缓存恢复本地文档状态')
        } catch (e) {
          console.error('应用缓存状态失败:', e)
        }
      }

      const stateVector = Y.encodeStateVector(ydocRef.current)
      socketRef.current.emit('sync-delta', stateVector)
      console.log('请求 delta 同步')
    } catch (e) {
      console.error('同步失败:', e)
      isSynchronizingRef.current = false
      setSyncStatus('idle')
    }
  }, [onStateChange])

  const sendUpdate = useCallback((update: Uint8Array) => {
    if (!socketRef.current) return

    if (socketRef.current.connected && !isSynchronizingRef.current) {
      socketRef.current.emit('doc-update', update)
    } else {
      pendingUpdatesRef.current.push({
        update,
        timestamp: Date.now()
      })
      console.log(`更新已缓存 (待处理: ${pendingUpdatesRef.current.length})`)

      if (ydocRef.current) {
        setCachedState(documentId, {
          ydocUpdate: Y.encodeStateAsUpdate(ydocRef.current),
          pendingUpdates: pendingUpdatesRef.current,
          lastSyncVersion: serverVersion,
          clientId: ydocRef.current.clientID
        })
      }
    }
  }, [documentId, serverVersion])

  const sendCursorPosition = useCallback((selection: { anchor: number; head: number }) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('cursor-update', selection)
    }
  }, [])

  const sendSelection = useCallback((selection: { from: number; to: number; text?: string }) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('cursor-selection', selection)
    }
  }, [])

  const saveDocument = useCallback(() => {
    if (socketRef.current?.connected) {
      return new Promise<void>((resolve) => {
        socketRef.current!.once('save-confirm', () => {
          resolve()
        })
        socketRef.current!.emit('request-save')
      })
    }
    return Promise.resolve()
  }, [])

  useEffect(() => {
    if (!documentId || !token || !user) return

    cachedStateRef.current = getCachedState(documentId)
    const ydocInstance = setupYdoc()

    const updateHandler = (update: Uint8Array, origin: any) => {
      if (origin !== 'remote' && origin !== 'server' && origin !== 'local-cache') {
        sendUpdate(update)
      }
      onYDocUpdate?.(ydocInstance)
    }

    ydocInstance.on('update', updateHandler)

    const socketOptions: Partial<ManagerOptions & SocketOptions> = {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: maxReconnectAttempts,
      timeout: 20000
    }

    const socket = io(socketOptions)
    socketRef.current = socket

    socket.on('connect', () => {
      console.log('WebSocket 已连接')
      setIsConnected(true)
      reconnectAttemptsRef.current = 0
      onStateChange?.('connected')
      
      socket.emit('join-document', documentId, { color: user.avatarColor })
    })

    socket.on('disconnect', (reason) => {
      console.log('WebSocket 已断开:', reason)
      setIsConnected(false)
      onStateChange?.('disconnected')

      if (ydocInstance && !ydocInstance.isDestroyed) {
        setCachedState(documentId, {
          ydocUpdate: Y.encodeStateAsUpdate(ydocInstance),
          pendingUpdates: pendingUpdatesRef.current,
          lastSyncVersion: serverVersion,
          clientId: ydocInstance.clientID
        })
      }

      if (reason === 'io server disconnect') {
        socket.connect()
      }
    })

    socket.on('connect_error', (error) => {
      console.error('连接错误:', error)
      reconnectAttemptsRef.current++
      
      if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
        console.error('达到最大重连次数，停止重连')
      }
    })

    socket.on('reconnect', (attemptNumber) => {
      console.log(`重新连接成功 (尝试 ${attemptNumber} 次)`)
      setIsConnected(true)
      reconnectAttemptsRef.current = 0
    })

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`尝试重连 (${attemptNumber}/${maxReconnectAttempts})...`)
      onStateChange?.('connecting')
    })

    socket.on('reconnect_failed', () => {
      console.error('重连失败')
      onStateChange?.('disconnected')
    })

    socket.on('doc-full-state', async (data: { state: ArrayBuffer; version: number }) => {
      try {
        isSynchronizingRef.current = true
        setSyncStatus('syncing')
        onStateChange?.('synchronizing')

        const serverState = new Uint8Array(data.state)
        const localState = Y.encodeStateAsUpdate(ydocInstance)

        const mergedDoc = new Y.Doc()
        Y.applyUpdate(mergedDoc, serverState, 'server')
        
        if (cachedStateRef.current?.pendingUpdates && cachedStateRef.current.pendingUpdates.length > 0) {
          for (const pending of cachedStateRef.current.pendingUpdates) {
            try {
              Y.applyUpdate(mergedDoc, pending.update, 'pending')
            } catch (e) {
              console.warn('应用待处理更新失败:', e)
            }
          }
        }

        if (pendingUpdatesRef.current.length > 0) {
          for (const pending of pendingUpdatesRef.current) {
            try {
              Y.applyUpdate(mergedDoc, pending.update, 'pending')
            } catch (e) {
              console.warn('应用待处理更新失败:', e)
            }
          }
        }

        const finalState = Y.encodeStateAsUpdate(mergedDoc)
        
        ydocInstance.transact(() => {
          ydocInstance.clear()
        })
        Y.applyUpdate(ydocInstance, finalState, 'server')

        setServerVersion(data.version)
        pendingUpdatesRef.current = []
        isSynchronizingRef.current = false
        setSyncStatus('synced')
        onStateChange?.('connected')
        clearCachedState(documentId)

        setTimeout(flushPendingUpdates, 100)

        console.log(`已同步到服务器版本 ${data.version}`)
      } catch (e) {
        console.error('应用完整状态失败:', e)
        isSynchronizingRef.current = false
        setSyncStatus('idle')
      }
    })

    socket.on('doc-delta', (data: { state: ArrayBuffer; version: number }) => {
      try {
        const delta = new Uint8Array(data.state)
        Y.applyUpdate(ydocInstance, delta, 'server')
        setServerVersion(data.version)
        isSynchronizingRef.current = false
        setSyncStatus('synced')
        onStateChange?.('connected')
        
        setTimeout(flushPendingUpdates, 100)

        console.log(`delta 同步完成，版本 ${data.version}`)
      } catch (e) {
        console.error('应用 delta 失败，请求完整状态:', e)
        socket.emit('sync-request')
      }
    })

    socket.on('doc-update', (update: ArrayBuffer) => {
      if (isSynchronizingRef.current) {
        console.warn('同步中忽略更新')
        return
      }

      try {
        Y.applyUpdate(ydocInstance, new Uint8Array(update), 'remote')
      } catch (e) {
        console.error('应用远程更新失败:', e)
        socket.emit('sync-request')
      }
    })

    socket.on('users-update', (users: RemoteUser[]) => {
      setOnlineUsers(users.filter(u => u.userId !== user.id))
    })

    socket.on('user-left', (data: { userId: string }) => {
      setOnlineUsers(prev => prev.filter(u => u.userId !== data.userId))
      setRemoteCursors(prev => {
        const newMap = new Map(prev)
        newMap.delete(data.userId)
        return newMap
      })
    })

    socket.on('cursor-update', (cursor: RemoteCursor) => {
      setRemoteCursors(prev => {
        const newMap = new Map(prev)
        newMap.set(cursor.userId, cursor)
        return newMap
      })
    })

    socket.on('cursor-selection', (selection: RemoteCursor) => {
      setRemoteCursors(prev => {
        const newMap = new Map(prev)
        newMap.set(selection.userId, selection)
        return newMap
      })
    })

    socket.on('awareness-update', (awareness: any) => {
      if (awareness.userId && awareness.userId !== user.id) {
        setRemoteCursors(prev => {
          const newMap = new Map(prev)
          const existing = newMap.get(awareness.userId)
          newMap.set(awareness.userId, {
            ...existing,
            userId: awareness.userId,
            username: awareness.user?.name || existing?.username || '',
            color: awareness.user?.color || existing?.color || '#3b82f6',
            ...awareness.cursor
          })
          return newMap
        })
      }
    })

    socket.on('error', (error: any) => {
      console.error('服务端错误:', error)
      if (error.retry) {
        setTimeout(() => socket.connect(), 2000)
      }
    })

    const heartbeatInterval = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat')
      }
    }, 30000)

    return () => {
      clearInterval(heartbeatInterval)
      
      if (socket.connected) {
        socket.emit('leave-document')
      }
      
      socket.disconnect()
      socketRef.current = null
      
      ydocInstance.off('update', updateHandler)
      
      if (ydocInstance && !ydocInstance.isDestroyed) {
        setCachedState(documentId, {
          ydocUpdate: Y.encodeStateAsUpdate(ydocInstance),
          pendingUpdates: pendingUpdatesRef.current,
          lastSyncVersion: serverVersion,
          clientId: ydocInstance.clientID
        })
      }

      ydocRef.current = null
      setYdoc(null)
      isSynchronizingRef.current = false
    }
  }, [documentId, token, user, setupYdoc, sendUpdate, synchronizeWithServer, flushPendingUpdates, onYDocUpdate, onStateChange, serverVersion])

  return {
    ydoc,
    isConnected,
    onlineUsers,
    remoteCursors,
    serverVersion,
    syncStatus,
    sendCursorPosition,
    sendSelection,
    saveDocument,
    synchronizeWithServer
  }
}
