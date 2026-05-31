const EventEmitter = require('events');
const crypto = require('crypto');
const axios = require('axios');

class CloudSyncManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      cloudEndpoint: options.cloudEndpoint || process.env.CLOUD_ENDPOINT || 'http://localhost:8000',
      apiKey: options.apiKey || process.env.CLOUD_API_KEY || '',
      syncInterval: options.syncInterval || 5000,
      batchSize: options.batchSize || 100,
      maxRetryAttempts: options.maxRetryAttempts || 5,
      retryDelay: options.retryDelay || 3000,
      checkInterval: options.checkInterval || 10000
    };

    this.isOnline = true;
    this.isSyncing = false;
    this.lastSyncTime = null;
    this.syncInterval = null;
    this.networkCheckInterval = null;

    this.pendingData = [];
    this.syncStats = {
      totalSynced: 0,
      totalFailed: 0,
      pendingCount: 0,
      lastSyncDuration: 0
    };

    this._init();
  }

  _init() {
    this._checkNetworkStatus();
    
    this.networkCheckInterval = setInterval(() => {
      this._checkNetworkStatus();
    }, this.config.checkInterval);

    this.syncInterval = setInterval(() => {
      this.syncPendingData();
    }, this.config.syncInterval);

    console.log('云端同步管理器已启动');
  }

  async _checkNetworkStatus() {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      await axios.head(this.config.cloudEndpoint + '/health', {
        signal: controller.signal,
        timeout: 5000
      });

      clearTimeout(timeoutId);
      
      if (!this.isOnline) {
        this.isOnline = true;
        this.emit('online');
        console.log('✅ 网络已恢复，开始断点续传...');
        this.syncPendingData();
      }
    } catch (err) {
      if (this.isOnline) {
        this.isOnline = false;
        this.emit('offline');
        console.log('⚠️ 网络断开，数据将本地缓存');
      }
    }
  }

  async enqueueData(data, type = 'telemetry') {
    const record = {
      id: this._generateId(),
      type,
      data,
      timestamp: new Date().toISOString(),
      checksum: this._generateChecksum(data),
      retryCount: 0,
      status: 'pending'
    };

    this.pendingData.push(record);
    this.syncStats.pendingCount = this.pendingData.length;

    await this._saveToCache(record);

    if (this.isOnline && this.pendingData.length >= 1) {
      setImmediate(() => this.syncPendingData());
    }

    this.emit('dataQueued', record);
    return record.id;
  }

  async syncPendingData() {
    if (!this.isOnline || this.isSyncing || this.pendingData.length === 0) {
      return;
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      const batch = this.pendingData.slice(0, this.config.batchSize);
      
      const syncResult = await this._sendBatchToCloud(batch);
      
      if (syncResult.success) {
        const syncedIds = syncResult.syncedIds || batch.map(r => r.id);
        
        for (const id of syncedIds) {
          const index = this.pendingData.findIndex(r => r.id === id);
          if (index !== -1) {
            const record = this.pendingData[index];
            record.status = 'synced';
            this.pendingData.splice(index, 1);
            this.syncStats.totalSynced++;
            await this._removeFromCache(id);
          }
        }

        if (syncResult.failedIds && syncResult.failedIds.length > 0) {
          for (const id of syncResult.failedIds) {
            const record = this.pendingData.find(r => r.id === id);
            if (record) {
              record.retryCount++;
              if (record.retryCount >= this.config.maxRetryAttempts) {
                record.status = 'failed';
                this.syncStats.totalFailed++;
                console.error(`❌ 数据发送失败超过最大重试次数: ${id}`);
              }
            }
          }
        }

        this.lastSyncTime = new Date().toISOString();
        this.syncStats.lastSyncDuration = Date.now() - startTime;
        this.syncStats.pendingCount = this.pendingData.length;

        this.emit('syncSuccess', {
          syncedCount: syncedIds.length,
          pendingCount: this.pendingData.length
        });

        if (this.pendingData.length > 0) {
          setTimeout(() => this.syncPendingData(), 500);
        }

      } else {
        console.warn('云端同步失败，将在下次重试');
        this.emit('syncFailed', { error: syncResult.error });
      }

    } catch (err) {
      console.error('同步过程出错:', err.message);
      this.emit('syncError', { error: err.message });
    } finally {
      this.isSyncing = false;
    }
  }

  async _sendBatchToCloud(batch) {
    try {
      const payload = {
        records: batch.map(r => ({
          id: r.id,
          type: r.type,
          data: r.data,
          timestamp: r.timestamp,
          checksum: r.checksum
        })),
        batchChecksum: this._generateBatchChecksum(batch),
        clientId: this._getClientId(),
        timestamp: new Date().toISOString()
      };

      const response = await axios.post(
        `${this.config.cloudEndpoint}/api/v1/data/batch`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.config.apiKey
          },
          timeout: 30000
        }
      );

      return {
        success: response.status === 200,
        syncedIds: response.data?.syncedIds || [],
        failedIds: response.data?.failedIds || [],
        serverResponse: response.data
      };

    } catch (err) {
      if (err.response?.status === 409) {
        console.log('检测到重复数据，服务器已处理');
        return {
          success: true,
          syncedIds: batch.map(r => r.id),
          failedIds: []
        };
      }

      return {
        success: false,
        error: err.message,
        status: err.response?.status
      };
    }
  }

  async _saveToCache(record) {
    try {
      const db = require('../database/sqliteDb');
      if (db.db) {
        const stmt = db.db.prepare(`
          INSERT OR IGNORE INTO cloud_sync_queue 
          (id, type, data, timestamp, checksum, retry_count, status)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
          record.id,
          record.type,
          JSON.stringify(record.data),
          record.timestamp,
          record.checksum,
          record.retryCount,
          record.status
        );
      }
    } catch (err) {
      console.warn('缓存到数据库失败:', err.message);
    }
  }

  async _removeFromCache(id) {
    try {
      const db = require('../database/sqliteDb');
      if (db.db) {
        const stmt = db.db.prepare('DELETE FROM cloud_sync_queue WHERE id = ?');
        stmt.run(id);
      }
    } catch (err) {
      console.warn('从缓存删除失败:', err.message);
    }
  }

  async _loadPendingFromCache() {
    try {
      const db = require('../database/sqliteDb');
      if (db.db) {
        const stmt = db.db.prepare(`
          SELECT * FROM cloud_sync_queue 
          WHERE status = 'pending' 
          ORDER BY timestamp ASC
        `);
        const rows = stmt.all();
        
        this.pendingData = rows.map(row => ({
          id: row.id,
          type: row.type,
          data: JSON.parse(row.data),
          timestamp: row.timestamp,
          checksum: row.checksum,
          retryCount: row.retry_count,
          status: row.status
        }));
        
        this.syncStats.pendingCount = this.pendingData.length;
        console.log(`从数据库加载 ${this.pendingData.length} 条待同步数据`);
      }
    } catch (err) {
      console.warn('从缓存加载失败:', err.message);
    }
  }

  _generateId() {
    return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  }

  _generateChecksum(data) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex')
      .substring(0, 16);
  }

  _generateBatchChecksum(batch) {
    const ids = batch.map(r => r.id).sort().join(',');
    return crypto
      .createHash('sha256')
      .update(ids)
      .digest('hex')
      .substring(0, 16);
  }

  _getClientId() {
    if (!this._clientId) {
      this._clientId = `edge-${crypto.randomBytes(8).toString('hex')}`;
    }
    return this._clientId;
  }

  async verifyDataIntegrity(record, serverResponse) {
    const localChecksum = record.checksum;
    const serverChecksum = serverResponse?.checksum;
    
    if (serverChecksum && localChecksum !== serverChecksum) {
      console.error(`数据完整性校验失败: ${record.id}`);
      return false;
    }
    
    return true;
  }

  async forceSync() {
    console.log('强制同步所有待发送数据...');
    await this.syncPendingData();
  }

  getStats() {
    return {
      ...this.syncStats,
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      pendingCount: this.pendingData.length,
      config: {
        cloudEndpoint: this.config.cloudEndpoint,
        syncInterval: this.config.syncInterval,
        batchSize: this.config.batchSize
      }
    };
  }

  async initDatabase() {
    try {
      const db = require('../database/sqliteDb');
      if (db.db) {
        db.db.exec(`
          CREATE TABLE IF NOT EXISTS cloud_sync_queue (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            data TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            checksum TEXT,
            retry_count INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          
          CREATE INDEX IF NOT EXISTS idx_sync_status ON cloud_sync_queue(status);
          CREATE INDEX IF NOT EXISTS idx_sync_timestamp ON cloud_sync_queue(timestamp);
        `);
        
        await this._loadPendingFromCache();
      }
    } catch (err) {
      console.warn('初始化同步队列表失败:', err.message);
    }
  }

  updateConfig(newConfig) {
    Object.assign(this.config, newConfig);
    console.log('云端同步配置已更新:', this.config);
  }

  async disconnect() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
      this.networkCheckInterval = null;
    }
    console.log('云端同步管理器已停止');
  }
}

const cloudSyncManager = new CloudSyncManager();
cloudSyncManager.initDatabase();

module.exports = {
  CloudSyncManager,
  cloudSyncManager
};
