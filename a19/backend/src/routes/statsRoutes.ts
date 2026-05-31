import { Router } from 'express';
import {
  getPersonalStats,
  getTeamStats,
  getReviewStats
} from '../controllers/statsController';
import { authenticateJWT } from '../middleware/auth';

const router = Router();

router.use(authenticateJWT);

router.get('/personal', getPersonalStats);
router.get('/team', getTeamStats);
router.get('/reviews', getReviewStats);

export default router;
