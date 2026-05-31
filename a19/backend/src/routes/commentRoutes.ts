import { Router } from 'express';
import {
  createComment,
  getComments,
  updateComment,
  deleteComment,
  replyToComment,
  resolveComment
} from '../controllers/commentController';
import { authenticateJWT } from '../middleware/auth';

const router = Router();

router.use(authenticateJWT);

router.route('/')
  .get(getComments)
  .post(createComment);

router.route('/:id')
  .put(updateComment)
  .delete(deleteComment);

router.post('/:id/reply', replyToComment);
router.post('/:id/resolve', resolveComment);

export default router;
