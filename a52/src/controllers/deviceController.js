const { Device, Firmware } = require('../models');

class DeviceController {
  async registerDevice(req, res) {
    try {
      const { id, name, deviceType, currentVersion } = req.body;

      if (!id || !deviceType) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: id, deviceType'
        });
      }

      let device = await Device.findByPk(id);

      if (device) {
        device.name = name || device.name;
        device.deviceType = deviceType;
        device.lastSeen = new Date();
        device.status = 'online';
        if (currentVersion) {
          device.currentVersion = currentVersion;
        }
        await device.save();
      } else {
        device = await Device.create({
          id,
          name,
          deviceType,
          currentVersion,
          status: 'online',
          lastSeen: new Date()
        });
      }

      res.json({
        success: true,
        data: device
      });
    } catch (error) {
      console.error('Register device error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getDevice(req, res) {
    try {
      const { id } = req.params;
      const device = await Device.findByPk(id, {
        include: [{ model: Firmware, as: 'currentFirmware' }]
      });

      if (!device) {
        return res.status(404).json({
          success: false,
          error: 'Device not found'
        });
      }

      res.json({
        success: true,
        data: device
      });
    } catch (error) {
      console.error('Get device error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getDeviceList(req, res) {
    try {
      const { deviceType, status, page = 1, pageSize = 20 } = req.query;
      const where = {};

      if (deviceType) {
        where.deviceType = deviceType;
      }

      if (status) {
        where.status = status;
      }

      const offset = (parseInt(page) - 1) * parseInt(pageSize);

      const { count, rows } = await Device.findAndCountAll({
        where,
        include: [{ model: Firmware, as: 'currentFirmware' }],
        order: [['lastSeen', 'DESC']],
        limit: parseInt(pageSize),
        offset
      });

      res.json({
        success: true,
        data: {
          total: count,
          page: parseInt(page),
          pageSize: parseInt(pageSize),
          totalPages: Math.ceil(count / parseInt(pageSize)),
          devices: rows
        }
      });
    } catch (error) {
      console.error('Get device list error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async updateDeviceStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, currentVersion } = req.body;

      const device = await Device.findByPk(id);
      if (!device) {
        return res.status(404).json({
          success: false,
          error: 'Device not found'
        });
      }

      if (status) {
        device.status = status;
      }
      if (currentVersion) {
        device.currentVersion = currentVersion;
      }
      device.lastSeen = new Date();
      await device.save();

      res.json({
        success: true,
        data: device
      });
    } catch (error) {
      console.error('Update device status error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async deleteDevice(req, res) {
    try {
      const { id } = req.params;
      const device = await Device.findByPk(id);

      if (!device) {
        return res.status(404).json({
          success: false,
          error: 'Device not found'
        });
      }

      await device.destroy();

      res.json({
        success: true,
        message: 'Device deleted successfully'
      });
    } catch (error) {
      console.error('Delete device error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async heartbeat(req, res) {
    try {
      const { id } = req.params;
      const { status, currentVersion, deviceType, autoRegister = false, name } = req.body;

      let device = await Device.findByPk(id);
      
      if (!device) {
        if (autoRegister && deviceType) {
          device = await Device.create({
            id,
            name: name || id,
            deviceType,
            currentVersion,
            status: status || 'online',
            lastSeen: new Date()
          });
          console.log(`Auto-registered device via heartbeat: ${id}`);
        } else {
          return res.status(404).json({
            success: false,
            error: 'Device not found. Use autoRegister=true with deviceType to auto-register'
          });
        }
      } else {
        device.lastSeen = new Date();
        if (status) {
          device.status = status;
        }
        if (currentVersion) {
          device.currentVersion = currentVersion;
        }
        if (deviceType) {
          device.deviceType = deviceType;
        }
        if (name) {
          device.name = name;
        }
        await device.save();
      }

      res.json({
        success: true,
        data: {
          timestamp: new Date().toISOString(),
          isNew: !device.createdAt || device.createdAt.getTime() === device.updatedAt.getTime()
        }
      });
    } catch (error) {
      console.error('Heartbeat error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new DeviceController();
