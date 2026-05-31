const { DataTypes } = require('sequelize');
const { sequelize } = require('../database');

const AlertLog = sequelize.define('AlertLog', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  level: {
    type: DataTypes.ENUM('info', 'warning', 'error', 'critical'),
    defaultValue: 'warning'
  },
  type: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: '告警类型：UPDATE_FAILED, RETRY_FAILED, POLICY_VIOLATION, DEVICE_OFFLINE'
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  deviceId: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'device_id'
  },
  taskId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'task_id'
  },
  policyId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'policy_id'
  },
  retryCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'retry_count'
  },
  maxRetries: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'max_retries'
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: '附加信息，如错误详情、设备信息等'
  },
  acknowledged: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  acknowledgedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'acknowledged_at'
  },
  acknowledgedBy: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'acknowledged_by'
  }
}, {
  tableName: 'alert_logs',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['level', 'created_at']
    },
    {
      fields: ['device_id', 'task_id']
    },
    {
      fields: ['type', 'created_at']
    }
  ]
});

module.exports = AlertLog;
