const { DataTypes } = require('sequelize');
const { sequelize } = require('../database');

const DeviceVersionHistory = sequelize.define('DeviceVersionHistory', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  deviceId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'device_id'
  },
  firmwareId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'firmware_id'
  },
  version: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('current', 'previous', 'rolled_back'),
    defaultValue: 'current'
  },
  installedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'installed_at'
  },
  rolledBackAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'rolled_back_at'
  }
}, {
  tableName: 'device_version_histories',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['device_id']
    }
  ]
});

module.exports = DeviceVersionHistory;
