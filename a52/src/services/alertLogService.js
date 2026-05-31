const { AlertLog, Device, UpdateTask, UpdatePolicy } = require('../models');
const { Op } = require('sequelize');

class AlertLogService {
  constructor() {
    this.ALERT_TYPES = {
      UPDATE_FAILED: 'UPDATE_FAILED',
      RETRY_FAILED: 'RETRY_FAILED',
      RETRY_EXHAUSTED: 'RETRY_EXHAUSTED',
      POLICY_VIOLATION: 'POLICY_VIOLATION',
      DEVICE_OFFLINE: 'DEVICE_OFFLINE',
      CONCURRENT_LIMIT: 'CONCURRENT_LIMIT',
      CHUNK_DOWNLOAD_FAILED: 'CHUNK_DOWNLOAD_FAILED',
      FIRMWARE_VERIFICATION_FAILED: 'FIRMWARE_VERIFICATION_FAILED'
    };
  }

  async createAlert(options) {
    const {
      level = 'warning',
      type,
      title,
      message,
      deviceId = null,
      taskId = null,
      policyId = null,
      retryCount = 0,
      maxRetries = 0,
      metadata = {}
    } = options;

    if (!type || !title || !message) {
      throw new Error('type, title and message are required');
    }

    const alert = await AlertLog.create({
      level,
      type,
      title,
      message,
      deviceId,
      taskId,
      policyId,
      retryCount,
      maxRetries,
      metadata,
      acknowledged: false
    });

    console.log(`[ALERT] [${level.toUpperCase()}] ${type}: ${title}`);

    return alert;
  }

  async createUpdateFailedAlert(deviceId, taskId, policy, errorMessage, retryCount = 0) {
    const device = await Device.findByPk(deviceId);
    const task = await UpdateTask.findByPk(taskId);

    const metadata = {
      deviceName: device?.name,
      taskName: task?.name,
      errorMessage,
      timestamp: new Date().toISOString()
    };

    let level = 'warning';
    let type = this.ALERT_TYPES.UPDATE_FAILED;

    if (policy && retryCount >= policy.alertThreshold) {
      if (retryCount >= policy.retryMaxAttempts) {
        level = 'error';
        type = this.ALERT_TYPES.RETRY_EXHAUSTED;
      } else {
        level = 'error';
        type = this.ALERT_TYPES.RETRY_FAILED;
      }
    }

    return await this.createAlert({
      level,
      type,
      title: `设备更新失败: ${deviceId}`,
      message: `设备 ${deviceId} 在任务 ${taskId} 中更新失败。重试次数: ${retryCount}/${policy?.retryMaxAttempts || 0}。错误: ${errorMessage}`,
      deviceId,
      taskId,
      policyId: policy?.id,
      retryCount,
      maxRetries: policy?.retryMaxAttempts || 0,
      metadata
    });
  }

  async createRetryScheduledAlert(deviceId, taskId, policy, retryCount, nextRetryTime) {
    const device = await Device.findByPk(deviceId);
    const task = await UpdateTask.findByPk(taskId);

    const nextRetryFormatted = new Date(nextRetryTime).toLocaleString();

    const metadata = {
      deviceName: device?.name,
      taskName: task?.name,
      nextRetryTime: nextRetryFormatted,
      intervalSeconds: policy?.retryInterval || 300
    };

    return await this.createAlert({
      level: 'info',
      type: this.ALERT_TYPES.RETRY_FAILED,
      title: `更新重试已安排: ${deviceId}`,
      message: `设备 ${deviceId} 第 ${retryCount} 次更新失败，已安排在 ${nextRetryFormatted} 进行第 ${retryCount + 1} 次重试。`,
      deviceId,
      taskId,
      policyId: policy?.id,
      retryCount,
      maxRetries: policy?.retryMaxAttempts || 0,
      metadata
    });
  }

  async createPolicyViolationAlert(deviceId, taskId, policy, reason) {
    const device = await Device.findByPk(deviceId);
    const task = await UpdateTask.findByPk(taskId);

    const metadata = {
      deviceName: device?.name,
      taskName: task?.name,
      policyName: policy?.name,
      violationReason: reason
    };

    return await this.createAlert({
      level: 'warning',
      type: this.ALERT_TYPES.POLICY_VIOLATION,
      title: `策略违规: ${policy?.name || 'Unknown Policy'}`,
      message: `设备 ${deviceId} 违反更新策略 "${policy?.name}"。原因: ${reason}`,
      deviceId,
      taskId,
      policyId: policy?.id,
      metadata
    });
  }

