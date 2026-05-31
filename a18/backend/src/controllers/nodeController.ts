import { Request, Response } from 'express';
import { Op } from 'sequelize';
import PipelineNode, { PipelineNodeAttributes } from '../models/PipelineNode';

export const getAllNodes = async (req: Request, res: Response) => {
  try {
    const { layerId, nodeType } = req.query;
    const where: any = {};
    
    if (layerId) where.layerId = layerId;
    if (nodeType) where.nodeType = nodeType;
    
    const nodes = await PipelineNode.findAll({ where });
    res.json({ success: true, data: nodes });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const getNodeById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const node = await PipelineNode.findByPk(id);
    
    if (!node) {
      return res.status(404).json({ success: false, error: '节点不存在' });
    }
    
    res.json({ success: true, data: node });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const createNode = async (req: Request, res: Response) => {
  try {
    const nodeData: Partial<PipelineNodeAttributes> = req.body;
    const node = await PipelineNode.create(nodeData as any);
    res.status(201).json({ success: true, data: node });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const batchCreateNodes = async (req: Request, res: Response) => {
  try {
    const { nodes } = req.body;
    const createdNodes = await PipelineNode.bulkCreate(nodes);
    res.status(201).json({ success: true, data: createdNodes });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const updateNode = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const [updatedCount] = await PipelineNode.update(updateData, {
      where: { id }
    });
    
    if (updatedCount === 0) {
      return res.status(404).json({ success: false, error: '节点不存在' });
    }
    
    const updatedNode = await PipelineNode.findByPk(id);
    res.json({ success: true, data: updatedNode });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const deleteNode = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deletedCount = await PipelineNode.destroy({ where: { id } });
    
    if (deletedCount === 0) {
      return res.status(404).json({ success: false, error: '节点不存在' });
    }
    
    res.json({ success: true, message: '节点删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const queryNodesByCondition = async (req: Request, res: Response) => {
  try {
    const { minPressure, maxPressure, minDemand, maxDemand, nodeTypes, searchText } = req.query;
    
    const where: any = {};
    
    if (minPressure) where.pressure = { [Op.gte]: parseFloat(minPressure as string) };
    if (maxPressure) where.pressure = { ...where.pressure, [Op.lte]: parseFloat(maxPressure as string) };
    if (minDemand) where.demand = { [Op.gte]: parseFloat(minDemand as string) };
    if (maxDemand) where.demand = { ...where.demand, [Op.lte]: parseFloat(maxDemand as string) };
    if (nodeTypes) where.nodeType = { [Op.in]: (nodeTypes as string).split(',') };
    if (searchText) {
      where[Op.or] = [
        { name: { [Op.like]: `%${searchText}%` } }
      ];
    }
    
    const nodes = await PipelineNode.findAll({ where });
    res.json({ success: true, data: nodes });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};
