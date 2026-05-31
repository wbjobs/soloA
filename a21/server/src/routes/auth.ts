import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { db } from '../db'
import { config, UserRole } from '../config'
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth'

const router = Router()

const AVATAR_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899'
]

function getRandomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
}

router.post('/register', async (req, res) => {
  try {
    const { username, email, password, role } = req.body

    if (!username || !email || !password) {
      return res.status(400).json({ error: '请填写必填字段' })
    }

    const existingUser = await db.query(
      'SELECT id FROM users WHERE username = $1 OR email = $2',
      [username, email]
    )

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: '用户名或邮箱已存在' })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const userRole = role && Object.values(UserRole).includes(role) ? role : UserRole.READER

    const result = await db.query(
      `INSERT INTO users (username, email, password_hash, role, avatar_color)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, email, role, avatar_color, created_at`,
      [username, email, passwordHash, userRole, getRandomColor()]
    )

    const user = result.rows[0]

    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    )

    res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatarColor: user.avatar_color
      }
    })
  } catch (error) {
    console.error('注册错误:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: '请填写邮箱和密码' })
    }

    const result = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: '邮箱或密码错误' })
    }

    const user = result.rows[0]
    const isValid = await bcrypt.compare(password, user.password_hash)

    if (!isValid) {
      return res.status(401).json({ error: '邮箱或密码错误' })
    }

    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    )

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        avatarColor: user.avatar_color
      }
    })
  } catch (error) {
    console.error('登录错误:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await db.query(
      'SELECT id, username, email, role, avatar_color, created_at FROM users WHERE id = $1',
      [req.user!.userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const user = result.rows[0]
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      avatarColor: user.avatar_color,
      createdAt: user.created_at
    })
  } catch (error) {
    console.error('获取用户信息错误:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

export default router
