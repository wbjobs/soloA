import { Request, Response } from 'express';
import Layer, { LayerAttributes } from '../models/Layer';

export const getAllLayers = async (req: Request, res: Response) => {
  try {
    const layers = await Layer.findAll({ order: [['order', 'ASC']] });
    res.json({ success: true, data: layers });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const getLayerById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const layer = await Layer.findByPk(id);
    
    if (!layer) {
      return res.status(404).json({ success: false, error: '图层不存在' });
    }
    
    res.json({ success: true, data: layer });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const createLayer = async (req: Request, res: Response) => {
  try {
    const layerData: Partial<LayerAttributes> = req.body;
    const layer = await Layer.create(layerData as any);
    res.status(201).json({ success: true, data: layer });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const updateLayer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const [updatedCount] = await Layer.update(updateData, {
      where: { id }
    });
    
    if (updatedCount === 0) {
      return res.status(404).json({ success: false, error: '图层不存在' });
    }
    
    const updatedLayer = await Layer.findByPk(id);
    res.json({ success: true, data: updatedLayer });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const toggleLayerVisibility = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const layer = await Layer.findByPk(id);
    
    if (!layer) {
      return res.status(404).json({ success: false, error: '图层不存在' });
    }
    
    layer.visible = !layer.visible;
    await layer.save();
    
    res.json({ success: true, data: layer });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const updateLayerStyle = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { style } = req.body;
    
    const [updatedCount] = await Layer.update({ style }, {
      where: { id }
    });
    
    if (updatedCount === 0) {
      return res.status(404).json({ success: false, error: '图层不存在' });
    }
    
    const updatedLayer = await Layer.findByPk(id);
    res.json({ success: true, data: updatedLayer });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const deleteLayer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deletedCount = await Layer.destroy({ where: { id } });
    
    if (deletedCount === 0) {
      return res.status(404).json({ success: false, error: '图层不存在' });
    }
    
    res.json({ success: true, message: '图层删除成功' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};
