const { UpdatePolicy, Device, UpdateTask, DeviceUpdateStatus } = require('../models');
const { Op } = require('sequelize');

class UpdatePolicyService {
  async createPolicy(policyData) {
    const {
      name,
      description,
      deviceType,
      location,
      onlineStatus = 'any',
      updateStartTime = '00:00',
      updateEndTime = '23:59',
      allowedDays = [0, 1, 2, 3, 4, 5, 6],
      maxConcurrent = 10,
      retryMaxAttempts = 3,
      retryInterval = 300,
      retryBackoffMultiplier = 2.0,
      retryMaxInterval = 3600,
      alertOnFailure = true,
      alertThreshold = 2,
      priority = 10,
      isActive = true
    } = policyData;

    if (!name) {
      throw new Error('Policy name is required');
    }

    if (!this.validateTimeFormat(updateStartTime) || !this.validateTimeFormat(updateEndTime)) {
      throw new Error('Invalid time format. Use HH:MM');
    }

    if (!this.validateDays(allowedDays)) {
      throw new Error('Invalid allowedDays. Must be array of 0-6');
    }

    const existingPolicy = await UpdatePolicy.findOne({
      where: { name }
    });

    if (existingPolicy) {
      throw new Error('Policy with same name already exists');
    }

    const policy = await UpdatePolicy.create({
      name,
      description,
      deviceType,
      location,
      onlineStatus,
      updateStartTime,
      updateEndTime,
      allowedDays,
      maxConcurrent,
      retryMaxAttempts,
      retryInterval,
      retryBackoffMultiplier,
      retryMaxInterval,
      alertOnFailure,
      alertThreshold,
      priority,
      isActive
    });

    return policy;
  }

