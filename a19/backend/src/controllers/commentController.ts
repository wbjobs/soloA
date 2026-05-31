import { Response, NextFunction } from 'express';
import { query } from '../config/database';
import { publishToQueue, QUEUES } from '../config/rabbitmq';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

export const createComment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { reviewId, filePath, lineNumber, content } = req.body;
    const authorId = req.userId!;
    
    if (!reviewId || !content) {
      return next(new AppError('Review ID and content are required', 400));
    }
    
    const reviewResult = await query(
      'SELECT * FROM reviews WHERE id = $1',
      [reviewId]
    );
    
    if (reviewResult.rows.length === 0) {
      return next(new AppError('Review not found', 404));
    }
    
    const result = await query(
      `INSERT INTO comments (review_id, author_id, file_path, line_number, content)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [reviewId, authorId, filePath || null, lineNumber || null, content]
    );
    
    const comment = result.rows[0];
    
    const authorResult = await query(
      'SELECT username, display_name FROM users WHERE id = $1',
      [authorId]
    );
    
    const authorName = authorResult.rows[0]?.display_name || authorResult.rows[0]?.username;
    
    const creatorResult = await query(
      'SELECT email FROM users WHERE id = $1',
      [reviewResult.rows[0].creator_id]
    );
    
    if (creatorResult.rows.length > 0) {
      await publishToQueue(QUEUES.EMAIL_NOTIFICATIONS, {
        type: 'new_comment',
        to: creatorResult.rows[0].email,
        reviewTitle: reviewResult.rows[0].title,
        commentAuthor: authorName,
        commentContent: content,
        filePath: filePath || 'General',
        reviewId
      });
    }
    
    res.status(201).json({
      status: 'success',
      data: {
        comment: {
          ...comment,
          author: authorResult.rows[0]
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getComments = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { reviewId, filePath } = req.query;
    
    let queryText = `
      SELECT c.*,
             u.username as author_username,
             u.display_name as author_display_name,
             u.avatar_url as author_avatar
      FROM comments c
      JOIN users u ON c.author_id = u.id
      WHERE c.review_id = $1
    `;
    const params: any[] = [reviewId];
    
    if (filePath) {
      queryText += ' AND c.file_path = $2';
      params.push(filePath);
    }
    
    queryText += ' ORDER BY c.created_at ASC';
    
    const result = await query(queryText, params);
    
    const commentsWithReplies = [];
    
    for (const comment of result.rows) {
      const repliesResult = await query(
        `SELECT cr.*,
                u.username as author_username,
                u.display_name as author_display_name,
                u.avatar_url as author_avatar
         FROM comment_replies cr
         JOIN users u ON cr.author_id = u.id
         WHERE cr.parent_comment_id = $1
         ORDER BY cr.created_at ASC`,
        [comment.id]
      );
      
      commentsWithReplies.push({
        ...comment,
        replies: repliesResult.rows
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        comments: commentsWithReplies
      }
    });
  } catch (error) {
    next(error);
  }
};

export const updateComment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { content, isResolved } = req.body;
    const userId = req.userId!;
    
    const commentResult = await query(
      'SELECT * FROM comments WHERE id = $1',
      [id]
    );
    
    if (commentResult.rows.length === 0) {
      return next(new AppError('Comment not found', 404));
    }
    
    if (commentResult.rows[0].author_id !== userId) {
      return next(new AppError('Access denied', 403));
    }
    
    const result = await query(
      `UPDATE comments 
       SET content = COALESCE($1, content),
           is_resolved = COALESCE($2, is_resolved)
       WHERE id = $3
       RETURNING *`,
      [content, isResolved, id]
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        comment: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

export const deleteComment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    
    const commentResult = await query(
      'SELECT * FROM comments WHERE id = $1',
      [id]
    );
    
    if (commentResult.rows.length === 0) {
      return next(new AppError('Comment not found', 404));
    }
    
    if (commentResult.rows[0].author_id !== userId) {
      return next(new AppError('Access denied', 403));
    }
    
    await query('DELETE FROM comments WHERE id = $1', [id]);
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(error);
  }
};

export const replyToComment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;
    const authorId = req.userId!;
    
    if (!content) {
      return next(new AppError('Content is required', 400));
    }
    
    const commentResult = await query(
      `SELECT c.*, r.title as review_title, r.creator_id as review_creator
       FROM comments c
       JOIN reviews r ON c.review_id = r.id
       WHERE c.id = $1`,
      [commentId]
    );
    
    if (commentResult.rows.length === 0) {
      return next(new AppError('Comment not found', 404));
    }
    
    const result = await query(
      `INSERT INTO comment_replies (parent_comment_id, author_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [commentId, authorId, content]
    );
    
    const reply = result.rows[0];
    
    const authorResult = await query(
      'SELECT username, display_name FROM users WHERE id = $1',
      [authorId]
    );
    
    const authorName = authorResult.rows[0]?.display_name || authorResult.rows[0]?.username;
    
    if (commentResult.rows[0].author_id !== authorId) {
      const parentAuthorResult = await query(
        'SELECT email FROM users WHERE id = $1',
        [commentResult.rows[0].author_id]
      );
      
      if (parentAuthorResult.rows.length > 0) {
        await publishToQueue(QUEUES.EMAIL_NOTIFICATIONS, {
          type: 'comment_reply',
          to: parentAuthorResult.rows[0].email,
          reviewTitle: commentResult.rows[0].review_title,
          commentAuthor: authorName,
          replyContent: content,
          reviewId: commentResult.rows[0].review_id
        });
      }
    }
    
    res.status(201).json({
      status: 'success',
      data: {
        reply: {
          ...reply,
          author: authorResult.rows[0]
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

export const resolveComment = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;
    
    const commentResult = await query(
      `SELECT c.*, r.creator_id as review_creator
       FROM comments c
       JOIN reviews r ON c.review_id = r.id
       WHERE c.id = $1`,
      [id]
    );
    
    if (commentResult.rows.length === 0) {
      return next(new AppError('Comment not found', 404));
    }
    
    if (commentResult.rows[0].author_id !== userId && 
        commentResult.rows[0].review_creator !== userId) {
      return next(new AppError('Access denied', 403));
    }
    
    const result = await query(
      `UPDATE comments 
       SET is_resolved = true
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        comment: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};
