import { Request, Response, NextFunction } from 'express';
import { query, getClient } from '../config/database';
import { publishToQueue, QUEUES } from '../config/rabbitmq';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

export const bulkUpdateReviewStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    
    const { reviewIds, status, comment } = req.body;
    const userId = req.userId!;

    if (!reviewIds || !Array.isArray(reviewIds) || reviewIds.length === 0) {
      return next(new AppError('No review IDs provided', 400));
    }

    const validStatuses = ['pending', 'approved', 'rejected', 'merged'];
    if (!validStatuses.includes(status)) {
      return next(new AppError('Invalid status', 400));
    }

    const placeholders = reviewIds.map((_, i) => `$${i + 2}`).join(',');
    
    const reviews = await client.query(
      `SELECT r.*, u.email as creator_email 
       FROM reviews r
       JOIN users u ON r.creator_id = u.id
       WHERE r.id IN (${placeholders})`,
      [userId, ...reviewIds]
    );

    if (reviews.rows.length === 0) {
      await client.query('ROLLBACK');
      return next(new AppError('No valid reviews found', 404));
    }

    const updatePlaceholders = reviewIds.map((_, i) => `$${i + 2}`).join(',');
    await client.query(
      `UPDATE reviews 
       SET status = $1, updated_at = NOW()
       WHERE id IN (${updatePlaceholders})`,
      [status, ...reviewIds]
    );

    await client.query(
      `UPDATE review_assignments 
       SET status = 'reviewed', assigned_at = NOW()
       WHERE review_id IN (${updatePlaceholders}) AND user_id = $1`,
      [userId, ...reviewIds]
    );

    if (comment) {
      for (const reviewId of reviewIds) {
        await client.query(
          `INSERT INTO comments (review_id, author_id, content)
           VALUES ($1, $2, $3)`,
          [reviewId, userId, comment]
        );
      }
    }

    for (const review of reviews.rows) {
      await publishToQueue(QUEUES.EMAIL_NOTIFICATIONS, {
        type: 'review_status_changed',
        to: review.creator_email,
        reviewTitle: review.title,
        newStatus: status,
        reviewId: review.id
      });
    }

    await client.query('COMMIT');

    res.status(200).json({
      status: 'success',
      data: {
        updatedCount: reviews.rows.length,
        reviews: reviews.rows
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

export const bulkAssignReviewers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    
    const { reviewIds, reviewerIds } = req.body;
    const userId = req.userId!;

    if (!reviewIds || !Array.isArray(reviewIds) || reviewIds.length === 0) {
      return next(new AppError('No review IDs provided', 400));
    }

    if (!reviewerIds || !Array.isArray(reviewerIds) || reviewerIds.length === 0) {
      return next(new AppError('No reviewer IDs provided', 400));
    }

    const reviews = await client.query(
      `SELECT r.*, p.name as project_name
       FROM reviews r
       JOIN projects p ON r.project_id = p.id
       WHERE r.id = ANY($1)`,
      [reviewIds]
    );

    if (reviews.rows.length === 0) {
      await client.query('ROLLBACK');
      return next(new AppError('No valid reviews found', 404));
    }

    const reviewers = await client.query(
      `SELECT id, email, username, display_name 
       FROM users 
       WHERE id = ANY($1)`,
      [reviewerIds]
    );

    for (const review of reviews.rows) {
      for (const reviewer of reviewers.rows) {
        await client.query(
          `INSERT INTO review_assignments (review_id, user_id, status)
           VALUES ($1, $2, 'pending')
           ON CONFLICT (review_id, user_id) DO NOTHING`,
          [review.id, reviewer.id]
        );

        await publishToQueue(QUEUES.EMAIL_NOTIFICATIONS, {
          type: 'review_assigned',
          to: reviewer.email,
          reviewTitle: review.title,
          projectName: review.project_name,
          reviewId: review.id
        });
      }
    }

    await client.query('COMMIT');

    res.status(200).json({
      status: 'success',
      data: {
        assignedCount: reviews.rows.length * reviewers.rows.length,
        reviews: reviews.rows.map(r => r.id),
        reviewers: reviewers.rows.map(r => r.id)
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};

export const bulkDeleteReviews = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    
    const { reviewIds } = req.body;
    const userId = req.userId!;

    if (!reviewIds || !Array.isArray(reviewIds) || reviewIds.length === 0) {
      return next(new AppError('No review IDs provided', 400));
    }

    const reviews = await client.query(
      `SELECT * FROM reviews 
       WHERE id = ANY($1) AND creator_id = $2`,
      [reviewIds, userId]
    );

    if (reviews.rows.length === 0) {
      await client.query('ROLLBACK');
      return next(new AppError('No valid reviews found or access denied', 404));
    }

    await client.query(
      'DELETE FROM reviews WHERE id = ANY($1) AND creator_id = $2',
      [reviewIds, userId]
    );

    await client.query('COMMIT');

    res.status(200).json({
      status: 'success',
      data: {
        deletedCount: reviews.rows.length
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};
