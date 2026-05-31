import { Router } from 'express';
import {
  bulkUpdateReviewStatus,
  bulkAssignReviewers,
  bulkDeleteReviews
} from '../controllers/batchController';
import { authenticateJWT } from '../middleware/auth';

const router = Router();

router.use(authenticateJWT);

router.post('/reviews/status', bulkUpdateReviewStatus);
router.post('/reviews/assign', bulkAssignReviewers);
router.delete('/reviews', bulkDeleteReviews);

export default router;
