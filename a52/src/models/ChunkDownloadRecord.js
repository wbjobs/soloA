const { DataTypes } = require('sequelize');
const { sequelize } = require('../database');

const ChunkDownloadRecord = sequelize.define('ChunkDownloadRecord', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true
  },
  taskId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'task_id'
  },
  deviceId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'device_id'
  },
  chunkIndex: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'chunk_index'
  },
  status: {
    type: DataTypes.ENUM('pending', 'downloading', 'completed', 'failed'),
    defaultValue: 'pending'
  },
  checksum: {
    type: DataTypes.STRING(64),
    allowNull: true
  },
  downloadTime: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'download_time'
  },
  retryCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'retry_count'
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'error_message'
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'completed_at'
  }
}, {
  tableName: 'chunk_download_records',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['task_id', 'device_id', 'chunk_index']
    },
    {
      fields: ['task_id', 'device_id']
    }
  ]
});

module.exports = ChunkDownloadRecord;
