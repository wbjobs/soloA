import dotenv from 'dotenv'

dotenv.config()

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },
  postgres: {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'collab_docs'
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined
  }
}

export enum UserRole {
  READER = 'reader',
  EDITOR = 'editor',
  ADMIN = 'admin'
}

export type Permission = 
  | 'document:read'
  | 'document:write'
  | 'document:delete'
  | 'document:rollback'
  | 'comment:read'
  | 'comment:write'
  | 'comment:resolve'
  | 'user:manage'
  | 'admin:all'

export const rolePermissions: Record<UserRole, Permission[]> = {
  [UserRole.READER]: ['document:read', 'comment:read'],
  [UserRole.EDITOR]: [
    'document:read',
    'document:write',
    'document:rollback',
    'comment:read',
    'comment:write',
    'comment:resolve'
  ],
  [UserRole.ADMIN]: [
    'document:read',
    'document:write',
    'document:delete',
    'document:rollback',
    'comment:read',
    'comment:write',
    'comment:resolve',
    'user:manage',
    'admin:all'
  ]
}
