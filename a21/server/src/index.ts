import express from 'express'
import http from 'http'
import cors from 'cors'
import { Server } from 'socket.io'
import { config } from './config'
import { initDatabase } from './db'
import { initRedis } from './redis'
import { setupCollaboration } from './socket/collab'

import authRoutes from './routes/auth'
import documentRoutes from './routes/documents'
import commentRoutes from './routes/comments'

const app = express()
const server = http.createServer(app)

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}))

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/auth', authRoutes)
app.use('/api/documents', documentRoutes)
app.use('/api/comments', commentRoutes)

app.use((_req, res) => {
  res.status(404).json({ error: '接口不存在' })
})

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err)
  res.status(500).json({ error: '服务器内部错误' })
})

const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
  },
  pingInterval: 30000,
  pingTimeout: 60000
})

setupCollaboration(io)

async function startServer() {
  try {
    console.log('正在初始化数据库...')
    await initDatabase()
    console.log('数据库初始化完成')

    console.log('正在连接 Redis...')
    await initRedis()
    console.log('Redis 连接完成')

    server.listen(config.port, () => {
      console.log(`服务器运行在端口 ${config.port}`)
    })
  } catch (error) {
    console.error('启动服务器失败:', error)
    process.exit(1)
  }
}

startServer()
