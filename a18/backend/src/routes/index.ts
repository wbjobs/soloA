import { Router } from 'express';
import nodeRoutes from './nodeRoutes';
import pipelineRoutes from './pipelineRoutes';
import layerRoutes from './layerRoutes';
import analysisRoutes from './analysisRoutes';
import simulationRoutes from './simulationRoutes';
import dataRoutes from './dataRoutes';
import faultRoutes from './faultRoutes';
import maintenanceRoutes from './maintenanceRoutes';
import annotationRoutes from './annotationRoutes';

const router = Router();

router.use('/nodes', nodeRoutes);
router.use('/pipelines', pipelineRoutes);
router.use('/layers', layerRoutes);
router.use('/analysis', analysisRoutes);
router.use('/simulation', simulationRoutes);
router.use('/data', dataRoutes);
router.use('/faults', faultRoutes);
router.use('/maintenance', maintenanceRoutes);
router.use('/annotations', annotationRoutes);

export default router;
