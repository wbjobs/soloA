import { Router } from 'express';
import {
  getAllLayers,
  getLayerById,
  createLayer,
  updateLayer,
  deleteLayer,
  toggleLayerVisibility,
  updateLayerStyle
} from '../controllers/layerController';

const router = Router();

router.get('/', getAllLayers);
router.get('/:id', getLayerById);
router.post('/', createLayer);
router.put('/:id', updateLayer);
router.patch('/:id/toggle-visibility', toggleLayerVisibility);
router.patch('/:id/style', updateLayerStyle);
router.delete('/:id', deleteLayer);

export default router;
