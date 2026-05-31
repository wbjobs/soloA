import { Router } from 'express';
import {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  getTasksByNode,
  getTasksByPipeline,
  getTasksSummary,
  batchCreateTasks
} from '../controllers/maintenanceController';

const router = Router();

router.get('/', getAllTasks);
router.get('/summary', getTasksSummary);
router.get('/node/:nodeId', getTasksByNode);
router.get('/pipeline/:pipelineId', getTasksByPipeline);
router.get('/:id', getTaskById);
router.post('/', createTask);
router.post('/batch', batchCreateTasks);
router.put('/:id', updateTask);
router.patch('/:id/status', updateTaskStatus);
router.delete('/:id', deleteTask);

export default router;
