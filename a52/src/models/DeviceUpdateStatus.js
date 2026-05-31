const { DataTypes } = require('sequelize');
const { sequelize } = require('../database');

const DeviceUpdateStatus = sequelize.define('DeviceUpdateStatus', {
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
  taskId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'task_id'
  },
  status: {
    type: DataTypes.ENUM(
      'pending',
      'downloading',
      'downloaded',
      'installing',
      'installed',
      'completed',
      'failed',
      'cancelled',
      'rolled_back'
    ),
    defaultValue: 'pending'
  },
  currentChunk: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'current_chunk'
  },
  totalChunks: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'total_chunks'
  },
  progress: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'error_message'
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'started_at'
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'completed_at'
  }
}, {
  tableName: 'device_update_statuses',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['device_id', 'task_id']
    }
  ]
});

module.exports = DeviceUpdateStatus;
