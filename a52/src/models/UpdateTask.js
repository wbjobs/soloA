const { DataTypes } = require('sequelize');
const { sequelize } = require('../database');

const UpdateTask = sequelize.define('UpdateTask', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  firmwareId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'firmware_id'
  },
  deviceIds: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: false,
    field: 'device_ids'
  },
  updateType: {
    type: DataTypes.ENUM('full', 'delta'),
    defaultValue: 'full',
    field: 'update_type'
  },
  status: {
    type: DataTypes.ENUM(
      'pending',
      'in_progress',
      'completed',
      'failed',
      'cancelled',
      'rolled_back'
    ),
    defaultValue: 'pending'
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
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'update_tasks',
  timestamps: true,
  underscored: true
});

module.exports = UpdateTask;
