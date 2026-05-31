import { Request, Response } from 'express';
import TopologyGraph from '../services/topologyService';

export const checkConnectivity = async (req: Request, res: Response) => {
  try {
    const { nodeId1, nodeId2 } = req.body;
    
    const graph = new TopologyGraph();
    await graph.loadFromDatabase();
    
    const connected = graph.checkConnectivity(nodeId1, nodeId2);
    
    res.json({
      success: true,
      data: {
        nodeId1,
        nodeId2,
        connected
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const getUpstreamNodes = async (req: Request, res: Response) => {
  try {
    const { nodeId, maxDepth = 10 } = req.body;
    
    const graph = new TopologyGraph();
    await graph.loadFromDatabase();
    
    const result = graph.findUpstream(nodeId, maxDepth);
    
    res.json({
      success: true,
      data: {
        startNode: nodeId,
        nodes: result.nodes,
        edges: result.edges
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const getDownstreamNodes = async (req: Request, res: Response) => {
  try {
    const { nodeId, maxDepth = 10 } = req.body;
    
    const graph = new TopologyGraph();
    await graph.loadFromDatabase();
    
    const result = graph.findDownstream(nodeId, maxDepth);
    
    res.json({
      success: true,
      data: {
        startNode: nodeId,
        nodes: result.nodes,
        edges: result.edges
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const detectLoops = async (req: Request, res: Response) => {
  try {
    const graph = new TopologyGraph();
    await graph.loadFromDatabase();
    
    const loops = graph.detectLoops();
    
    res.json({
      success: true,
      data: {
        loopCount: loops.length,
        loops
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const getShortestPath = async (req: Request, res: Response) => {
  try {
    const { startNodeId, endNodeId } = req.body;
    
    const graph = new TopologyGraph();
    await graph.loadFromDatabase();
    
    const result = graph.findShortestPath(startNodeId, endNodeId);
    
    if (!result) {
      return res.json({
        success: true,
        data: {
          exists: false,
          path: [],
          totalLength: 0,
          edges: []
        }
      });
    }
    
    res.json({
      success: true,
      data: {
        exists: true,
        path: result.path,
        totalLength: result.totalLength,
        edges: result.edges
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const findNearestNode = async (req: Request, res: Response) => {
  try {
    const { x, y, maxDistance = 100 } = req.body;
    
    const graph = new TopologyGraph();
    await graph.loadFromDatabase();
    
    const node = graph.findNearestNode(x, y, maxDistance);
    
    res.json({
      success: true,
      data: node
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};
