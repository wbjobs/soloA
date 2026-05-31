import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config, UserRole, rolePermissions, Permission } from '../config'

export interface AuthPayload {
  userId: string
  username: string
  email: string
  role: UserRole
}

export interface AuthenticatedRequest extends Request {
  user?: AuthPayload
}

export function verifyToken(token: string): AuthPayload {
  return jwt.verify(token, config.jwt.secret) as AuthPayload
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未提供认证令牌' })
  }

  try {
    const token = authHeader.substring(7)
    const decoded = verifyToken(token)
    req.user = decoded
    next()
  } catch (error) {
    return res.status(401).json({ error: '无效的认证令牌' })
  }
}

export function requirePermission(permission: Permission) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.user) {
      return res.status(401).json({ error: '未认证' })
    }

    const permissions = rolePermissions[req.user.role]
    if (!permissions.includes(permission) && !permissions.includes('admin:all')) {
      return res.status(403).json({ error: '权限不足' })
    }

    next()
  }
}
