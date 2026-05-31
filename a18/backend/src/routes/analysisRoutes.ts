import { Router } from 'express';
import {
  checkConnectivity,
  getUpstreamNodes,
  getDownstreamNodes,
  detectLoops,
  getShortestPath,
  findNearestNode
} from '../controllers/analysisController';

const router = Router();

router.post('/connectivity', checkConnectivity);
router.post('/upstream', getUpstreamNodes);
router.post('/downstream', getDownstreamNodes);
router.post('/loops', detectLoops);
router.post('/shortest-path', getShortestPath);
router.post('/nearest-node', findNearestNode);

export default router;
