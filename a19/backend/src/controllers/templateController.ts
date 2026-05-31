import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';

const DEFAULT_CHECKLIST = [
  {
    id: '1',
    title: '代码是否遵循项目编码规范？',
    description: '检查代码风格、命名约定、格式等',
    category: '代码质量',
    required: true,
    sortOrder: 1
  },
  {
    id: '2',
    title: '是否有足够的测试覆盖？',
    description: '单元测试、集成测试是否完善',
    category: '测试',
    required: true,
    sortOrder: 2
  },
  {
    id: '3',
    title: '是否有潜在的安全问题？',
    description: 'SQL注入、XSS、敏感信息泄露等',
    category: '安全',
    required: true,
    sortOrder: 3
  },
  {
    id: '4',
    title: '代码逻辑是否正确？',
    description: '业务逻辑是否符合需求',
    category: '功能',
    required: true,
    sortOrder: 4
  },
  {
    id: '5',
    title: '是否有性能优化空间？',
    description: '算法复杂度、数据库查询、内存使用等',
    category: '性能',
    required: false,
    sortOrder: 5
  },
  {
    id: '6',
    title: '文档和注释是否充分？',
    description: '代码注释、API文档、README更新等',
    category: '文档',
    required: false,
    sortOrder: 6
  }
];

export const getTemplates = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { projectId } = req.query;
    const userId = req.userId!;

    let queryText = `
      SELECT rt.*, u.username as owner_username
      FROM review_templates rt
      JOIN users u ON rt.owner_id = u.id
      WHERE rt.owner_id = $1 OR rt.is_global = true
    `;
    const params: any[] = [userId];

    if (projectId) {
      queryText += ' OR rt.project_id = $2';
      params.push(projectId);
    }

    queryText += ' ORDER BY rt.is_default DESC, rt.created_at DESC';

    const result = await query(queryText, params);

    if (result.rows.length === 0) {
      const defaultTemplate = {
        id: 'default',
        name: '默认审查模板',
        description: '系统默认的代码审查清单',
        owner_id: userId,
        project_id: null,
        is_default: true,
        is_global: true,
        checklist: DEFAULT_CHECKLIST,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      return res.status(200).json({
        status: 'success',
        data: {
          templates: [defaultTemplate]
        }
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        templates: result.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getTemplate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;

    if (id === 'default') {
      return res.status(200).json({
        status: 'success',
        data: {
          template: {
            id: 'default',
            name: '默认审查模板',
            description: '系统默认的代码审查清单',
            checklist: DEFAULT_CHECKLIST
          }
        }
      });
    }

    const result = await query(
      `SELECT rt.*, u.username as owner_username
       FROM review_templates rt
       JOIN users u ON rt.owner_id = u.id
       WHERE rt.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return next(new AppError('Template not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        template: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

export const createTemplate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, description, projectId, isDefault, isGlobal, checklist } = req.body;
    const userId = req.userId!;

    if (!name || !checklist) {
      return next(new AppError('Name and checklist are required', 400));
    }

    if (isDefault) {
      await query(
        `UPDATE review_templates 
         SET is_default = false 
         WHERE owner_id = $1 ${projectId ? 'AND project_id = $2' : 'AND project_id IS NULL'}`,
        projectId ? [userId, projectId] : [userId]
      );
    }

    const result = await query(
      `INSERT INTO review_templates 
       (name, description, owner_id, project_id, is_default, is_global, checklist)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, description || '', userId, projectId || null, isDefault || false, isGlobal || false, JSON.stringify(checklist)]
    );

    res.status(201).json({
      status: 'success',
      data: {
        template: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

export const updateTemplate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const { name, description, isDefault, checklist } = req.body;
    const userId = req.userId!;

    const existing = await query(
      'SELECT * FROM review_templates WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return next(new AppError('Template not found', 404));
    }

    if (existing.rows[0].owner_id !== userId) {
      return next(new AppError('Access denied', 403));
    }

    if (isDefault) {
      await query(
        `UPDATE review_templates 
         SET is_default = false 
         WHERE owner_id = $1 AND id != $2`,
        [userId, id]
      );
    }

    const result = await query(
      `UPDATE review_templates 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           is_default = COALESCE($3, is_default),
           checklist = COALESCE($4, checklist),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [name, description, isDefault, checklist ? JSON.stringify(checklist) : null, id]
    );

    res.status(200).json({
      status: 'success',
      data: {
        template: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

export const deleteTemplate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const userId = req.userId!;

    const existing = await query(
      'SELECT * FROM review_templates WHERE id = $1',
      [id]
    );

    if (existing.rows.length === 0) {
      return next(new AppError('Template not found', 404));
    }

    if (existing.rows[0].owner_id !== userId) {
      return next(new AppError('Access denied', 403));
    }

    await query('DELETE FROM review_templates WHERE id = $1', [id]);

    res.status(204).json({
      status: 'success',
      data: null
    });
  } catch (error) {
    next(error);
  }
};

export const applyTemplateToReview = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { reviewId, templateId } = req.params;
    const userId = req.userId!;

    const reviewResult = await query(
      'SELECT * FROM reviews WHERE id = $1',
      [reviewId]
    );

    if (reviewResult.rows.length === 0) {
      return next(new AppError('Review not found', 404));
    }

    let checklist: any[] = DEFAULT_CHECKLIST;

    if (templateId && templateId !== 'default') {
      const templateResult = await query(
        'SELECT checklist FROM review_templates WHERE id = $1',
        [templateId]
      );

      if (templateResult.rows.length === 0) {
        return next(new AppError('Template not found', 404));
      }

      checklist = templateResult.rows[0].checklist;
    }

    await query(
      'DELETE FROM review_checklist_items WHERE review_id = $1',
      [reviewId]
    );

    for (const item of checklist) {
      await query(
        `INSERT INTO review_checklist_items 
         (review_id, template_id, title, description, category, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [reviewId, templateId === 'default' ? null : templateId, item.title, item.description, item.category, item.sortOrder || 0]
      );
    }

    await query(
      'UPDATE reviews SET template_id = $1 WHERE id = $2',
      [templateId === 'default' ? null : templateId, reviewId]
    );

    const itemsResult = await query(
      'SELECT * FROM review_checklist_items WHERE review_id = $1 ORDER BY sort_order',
      [reviewId]
    );

    res.status(200).json({
      status: 'success',
      data: {
        checklist: itemsResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getReviewChecklist = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { reviewId } = req.params;

    const result = await query(
      'SELECT * FROM review_checklist_items WHERE review_id = $1 ORDER BY sort_order',
      [reviewId]
    );

    res.status(200).json({
      status: 'success',
      data: {
        checklist: result.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

export const updateChecklistItem = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { itemId } = req.params;
    const { status } = req.body;
    const userId = req.userId!;

    const validStatuses = ['pending', 'checked', 'not_applicable'];
    if (!validStatuses.includes(status)) {
      return next(new AppError('Invalid status', 400));
    }

    const result = await query(
      `UPDATE review_checklist_items 
       SET status = $1, 
           checked_by = $2, 
           checked_at = NOW(),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, userId, itemId]
    );

    if (result.rows.length === 0) {
      return next(new AppError('Checklist item not found', 404));
    }

    res.status(200).json({
      status: 'success',
      data: {
        item: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};
