import { Response, NextFunction } from 'express';
import { query } from '../config/database';
import { gitService } from '../services/gitService';
import { publishToQueue, QUEUES } from '../config/rabbitmq';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

export const createProject = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, description, repoUrl, isPublic } = req.body;
    const ownerId = req.userId!;
    
    if (!name) {
      return next(new AppError('Project name is required', 400));
    }
    
    const result = await query(
      `INSERT INTO projects (name, description, owner_id, repo_url, is_public) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [name, description || '', ownerId, repoUrl || null, isPublic || false]
    );
    
    const project = result.rows[0];
    
    if (repoUrl) {
      await publishToQueue(QUEUES.GIT_OPERATIONS, {
        type: 'clone',
        projectId: project.id,
        repoUrl
      });
    } else {
      await gitService.initRepo(project.id, name);
      const branches = await gitService.getBranches(project.id);
      
      for (const branchName of branches) {
        const lastCommit = await gitService.getLastCommit(project.id, branchName);
        await query(
          `INSERT INTO branches (project_id, name, last_commit_hash, last_commit_message)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (project_id, name) DO UPDATE SET
             last_commit_hash = EXCLUDED.last_commit_hash,
             last_commit_message = EXCLUDED.last_commit_message,
             updated_at = NOW()`,
          [project.id, branchName, lastCommit?.hash, lastCommit?.message]
        );
      }
    }
    
    res.status(201).json({
      status: 'success',
      data: {
        project
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getProjects = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.userId!;
    
    const result = await query(
      `SELECT p.*, u.username as owner_username
       FROM projects p
       JOIN users u ON p.owner_id = u.id
       WHERE p.owner_id = $1 OR p.is_public = true
       ORDER BY p.created_at DESC`,
      [userId]
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        projects: result.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getProject = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      `SELECT p.*, u.username as owner_username
       FROM projects p
       JOIN users u ON p.owner_id = u.id
       WHERE p.id = $1`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return next(new AppError('Project not found', 404));
    }
    
    const project = result.rows[0];
    
    if (!project.is_public && project.owner_id !== req.userId) {
      return next(new AppError('Access denied', 403));
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        project
      }
    });
  } catch (error) {
    next(error);
  }
};

export const updateProject = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { name, description, isPublic, defaultBranch } = req.body;
    
    const projectResult = await query(
      'SELECT * FROM projects WHERE id = $1',
      [id]
    );
    
    if (projectResult.rows.length === 0) {
      return next(new AppError('Project not found', 404));
    }
    
    if (projectResult.rows[0].owner_id !== req.userId) {
      return next(new AppError('Access denied', 403));
    }
    
    const result = await query(
      `UPDATE projects 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           is_public = COALESCE($3, is_public),
           default_branch = COALESCE($4, default_branch),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [name, description, isPublic, defaultBranch, id]
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        project: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

export const deleteProject = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    
    const projectResult = await query(
      'SELECT * FROM projects WHERE id = $1',
      [id]
    );
    
    if (projectResult.rows.length === 0) {
      return next(new AppError('Project not found', 404));
    }
    
    if (projectResult.rows[0].owner_id !== req.userId) {
      return next(new AppError('Access denied', 403));
    }
    
    await query('DELETE FROM projects WHERE id = $1', [id]);
    
    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(error);
  }
};

export const getProjectBranches = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { projectId } = req.params;
    
    const result = await query(
      'SELECT * FROM branches WHERE project_id = $1 ORDER BY updated_at DESC',
      [projectId]
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        branches: result.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

export const createBranch = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { projectId } = req.params;
    const { name, baseBranch } = req.body;
    
    if (!name) {
      return next(new AppError('Branch name is required', 400));
    }
    
    const projectResult = await query(
      'SELECT * FROM projects WHERE id = $1',
      [projectId]
    );
    
    if (projectResult.rows.length === 0) {
      return next(new AppError('Project not found', 404));
    }
    
    if (projectResult.rows[0].owner_id !== req.userId) {
      return next(new AppError('Access denied', 403));
    }
    
    if (!gitService.repoExists(projectId)) {
      return next(new AppError('Repository not initialized', 400));
    }
    
    await gitService.createBranch(projectId, name, baseBranch || 'main');
    
    const lastCommit = await gitService.getLastCommit(projectId, name);
    
    const result = await query(
      `INSERT INTO branches (project_id, name, last_commit_hash, last_commit_message)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, name) DO UPDATE SET
         last_commit_hash = EXCLUDED.last_commit_hash,
         last_commit_message = EXCLUDED.last_commit_message,
         updated_at = NOW()
       RETURNING *`,
      [projectId, name, lastCommit?.hash, lastCommit?.message]
    );
    
    res.status(201).json({
      status: 'success',
      data: {
        branch: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};
