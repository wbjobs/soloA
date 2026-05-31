import { Router } from 'express';
import {
  exportData,
  importData,
  exportToGeoJSON,
  importGeoJSON
} from '../controllers/dataController';

const router = Router();

router.post('/export', exportData);
router.post('/import', importData);
router.get('/export/geojson', exportToGeoJSON);
router.post('/import/geojson', importGeoJSON);

export default router;
