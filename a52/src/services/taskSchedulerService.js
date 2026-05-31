const { UpdateTask, DeviceUpdateStatus, Device, DeviceVersionHistory, Firmware, DeltaPackage } = require('../models');
const redisService = require('./redisService');
const config = require('../config');
const updatePolicyService = require('./updatePolicyService');
const retryService = require('./retryService');
const alertLogService = require('./alertLogService');

class TaskSchedulerService {
  constructor() {
    this.activeTasks = new Map();
  }

  async createTask(taskData) {
    const { 
      name, 
      firmwareId, 
      deviceIds, 
      updateType = 'full', 
      description,
      autoRegisterDevices = false,
      deviceType = null
    } = taskData;

    const firmware = await Firmware.findByPk(firmwareId);
    if (!firmware) {
      throw new Error('Firmware not found');
    }

    const validDevices = [];
    const registeredDevices = [];
    
    for (const deviceId of deviceIds) {
      let device = await Device.findByPk(deviceId);
      
      if (device) {
        validDevices.push(deviceId);
        registeredDevices.push(device);
      } else if (autoRegisterDevices) {
        device = await Device.create({
          id: deviceId,
          name: deviceId,
          deviceType: deviceType || firmware.deviceType,
          status: 'offline',
          currentVersion: null
        });
        validDevices.push(deviceId);
        registeredDevices.push(device);
        console.log(`Auto-registered new device: ${deviceId}`);
      }
    }

    if (validDevices.length === 0) {
      throw new Error('No valid devices found. Use autoRegisterDevices=true to auto-register new devices');
    }

    const task = await UpdateTask.create({
      name,
      firmwareId,
      deviceIds: validDevices,
      updateType,
      status: 'pending',
      description
    });

    for (const deviceId of validDevices) {
      await DeviceUpdateStatus.create({
        deviceId,
        taskId: task.id,
        status: 'pending',
        currentChunk: 0,
        totalChunks: 0,
        progress: 0
      });
    }

    return {
      task,
      autoRegistered: validDevices.length - (deviceIds.length - validDevices.length)
    };
  }

