const { DataTypes } = require('sequelize');
const { sequelize } = require('../database');

const UpdatePolicy = sequelize.define('UpdatePolicy', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  deviceType: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'device_type',
    comment: '设备型号，为空则匹配所有型号'
  },
  location: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: '地理位置，如机房、区域等，为空则匹配所有位置'
  },
  onlineStatus: {
    type: DataTypes.ENUM('online', 'offline', 'any'),
    defaultValue: 'any',
    field: 'online_status',
    comment: '在线状态筛选'
  },
  updateStartTime: {
    type: DataTypes.STRING(5),
    defaultValue: '00:00',
    field: 'update_start_time',
    comment: '每日更新开始时间，格式 HH:MM'
  },
  updateEndTime: {
    type: DataTypes.STRING(5),
    defaultValue: '23:59',
    field: 'update_end_time',
    comment: '每日更新结束时间，格式 HH:MM'
  },
  allowedDays: {
    type: DataTypes.ARRAY(DataTypes.INTEGER),
    defaultValue: [0, 1, 2, 3, 4, 5, 6],
    field: 'allowed_days',
    comment: '允许更新的星期，0=周日, 1=周一, ..., 6=周六'
  },
  maxConcurrent: {
    type: DataTypes.INTEGER,
    defaultValue: 10,
    field: 'max_concurrent',
    comment: '最大并发更新数'
  },
  retryMaxAttempts: {
    type: DataTypes.INTEGER,
    defaultValue: 3,
    field: 'retry_max_attempts',
    comment: '最大重试次数'
  },
  retryInterval: {
    type: DataTypes.INTEGER,
    defaultValue: 300,
    field: 'retry_interval',
    comment: '重试间隔（秒）'
  },
  retryBackoffMultiplier: {
    type: DataTypes.FLOAT,
    defaultValue: 2.0,
    field: 'retry_backoff_multiplier',
    comment: '指数退避乘数'
  },
  retryMaxInterval: {
    type: DataTypes.INTEGER,
    defaultValue: 3600,
    field: 'retry_max_interval',
    comment: '最大重试间隔（秒）'
  },
  alertOnFailure: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'alert_on_failure',
    comment: '失败时是否告警'
  },
  alertThreshold: {
    type: DataTypes.INTEGER,
    defaultValue: 2,
    field: 'alert_threshold',
    comment: '触发告警的失败次数阈值'
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 10,
    comment: '策略优先级，数值越大优先级越高'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  }
}, {
  tableName: 'update_policies',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['device_type', 'location', 'online_status']
    },
    {
      fields: ['priority']
    }
  ]
});

module.exports = UpdatePolicy;
