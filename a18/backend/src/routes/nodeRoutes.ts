import { Router } from 'express';
import {
  getAllNodes,
  getNodeById,
  createNode,
  updateNode,
  deleteNode,
  batchCreateNodes,
  queryNodesByCondition
} from '../controllers/nodeController';

const router = Router();

router.get('/', getAllNodes);
router.get('/query', queryNodesByCondition);
router.get('/:id', getNodeById);
router.post('/', createNode);
router.post('/batch', batchCreateNodes);
router.put('/:id', updateNode);
router.delete('/:id', deleteNode);

export default router;
