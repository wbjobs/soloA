import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

export const getPersonalStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.userId!;
    const { period = '30d' } = req.query;

    const daysMap: Record<string, number> = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '1y': 365
    };
    const days = daysMap[period as string] || 30;

    const createdStats = await query(
      `SELECT 
         COUNT(*) as total,
         COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
         COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
         COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
         COUNT(CASE WHEN status = 'merged' THEN 1 END) as merged
       FROM reviews 
       WHERE creator_id = $1 
       AND created_at >= NOW() - INTERVAL '${days} days'`,
      [userId]
    );

    const reviewedStats = await query(
      `SELECT 
         COUNT(*) as total,
         COUNT(CASE WHEN r.status = 'pending' THEN 1 END) as pending,
         COUNT(CASE WHEN r.status = 'approved' THEN 1 END) as approved,
         COUNT(CASE WHEN r.status = 'rejected' THEN 1 END) as rejected,
         COUNT(CASE WHEN r.status = 'merged' THEN 1 END) as merged
       FROM review_assignments ra
       JOIN reviews r ON ra.review_id = r.id
       WHERE ra.user_id = $1 
       AND r.created_at >= NOW() - INTERVAL '${days} days'`,
      [userId]
    );

    const efficiencyResult = await query(
      `WITH my_reviews AS (
         SELECT id, created_at, merged_at,
                (SELECT MIN(created_at) FROM review_assignments 
                 WHERE review_id = r.id AND user_id = $1) as first_review_time
         FROM reviews r
         WHERE r.creator_id = $1
         AND r.created_at >= NOW() - INTERVAL '${days} days'
       )
       SELECT 
         AVG(EXTRACT(EPOCH FROM (first_review_time - created_at))) as avg_time_to_first_review,
         AVG(EXTRACT(EPOCH FROM (merged_at - created_at))) as avg_time_to_merge
       FROM my_reviews`,
      [userId]
    );

    const mostCommentedFiles = await query(
      `SELECT 
         c.file_path as file,
         COUNT(*) as comment_count
       FROM comments c
       JOIN reviews r ON c.review_id = r.id
       WHERE c.author_id = $1
       AND c.file_path IS NOT NULL
       AND c.created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY c.file_path
       ORDER BY comment_count DESC
       LIMIT 10`,
      [userId]
    );

    const weeklyReviews = await query(
      `SELECT 
         COUNT(*) as count
       FROM reviews 
       WHERE creator_id = $1
       AND created_at >= NOW() - INTERVAL '${days} days'`,
      [userId]
    );

    const avgTimeToFirstReview = efficiencyResult.rows[0]?.avg_time_to_first_review || 0;
    const avgTimeToMerge = efficiencyResult.rows[0]?.avg_time_to_merge || 0;
    const reviewsPerWeek = (weeklyReviews.rows[0]?.count || 0) / (days / 7);

    res.status(200).json({
      status: 'success',
      data: {
        period,
        created: createdStats.rows[0],
        reviewed: reviewedStats.rows[0],
        efficiency: {
          avgTimeToFirstReview: avgTimeToFirstReview,
          avgTimeToMerge: avgTimeToMerge,
          avgReviewCycle: avgTimeToFirstReview + avgTimeToMerge,
          reviewsPerWeek
        },
        mostCommentedFiles: mostCommentedFiles.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getTeamStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { projectId, period = '30d' } = req.query;

    const daysMap: Record<string, number> = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '1y': 365
    };
    const days = daysMap[period as string] || 30;

    let projectFilter = '';
    const params: any[] = [];

    if (projectId) {
      projectFilter = 'AND r.project_id = $1';
      params.push(projectId);
    }

    const totalReviews = await query(
      `SELECT COUNT(*) as count 
       FROM reviews r 
       WHERE created_at >= NOW() - INTERVAL '${days} days'
       ${projectFilter}`,
      params
    );

    const avgTimeToMerge = await query(
      `SELECT AVG(EXTRACT(EPOCH FROM (merged_at - created_at))) as avg_time
       FROM reviews r
       WHERE status = 'merged'
       AND created_at >= NOW() - INTERVAL '${days} days'
       ${projectFilter}`,
      params
    );

    const activeUsers = await query(
      `SELECT COUNT(DISTINCT user_id) as count
       FROM (
         SELECT creator_id as user_id FROM reviews WHERE created_at >= NOW() - INTERVAL '${days} days' ${projectFilter}
         UNION
         SELECT user_id FROM review_assignments ra
         JOIN reviews r ON ra.review_id = r.id
         WHERE r.created_at >= NOW() - INTERVAL '${days} days'
         ${projectFilter}
       ) t`,
      params
    );

    const topReviewers = await query(
      `SELECT 
         u.id as user_id,
         u.username,
         u.display_name,
         COUNT(r.id) as created,
         COUNT(ra.id) as reviewed,
         COUNT(CASE WHEN r.status = 'approved' THEN 1 END) as approved,
         COUNT(CASE WHEN r.status = 'rejected' THEN 1 END) as rejected
       FROM users u
       LEFT JOIN reviews r ON r.creator_id = u.id 
         AND r.created_at >= NOW() - INTERVAL '${days} days'
         ${projectFilter ? 'AND r.project_id = $1' : ''}
       LEFT JOIN review_assignments ra ON ra.user_id = u.id
         AND EXISTS (SELECT 1 FROM reviews r2 WHERE r2.id = ra.review_id 
           AND r2.created_at >= NOW() - INTERVAL '${days} days'
           ${projectFilter ? 'AND r2.project_id = $1' : ''})
       GROUP BY u.id, u.username, u.display_name
       HAVING COUNT(r.id) > 0 OR COUNT(ra.id) > 0
       ORDER BY (COUNT(r.id) + COUNT(ra.id)) DESC
       LIMIT 10`,
      params.length > 0 ? [params[0]] : []
    );

    const weeklyTrend = await query(
      `SELECT 
         to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as week,
         COUNT(*) as reviews,
         COUNT(CASE WHEN status = 'merged' THEN 1 END) as merged
       FROM reviews r
       WHERE created_at >= NOW() - INTERVAL '${days} days'
       ${projectFilter}
       GROUP BY date_trunc('week', created_at)
       ORDER BY week DESC
       LIMIT 12`,
      params
    );

    const totalCount = totalReviews.rows[0]?.count || 0;
    const userCount = activeUsers.rows[0]?.count || 1;

    res.status(200).json({
      status: 'success',
      data: {
        period,
        totalReviews: totalCount,
        avgTimeToMerge: avgTimeToMerge.rows[0]?.avg_time || 0,
        avgReviewsPerMember: totalCount / userCount,
        topReviewers: topReviewers.rows,
        weeklyTrend: weeklyTrend.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getReviewStats = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { projectId } = req.query;

    let projectFilter = '';
    const params: any[] = [];

    if (projectId) {
      projectFilter = 'WHERE project_id = $1';
      params.push(projectId);
    }

    const result = await query(
      `SELECT 
         COUNT(*) as total,
         COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
         COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
         COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
         COUNT(CASE WHEN status = 'merged' THEN 1 END) as merged
       FROM reviews
       ${projectFilter}`,
      params
    );

    const monthlyTrend = await query(
      `SELECT 
         to_char(created_at, 'YYYY-MM') as month,
         status,
         COUNT(*) as count
       FROM reviews
       ${projectFilter}
       GROUP BY to_char(created_at, 'YYYY-MM'), status
       ORDER BY month DESC
       LIMIT 6`,
      params
    );

    res.status(200).json({
      status: 'success',
      data: {
        summary: result.rows[0],
        monthlyTrend: monthlyTrend.rows
      }
    });
  } catch (error) {
    next(error);
  }
};
