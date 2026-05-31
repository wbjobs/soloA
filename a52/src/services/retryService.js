const { DeviceUpdateStatus, Device, UpdateTask } = require('../models');
const { Op } = require('sequelize');
const updatePolicyService = require('./updatePolicyService');
const alertLogService = require('./alertLogService');
const redisService = require('./redisService');

class RetryService {
  constructor() {
    this.retryQueue = new Map();
    this.retryTimers = new Map();
    this.isRunning = false;
  }

  async initialize() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    await this.recoverRetryQueue();
    this.startRetryProcessor();
    console.log('Retry service initialized');
  }

  async shutdown() {
    this.isRunning = false;
    
    for (const timer of this.retryTimers.values()) {
      clearTimeout(timer);
    }
    this.retryTimers.clear();
    
    console.log('Retry service stopped');
  }

  async recoverRetryQueue() {
    console.log('Recovering retry queue from database...');
    
    const failedStatuses = await DeviceUpdateStatus.findAll({
      where: {
        status: 'failed',
        errorMessage: {
          [Op.ne]: null
        }
      },
      include: [
        { model: UpdateTask },
        { model: Device }
      ]
    });

    for (const status of failedStatuses) {
      const task = status.UpdateTask;
      if (!task || task.status === 'completed' || task.status === 'cancelled') {
        continue;
      }

      const device = status.Device;
      if (!device) continue;

      const policy = await updatePolicyService.matchPolicyForDevice(device);
      const retryKey = this.getRetryKey(task.id, device.id);
      const retryInfo = await redisService.get(`retry:${retryKey}`);

      if (retryInfo && retryInfo.retryCount < policy.retryMaxAttempts) {
        await this.scheduleRetry(task, device, policy, status, retryInfo.retryCount);
      }
    }

    console.log(`Recovered ${this.retryQueue.size} retry tasks from database`);
  }

  startRetryProcessor() {
    setInterval(() => {
      this.processRetryQueue();
    }, 60000);
  }

  async processRetryQueue() {
    if (!this.isRunning) return;

    const now = Date.now();
    
    for (const [key, retryInfo] of this.retryQueue.entries()) {
      if (retryInfo.scheduledTime <= now && !retryInfo.processing) {
        retryInfo.processing = true;
        try {
          await this.executeRetry(retryInfo);
          this.retryQueue.delete(key);
        } catch (error) {
          console.error(`Retry execution failed for ${key}:`, error);
          retryInfo.processing = false;
        }
      }
    }
  }

  async handleUpdateFailure(task, device, deviceStatus, errorMessage) {
    const policy = await updatePolicyService.matchPolicyForDevice(device);
    const retryKey = this.getRetryKey(task.id, device.id);
    
    let retryInfo = await redisService.get(`retry:${retryKey}`);
    
    if (!retryInfo) {
      retryInfo = {
        taskId: task.id,
        deviceId: device.id,
        retryCount: 0,
        errors: [],
        firstFailedAt: Date.now()
      };
    }

    retryInfo.retryCount++;
    retryInfo.errors.push({
      message: errorMessage,
      timestamp: Date.now()
    });

    if (retryInfo.retryCount > policy.retryMaxAttempts) {
      await this.handleRetryExhausted(task, device, policy, deviceStatus, retryInfo);
      return;
    }

    await redisService.set(`retry:${retryKey}`, retryInfo, 86400);

    if (policy.alertOnFailure && retryInfo.retryCount >= policy.alertThreshold) {
      await alertLogService.createUpdateFailedAlert(
        device.id,
        task.id,
        policy,
        errorMessage,
        retryInfo.retryCount
      );
    }

    await this.scheduleRetry(task, device, policy, deviceStatus, retryInfo.retryCount);
  }

  async scheduleRetry(task, device, policy, deviceStatus, retryCount) {
    const intervalSeconds = updatePolicyService.calculateRetryInterval(policy, retryCount);
    const scheduledTime = Date.now() + (intervalSeconds * 1000);
    const retryKey = this.getRetryKey(task.id, device.id);

    const retryInfo = {
      taskId: task.id,
      deviceId: device.id,
      policyId: policy.id,
      retryCount,
      scheduledTime,
      intervalSeconds,
      processing: false
    };

    this.retryQueue.set(retryKey, retryInfo);
    await redisService.set(`retry:${retryKey}`, retryInfo, 86400);

    await alertLogService.createRetryScheduledAlert(
      device.id,
      task.id,
      policy,
      retryCount,
      scheduledTime
    );

    console.log(`Scheduled retry #${retryCount} for device ${device.id} in ${intervalSeconds} seconds`);
  }

  async executeRetry(retryInfo) {
    const { taskId, deviceId, retryCount } = retryInfo;
    const retryKey = this.getRetryKey(taskId, deviceId);

    console.log(`Executing retry #${retryCount} for task ${taskId}, device ${deviceId}`);

    const task = await UpdateTask.findByPk(taskId);
    const device = await Device.findByPk(deviceId);

    if (!task || !device) {
      console.warn(`Task or device not found for retry: ${retryKey}`);
      this.retryQueue.delete(retryKey);
      return;
    }

    const policy = await updatePolicyService.matchPolicyForDevice(device);

    const timeCheck = await updatePolicyService.isUpdateTimeAllowed(policy);
    if (!timeCheck.allowed) {
      console.log(`Retry delayed: ${timeCheck.reason}`);
      await alertLogService.createPolicyViolationAlert(
        deviceId,
        taskId,
        policy,
        timeCheck.reason
      );
      await this.rescheduleRetry(task, device, policy, retryCount + 1);
      return;
    }

    const concurrentCheck = await updatePolicyService.checkConcurrentLimit(policy);
    if (!concurrentCheck.canStart) {
      console.log(`Concurrent limit reached, delaying retry`);
      await alertLogService.createConcurrentLimitAlert(policy, concurrentCheck.current, concurrentCheck.max);
      await this.rescheduleRetry(task, device, policy, retryCount + 1);
      return;
    }

    const deviceStatus = await DeviceUpdateStatus.findOne({
      where: { taskId, deviceId }
    });

    if (!deviceStatus) {
      console.warn(`Device status not found for retry: ${retryKey}`);
      return;
    }

    await redisService.clearChunkInfo(taskId, deviceId);

    deviceStatus.status = 'downloading';
    deviceStatus.currentChunk = 0;
    deviceStatus.progress = 0;
    deviceStatus.errorMessage = null;
    deviceStatus.startedAt = new Date();
    deviceStatus.completedAt = null;
    await deviceStatus.save();

    await redisService.setDeviceStatus(deviceId, {
      taskId,
      status: 'downloading',
      currentChunk: 0,
      totalChunks: deviceStatus.totalChunks,
      progress: 0,
      retryCount
    });

    console.log(`Retry #${retryCount} started for device ${deviceId}`);
  }

  async rescheduleRetry(task, device, policy, currentRetryCount) {
    const intervalSeconds = updatePolicyService.calculateRetryInterval(policy, currentRetryCount);
    const scheduledTime = Date.now() + (intervalSeconds * 1000);
    const retryKey = this.getRetryKey(task.id, device.id);

    const retryInfo = this.retryQueue.get(retryKey);
    if (retryInfo) {
      retryInfo.scheduledTime = scheduledTime;
      retryInfo.intervalSeconds = intervalSeconds;
      retryInfo.processing = false;
      await redisService.set(`retry:${retryKey}`, retryInfo, 86400);
    }

    console.log(`Retry for device ${device.id} rescheduled for ${new Date(scheduledTime).toLocaleString()}`);
  }

  async handleRetryExhausted(task, device, policy, deviceStatus, retryInfo) {
    const retryKey = this.getRetryKey(task.id, device.id);
    
    this.retryQueue.delete(retryKey);
    await redisService.del(`retry:${retryKey}`);

    await alertLogService.createAlert({
      level: 'critical',
      type: 'RETRY_EXHAUSTED',
      title: `更新重试耗尽: ${device.id}`,
      message: `设备 ${device.id} 的更新在 ${retryInfo.retryCount} 次重试后仍然失败。最后错误: ${retryInfo.errors[retryInfo.errors.length - 1]?.message || 'Unknown error'}`,
      deviceId: device.id,
      taskId: task.id,
      policyId: policy.id,
      retryCount: retryInfo.retryCount,
      maxRetries: policy.retryMaxAttempts,
      metadata: {
        errors: retryInfo.errors,
        firstFailedAt: retryInfo.firstFailedAt
      }
    });

    deviceStatus.status = 'failed';
    deviceStatus.errorMessage = `Update failed after ${retryInfo.retryCount} retries`;
    deviceStatus.completedAt = new Date();
    await deviceStatus.save();

    console.error(`Retry exhausted for device ${device.id} after ${retryInfo.retryCount} attempts`);
  }

  async cancelRetry(taskId, deviceId) {
    const retryKey = this.getRetryKey(taskId, deviceId);
    
    this.retryQueue.delete(retryKey);
    await redisService.del(`retry:${retryKey}`);
    
    const timer = this.retryTimers.get(retryKey);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(retryKey);
    }

    console.log(`Retry cancelled for task ${taskId}, device ${deviceId}`);
  }

  async cancelAllRetries(taskId) {
    const keysToDelete = [];
    
    for (const [key, value] of this.retryQueue.entries()) {
      if (value.taskId === taskId) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.retryQueue.delete(key);
      await redisService.del(`retry:${key}`);
      
      const timer = this.retryTimers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.retryTimers.delete(key);
      }
    }

    console.log(`Cancelled ${keysToDelete.length} retries for task ${taskId}`);
  }

  async getRetryStatus(taskId, deviceId) {
    const retryKey = this.getRetryKey(taskId, deviceId);
    const retryInfo = await redisService.get(`retry:${retryKey}`);
    
    if (!retryInfo) {
      const fromMemory = this.retryQueue.get(retryKey);
      if (fromMemory) {
        return {
          ...fromMemory,
          scheduledFor: new Date(fromMemory.scheduledTime).toLocaleString()
        };
      }
      return null;
    }

    return {
      ...retryInfo,
      scheduledFor: retryInfo.scheduledTime ? new Date(retryInfo.scheduledTime).toLocaleString() : null
    };
  }

  async getAllRetries(taskId = null) {
    const retries = [];
    
    for (const [key, value] of this.retryQueue.entries()) {
      if (!taskId || value.taskId === taskId) {
        retries.push({
          key,
          ...value,
          scheduledFor: new Date(value.scheduledTime).toLocaleString()
        });
      }
    }

    return retries.sort((a, b) => a.scheduledTime - b.scheduledTime);
  }

  getRetryKey(taskId, deviceId) {
    return `${taskId}:${deviceId}`;
  }
}

module.exports = new RetryService();
