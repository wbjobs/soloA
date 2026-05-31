import { Router } from 'express';
import {
  getAllPipelines,
  getPipelineById,
  createPipeline,
  updatePipeline,
  deletePipeline,
  batchCreatePipelines,
  queryPipelinesByCondition
} from '../controllers/pipelineController';

const router = Router();

router.get('/', getAllPipelines);
router.get('/query', queryPipelinesByCondition);
router.get('/:id', getPipelineById);
router.post('/', createPipeline);
router.post('/batch', batchCreatePipelines);
router.put('/:id', updatePipeline);
router.delete('/:id', deletePipeline);

export default router;
