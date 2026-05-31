const { DataTypes } = require('sequelize');
const { sequelize } = require('../database');

const Device = sequelize.define('Device', {
  id: {
    type: DataTypes.STRING(100),
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  deviceType: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'device_type'
  },
  location: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '地理位置标识，如机房、区域等'
  },
  currentFirmwareId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'current_firmware_id'
  },
  currentVersion: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'current_version'
  },
  status: {
    type: DataTypes.ENUM('online', 'offline', 'updating', 'error'),
    defaultValue: 'offline'
  },
  lastSeen: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_seen'
  }
}, {
  tableName: 'devices',
  timestamps: true,
  underscored: true
});

module.exports = Device;
