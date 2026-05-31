import { Router } from 'express';
import {
  createReview,
  getReviews,
  getReview,
  updateReviewStatus,
  getReviewDiff,
  getReviewAnalysis,
  assignReviewer
} from '../controllers/reviewController';
import { authenticateJWT } from '../middleware/auth';

const router = Router();

router.use(authenticateJWT);

router.route('/')
  .get(getReviews)
  .post(createReview);

router.route('/:id')
  .get(getReview);

router.put('/:id/status', updateReviewStatus);
router.get('/:id/diff', getReviewDiff);
router.get('/:id/analysis', getReviewAnalysis);
router.post('/:id/assign', assignReviewer);

export default router;
