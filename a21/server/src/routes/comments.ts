import { Router } from 'express'
import { db } from '../db'
import { authMiddleware, AuthenticatedRequest, requirePermission } from '../middleware/auth'

const router = Router()

router.get('/document/:documentId', authMiddleware, requirePermission('comment:read'), async (req: AuthenticatedRequest, res) => {
  try {
    const { documentId } = req.params

    const commentsResult = await db.query(
      `SELECT c.*, u.username as author_name, u.avatar_color as author_color
       FROM comments c
       LEFT JOIN users u ON c.author_id = u.id
       WHERE c.document_id = $1
       ORDER BY c.created_at DESC`,
      [documentId]
    )

    const comments = await Promise.all(
      commentsResult.rows.map(async (comment) => {
        const repliesResult = await db.query(
          `SELECT cr.*, u.username as author_name, u.avatar_color as author_color
           FROM comment_replies cr
           LEFT JOIN users u ON cr.author_id = u.id
           WHERE cr.comment_id = $1
           ORDER BY cr.created_at ASC`,
          [comment.id]
        )

        return {
          id: comment.id,
          documentId: comment.document_id,
          authorId: comment.author_id,
          authorName: comment.author_name,
          authorColor: comment.author_color,
          anchorFrom: comment.anchor_from,
          anchorTo: comment.anchor_to,
          selectedText: comment.selected_text,
          createdAt: comment.created_at,
          resolvedAt: comment.resolved_at,
          resolvedBy: comment.resolved_by,
          replies: repliesResult.rows.map(reply => ({
            id: reply.id,
            commentId: reply.comment_id,
            authorId: reply.author_id,
            authorName: reply.author_name,
            authorColor: reply.author_color,
            content: reply.content,
            createdAt: reply.created_at
          }))
        }
      })
    )

    res.json(comments)
  } catch (error) {
    console.error('获取评论错误:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

router.post('/', authMiddleware, requirePermission('comment:write'), async (req: AuthenticatedRequest, res) => {
  try {
    const { documentId, anchorFrom, anchorTo, selectedText, content } = req.body
    const userId = req.user!.userId

    if (!documentId || !anchorFrom || !anchorTo) {
      return res.status(400).json({ error: '缺少必要参数' })
    }

    const commentResult = await db.query(
      `INSERT INTO comments (document_id, author_id, anchor_from, anchor_to, selected_text)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, document_id, author_id, created_at`,
      [documentId, userId, anchorFrom, anchorTo, selectedText || '']
    )

    const comment = commentResult.rows[0]

    let replyId: string | null = null
    if (content) {
      const replyResult = await db.query(
        `INSERT INTO comment_replies (comment_id, author_id, content)
         VALUES ($1, $2, $3)
         RETURNING id, created_at`,
        [comment.id, userId, content]
      )
      replyId = replyResult.rows[0].id
    }

    res.status(201).json({
      id: comment.id,
      documentId: comment.document_id,
      authorId: comment.author_id,
      createdAt: comment.created_at,
      replyId
    })
  } catch (error) {
    console.error('创建评论错误:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

router.post('/:commentId/replies', authMiddleware, requirePermission('comment:write'), async (req: AuthenticatedRequest, res) => {
  try {
    const { commentId } = req.params
    const { content } = req.body
    const userId = req.user!.userId

    if (!content) {
      return res.status(400).json({ error: '回复内容不能为空' })
    }

    const commentResult = await db.query(
      'SELECT id FROM comments WHERE id = $1',
      [commentId]
    )

    if (commentResult.rows.length === 0) {
      return res.status(404).json({ error: '评论不存在' })
    }

    const result = await db.query(
      `INSERT INTO comment_replies (comment_id, author_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, comment_id, author_id, content, created_at`,
      [commentId, userId, content]
    )

    res.status(201).json({
      id: result.rows[0].id,
      commentId: result.rows[0].comment_id,
      authorId: result.rows[0].author_id,
      content: result.rows[0].content,
      createdAt: result.rows[0].created_at
    })
  } catch (error) {
    console.error('创建回复错误:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

router.patch('/:commentId/resolve', authMiddleware, requirePermission('comment:resolve'), async (req: AuthenticatedRequest, res) => {
  try {
    const { commentId } = req.params
    const userId = req.user!.userId

    const result = await db.query(
      `UPDATE comments 
       SET resolved_at = CURRENT_TIMESTAMP, resolved_by = $1
       WHERE id = $2 AND resolved_at IS NULL
       RETURNING id, resolved_at`,
      [userId, commentId]
    )

    if (result.rows.length === 0) {
      const checkResult = await db.query('SELECT id FROM comments WHERE id = $1', [commentId])
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: '评论不存在' })
      }
      return res.status(400).json({ error: '评论已被解决' })
    }

    res.json({
      id: result.rows[0].id,
      resolvedAt: result.rows[0].resolved_at,
      resolvedBy: userId
    })
  } catch (error) {
    console.error('解决评论错误:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

router.patch('/:commentId/reopen', authMiddleware, requirePermission('comment:resolve'), async (req: AuthenticatedRequest, res) => {
  try {
    const { commentId } = req.params

    const result = await db.query(
      `UPDATE comments 
       SET resolved_at = NULL, resolved_by = NULL
       WHERE id = $1 AND resolved_at IS NOT NULL
       RETURNING id`,
      [commentId]
    )

    if (result.rows.length === 0) {
      const checkResult = await db.query('SELECT id FROM comments WHERE id = $1', [commentId])
      if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: '评论不存在' })
      }
      return res.status(400).json({ error: '评论未被解决' })
    }

    res.json({ id: result.rows[0].id, reopened: true })
  } catch (error) {
    console.error('重新打开评论错误:', error)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

export default router
