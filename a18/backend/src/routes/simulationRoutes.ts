import { Router } from 'express';
import {
  runFlowSimulation,
  calculatePressureDistribution,
  simulateLeak,
  getLeakImpactArea
} from '../controllers/simulationController';

const router = Router();

router.post('/flow', runFlowSimulation);
router.post('/pressure', calculatePressureDistribution);
router.post('/leak', simulateLeak);
router.post('/leak-impact', getLeakImpactArea);

export default router;
