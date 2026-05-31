const { DataTypes } = require('sequelize');
const { sequelize } = require('../database');

const Firmware = sequelize.define('Firmware', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  version: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  deviceType: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'device_type'
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
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_active'
  },
  releasedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'released_at'
  }
}, {
  tableName: 'firmwares',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['version', 'device_type']
    }
  ]
});

module.exports = Firmware;
