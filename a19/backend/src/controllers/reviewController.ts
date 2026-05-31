import { Response, NextFunction } from 'express';
import { query } from '../config/database';
import { gitService } from '../services/gitService';
import { codeAnalysisService } from '../services/codeAnalysisService';
import { publishToQueue, QUEUES } from '../config/rabbitmq';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

export const createReview = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { projectId, title, description, sourceBranchId, targetBranchId, reviewerIds } = req.body;
    const creatorId = req.userId!;
    
    if (!projectId || !title || !sourceBranchId || !targetBranchId) {
      return next(new AppError('Missing required fields', 400));
    }
    
    const branches = await query(
      'SELECT * FROM branches WHERE id IN ($1, $2)',
      [sourceBranchId, targetBranchId]
    );
    
    if (branches.rows.length < 2) {
      return next(new AppError('Invalid branch IDs', 400));
    }
    
    const result = await query(
      `INSERT INTO reviews (project_id, title, description, source_branch_id, target_branch_id, creator_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [projectId, title, description || '', sourceBranchId, targetBranchId, creatorId]
    );
    
    const review = result.rows[0];
    
    if (reviewerIds && reviewerIds.length > 0) {
      for (const reviewerId of reviewerIds) {
        await query(
          `INSERT INTO review_assignments (review_id, user_id, status)
           VALUES ($1, $2, 'pending')`,
          [review.id, reviewerId]
        );
        
        const userResult = await query(
          'SELECT email FROM users WHERE id = $1',
          [reviewerId]
        );
        
        if (userResult.rows.length > 0) {
          const projectResult = await query(
            'SELECT name FROM projects WHERE id = $1',
            [projectId]
          );
          
          await publishToQueue(QUEUES.EMAIL_NOTIFICATIONS, {
            type: 'review_assigned',
            to: userResult.rows[0].email,
            reviewTitle: title,
            projectName: projectResult.rows[0].name,
            reviewId: review.id
          });
        }
      }
    }
    
    const sourceBranch = branches.rows.find(b => b.id === sourceBranchId)!;
    await publishToQueue(QUEUES.CODE_ANALYSIS, {
      type: 'run_analysis',
      projectId,
      reviewId: review.id,
      sourceBranch: sourceBranch.name
    });
    
    res.status(201).json({
      status: 'success',
      data: {
        review
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getReviews = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { projectId, status } = req.query;
    const userId = req.userId!;
    
    let queryText = `
      SELECT r.*, 
             u.username as creator_username,
             u.display_name as creator_display_name,
             sb.name as source_branch_name,
             tb.name as target_branch_name
      FROM reviews r
      JOIN users u ON r.creator_id = u.id
      JOIN branches sb ON r.source_branch_id = sb.id
      JOIN branches tb ON r.target_branch_id = tb.id
      WHERE 1=1
    `;
    const params: any[] = [];
    
    if (projectId) {
      queryText += ' AND r.project_id = $1';
      params.push(projectId);
    }
    
    if (status) {
      const paramIndex = params.length + 1;
      queryText += ` AND r.status = $${paramIndex}`;
      params.push(status);
    }
    
    queryText += ' ORDER BY r.created_at DESC';
    
    const result = await query(queryText, params);
    
    res.status(200).json({
      status: 'success',
      data: {
        reviews: result.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getReview = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      `SELECT r.*, 
              u.username as creator_username,
              u.display_name as creator_display_name,
              u.email as creator_email,
              sb.name as source_branch_name,
              tb.name as target_branch_name,
              p.name as project_name,
              p.id as project_id
       FROM reviews r
       JOIN users u ON r.creator_id = u.id
       JOIN branches sb ON r.source_branch_id = sb.id
       JOIN branches tb ON r.target_branch_id = tb.id
       JOIN projects p ON r.project_id = p.id
       WHERE r.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return next(new AppError('Review not found', 404));
    }
    
    const review = result.rows[0];
    
    const assignmentsResult = await query(
      `SELECT ra.*, 
              u.username,
              u.display_name
       FROM review_assignments ra
       JOIN users u ON ra.user_id = u.id
       WHERE ra.review_id = $1`,
      [id]
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        review: {
          ...review,
          reviewers: assignmentsResult.rows
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

export const updateReviewStatus = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.userId!;
    
    const validStatuses = ['pending', 'approved', 'rejected', 'merged'];
    if (!validStatuses.includes(status)) {
      return next(new AppError('Invalid status', 400));
    }
    
    const reviewResult = await query(
      'SELECT * FROM reviews WHERE id = $1',
      [id]
    );
    
    if (reviewResult.rows.length === 0) {
      return next(new AppError('Review not found', 404));
    }
    
    const review = reviewResult.rows[0];
    
    const isAssignedReviewer = await query(
      'SELECT 1 FROM review_assignments WHERE review_id = $1 AND user_id = $2',
      [id, userId]
    );
    
    const isCreator = review.creator_id === userId;
    
    if (!isAssignedReviewer.rows.length && !isCreator) {
      return next(new AppError('Access denied', 403));
    }
    
    if (status === 'merged') {
      const branches = await query(
        'SELECT * FROM branches WHERE id IN ($1, $2)',
        [review.source_branch_id, review.target_branch_id]
      );
      
      const sourceBranch = branches.rows.find(b => b.id === review.source_branch_id);
      const targetBranch = branches.rows.find(b => b.id === review.target_branch_id);
      
      if (sourceBranch && targetBranch) {
        try {
          await gitService.mergeBranches(
            review.project_id,
            sourceBranch.name,
            targetBranch.name
          );
        } catch (mergeError: any) {
          return next(new AppError(mergeError.message || 'Failed to merge branches', 400));
        }
      }
    }
    
    const result = await query(
      `UPDATE reviews 
       SET status = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING *`,
      [status, id]
    );
    
    if (isAssignedReviewer.rows.length) {
      await query(
        `UPDATE review_assignments 
         SET status = 'reviewed' 
         WHERE review_id = $1 AND user_id = $2`,
        [id, userId]
      );
    }
    
    const creatorResult = await query(
      'SELECT email FROM users WHERE id = $1',
      [review.creator_id]
    );
    
    if (creatorResult.rows.length > 0) {
      await publishToQueue(QUEUES.EMAIL_NOTIFICATIONS, {
        type: 'review_status_changed',
        to: creatorResult.rows[0].email,
        reviewTitle: review.title,
        newStatus: status,
        reviewId: id
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        review: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getReviewDiff = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    
    const reviewResult = await query(
      `SELECT r.*, sb.name as source_branch_name, tb.name as target_branch_name
       FROM reviews r
       JOIN branches sb ON r.source_branch_id = sb.id
       JOIN branches tb ON r.target_branch_id = tb.id
       WHERE r.id = $1`,
      [id]
    );
    
    if (reviewResult.rows.length === 0) {
      return next(new AppError('Review not found', 404));
    }
    
    const review = reviewResult.rows[0];
    
    const diff = await gitService.getDiff(
      review.project_id,
      review.source_branch_name,
      review.target_branch_name
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        diff
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getReviewAnalysis = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    
    const results = await codeAnalysisService.getAnalysisResults(id);
    
    res.status(200).json({
      status: 'success',
      data: {
        analyses: results
      }
    });
  } catch (error) {
    next(error);
  }
};

export const assignReviewer = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    
    const reviewResult = await query(
      'SELECT * FROM reviews WHERE id = $1',
      [id]
    );
    
    if (reviewResult.rows.length === 0) {
      return next(new AppError('Review not found', 404));
    }
    
    const review = reviewResult.rows[0];
    
    if (review.creator_id !== req.userId) {
      return next(new AppError('Only the creator can assign reviewers', 403));
    }
    
    await query(
      `INSERT INTO review_assignments (review_id, user_id, status)
       VALUES ($1, $2, 'pending')
       ON CONFLICT (review_id, user_id) DO NOTHING`,
      [id, userId]
    );
    
    const userResult = await query(
      'SELECT email FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length > 0) {
      const projectResult = await query(
        'SELECT name FROM projects WHERE id = $1',
        [review.project_id]
      );
      
      await publishToQueue(QUEUES.EMAIL_NOTIFICATIONS, {
        type: 'review_assigned',
        to: userResult.rows[0].email,
        reviewTitle: review.title,
        projectName: projectResult.rows[0].name,
        reviewId: id
      });
    }
    
    res.status(200).json({
      status: 'success',
      message: 'Reviewer assigned successfully'
    });
  } catch (error) {
    next(error);
  }
};
