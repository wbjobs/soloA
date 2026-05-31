import { Request, Response } from 'express';
import PipelineSimulation from '../services/simulationService';

export const runFlowSimulation = async (req: Request, res: Response) => {
  try {
    const simulation = new PipelineSimulation();
    await simulation.initialize();
    
    const result = await simulation.runFlowSimulation();
    
    const nodePressuresObj: Record<string, number> = {};
    result.nodePressures.forEach((value, key) => {
      nodePressuresObj[key] = value;
    });
    
    const pipeFlowRatesObj: Record<string, number> = {};
    result.pipeFlowRates.forEach((value, key) => {
      pipeFlowRatesObj[key] = value;
    });
    
    const pipeVelocitiesObj: Record<string, number> = {};
    result.pipeVelocities.forEach((value, key) => {
      pipeVelocitiesObj[key] = value;
    });
    
    const flowDirectionsObj: Record<string, { from: string; to: string }> = {};
    result.flowDirections.forEach((value, key) => {
      flowDirectionsObj[key] = value;
    });
    
    res.json({
      success: true,
      data: {
        nodePressures: nodePressuresObj,
        pipeFlowRates: pipeFlowRatesObj,
        pipeVelocities: pipeVelocitiesObj,
        flowDirections: flowDirectionsObj
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const calculatePressureDistribution = async (req: Request, res: Response) => {
  try {
    const simulation = new PipelineSimulation();
    await simulation.initialize();
    
    const result = await simulation.calculatePressureDistribution();
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const simulateLeak = async (req: Request, res: Response) => {
  try {
    const { leakNodeId, leakRate = 10 } = req.body;
    
    const simulation = new PipelineSimulation();
    await simulation.initialize();
    
    const result = await simulation.simulateLeak(leakNodeId, leakRate);
    
    const pressureDropObj: Record<string, number> = {};
    result.pressureDrop.forEach((value, key) => {
      pressureDropObj[key] = value;
    });
    
    res.json({
      success: true,
      data: {
        affectedNodes: result.affectedNodes,
        affectedPipes: result.affectedPipes,
        pressureDrop: pressureDropObj,
        impactArea: result.impactArea
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const getLeakImpactArea = async (req: Request, res: Response) => {
  try {
    const { leakNodeId, leakRate = 10 } = req.body;
    
    const simulation = new PipelineSimulation();
    await simulation.initialize();
    
    const result = await simulation.getLeakImpactArea(leakNodeId, leakRate);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};
