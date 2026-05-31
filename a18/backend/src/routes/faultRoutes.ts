import { Router } from 'express';
import {
  simulateFault,
  analyzeValveClosure,
  getAllFaults,
  getFaultById,
  updateFault,
  resolveFault,
  deleteFault,
  getActiveFaultsSummary
} from '../controllers/faultController';

const router = Router();

router.get('/', getAllFaults);
router.get('/summary', getActiveFaultsSummary);
router.get('/:id', getFaultById);
router.post('/simulate', simulateFault);
router.post('/analyze-valve', analyzeValveClosure);
router.put('/:id', updateFault);
router.patch('/:id/resolve', resolveFault);
router.delete('/:id', deleteFault);

export default router;