  async updatePolicy(policyId, updateData) {
    const policy = await UpdatePolicy.findByPk(policyId);
    if (!policy) {
      throw new Error('Policy not found');
    }

    const allowedFields = [
      'name', 'description', 'deviceType', 'location', 'onlineStatus',
      'updateStartTime', 'updateEndTime', 'allowedDays',
      'maxConcurrent', 'retryMaxAttempts', 'retryInterval',
      'retryBackoffMultiplier', 'retryMaxInterval',
      'alertOnFailure', 'alertThreshold', 'priority', 'isActive'
    ];

    const updateValues = {};
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        updateValues[field] = updateData[field];
      }
    }

    if (updateValues.updateStartTime && !this.validateTimeFormat(updateValues.updateStartTime)) {
      throw new Error('Invalid updateStartTime format. Use HH:MM');
    }

    if (updateValues.updateEndTime && !this.validateTimeFormat(updateValues.updateEndTime)) {
      throw new Error('Invalid updateEndTime format. Use HH:MM');
    }

    if (updateValues.allowedDays && !this.validateDays(updateValues.allowedDays)) {
      throw new Error('Invalid allowedDays. Must be array of 0-6');
    }

    await policy.update(updateValues);

    return policy;
  }

  async deletePolicy(policyId) {
    const policy = await UpdatePolicy.findByPk(policyId);
    if (!policy) {
      throw new Error('Policy not found');
    }

    await policy.destroy();
    return true;
  }

  async getPolicy(policyId) {
    const policy = await UpdatePolicy.findByPk(policyId);
    if (!policy) {
      throw new Error('Policy not found');
    }
    return policy;
  }

  async getPolicyList(filters = {}, page = 1, pageSize = 20) {
    const { isActive, deviceType, location, onlineStatus } = filters;
    const where = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }
    if (deviceType) {
      where.deviceType = deviceType;
    }
    if (location) {
      where.location = location;
    }
    if (onlineStatus) {
      where.onlineStatus = onlineStatus;
    }

    const offset = (page - 1) * pageSize;

    const { count, rows } = await UpdatePolicy.findAndCountAll({
      where,
      order: [['priority', 'DESC'], ['createdAt', 'DESC']],
      limit: pageSize,
      offset
    });

    return {
      total: count,
      page,
      pageSize,
      totalPages: Math.ceil(count / pageSize),
      policies: rows
    };
  }

  async matchPolicyForDevice(device) {
    const policies = await UpdatePolicy.findAll({
      where: { isActive: true },
      order: [['priority', 'DESC'], ['createdAt', 'DESC']]
    });

    for (const policy of policies) {
      if (this.doesDeviceMatchPolicy(device, policy)) {
        return policy;
      }
    }

    return await this.getDefaultPolicy();
  }

  async getDefaultPolicy() {
    let defaultPolicy = await UpdatePolicy.findOne({
      where: {
        isActive: true,
        deviceType: null,
        location: null,
        onlineStatus: 'any'
      },
      order: [['priority', 'DESC']]
    });

    if (!defaultPolicy) {
      defaultPolicy = await this.createPolicy({
        name: 'Default Policy',
        description: '默认更新策略',
        updateStartTime: '00:00',
        updateEndTime: '23:59',
        maxConcurrent: 100,
        retryMaxAttempts: 3,
        retryInterval: 300,
        priority: 0,
        isActive: true
      });
    }

    return defaultPolicy;
  }

  doesDeviceMatchPolicy(device, policy) {
    if (policy.deviceType && policy.deviceType !== device.deviceType) {
      return false;
    }

    if (policy.location && policy.location !== device.location) {
      return false;
    }

    if (policy.onlineStatus !== 'any' && policy.onlineStatus !== device.status) {
      return false;
    }

    return true;
  }

  async isUpdateTimeAllowed(policy) {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (!policy.allowedDays.includes(currentDay)) {
      return {
        allowed: false,
        reason: 'Not in allowed days',
        nextAllowedDay: this.getNextAllowedDay(currentDay, policy.allowedDays)
      };
    }

    if (currentTime < policy.updateStartTime || currentTime > policy.updateEndTime) {
      return {
        allowed: false,
        reason: 'Not in update time window',
        nextAllowedTime: policy.updateStartTime
      };
    }

    return {
      allowed: true,
      reason: 'Update allowed'
    };
  }

  getNextAllowedDay(currentDay, allowedDays) {
    for (let i = 1; i <= 7; i++) {
      const nextDay = (currentDay + i) % 7;
      if (allowedDays.includes(nextDay)) {
        return nextDay;
      }
    }
    return null;
  }

  async checkConcurrentLimit(policy) {
    const activeTasks = await DeviceUpdateStatus.count({
      where: {
        status: {
          [Op.in]: ['downloading', 'installing']
        }
      }
    });

    return {
      current: activeTasks,
      max: policy.maxConcurrent,
      canStart: activeTasks < policy.maxConcurrent
    };
  }

  async getDevicesMatchingPolicy(policyId) {
    const policy = await UpdatePolicy.findByPk(policyId);
    if (!policy) {
      throw new Error('Policy not found');
    }

    const where = {};
    
    if (policy.deviceType) {
      where.deviceType = policy.deviceType;
    }
    if (policy.location) {
      where.location = policy.location;
    }
    if (policy.onlineStatus !== 'any') {
      where.status = policy.onlineStatus;
    }

    const devices = await Device.findAll({
      where,
      order: [['lastSeen', 'DESC']]
    });

    return devices;
  }

  calculateRetryInterval(policy, attempt) {
    const baseInterval = policy.retryInterval;
    const multiplier = policy.retryBackoffMultiplier;
    const maxInterval = policy.retryMaxInterval;

    let interval = baseInterval * Math.pow(multiplier, attempt - 1);
    
    if (interval > maxInterval) {
      interval = maxInterval;
    }

    return Math.floor(interval);
  }

  validateTimeFormat(time) {
    const regex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return regex.test(time);
  }

  validateDays(days) {
    if (!Array.isArray(days)) return false;
    return days.every(day => Number.isInteger(day) && day >= 0 && day <= 6);
  }
}

module.exports = new UpdatePolicyService();
