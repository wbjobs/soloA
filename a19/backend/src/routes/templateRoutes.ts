import { Router } from 'express';
import {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  applyTemplateToReview,
  getReviewChecklist,
  updateChecklistItem
} from '../controllers/templateController';
import { authenticateJWT } from '../middleware/auth';

const router = Router();

router.use(authenticateJWT);

router.route('/')
  .get(getTemplates)
  .post(createTemplate);

router.route('/:id')
  .get(getTemplate)
  .put(updateTemplate)
  .delete(deleteTemplate);

router.post('/apply/:reviewId/:templateId', applyTemplateToReview);
router.get('/checklist/:reviewId', getReviewChecklist);
router.put('/checklist/:itemId', updateChecklistItem);

export default router;