  async startTask(taskId) {
    const task = await UpdateTask.findByPk(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    if (task.status !== 'pending') {
      throw new Error('Task is not in pending state');
    }

    const firmware = await Firmware.findByPk(task.firmwareId);
    const totalChunks = Math.ceil(firmware.fileSize / config.storage.chunkSize);

    task.status = 'in_progress';
    task.startedAt = new Date();
    await task.save();

    const deviceStatuses = await DeviceUpdateStatus.findAll({
      where: { taskId: task.id }
    });

    for (const status of deviceStatuses) {
      const device = await Device.findByPk(status.deviceId);
      if (!device) continue;

      const policy = await updatePolicyService.matchPolicyForDevice(device);
      
      const timeCheck = await updatePolicyService.isUpdateTimeAllowed(policy);
      if (!timeCheck.allowed) {
        console.log(`Device ${status.deviceId}: ${timeCheck.reason}`);
        await alertLogService.createPolicyViolationAlert(
          status.deviceId,
          task.id,
          policy,
          timeCheck.reason
        );
        continue;
      }

      const concurrentCheck = await updatePolicyService.checkConcurrentLimit(policy);
      if (!concurrentCheck.canStart) {
        console.log(`Device ${status.deviceId}: concurrent limit reached (${concurrentCheck.current}/${concurrentCheck.max})`);
        await alertLogService.createConcurrentLimitAlert(policy, concurrentCheck.current, concurrentCheck.max);
        continue;
      }

      status.status = 'downloading';
      status.startedAt = new Date();
      status.totalChunks = totalChunks;
      await status.save();

      await Device.update(
        { status: 'updating' },
        { where: { id: status.deviceId } }
      );

      await redisService.setDeviceStatus(status.deviceId, {
        taskId: task.id,
        status: 'downloading',
        currentChunk: 0,
        totalChunks,
        progress: 0,
        policyId: policy.id
      });
    }

    return task;
  }

  async cancelTask(taskId) {
    const task = await UpdateTask.findByPk(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    if (task.status !== 'in_progress' && task.status !== 'pending') {
      throw new Error('Task cannot be cancelled');
    }

    task.status = 'cancelled';
    await task.save();

    await retryService.cancelAllRetries(taskId);

    const deviceStatuses = await DeviceUpdateStatus.findAll({
      where: { taskId: task.id }
    });

    for (const status of deviceStatuses) {
      if (status.status !== 'completed' && status.status !== 'failed') {
        status.status = 'cancelled';
        await status.save();

        await Device.update(
          { status: 'online' },
          { where: { id: status.deviceId } }
        );

        await redisService.setDeviceStatus(status.deviceId, {
          taskId: task.id,
          status: 'cancelled'
        });
      }
    }

    return task;
  }

  async updateDeviceStatus(taskId, deviceId, statusUpdate) {
    const { status, currentChunk, progress, errorMessage } = statusUpdate;

    const deviceStatus = await DeviceUpdateStatus.findOne({
      where: { taskId, deviceId }
    });

    if (!deviceStatus) {
      throw new Error('Device status not found');
    }

    const task = await UpdateTask.findByPk(taskId);
    const device = await Device.findByPk(deviceId);
    const policy = device ? await updatePolicyService.matchPolicyForDevice(device) : null;

    const previousStatus = deviceStatus.status;

    if (status) {
      deviceStatus.status = status;
    }

    if (currentChunk !== undefined) {
      deviceStatus.currentChunk = currentChunk;
    }

    if (progress !== undefined) {
      deviceStatus.progress = progress;
    }

    if (errorMessage) {
      deviceStatus.errorMessage = errorMessage;
    }

    if (status === 'completed' || status === 'failed') {
      deviceStatus.completedAt = new Date();
    }

    await deviceStatus.save();

    if (status === 'failed' && policy && policy.retryMaxAttempts > 0) {
      console.log(`Device ${deviceId} update failed, checking retry policy...`);
      await retryService.handleUpdateFailure(
        task,
        device,
        deviceStatus,
        errorMessage || 'Unknown error'
      );
    } else if (status === 'completed') {
      await retryService.cancelRetry(taskId, deviceId);
    }

    await redisService.setDeviceStatus(deviceId, {
      taskId,
      status: deviceStatus.status,
      currentChunk: deviceStatus.currentChunk,
      totalChunks: deviceStatus.totalChunks,
      progress: deviceStatus.progress
    });

    await this.checkTaskCompletion(taskId);

    return deviceStatus;
  }

  async checkTaskCompletion(taskId) {
    const task = await UpdateTask.findByPk(taskId);
    if (!task || task.status !== 'in_progress') {
      return;
    }

    const deviceStatuses = await DeviceUpdateStatus.findAll({
      where: { taskId: task.id }
    });

    const pendingRetries = await retryService.getAllRetries(taskId);
    const hasPendingRetries = pendingRetries.length > 0;

    const allCompleted = deviceStatuses.every(s => 
      s.status === 'completed' || s.status === 'failed' || s.status === 'cancelled'
    );

    if (allCompleted && !hasPendingRetries) {
      const anyFailed = deviceStatuses.some(s => s.status === 'failed');
      const allCancelled = deviceStatuses.every(s => s.status === 'cancelled');

      if (allCancelled) {
        task.status = 'cancelled';
      } else if (anyFailed) {
        task.status = 'failed';
      } else {
        task.status = 'completed';
      }
      
      task.completedAt = new Date();
      await task.save();

      for (const status of deviceStatuses) {
        if (status.status === 'completed') {
          await Device.update(
            { status: 'online', lastSeen: new Date() },
            { where: { id: status.deviceId } }
          );
          
          const firmware = await Firmware.findByPk(task.firmwareId);
          if (firmware) {
            await Device.update(
              { 
                currentFirmwareId: firmware.id,
                currentVersion: firmware.version
              },
              { where: { id: status.deviceId } }
            );
            
            await this.recordVersionHistory(status.deviceId, firmware, 'current');
          }
        } else if (status.status === 'failed') {
          await Device.update(
            { status: 'error' },
            { where: { id: status.deviceId } }
          );
        }
      }
      
      if (task.status === 'completed' || task.status === 'cancelled') {
        try {
          await redisService.clearAllChunkInfo(task.id);
          console.log(`Cleared chunk info for completed task: ${task.id}`);
        } catch (err) {
          console.warn('Failed to clear chunk info:', err.message);
        }
      }
    }
  }

  async getTask(taskId) {
    const task = await UpdateTask.findByPk(taskId, {
      include: [
        { model: Firmware },
        { model: DeviceUpdateStatus }
      ]
    });

    if (!task) {
      throw new Error('Task not found');
    }

    const progress = await this.calculateTaskProgress(taskId);
    const pendingRetries = await retryService.getAllRetries(taskId);

    return {
      ...task.toJSON(),
      progress,
      pendingRetries: pendingRetries.length
    };
  }

  async calculateTaskProgress(taskId) {
    const deviceStatuses = await DeviceUpdateStatus.findAll({
      where: { taskId }
    });

    if (deviceStatuses.length === 0) {
      return 0;
    }

    const totalProgress = deviceStatuses.reduce((sum, s) => sum + (s.progress || 0), 0);
    return (totalProgress / deviceStatuses.length).toFixed(2);
  }

  async getTaskList(filters = {}, page = 1, pageSize = 20) {
    const { status, firmwareId } = filters;
    const where = {};

    if (status) {
      where.status = status;
    }

    if (firmwareId) {
      where.firmwareId = firmwareId;
    }

    const offset = (page - 1) * pageSize;

    const { count, rows } = await UpdateTask.findAndCountAll({
      where,
      include: [
        { model: Firmware }
      ],
      order: [['createdAt', 'DESC']],
      limit: pageSize,
      offset
    });

    return {
      total: count,
      page,
      pageSize,
      totalPages: Math.ceil(count / pageSize),
      data: rows
    };
  }

  async recordVersionHistory(deviceId, firmware, status = 'current') {
    const histories = await DeviceVersionHistory.findAll({
      where: { deviceId, status: 'current' }
    });

    for (const history of histories) {
      history.status = 'previous';
      await history.save();
    }

    return await DeviceVersionHistory.create({
      deviceId,
      firmwareId: firmware.id,
      version: firmware.version,
      status
    });
  }

  async getDeviceHistory(deviceId) {
    return await DeviceVersionHistory.findAll({
      where: { deviceId },
      include: [
        { model: Firmware }
      ],
      order: [['installedAt', 'DESC']]
    });
  }
}

module.exports = new TaskSchedulerService();
