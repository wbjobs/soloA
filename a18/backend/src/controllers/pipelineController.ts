import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Pipeline, { PipelineAttributes } from '../models/Pipeline';

export const getAllPipelines = async (req: Request, res: Response) => {
  try {
    const { layerId, status, material } = req.query;
    const where: any = {};
    
    if (layerId) where.layerId = layerId;
    if (status) where.status = status;
    if (material) where.material = material;
    
    const pipelines = await Pipeline.findAll({ where });
    res.json({ success: true, data: pipelines });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const getPipelineById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pipeline = await Pipeline.findByPk(id);
    
    if (!pipeline) {
      return res.status(404).json({ success: false, error: '管道不存在' });
    }
    
    res.json({ success: true, data: pipeline });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const createPipeline = async (req: Request, res: Response) => {
  try {
    const pipelineData: Partial<PipelineAttributes> = req.body;
    const pipeline = await Pipeline.create(pipelineData as any);
    res.status(201).json({ success: true, data: pipeline });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const batchCreatePipelines = async (req: Request, res: Response) => {
  try {
    const { pipelines } = req.body;
    const createdPipelines = await Pipeline.bulkCreate(pipelines);
    res.status(201).json({ success: true, data: createdPipelines });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const updatePipeline = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const [updatedCount] = await Pipeline.update(updateData, {
      where: { id }
    });
    
    if (updatedCount === 0) {
      return res.status(404).json({ success: false, error: '管道不存在' });
    }
    
    const updatedPipeline = await Pipeline.findByPk(id);
    res.json({ success: true, data: updatedPipeline });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const deletePipeline = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deletedCount = await Pipeline.destroy({ where: { id } });
    
    if (deletedCount === 0) {
      return res.status(404).json({ success: false, error: '管道不存在' });
    }
    
    res.json({ success: true, message: '管道删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const queryPipelinesByCondition = async (req: Request, res: Response) => {
  try {
    const { 
      minDiameter, maxDiameter, 
      minDepth, maxDepth,
      minLength, maxLength,
      materials, statuses, searchText 
    } = req.query;
    
    const where: any = {};
    
    if (minDiameter) where.diameter = { [Op.gte]: parseFloat(minDiameter as string) };
    if (maxDiameter) where.diameter = { ...where.diameter, [Op.lte]: parseFloat(maxDiameter as string) };
    if (minDepth) where.depth = { [Op.gte]: parseFloat(minDepth as string) };
    if (maxDepth) where.depth = { ...where.depth, [Op.lte]: parseFloat(maxDepth as string) };
    if (minLength) where.length = { [Op.gte]: parseFloat(minLength as string) };
    if (maxLength) where.length = { ...where.length, [Op.lte]: parseFloat(maxLength as string) };
    if (materials) where.material = { [Op.in]: (materials as string).split(',') };
    if (statuses) where.status = { [Op.in]: (statuses as string).split(',') };
    if (searchText) {
      where[Op.or] = [
        { name: { [Op.like]: `%${searchText}%` } }
      ];
    }
    
    const pipelines = await Pipeline.findAll({ where });
    res.json({ success: true, data: pipelines });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};