  async createConcurrentLimitAlert(policy, current, max) {
    const metadata = {
      policyName: policy?.name,
      currentCount: current,
      maxCount: max
    };

    return await this.createAlert({
      level: 'warning',
      type: this.ALERT_TYPES.CONCURRENT_LIMIT,
      title: '并发更新数超限',
      message: `当前并发更新数 (${current}) 已达到策略限制 (${max})。新的更新将被延迟。`,
      policyId: policy?.id,
      retryCount: 0,
      maxRetries: 0,
      metadata
    });
  }

  async getAlert(alertId) {
    const alert = await AlertLog.findByPk(alertId, {
      include: [
        { model: Device, attributes: ['id', 'name', 'deviceType', 'status'] },
        { model: UpdateTask, attributes: ['id', 'name', 'status'] },
        { model: UpdatePolicy, attributes: ['id', 'name', 'isActive'] }
      ]
    });

    if (!alert) {
      throw new Error('Alert not found');
    }

    return alert;
  }

  async getAlertList(filters = {}, page = 1, pageSize = 20) {
    const {
      level,
      type,
      deviceId,
      taskId,
      policyId,
      acknowledged,
      startDate,
      endDate
    } = filters;

    const where = {};

    if (level) where.level = level;
    if (type) where.type = type;
    if (deviceId) where.deviceId = deviceId;
    if (taskId) where.taskId = taskId;
    if (policyId) where.policyId = policyId;
    if (acknowledged !== undefined) where.acknowledged = acknowledged === 'true' || acknowledged === true;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }

    const offset = (page - 1) * pageSize;

    const { count, rows } = await AlertLog.findAndCountAll({
      where,
      include: [
        { model: Device, attributes: ['id', 'name', 'deviceType'] },
        { model: UpdateTask, attributes: ['id', 'name'] }
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
      alerts: rows
    };
  }

  async acknowledgeAlert(alertId, acknowledgedBy = null) {
    const alert = await AlertLog.findByPk(alertId);
    if (!alert) {
      throw new Error('Alert not found');
    }

    alert.acknowledged = true;
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = acknowledgedBy;
    await alert.save();

    return alert;
  }

  async acknowledgeAlerts(alertIds, acknowledgedBy = null) {
    const result = await AlertLog.update(
      {
        acknowledged: true,
        acknowledgedAt: new Date(),
        acknowledgedBy
      },
      {
        where: {
          id: { [Op.in]: alertIds }
        }
      }
    );

    return result[0];
  }

  async acknowledgeAllAlerts(acknowledgedBy = null, filters = {}) {
    const where = { acknowledged: false };

    if (filters.level) where.level = filters.level;
    if (filters.type) where.type = filters.type;
    if (filters.deviceId) where.deviceId = filters.deviceId;

    const result = await AlertLog.update(
      {
        acknowledged: true,
        acknowledgedAt: new Date(),
        acknowledgedBy
      },
      { where }
    );

    return result[0];
  }

  async deleteAlert(alertId) {
    const alert = await AlertLog.findByPk(alertId);
    if (!alert) {
      throw new Error('Alert not found');
    }

    await alert.destroy();
    return true;
  }

  async getAlertStats(deviceId = null) {
    const where = {};
    if (deviceId) where.deviceId = deviceId;

    const [
      totalCount,
      unacknowledgedCount,
      criticalCount,
      errorCount,
      warningCount
    ] = await Promise.all([
      AlertLog.count({ where }),
      AlertLog.count({ where: { ...where, acknowledged: false } }),
      AlertLog.count({ where: { ...where, level: 'critical' } }),
      AlertLog.count({ where: { ...where, level: 'error' } }),
      AlertLog.count({ where: { ...where, level: 'warning' } })
    ]);

    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last24hCount = await AlertLog.count({
      where: {
        ...where,
        createdAt: { [Op.gte]: last24h }
      }
    });

    return {
      total: totalCount,
      unacknowledged: unacknowledgedCount,
      critical: criticalCount,
      error: errorCount,
      warning: warningCount,
      last24h: last24hCount
    };
  }

  async getLatestAlerts(deviceId = null, limit = 10) {
    const where = {};
    if (deviceId) where.deviceId = deviceId;

    return await AlertLog.findAll({
      where,
      include: [
        { model: Device, attributes: ['id', 'name'] }
      ],
      order: [['createdAt', 'DESC']],
      limit
    });
  }
}

module.exports = new AlertLogService();
