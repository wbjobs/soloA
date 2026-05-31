import { Pool } from 'pg'
import { config } from '../config'

const pool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  user: config.postgres.user,
  password: config.postgres.password,
  database: config.postgres.database
})

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
  getPool: () => pool
}

export async function initDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'reader',
      avatar_color VARCHAR(7) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL DEFAULT '未命名文档',
      owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ydoc_state BYTEA,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS document_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      ydoc_state BYTEA NOT NULL,
      content_snapshot TEXT NOT NULL,
      created_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(document_id, version_number)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS document_permissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL DEFAULT 'reader',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(document_id, user_id)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      anchor_from JSONB NOT NULL,
      anchor_to JSONB NOT NULL,
      selected_text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP,
      resolved_by UUID REFERENCES users(id)
    )
  `)

  await db.query(`
    CREATE TABLE IF NOT EXISTS comment_replies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
      author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id)
  `)
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON document_versions(document_id)
  `)
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_comments_doc ON comments(document_id)
  `)
}
