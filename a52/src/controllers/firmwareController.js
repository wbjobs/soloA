const { Firmware } = require('../models');
const signatureService = require('../services/signatureService');
const fs = require('fs');
const path = require('path');
const config = require('../config');

class FirmwareController {
  async uploadFirmware(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No firmware file provided'
        });
      }

      const { name, version, deviceType, description } = req.body;

      if (!name || !version || !deviceType) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: name, version, deviceType'
        });
      }

      const existingFirmware = await Firmware.findOne({
        where: { version, deviceType }
      });

      if (existingFirmware) {
        fs.unlinkSync(req.file.path);
        return res.status(409).json({
          success: false,
          error: 'Firmware with same version and device type already exists'
        });
      }

      const checksum = await signatureService.calculateFileChecksum(req.file.path);
      const signature = await signatureService.signFile(req.file.path);

      const firmwareDir = path.join(config.storage.firmwarePath, deviceType, version);
      if (!fs.existsSync(firmwareDir)) {
        fs.mkdirSync(firmwareDir, { recursive: true });
      }

      const finalPath = path.join(firmwareDir, path.basename(req.file.path));
      fs.renameSync(req.file.path, finalPath);

      const firmware = await Firmware.create({
        name,
        version,
        deviceType,
        filePath: finalPath,
        fileSize: fs.statSync(finalPath).size,
        checksum,
        signature,
        description,
        isActive: false
      });

      res.status(201).json({
        success: true,
        data: firmware
      });
    } catch (error) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      console.error('Upload firmware error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getFirmwareList(req, res) {
    try {
      const { deviceType, isActive, page = 1, pageSize = 20 } = req.query;
      const where = {};

      if (deviceType) {
        where.deviceType = deviceType;
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      const offset = (parseInt(page) - 1) * parseInt(pageSize);

      const { count, rows } = await Firmware.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
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
          firmwares: rows
        }
      });
    } catch (error) {
      console.error('Get firmware list error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getFirmware(req, res) {
    try {
      const { id } = req.params;
      const firmware = await Firmware.findByPk(id);

      if (!firmware) {
        return res.status(404).json({
          success: false,
          error: 'Firmware not found'
        });
      }

      res.json({
        success: true,
        data: firmware
      });
    } catch (error) {
      console.error('Get firmware error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async activateFirmware(req, res) {
    try {
      const { id } = req.params;
      const firmware = await Firmware.findByPk(id);

      if (!firmware) {
        return res.status(404).json({
          success: false,
          error: 'Firmware not found'
        });
      }

      await Firmware.update(
        { isActive: false },
        { where: { deviceType: firmware.deviceType } }
      );

      firmware.isActive = true;
      firmware.releasedAt = new Date();
      await firmware.save();

      res.json({
        success: true,
        data: firmware
      });
    } catch (error) {
      console.error('Activate firmware error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async deleteFirmware(req, res) {
    try {
      const { id } = req.params;
      const firmware = await Firmware.findByPk(id);

      if (!firmware) {
        return res.status(404).json({
          success: false,
          error: 'Firmware not found'
        });
      }

      if (fs.existsSync(firmware.filePath)) {
        fs.unlinkSync(firmware.filePath);
      }

      await firmware.destroy();

      res.json({
        success: true,
        message: 'Firmware deleted successfully'
      });
    } catch (error) {
      console.error('Delete firmware error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async downloadFirmware(req, res) {
    try {
      const { id } = req.params;
      const firmware = await Firmware.findByPk(id);

      if (!firmware) {
        return res.status(404).json({
          success: false,
          error: 'Firmware not found'
        });
      }

      if (!fs.existsSync(firmware.filePath)) {
        return res.status(404).json({
          success: false,
          error: 'Firmware file not found'
        });
      }

      res.download(firmware.filePath, `${firmware.name}_${firmware.version}.bin`);
    } catch (error) {
      console.error('Download firmware error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getChunk(req, res) {
    try {
      const { id, chunkIndex } = req.params;
      const firmware = await Firmware.findByPk(id);

      if (!firmware) {
        return res.status(404).json({
          success: false,
          error: 'Firmware not found'
        });
      }

      if (!fs.existsSync(firmware.filePath)) {
        return res.status(404).json({
          success: false,
          error: 'Firmware file not found'
        });
      }

      const chunkSize = config.storage.chunkSize;
      const start = parseInt(chunkIndex) * chunkSize;
      const fileSize = firmware.fileSize;
      const totalChunks = Math.ceil(fileSize / chunkSize);

      if (parseInt(chunkIndex) >= totalChunks) {
        return res.status(400).json({
          success: false,
          error: 'Invalid chunk index'
        });
      }

      const end = Math.min(start + chunkSize - 1, fileSize - 1);
      const length = end - start + 1;

      const fileStream = fs.createReadStream(firmware.filePath, { start, end });

      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', length);
      res.setHeader('X-Chunk-Index', chunkIndex);
      res.setHeader('X-Total-Chunks', totalChunks);
      res.setHeader('X-File-Size', fileSize);
      res.setHeader('X-Checksum', firmware.checksum);

      fileStream.pipe(res);
    } catch (error) {
      console.error('Get chunk error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new FirmwareController();
