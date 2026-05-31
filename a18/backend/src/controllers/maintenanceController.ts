import { Request, Response } from 'express';
import MaintenanceTask from '../models/MaintenanceTask';
import { Op } from 'sequelize';

export const getAllTasks = async (req: Request, res: Response) => {
  try {
    const { status, priority, taskType, assignee, startDate, endDate, nodeId, pipelineId } = req.query;
    const where: any = {};

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (taskType) where.taskType = taskType;
    if (assignee) where.assignee = assignee;
    if (nodeId) where.nodeId = nodeId;
    if (pipelineId) where.pipelineId = pipelineId;
    if (startDate) where.scheduledDate = { [Op.gte]: new Date(startDate as string) };
    if (endDate) where.scheduledDate = { ...where.scheduledDate, [Op.lte]: new Date(endDate as string) };

    const tasks = await MaintenanceTask.findAll({
      where,
      order: [['priority', 'ASC'], ['scheduledDate', 'ASC']]
    });

    res.json({
      success: true,
      data: tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const getTaskById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const task = await MaintenanceTask.findByPk(id);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: '维护任务不存在'
      });
    }

    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const createTask = async (req: Request, res: Response) => {
  try {
    const taskData = req.body;
    
    if (!taskData.title || !taskData.description || !taskData.scheduledDate) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: title, description, scheduledDate'
      });
    }

    const task = await MaintenanceTask.create(taskData);

    res.status(201).json({
      success: true,
      data: task
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const updateTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const [updatedCount] = await MaintenanceTask.update(updateData, {
      where: { id }
    });

    if (updatedCount === 0) {
      return res.status(404).json({
        success: false,
        error: '维护任务不存在'
      });
    }

    const updatedTask = await MaintenanceTask.findByPk(id);
    res.json({
      success: true,
      data: updatedTask
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const updateTaskStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes, actualDuration, cost } = req.body;

    const task = await MaintenanceTask.findByPk(id);
    if (!task) {
      return res.status(404).json({
        success: false,
        error: '维护任务不存在'
      });
    }

    task.status = status || task.status;
    if (status === 'completed') {
      task.completedDate = new Date();
    }
    if (notes) task.notes = notes;
    if (actualDuration !== undefined) task.actualDuration = actualDuration;
    if (cost !== undefined) task.cost = cost;

    await task.save();

    res.json({
      success: true,
      data: task
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const deleteTask = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deletedCount = await MaintenanceTask.destroy({ where: { id } });

    if (deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: '维护任务不存在'
      });
    }

    res.json({
      success: true,
      message: '维护任务已删除'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const getTasksByNode = async (req: Request, res: Response) => {
  try {
    const { nodeId } = req.params;

    const tasks = await MaintenanceTask.findAll({
      where: { nodeId },
      order: [['scheduledDate', 'DESC']]
    });

    res.json({
      success: true,
      data: tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const getTasksByPipeline = async (req: Request, res: Response) => {
  try {
    const { pipelineId } = req.params;

    const tasks = await MaintenanceTask.findAll({
      where: { pipelineId },
      order: [['scheduledDate', 'DESC']]
    });

    res.json({
      success: true,
      data: tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const getTasksSummary = async (req: Request, res: Response) => {
  try {
    const tasks = await MaintenanceTask.findAll();

    const summary = {
      total: tasks.length,
      byStatus: {
        pending: 0,
        in_progress: 0,
        completed: 0,
        cancelled: 0
      },
      byPriority: {
        high: 0,
        medium: 0,
        low: 0
      },
      byType: {} as Record<string, number>,
      upcoming: 0,
      overdue: 0
    };

    const now = new Date();

    tasks.forEach(task => {
      summary.byStatus[task.status]++;
      summary.byPriority[task.priority]++;
      summary.byType[task.taskType] = (summary.byType[task.taskType] || 0) + 1;

      if (task.status === 'pending' || task.status === 'in_progress') {
        if (task.scheduledDate < now && (!task.dueDate || task.dueDate < now)) {
          summary.overdue++;
        } else if (task.scheduledDate > now) {
          summary.upcoming++;
        }
      }
    });

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const batchCreateTasks = async (req: Request, res: Response) => {
  try {
    const { tasks } = req.body;

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'tasks 必须是一个非空数组'
      });
    }

    const createdTasks = await MaintenanceTask.bulkCreate(tasks);

    res.status(201).json({
      success: true,
      data: createdTasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};
