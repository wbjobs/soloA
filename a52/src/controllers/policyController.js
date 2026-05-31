const updatePolicyService = require('../services/updatePolicyService');
const alertLogService = require('../services/alertLogService');
const retryService = require('../services/retryService');

class PolicyController {
  async createPolicy(req, res) {
    try {
      const {
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
      } = req.body;

      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Policy name is required'
        });
      }

      const policy = await updatePolicyService.createPolicy({
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

      res.status(201).json({
        success: true,
        data: policy
      });
    } catch (error) {
      console.error('Create policy error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async updatePolicy(req, res) {
    try {
      const { id } = req.params;
      const policy = await updatePolicyService.updatePolicy(id, req.body);

      res.json({
        success: true,
        data: policy
      });
    } catch (error) {
      console.error('Update policy error:', error);
      if (error.message === 'Policy not found') {
        return res.status(404).json({ success: false, error: error.message });
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async deletePolicy(req, res) {
    try {
      const { id } = req.params;
      await updatePolicyService.deletePolicy(id);

      res.json({
        success: true,
        message: 'Policy deleted successfully'
      });
    } catch (error) {
      console.error('Delete policy error:', error);
      if (error.message === 'Policy not found') {
        return res.status(404).json({ success: false, error: error.message });
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getPolicy(req, res) {
    try {
      const { id } = req.params;
      const policy = await updatePolicyService.getPolicy(id);

      res.json({
        success: true,
        data: policy
      });
    } catch (error) {
      console.error('Get policy error:', error);
      if (error.message === 'Policy not found') {
        return res.status(404).json({ success: false, error: error.message });
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getPolicyList(req, res) {
    try {
      const { 
        isActive, 
        deviceType, 
        location, 
        onlineStatus,
        page = 1, 
        pageSize = 20 
      } = req.query;

      const result = await updatePolicyService.getPolicyList(
        { isActive, deviceType, location, onlineStatus },
        parseInt(page),
        parseInt(pageSize)
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get policy list error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async checkPolicyMatch(req, res) {
    try {
      const { deviceId } = req.params;
      const { Device } = require('../models');
      
      const device = await Device.findByPk(deviceId);
      if (!device) {
        return res.status(404).json({
          success: false,
          error: 'Device not found'
        });
      }

      const policy = await updatePolicyService.matchPolicyForDevice(device);
      const timeCheck = await updatePolicyService.isUpdateTimeAllowed(policy);
      const concurrentCheck = await updatePolicyService.checkConcurrentLimit(policy);

      res.json({
        success: true,
        data: {
          policy,
          timeCheck,
          concurrentCheck,
          device
        }
      });
    } catch (error) {
      console.error('Check policy match error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getPolicyDevices(req, res) {
    try {
      const { id } = req.params;
      const devices = await updatePolicyService.getDevicesMatchingPolicy(id);

      res.json({
        success: true,
        data: devices
      });
    } catch (error) {
      console.error('Get policy devices error:', error);
      if (error.message === 'Policy not found') {
        return res.status(404).json({ success: false, error: error.message });
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

class AlertController {
  async getAlert(req, res) {
    try {
      const { id } = req.params;
      const alert = await alertLogService.getAlert(id);

      res.json({
        success: true,
        data: alert
      });
    } catch (error) {
      console.error('Get alert error:', error);
      if (error.message === 'Alert not found') {
        return res.status(404).json({ success: false, error: error.message });
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getAlertList(req, res) {
    try {
      const {
        level,
        type,
        deviceId,
        taskId,
        policyId,
        acknowledged,
        startDate,
        endDate,
        page = 1,
        pageSize = 20
      } = req.query;

      const result = await alertLogService.getAlertList(
        { level, type, deviceId, taskId, policyId, acknowledged, startDate, endDate },
        parseInt(page),
        parseInt(pageSize)
      );

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Get alert list error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async acknowledgeAlert(req, res) {
    try {
      const { id } = req.params;
      const { acknowledgedBy } = req.body;

      const alert = await alertLogService.acknowledgeAlert(id, acknowledgedBy);

      res.json({
        success: true,
        data: alert
      });
    } catch (error) {
      console.error('Acknowledge alert error:', error);
      if (error.message === 'Alert not found') {
        return res.status(404).json({ success: false, error: error.message });
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async acknowledgeAlerts(req, res) {
    try {
      const { alertIds, acknowledgedBy } = req.body;

      if (!alertIds || !Array.isArray(alertIds) || alertIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'alertIds array is required'
        });
      }

      const count = await alertLogService.acknowledgeAlerts(alertIds, acknowledgedBy);

      res.json({
        success: true,
        data: {
          acknowledgedCount: count
        }
      });
    } catch (error) {
      console.error('Acknowledge alerts error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async acknowledgeAll(req, res) {
    try {
      const { acknowledgedBy, level, type, deviceId } = req.body;

      const count = await alertLogService.acknowledgeAllAlerts(acknowledgedBy, {
        level,
        type,
        deviceId
      });

      res.json({
        success: true,
        data: {
          acknowledgedCount: count
        }
      });
    } catch (error) {
      console.error('Acknowledge all alerts error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async deleteAlert(req, res) {
    try {
      const { id } = req.params;
      await alertLogService.deleteAlert(id);

      res.json({
        success: true,
        message: 'Alert deleted successfully'
      });
    } catch (error) {
      console.error('Delete alert error:', error);
      if (error.message === 'Alert not found') {
        return res.status(404).json({ success: false, error: error.message });
      }
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getAlertStats(req, res) {
    try {
      const { deviceId } = req.query;
      const stats = await alertLogService.getAlertStats(deviceId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Get alert stats error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getLatestAlerts(req, res) {
    try {
      const { deviceId, limit = 10 } = req.query;
      const alerts = await alertLogService.getLatestAlerts(deviceId, parseInt(limit));

      res.json({
        success: true,
        data: alerts
      });
    } catch (error) {
      console.error('Get latest alerts error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

class RetryController {
  async getRetryStatus(req, res) {
    try {
      const { taskId, deviceId } = req.params;
      const status = await retryService.getRetryStatus(taskId, deviceId);

      if (!status) {
        return res.status(404).json({
          success: false,
          error: 'No pending retry found'
        });
      }

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('Get retry status error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getAllRetries(req, res) {
    try {
      const { taskId } = req.query;
      const retries = await retryService.getAllRetries(taskId);

      res.json({
        success: true,
        data: retries
      });
    } catch (error) {
      console.error('Get all retries error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async cancelRetry(req, res) {
    try {
      const { taskId, deviceId } = req.params;
      await retryService.cancelRetry(taskId, deviceId);

      res.json({
        success: true,
        message: 'Retry cancelled successfully'
      });
    } catch (error) {
      console.error('Cancel retry error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async cancelAllRetries(req, res) {
    try {
      const { taskId } = req.params;
      await retryService.cancelAllRetries(taskId);

      res.json({
        success: true,
        message: 'All retries cancelled successfully'
      });
    } catch (error) {
      console.error('Cancel all retries error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = {
  PolicyController: new PolicyController(),
  AlertController: new AlertController(),
  RetryController: new RetryController()
};
