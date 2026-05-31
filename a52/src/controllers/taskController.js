const taskSchedulerService = require('../services/taskSchedulerService');
const redisService = require('../services/redisService');

class TaskController {
  async createTask(req, res) {
    try {
      const { 
        name, 
        firmwareId, 
        deviceIds, 
        updateType, 
        description,
        autoRegisterDevices,
        deviceType
      } = req.body;

      if (!name || !firmwareId || !deviceIds || !Array.isArray(deviceIds) || deviceIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: name, firmwareId, deviceIds'
        });
      }

      const result = await taskSchedulerService.createTask({
        name,
        firmwareId,
        deviceIds,
        updateType,
        description,
        autoRegisterDevices: autoRegisterDevices === true,
        deviceType
      });

      res.status(201).json({
        success: true,
        data: result.task,
        autoRegistered: result.autoRegistered
      });
    } catch (error) {
      console.error('Create task error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async startTask(req, res) {
    try {
      const { id } = req.params;
      const task = await taskSchedulerService.startTask(id);

      res.json({
        success: true,
        data: task
      });
    } catch (error) {
      console.error('Start task error:', error);
      if (error.message === 'Task not found') {
        return res.status(404).json({ success: false, error: error.message });
      }
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  async cancelTask(req, res) {
    try {
      const { id } = req.params;
      const task = await taskSchedulerService.cancelTask(id);

      res.json({
        success: true,
        data: task
      });
    } catch (error) {
      console.error('Cancel task error:', error);
      if (error.message === 'Task not found') {
        return res.status(404).json({ success: false, error: error.message });
      }
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  async getTask(req, res) {
    try {
      const { id } = req.params;
      const task = await taskSchedulerService.getTask(id);

      res.json({
        success: true,
        data: task
      });
    } catch (error) {
      console.error('Get task error:', error);
      if (error.message === 'Task not found') {
        return res.status(404).json({ success: false, error: error.message });
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getTaskList(req, res) {
    try {
      const { status, firmwareId, page = 1, pageSize = 20 } = req.query;
      const result = await taskSchedulerService.getTaskList(
        { status, firmwareId },
        parseInt(page),
        parseInt(pageSize)
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get task list error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async reportDeviceStatus(req, res) {
    try {
      const { taskId, deviceId } = req.params;
      const { status, currentChunk, progress, errorMessage } = req.body;

      const deviceStatus = await taskSchedulerService.updateDeviceStatus(
        taskId,
        deviceId,
        { status, currentChunk, progress, errorMessage }
      );

      res.json({
        success: true,
        data: deviceStatus
      });
    } catch (error) {
      console.error('Report device status error:', error);
      if (error.message === 'Device status not found') {
        return res.status(404).json({ success: false, error: error.message });
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getDeviceStatus(req, res) {
    try {
      const { deviceId } = req.params;
      
      let status = await redisService.getDeviceStatus(deviceId);

      if (!status) {
        const { DeviceUpdateStatus, UpdateTask, Firmware } = require('../models');
        
        const deviceStatus = await DeviceUpdateStatus.findOne({
          where: { 
            deviceId,
            status: ['downloading', 'installing', 'in_progress']
          },
          include: [
            {
              model: UpdateTask,
              include: [{ model: Firmware }]
            }
          ],
          order: [['updatedAt', 'DESC']]
        });

        if (deviceStatus) {
          status = {
            taskId: deviceStatus.taskId,
            status: deviceStatus.status,
            currentChunk: deviceStatus.currentChunk,
            totalChunks: deviceStatus.totalChunks,
            progress: deviceStatus.progress,
            recoveredFromDB: true
          };
          
          await redisService.setDeviceStatus(deviceId, status);
        }
      }

      if (!status) {
        return res.status(404).json({
          success: false,
          error: 'No active update found for device'
        });
      }

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('Get device status error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async reportChunkComplete(req, res) {
    try {
      const { taskId, deviceId, chunkIndex } = req.params;
      const { success, checksum } = req.body;

      await redisService.setChunkInfo(taskId, deviceId, parseInt(chunkIndex), {
        success: success === true,
        checksum,
        completedAt: Date.now()
      });

      res.json({
        success: true,
        message: 'Chunk status recorded'
      });
    } catch (error) {
      console.error('Report chunk complete error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getChunkStatus(req, res) {
    try {
      const { taskId, deviceId } = req.params;
      const chunkInfo = await redisService.getAllChunkInfo(taskId, deviceId);

      res.json({
        success: true,
        data: chunkInfo
      });
    } catch (error) {
      console.error('Get chunk status error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async resumeDownload(req, res) {
    try {
      const { taskId, deviceId } = req.params;
      
      const { DeviceUpdateStatus } = require('../models');
      
      const deviceStatus = await DeviceUpdateStatus.findOne({
        where: { taskId, deviceId }
      });
      
      if (!deviceStatus) {
        return res.status(404).json({
          success: false,
          error: 'Device task status not found'
        });
      }
      
      if (deviceStatus.status === 'completed' || 
          deviceStatus.status === 'failed' || 
          deviceStatus.status === 'cancelled') {
        return res.status(400).json({
          success: false,
          error: 'Task is not resumable',
          currentStatus: deviceStatus.status
        });
      }
      
      const recoveredStatus = await redisService.recoverFromPersistence(taskId, deviceId);
      
      if (!recoveredStatus) {
        return res.status(500).json({
          success: false,
          error: 'Failed to recover download state'
        });
      }
      
      const completedCount = await redisService.getCompletedChunkCount(taskId, deviceId);
      const nextChunk = await redisService.getNextChunkToDownload(
        taskId, 
        deviceId, 
        deviceStatus.totalChunks
      );
      
      res.json({
        success: true,
        data: {
          taskId,
          deviceId,
          status: recoveredStatus,
          completedChunkCount: completedCount,
          nextChunkToDownload: nextChunk,
          totalChunks: deviceStatus.totalChunks,
          canResume: nextChunk >= 0,
          isComplete: nextChunk === -1
        }
      });
    } catch (error) {
      console.error('Resume download error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getNextChunk(req, res) {
    try {
      const { taskId, deviceId } = req.params;
      const { totalChunks } = req.query;
      
      const { DeviceUpdateStatus } = require('../models');
      
      const deviceStatus = await DeviceUpdateStatus.findOne({
        where: { taskId, deviceId }
      });
      
      if (!deviceStatus) {
        return res.status(404).json({
          success: false,
          error: 'Device task status not found'
        });
      }
      
      const total = totalChunks ? parseInt(totalChunks) : deviceStatus.totalChunks;
      
      const nextChunk = await redisService.getNextChunkToDownload(
        taskId, 
        deviceId, 
        total
      );
      
      const completedCount = await redisService.getCompletedChunkCount(taskId, deviceId);
      
      res.json({
        success: true,
        data: {
          taskId,
          deviceId,
          nextChunk,
          totalChunks: total,
          completedChunks: completedCount,
          progress: total > 0 ? ((completedCount / total) * 100).toFixed(2) : 0,
          isComplete: nextChunk === -1
        }
      });
    } catch (error) {
      console.error('Get next chunk error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new TaskController();
