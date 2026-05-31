import { Request, Response } from 'express';
import FaultRecord from '../models/FaultRecord';
import FaultAnalysisService from '../services/faultAnalysisService';
import { Op } from 'sequelize';

export const simulateFault = async (req: Request, res: Response) => {
  try {
    const {
      faultType,
      severity,
      location,
      affectedPipelineId,
      affectedNodeId
    } = req.body;

    if (!faultType || !severity || !location) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: faultType, severity, location'
      });
    }

    const service = new FaultAnalysisService();
    const result = await service.simulateFault({
      faultType,
      severity,
      location,
      affectedPipelineId,
      affectedNodeId
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('故障模拟失败:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const analyzeValveClosure = async (req: Request, res: Response) => {
  try {
    const { valveNodeId } = req.body;

    if (!valveNodeId) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数: valveNodeId'
      });
    }

    const service = new FaultAnalysisService();
    const result = await service.analyzeValveClosure(valveNodeId);

    res.json({
      success: result.success,
      data: result
    });
  } catch (error) {
    console.error('阀门关闭分析失败:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const getAllFaults = async (req: Request, res: Response) => {
  try {
    const { status, severity, faultType, startDate, endDate } = req.query;
    const where: any = {};

    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (faultType) where.faultType = faultType;
    if (startDate) where.startTime = { [Op.gte]: new Date(startDate as string) };
    if (endDate) where.startTime = { ...where.startTime, [Op.lte]: new Date(endDate as string) };

    const faults = await FaultRecord.findAll({
      where,
      order: [['startTime', 'DESC']]
    });

    res.json({
      success: true,
      data: faults
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const getFaultById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fault = await FaultRecord.findByPk(id);

    if (!fault) {
      return res.status(404).json({
        success: false,
        error: '故障记录不存在'
      });
    }

    res.json({
      success: true,
      data: fault
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const updateFault = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const [updatedCount] = await FaultRecord.update(updateData, {
      where: { id }
    });

    if (updatedCount === 0) {
      return res.status(404).json({
        success: false,
        error: '故障记录不存在'
      });
    }

    const updatedFault = await FaultRecord.findByPk(id);
    res.json({
      success: true,
      data: updatedFault
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const resolveFault = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { resolution, cost } = req.body;

    const service = new FaultAnalysisService();
    const fault = await service.resolveFault(id, resolution, cost);

    res.json({
      success: true,
      data: fault
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const deleteFault = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deletedCount = await FaultRecord.destroy({ where: { id } });

    if (deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: '故障记录不存在'
      });
    }

    res.json({
      success: true,
      message: '故障记录已删除'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};

export const getActiveFaultsSummary = async (req: Request, res: Response) => {
  try {
    const service = new FaultAnalysisService();
    const activeFaults = await service.getActiveFaults();

    const bySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };

    const byType: Record<string, number> = {};

    activeFaults.forEach(fault => {
      bySeverity[fault.severity]++;
      byType[fault.faultType] = (byType[fault.faultType] || 0) + 1;
    });

    res.json({
      success: true,
      data: {
        total: activeFaults.length,
        bySeverity,
        byType,
        faults: activeFaults
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message
    });
  }
};
