const { Device, DeviceVersionHistory, UpdateTask, Firmware, DeviceUpdateStatus } = require('../models');
const taskSchedulerService = require('../services/taskSchedulerService');
const redisService = require('../services/redisService');

class RollbackController {
  async getDeviceHistory(req, res) {
    try {
      const { deviceId } = req.params;
      const history = await taskSchedulerService.getDeviceHistory(deviceId);

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      console.error('Get device history error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async createRollbackTask(req, res) {
    try {
      const { deviceId, historyId } = req.body;

      if (!deviceId || !historyId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: deviceId, historyId'
        });
      }

      const device = await Device.findByPk(deviceId);
      if (!device) {
        return res.status(404).json({
          success: false,
          error: 'Device not found'
        });
      }

      const history = await DeviceVersionHistory.findByPk(historyId, {
        include: [{ model: Firmware }]
      });

      if (!history) {
        return res.status(404).json({
          success: false,
          error: 'Version history not found'
        });
      }

      if (history.deviceId !== deviceId) {
        return res.status(400).json({
          success: false,
          error: 'History entry does not belong to this device'
        });
      }

      if (!history.Firmware) {
        return res.status(404).json({
          success: false,
          error: 'Firmware not found for this history entry'
        });
      }

      const existingTasks = await UpdateTask.findAll({
        where: {
          deviceIds: { [Device.sequelize.Op.contains]: [deviceId] },
          status: ['pending', 'in_progress']
        }
      });

      if (existingTasks.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Device has active update tasks'
        });
      }

      const task = await taskSchedulerService.createTask({
        name: `Rollback_${deviceId}_${history.version}`,
        firmwareId: history.Firmware.id,
        deviceIds: [deviceId],
        updateType: 'full',
        description: `Rollback to version ${history.version}`
      });

      res.status(201).json({
        success: true,
        data: {
          task,
          targetVersion: history.version
        },
        message: 'Rollback task created successfully'
      });
    } catch (error) {
      console.error('Create rollback task error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async executeRollback(req, res) {
    try {
      const { taskId } = req.params;

      const task = await UpdateTask.findByPk(taskId, {
        include: [{ model: Firmware }]
      });

      if (!task) {
        return res.status(404).json({
          success: false,
          error: 'Task not found'
        });
      }

      if (task.status !== 'pending') {
        return res.status(400).json({
          success: false,
          error: 'Task is not in pending state'
        });
      }

      const deviceId = task.deviceIds[0];
      const currentHistory = await DeviceVersionHistory.findOne({
        where: { deviceId, status: 'current' }
      });

      if (currentHistory) {
        currentHistory.status = 'previous';
        await currentHistory.save();
      }

      const rollbackHistory = await DeviceVersionHistory.create({
        deviceId,
        firmwareId: task.firmwareId,
        version: task.Firmware.version,
        status: 'current'
      });

      await taskSchedulerService.startTask(taskId);

      res.json({
        success: true,
        data: {
          task,
          rollbackHistory
        },
        message: 'Rollback task started'
      });
    } catch (error) {
      console.error('Execute rollback error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async markRollbackComplete(req, res) {
    try {
      const { taskId, deviceId } = req.params;
      const { success, errorMessage } = req.body;

      const deviceStatus = await DeviceUpdateStatus.findOne({
        where: { taskId, deviceId }
      });

      if (!deviceStatus) {
        return res.status(404).json({
          success: false,
          error: 'Device status not found'
        });
      }

      if (success) {
        deviceStatus.status = 'rolled_back';
        deviceStatus.completedAt = new Date();
        await deviceStatus.save();

        const task = await UpdateTask.findByPk(taskId);
        const firmware = await Firmware.findByPk(task.firmwareId);

        await Device.update(
          {
            currentFirmwareId: firmware.id,
            currentVersion: firmware.version,
            status: 'online',
            lastSeen: new Date()
          },
          { where: { id: deviceId } }
        );

        const currentHistory = await DeviceVersionHistory.findOne({
          where: { deviceId, status: 'current' }
        });

        if (currentHistory) {
          currentHistory.status = 'previous';
          currentHistory.rolledBackAt = new Date();
          await currentHistory.save();
        }

        await DeviceVersionHistory.create({
          deviceId,
          firmwareId: firmware.id,
          version: firmware.version,
          status: 'current'
        });

        await redisService.setDeviceStatus(deviceId, {
          taskId,
          status: 'rolled_back',
          version: firmware.version
        });
      } else {
        deviceStatus.status = 'failed';
        deviceStatus.errorMessage = errorMessage || 'Rollback failed';
        deviceStatus.completedAt = new Date();
        await deviceStatus.save();

        await Device.update(
          { status: 'error' },
          { where: { id: deviceId } }
        );
      }

      await taskSchedulerService.checkTaskCompletion(taskId);

      res.json({
        success: true,
        message: success ? 'Rollback completed successfully' : 'Rollback failed'
      });
    } catch (error) {
      console.error('Mark rollback complete error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async rollbackToVersion(req, res) {
    try {
      const { deviceId, version } = req.params;

      const device = await Device.findByPk(deviceId);
      if (!device) {
        return res.status(404).json({
          success: false,
          error: 'Device not found'
        });
      }

      const history = await DeviceVersionHistory.findOne({
        where: { deviceId, version, status: 'previous' },
        include: [{ model: Firmware }],
        order: [['installedAt', 'DESC']]
      });

      if (!history) {
        return res.status(404).json({
          success: false,
          error: 'No previous version found for rollback'
        });
      }

      const existingTasks = await UpdateTask.findAll({
        where: {
          deviceIds: { [Device.sequelize.Op.contains]: [deviceId] },
          status: ['pending', 'in_progress']
        }
      });

      if (existingTasks.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Device has active update tasks'
        });
      }

      const task = await taskSchedulerService.createTask({
        name: `Rollback_${deviceId}_${version}`,
        firmwareId: history.Firmware.id,
        deviceIds: [deviceId],
        updateType: 'full',
        description: `Rollback to version ${version}`
      });

      await taskSchedulerService.startTask(task.id);

      res.json({
        success: true,
        data: {
          task,
          targetVersion: version
        },
        message: 'Rollback task started successfully'
      });
    } catch (error) {
      console.error('Rollback to version error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new RollbackController();
