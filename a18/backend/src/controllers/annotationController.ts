import { Request, Response } from 'express';
import Annotation from '../models/Annotation';
import FaultAnalysisService from '../services/faultAnalysisService';
import { Op } from 'sequelize';

export const getAllAnnotations = async (req: Request, res: Response) => {
  try {
    const { annotationType, visible, layerId } = req.query;
    const where: any = {};

    if (annotationType) where.annotationType = annotationType;
    if (visible !== undefined) where.visible = visible === 'true';
    if (layerId) where.layerId = layerId;

    const annotations = await Annotation.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      data: annotations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const getAnnotationById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const annotation = await Annotation.findByPk(id);

    if (!annotation) {
      return res.status(404).json({
        success: false,
        error: '标注不存在'
      });
    }

    res.json({
      success: true,
      data: annotation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const createAnnotation = async (req: Request, res: Response) => {
  try {
    const annotationData = req.body;
    
    if (!annotationData.annotationType || !annotationData.title) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: annotationType, title'
      });
    }

    const annotation = await Annotation.create({
      ...annotationData,
      visible: annotationData.visible !== false
    });

    res.status(201).json({
      success: true,
      data: annotation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const updateAnnotation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const [updatedCount] = await Annotation.update(updateData, {
      where: { id }
    });

    if (updatedCount === 0) {
      return res.status(404).json({
        success: false,
        error: '标注不存在'
      });
    }

    const updatedAnnotation = await Annotation.findByPk(id);
    res.json({
      success: true,
      data: updatedAnnotation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const deleteAnnotation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deletedCount = await Annotation.destroy({ where: { id } });

    if (deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: '标注不存在'
      });
    }

    res.json({
      success: true,
      message: '标注已删除'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const calculateDistance = async (req: Request, res: Response) => {
  try {
    const { x1, y1, z1, x2, y2, z2, useGeodesic } = req.body;

    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: x1, y1, x2, y2'
      });
    }

    const service = new FaultAnalysisService();
    const result = service.calculateDistance(
      x1, y1, z1 || 0,
      x2, y2, z2 || 0,
      useGeodesic
    );

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const calculateArea = async (req: Request, res: Response) => {
  try {
    const { points } = req.body;

    if (!Array.isArray(points) || points.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'points 必须是包含至少3个点的数组'
      });
    }

    const service = new FaultAnalysisService();
    const result = service.calculateArea(points);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const calculateHeight = async (req: Request, res: Response) => {
  try {
    const { x, y, z1, z2 } = req.body;

    if (z1 === undefined || z2 === undefined) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: z1, z2'
      });
    }

    const service = new FaultAnalysisService();
    const result = service.calculateHeight(x || 0, y || 0, z1, z2);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const createMeasurementAnnotation = async (req: Request, res: Response) => {
  try {
    const { type, points, title } = req.body;

    if (!type || !points) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: type, points'
      });
    }

    const service = new FaultAnalysisService();
    let measurementValue: number;
    let measurementUnit: string;
    let x: number, y: number, z: number;
    let endX: number | undefined, endY: number | undefined, endZ: number | undefined;

    if (type === 'distance' && points.length >= 2) {
      const result = service.calculateDistance(
        points[0].x, points[0].y, points[0].z || 0,
        points[1].x, points[1].y, points[1].z || 0
      );
      measurementValue = result.distance;
      measurementUnit = result.unit;
      x = points[0].x;
      y = points[0].y;
      z = points[0].z || 0;
      endX = points[1].x;
      endY = points[1].y;
      endZ = points[1].z || 0;
    } else if (type === 'area' && points.length >= 3) {
      const result = service.calculateArea(points);
      measurementValue = result.area;
      measurementUnit = result.unit;
      const centerX = points.reduce((sum: number, p: any) => sum + p.x, 0) / points.length;
      const centerY = points.reduce((sum: number, p: any) => sum + p.y, 0) / points.length;
      x = centerX;
      y = centerY;
      z = 0;
    } else if (type === 'height' && points.length >= 2) {
      const result = service.calculateHeight(
        points[0].x, points[0].y,
        points[0].z || 0,
        points[1].z || 0
      );
      measurementValue = result.height;
      measurementUnit = result.unit;
      x = points[0].x;
      y = points[0].y;
      z = points[0].z || 0;
      endZ = points[1].z || 0;
    } else {
      return res.status(400).json({
        success: false,
        error: '测量类型或点数量不正确'
      });
    }

    const annotation = await Annotation.create({
      annotationType: 'measurement',
      title: title || `${this.getMeasurementLabel(type)} ${measurementValue.toFixed(2)} ${measurementUnit}`,
      content: `测量值: ${measurementValue.toFixed(2)} ${measurementUnit}`,
      measurementType: type,
      measurementValue,
      measurementUnit,
      x,
      y,
      z,
      endX,
      endY,
      endZ,
      style: {
        color: '#ff0000',
        fontSize: 14
      },
      visible: true,
      properties: {
        points,
        measurementType: type
      }
    });

    res.json({
      success: true,
      data: annotation
    });
  } catch (error) {
    console.error('创建测量标注失败:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const toggleAnnotationVisibility = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const annotation = await Annotation.findByPk(id);
    if (!annotation) {
      return res.status(404).json({
        success: false,
        error: '标注不存在'
      });
    }

    annotation.visible = !annotation.visible;
    await annotation.save();

    res.json({
      success: true,
      data: annotation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const getMeasurementLabel = (type: string): string => {
  const labels: Record<string, string> = {
    distance: '距离',
    area: '面积',
    height: '高度',
    angle: '角度'
  };
  return labels[type] || '测量';
};
