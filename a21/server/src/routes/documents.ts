import { Router } from 'express'
import * as Y from 'yjs'
import { db } from '../db'
import { authMiddleware, AuthenticatedRequest, requirePermission } from '../middleware/auth'

const router = Router()

router.get('/', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.userId
    
    const result = await db.query(
      `SELECT d.id, d.title, d.owner_id, d.created_at, d.updated_at,
              u.username as owner_name,
              dp.role as user_role
       FROM documents d
       LEFT JOIN users u ON d.owner_id = u.id
       LEFT JOIN document_permissions dp ON dp.document_id = d.id AND dp.user_id = $1
       WHERE d.owner_id = $1 OR dp.id IS NOT NULL
       ORDER BY d.updated_at DESC`,
      [userId]
    )

    const documents = result.rows.map(doc => ({
      id: doc.id,
      title: doc.title,
      ownerId: doc.owner_id,
      ownerName: doc.owner_name,
      userRole: doc.user_role || (doc.owner_id === userId ? 'owner' : null),
      createdAt: doc.created_at,
      updatedAt: doc.updated_at
    }))

    res.json(documents)
  } catch (error) {
    console.error('获取文档列表错误:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

router.get('/:id', authMiddleware, requirePermission('document:read'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params
    const userId = req.user!.userId

    const result = await db.query(
      `SELECT d.*, u.username as owner_name,
              dp.role as user_role
       FROM documents d
       LEFT JOIN users u ON d.owner_id = u.id
       LEFT JOIN document_permissions dp ON dp.document_id = d.id AND dp.user_id = $2
       WHERE d.id = $1`,
      [id, userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '文档不存在' })
    }

    const doc = result.rows[0]
    
    res.json({
      id: doc.id,
      title: doc.title,
      ownerId: doc.owner_id,
      ownerName: doc.owner_name,
      userRole: doc.user_role || (doc.owner_id === userId ? 'owner' : null),
      createdAt: doc.created_at,
      updatedAt: doc.updated_at
    })
  } catch (error) {
    console.error('获取文档错误:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

router.post('/', authMiddleware, requirePermission('document:write'), async (req: AuthenticatedRequest, res) => {
  try {
    const { title } = req.body
    const userId = req.user!.userId

    const result = await db.query(
      `INSERT INTO documents (title, owner_id)
       VALUES ($1, $2)
       RETURNING id, title, owner_id, created_at, updated_at`,
      [title || '未命名文档', userId]
    )

    const doc = result.rows[0]
    res.status(201).json({
      id: doc.id,
      title: doc.title,
      ownerId: doc.owner_id,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at
    })
  } catch (error) {
    console.error('创建文档错误:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

router.put('/:id', authMiddleware, requirePermission('document:write'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params
    const { title } = req.body

    const result = await db.query(
      `UPDATE documents 
       SET title = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, title, updated_at`,
      [title || '未命名文档', id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '文档不存在' })
    }

    res.json(result.rows[0])
  } catch (error) {
    console.error('更新文档错误:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

router.delete('/:id', authMiddleware, requirePermission('document:delete'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params

    const result = await db.query(
      'DELETE FROM documents WHERE id = $1 RETURNING id',
      [id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '文档不存在' })
    }

    res.status(204).send()
  } catch (error) {
    console.error('删除文档错误:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

router.get('/:id/versions', authMiddleware, requirePermission('document:read'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params

    const result = await db.query(
      `SELECT dv.*, u.username as created_by_name
       FROM document_versions dv
       LEFT JOIN users u ON dv.created_by = u.id
       WHERE dv.document_id = $1
       ORDER BY dv.version_number DESC
       LIMIT 50`,
      [id]
    )

    const versions = result.rows.map(v => ({
      id: v.id,
      versionNumber: v.version_number,
      contentSnapshot: v.content_snapshot,
      createdBy: v.created_by,
      createdByName: v.created_by_name,
      createdAt: v.created_at
    }))

    res.json(versions)
  } catch (error) {
    console.error('获取版本历史错误:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

router.post('/:id/versions/:versionNumber/rollback', authMiddleware, requirePermission('document:rollback'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id, versionNumber } = req.params
    const userId = req.user!.userId

    const versionResult = await db.query(
      'SELECT ydoc_state FROM document_versions WHERE document_id = $1 AND version_number = $2',
      [id, versionNumber]
    )

    if (versionResult.rows.length === 0) {
      return res.status(404).json({ error: '版本不存在' })
    }

    const ydocState = versionResult.rows[0].ydoc_state

    await db.query(
      'UPDATE documents SET ydoc_state = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [ydocState, id]
    )

    res.json({ success: true, message: '文档已回滚到指定版本' })
  } catch (error) {
    console.error('回滚版本错误:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

router.post('/:id/versions/create-snapshot', authMiddleware, requirePermission('document:write'), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params
    const userId = req.user!.userId
    const { ydocState, contentSnapshot } = req.body

    const latestResult = await db.query(
      'SELECT MAX(version_number) as max_version FROM document_versions WHERE document_id = $1',
      [id]
    )
    const newVersion = (latestResult.rows[0].max_version || 0) + 1

    const result = await db.query(
      `INSERT INTO document_versions (document_id, version_number, ydoc_state, content_snapshot, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, version_number, created_at`,
      [id, newVersion, ydocState, contentSnapshot, userId]
    )

    res.status(201).json({
      id: result.rows[0].id,
      versionNumber: result.rows[0].version_number,
      createdAt: result.rows[0].created_at
    })
  } catch (error) {
    console.error('创建快照错误:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

export default router
