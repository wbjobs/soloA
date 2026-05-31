import { Router } from 'express';
import {
  getAllAnnotations,
  getAnnotationById,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  calculateDistance,
  calculateArea,
  calculateHeight,
  createMeasurementAnnotation,
  toggleAnnotationVisibility
} from '../controllers/annotationController';

const router = Router();

router.get('/', getAllAnnotations);
router.get('/:id', getAnnotationById);
router.post('/', createAnnotation);
router.post('/measure/distance', calculateDistance);
router.post('/measure/area', calculateArea);
router.post('/measure/height', calculateHeight);
router.post('/measurement', createMeasurementAnnotation);
router.put('/:id', updateAnnotation);
router.patch('/:id/toggle-visibility', toggleAnnotationVisibility);
router.delete('/:id', deleteAnnotation);

export default router;
