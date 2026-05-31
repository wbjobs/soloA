const { DataTypes } = require('sequelize');
const { sequelize } = require('../database');

const DeltaPackage = sequelize.define('DeltaPackage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  fromFirmwareId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'from_firmware_id'
  },
  toFirmwareId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'to_firmware_id'
  },
  filePath: {
    type: DataTypes.STRING(500),
    allowNull: false,
    field: 'file_path'
  },
  fileSize: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'file_size'
  },
  checksum: {
    type: DataTypes.STRING(64),
    allowNull: false
  },
  signature: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'generating', 'ready', 'failed'),
    defaultValue: 'pending'
  }
}, {
  tableName: 'delta_packages',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['from_firmware_id', 'to_firmware_id']
    }
  ]
});

module.exports = DeltaPackage;
