const redis = require('redis');
const config = require('../config');
const { ChunkDownloadRecord, DeviceUpdateStatus } = require('../models');

class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    const options = {
      url: `redis://${config.redis.host}:${config.redis.port}`
    };
    
    if (config.redis.password) {
      options.password = config.redis.password;
    }

    this.client = redis.createClient(options);
    
    this.client.on('error', (err) => {
      console.error('Redis connection error:', err);
      this.isConnected = false;
    });
    
    this.client.on('connect', () => {
      console.log('Redis connected successfully');
      this.isConnected = true;
    });
    
    this.client.on('end', () => {
      console.log('Redis connection closed');
      this.isConnected = false;
    });

    await this.client.connect();
    this.isConnected = true;
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  async get(key) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key, value, ttl = null) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }
    const stringValue = JSON.stringify(value);
    if (ttl) {
      await this.client.setEx(key, ttl, stringValue);
    } else {
      await this.client.set(key, stringValue);
    }
  }

  async del(key) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }
    await this.client.del(key);
  }

  async exists(key) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }
    return await this.client.exists(key);
  }

  async expire(key, ttl) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }
    await this.client.expire(key, ttl);
  }

  async hSet(key, field, value) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }
    await this.client.hSet(key, field, JSON.stringify(value));
  }

  async hGet(key, field) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }
    const value = await this.client.hGet(key, field);
    return value ? JSON.parse(value) : null;
  }

  async hGetAll(key) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }
    const result = await this.client.hGetAll(key);
    const parsed = {};
    for (const [field, value] of Object.entries(result)) {
      parsed[field] = JSON.parse(value);
    }
    return parsed;
  }

  async hDel(key, field) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }
    await this.client.hDel(key, field);
  }

  async lPush(key, value) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }
    await this.client.lPush(key, JSON.stringify(value));
  }

  async rPop(key) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }
    const value = await this.client.rPop(key);
    return value ? JSON.parse(value) : null;
  }

  async lLen(key) {
    if (!this.isConnected) {
      throw new Error('Redis not connected');
    }
    return await this.client.lLen(key);
  }

  async setDeviceStatus(deviceId, status) {
    const key = `device:status:${deviceId}`;
    await this.set(key, {
      ...status,
      updatedAt: Date.now()
    }, 86400);
  }

  async getDeviceStatus(deviceId) {
    const key = `device:status:${deviceId}`;
    return await this.get(key);
  }

  async setTaskProgress(taskId, progress) {
    const key = `task:progress:${taskId}`;
    await this.set(key, {
      ...progress,
      updatedAt: Date.now()
    });
  }

  async getTaskProgress(taskId) {
    const key = `task:progress:${taskId}`;
    return await this.get(key);
  }

  async setChunkInfo(taskId, deviceId, chunkIndex, chunkInfo) {
    const redisKey = `task:chunks:${taskId}:${deviceId}`;
    
    try {
      await this.hSet(redisKey, `chunk:${chunkIndex}`, chunkInfo);
    } catch (redisError) {
      console.warn('Redis unavailable for chunk info, using DB only:', redisError.message);
    }
    
    try {
      await ChunkDownloadRecord.upsert({
        taskId,
        deviceId,
        chunkIndex: parseInt(chunkIndex),
        status: chunkInfo.success ? 'completed' : 'failed',
        checksum: chunkInfo.checksum,
        completedAt: new Date(chunkInfo.completedAt),
        errorMessage: chunkInfo.success ? null : 'Chunk download failed'
      });
    } catch (dbError) {
      console.error('Failed to persist chunk info to DB:', dbError.message);
    }
  }

  async getChunkInfo(taskId, deviceId, chunkIndex) {
    const redisKey = `task:chunks:${taskId}:${deviceId}`;
    
    let info = null;
    
    try {
      if (this.isConnected) {
        info = await this.hGet(redisKey, `chunk:${chunkIndex}`);
      }
    } catch (redisError) {
      console.warn('Redis unavailable, recovering from DB:', redisError.message);
    }
    
    if (!info) {
      const record = await ChunkDownloadRecord.findOne({
        where: {
          taskId,
          deviceId,
          chunkIndex: parseInt(chunkIndex)
        }
      });
      
      if (record) {
        info = {
          success: record.status === 'completed',
          checksum: record.checksum,
          completedAt: record.completedAt ? record.completedAt.getTime() : null,
          recoveredFromDB: true
        };
        
        try {
          if (this.isConnected) {
            await this.hSet(redisKey, `chunk:${chunkIndex}`, info);
          }
        } catch (e) {
        }
      }
    }
    
    return info;
  }

  async getAllChunkInfo(taskId, deviceId) {
    const redisKey = `task:chunks:${taskId}:${deviceId}`;
    
    let allInfo = {};
    let fromRedis = false;
    
    try {
      if (this.isConnected) {
        allInfo = await this.hGetAll(redisKey);
        fromRedis = Object.keys(allInfo).length > 0;
      }
    } catch (redisError) {
      console.warn('Redis unavailable, recovering from DB:', redisError.message);
    }
    
    if (!fromRedis) {
      const records = await ChunkDownloadRecord.findAll({
        where: {
          taskId,
          deviceId
        },
        order: [['chunkIndex', 'ASC']]
      });
      
      for (const record of records) {
        allInfo[`chunk:${record.chunkIndex}`] = {
          success: record.status === 'completed',
          checksum: record.checksum,
          completedAt: record.completedAt ? record.completedAt.getTime() : null,
          recoveredFromDB: true
        };
      }
      
      if (Object.keys(allInfo).length > 0 && this.isConnected) {
        try {
          for (const [field, value] of Object.entries(allInfo)) {
            await this.hSet(redisKey, field, value);
          }
        } catch (e) {
        }
      }
    }
    
    return allInfo;
  }

  async getCompletedChunkCount(taskId, deviceId) {
    const records = await ChunkDownloadRecord.findAll({
      where: {
        taskId,
        deviceId,
        status: 'completed'
      }
    });
    
    return records.length;
  }

  async getNextChunkToDownload(taskId, deviceId, totalChunks) {
    const redisKey = `task:chunks:${taskId}:${deviceId}`;
    
    let completedChunks = new Set();
    
    try {
      if (this.isConnected) {
        const cached = await this.hGetAll(redisKey);
        for (const [key, info] of Object.entries(cached)) {
          if (info.success) {
            const match = key.match(/chunk:(\d+)/);
            if (match) {
              completedChunks.add(parseInt(match[1]));
            }
          }
        }
      }
    } catch (e) {
    }
    
    const dbRecords = await ChunkDownloadRecord.findAll({
      where: {
        taskId,
        deviceId,
        status: 'completed'
      },
      attributes: ['chunkIndex']
    });
    
    for (const record of dbRecords) {
      completedChunks.add(record.chunkIndex);
    }
    
    for (let i = 0; i < totalChunks; i++) {
      if (!completedChunks.has(i)) {
        return i;
      }
    }
    
    return -1;
  }

  async clearChunkInfo(taskId, deviceId) {
    const redisKey = `task:chunks:${taskId}:${deviceId}`;
    
    try {
      if (this.isConnected) {
        await this.del(redisKey);
      }
    } catch (e) {
      console.warn('Failed to clear Redis chunk info:', e.message);
    }
  }

  async clearAllChunkInfo(taskId) {
    const redisPattern = `task:chunks:${taskId}:*`;
    
    try {
      if (this.isConnected) {
        const keys = await this.client.keys(redisPattern);
        if (keys.length > 0) {
          await this.client.del(keys);
        }
      }
    } catch (e) {
      console.warn('Failed to clear Redis chunk info:', e.message);
    }
    
    try {
      await ChunkDownloadRecord.destroy({
        where: { taskId }
      });
    } catch (e) {
      console.error('Failed to clear DB chunk records:', e.message);
    }
  }

  async recoverFromPersistence(taskId, deviceId) {
    const deviceStatus = await DeviceUpdateStatus.findOne({
      where: { taskId, deviceId }
    });
    
    if (!deviceStatus) {
      return null;
    }
    
    const chunkRecords = await ChunkDownloadRecord.findAll({
      where: {
        taskId,
        deviceId,
        status: 'completed'
      },
      order: [['chunkIndex', 'ASC']]
    });
    
    const completedChunks = new Set(chunkRecords.map(r => r.chunkIndex));
    const nextChunk = await this.getNextChunkToDownload(taskId, deviceId, deviceStatus.totalChunks);
    
    const status = {
      taskId,
      status: deviceStatus.status,
      currentChunk: nextChunk >= 0 ? nextChunk : deviceStatus.currentChunk,
      totalChunks: deviceStatus.totalChunks,
      progress: deviceStatus.progress,
      recoveredFromDB: true,
      completedChunkCount: completedChunks.size
    };
    
    await this.setDeviceStatus(deviceId, status);
    
    return status;
  }
}

module.exports = new RedisService();
