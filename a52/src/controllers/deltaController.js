const { DeltaPackage, Firmware } = require('../models');
const deltaService = require('../services/deltaService');
const signatureService = require('../services/signatureService');
const fs = require('fs');
const path = require('path');
const config = require('../config');

class DeltaController {
  async generateDelta(req, res) {
    try {
      const { fromFirmwareId, toFirmwareId } = req.body;

      if (!fromFirmwareId || !toFirmwareId) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: fromFirmwareId, toFirmwareId'
        });
      }

      const fromFirmware = await Firmware.findByPk(fromFirmwareId);
      const toFirmware = await Firmware.findByPk(toFirmwareId);

      if (!fromFirmware || !toFirmware) {
        return res.status(404).json({
          success: false,
          error: 'Firmware not found'
        });
      }

      if (fromFirmware.deviceType !== toFirmware.deviceType) {
        return res.status(400).json({
          success: false,
          error: 'Firmware device types do not match'
        });
      }

      const existingDelta = await DeltaPackage.findOne({
        where: { fromFirmwareId, toFirmwareId }
      });

      if (existingDelta) {
        return res.status(200).json({
          success: true,
          data: existingDelta,
          message: 'Delta package already exists'
        });
      }

      const deltaPackage = await DeltaPackage.create({
        fromFirmwareId,
        toFirmwareId,
        filePath: '',
        fileSize: 0,
        checksum: '',
        signature: '',
        status: 'generating'
      });

      this._generateDeltaAsync(deltaPackage, fromFirmware, toFirmware);

      res.status(202).json({
        success: true,
        data: deltaPackage,
        message: 'Delta package generation started'
      });
    } catch (error) {
      console.error('Generate delta error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async _generateDeltaAsync(deltaPackage, fromFirmware, toFirmware) {
    try {
      const deltaDir = path.join(
        config.storage.firmwarePath,
        toFirmware.deviceType,
        'deltas'
      );
      
      if (!fs.existsSync(deltaDir)) {
        fs.mkdirSync(deltaDir, { recursive: true });
      }

      const deltaPath = path.join(
        deltaDir,
        `${fromFirmware.version}_to_${toFirmware.version}.patch`
      );

      const result = await deltaService.generateDelta(
        fromFirmware.filePath,
        toFirmware.filePath,
        deltaPath
      );

      const checksum = await signatureService.calculateFileChecksum(deltaPath);
      const signature = await signatureService.signFile(deltaPath);

      deltaPackage.filePath = result.deltaPath;
      deltaPackage.fileSize = result.size;
      deltaPackage.checksum = checksum;
      deltaPackage.signature = signature;
      deltaPackage.status = 'ready';
      await deltaPackage.save();

      const compressionInfo = deltaService.calculateCompressionRatio(
        toFirmware.fileSize,
        result.size
      );
      console.log(`Delta generated: ${compressionInfo.ratio}% compression`);
    } catch (error) {
      console.error('Delta generation failed:', error);
      deltaPackage.status = 'failed';
      await deltaPackage.save();
    }
  }

  async getDeltaList(req, res) {
    try {
      const { fromFirmwareId, toFirmwareId, status, page = 1, pageSize = 20 } = req.query;
      const where = {};

      if (fromFirmwareId) {
        where.fromFirmwareId = fromFirmwareId;
      }

      if (toFirmwareId) {
        where.toFirmwareId = toFirmwareId;
      }

      if (status) {
        where.status = status;
      }

      const offset = (parseInt(page) - 1) * parseInt(pageSize);

      const { count, rows } = await DeltaPackage.findAndCountAll({
        where,
        include: [
          { model: Firmware, as: 'fromFirmware' },
          { model: Firmware, as: 'toFirmware' }
        ],
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
          deltas: rows
        }
      });
    } catch (error) {
      console.error('Get delta list error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async getDelta(req, res) {
    try {
      const { id } = req.params;
      const delta = await DeltaPackage.findByPk(id, {
        include: [
          { model: Firmware, as: 'fromFirmware' },
          { model: Firmware, as: 'toFirmware' }
        ]
      });

      if (!delta) {
        return res.status(404).json({
          success: false,
          error: 'Delta package not found'
        });
      }

      res.json({
        success: true,
        data: delta
      });
    } catch (error) {
      console.error('Get delta error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async downloadDelta(req, res) {
    try {
      const { id } = req.params;
      const delta = await DeltaPackage.findByPk(id);

      if (!delta) {
        return res.status(404).json({
          success: false,
          error: 'Delta package not found'
        });
      }

      if (delta.status !== 'ready') {
        return res.status(400).json({
          success: false,
          error: 'Delta package is not ready'
        });
      }

      if (!fs.existsSync(delta.filePath)) {
        return res.status(404).json({
          success: false,
          error: 'Delta file not found'
        });
      }

      res.download(delta.filePath, path.basename(delta.filePath));
    } catch (error) {
      console.error('Download delta error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async deleteDelta(req, res) {
    try {
      const { id } = req.params;
      const delta = await DeltaPackage.findByPk(id);

      if (!delta) {
        return res.status(404).json({
          success: false,
          error: 'Delta package not found'
        });
      }

      if (fs.existsSync(delta.filePath)) {
        fs.unlinkSync(delta.filePath);
      }

      await delta.destroy();

      res.json({
        success: true,
        message: 'Delta package deleted successfully'
      });
    } catch (error) {
      console.error('Delete delta error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new DeltaController();
