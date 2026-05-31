const EventEmitter = require('events');

class OpcUaAdapter extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.client = null;
    this.session = null;
    this.subscription = null;
    this.connected = false;
    this.simulationMode = false;
    
    this.monitoredItems = new Map();
    this.monitoredItemCallbacks = new Map();
    
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 3000;
    this.isReconnecting = false;
    
    this._cleanupInterval = null;
    this._lastGcTime = Date.now();
    this._gcInterval = 60000;
    
    this.setMaxListeners(50);
    
    this._initMemoryManagement();
  }

  _initMemoryManagement() {
    if (global.gc) {
      this._cleanupInterval = setInterval(() => {
        if (Date.now() - this._lastGcTime > this._gcInterval) {
          try {
            global.gc();
            this._lastGcTime = Date.now();
          } catch (e) {}
        }
      }, 30000);
    }
  }

  async connect() {
    if (this.connected && !this.isReconnecting) {
      return true;
    }

    if (this.isReconnecting) {
      return new Promise((resolve) => {
        this.once('connection-status', (status) => {
          resolve(status);
        });
      });
    }

    this.isReconnecting = true;

    try {
      await this._cleanupOldConnection();

      const { OPCUAClient, AttributeIds } = require('node-opcua');
      this.AttributeIds = AttributeIds;

      this.client = OPCUAClient.create({
        endpointMustExist: false,
        securityMode: 'None',
        securityPolicy: 'None',
        connectionStrategy: {
          maxRetry: 3,
          initialDelay: 1000,
          maxDelay: 10000
        },
        keepSessionAlive: true,
        requestedSessionTimeout: 60000,
        endpoint_must_exist: false
      });

      this.client.on('connection_lost', () => {
        console.warn('OPC UA 连接丢失，将尝试重连');
        this.connected = false;
        this._attemptReconnect();
      });

      this.client.on('connection_reestablished', () => {
        console.log('OPC UA 连接已恢复');
        this.connected = true;
        this._restoreSubscriptions();
      });

      this.client.on('close', () => {
        console.log('OPC UA 客户端已关闭');
        this.connected = false;
      });

      await this.client.connect(this.config.endpoint);
      this.session = await this.client.createSession();

      this.connected = true;
      this.simulationMode = false;
      this.reconnectAttempts = 0;
      this.isReconnecting = false;

      console.log(`OPC UA 连接成功: ${this.config.endpoint}`);
      this.emit('connection-status', true);

      return true;

    } catch (err) {
      console.warn(`OPC UA 连接失败，启用模拟模式: ${err.message}`);
      this.simulationMode = true;
      this.connected = true;
      this.isReconnecting = false;
      this.emit('connection-status', true);
      return true;
    }
  }

  async _restoreSubscriptions() {
    if (this.monitoredItems.size === 0) return;

    console.log(`OPC UA 恢复 ${this.monitoredItems.size} 个订阅项...`);

    const nodeIds = Array.from(this.monitoredItems.keys());
    for (const nodeId of nodeIds) {
      const callbacks = this.monitoredItemCallbacks.get(nodeId) || [];
      this.monitoredItems.delete(nodeId);
      this.monitoredItemCallbacks.delete(nodeId);

      for (const callback of callbacks) {
        try {
          await this.subscribeToNode(nodeId, callback);
        } catch (err) {
          console.error(`恢复订阅失败 ${nodeId}:`, err.message);
        }
      }
    }

    console.log('OPC UA 订阅恢复完成');
  }

  async _attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`OPC UA 重连次数超限 (${this.maxReconnectAttempts}次)，切换到模拟模式`);
      this.simulationMode = true;
      this.connected = true;
      this.isReconnecting = false;
      this.emit('connection-status', true);
      return;
    }

    if (this.isReconnecting) return;

    this.reconnectAttempts++;
    this.isReconnecting = true;

    console.log(`OPC UA 将在 ${this.reconnectDelay}ms 后尝试重连 (第 ${this.reconnectAttempts} 次)`);

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (err) {
        console.error(`OPC UA 重连失败: ${err.message}`);
        this.isReconnecting = false;
      }
    }, this.reconnectDelay);
  }

  async _cleanupOldConnection() {
    await this._cleanupMonitoredItems();
    await this._cleanupSubscription();
    await this._cleanupSession();
    await this._cleanupClient();

    this.session = null;
    this.client = null;
    this.subscription = null;

    this.monitoredItems.clear();
    this.monitoredItemCallbacks.clear();

    this.removeAllListeners();
    this.setMaxListeners(50);
  }

  async _cleanupMonitoredItems() {
    if (this.monitoredItems.size === 0) return;

    console.log(`OPC UA 清理 ${this.monitoredItems.size} 个监控项...`);

    for (const [nodeId, monitoredItem] of this.monitoredItems) {
      try {
        if (monitoredItem && typeof monitoredItem.terminate === 'function') {
          await monitoredItem.terminate();
        }
        if (monitoredItem && typeof monitoredItem.removeAllListeners === 'function') {
          monitoredItem.removeAllListeners();
        }
      } catch (e) {}
    }

    this.monitoredItems.clear();
    this.monitoredItemCallbacks.clear();
  }

  async _cleanupSubscription() {
    if (!this.subscription) return;

    try {
      console.log('OPC UA 清理订阅...');
      await this.subscription.terminate();
    } catch (e) {}

    try {
      this.subscription.removeAllListeners();
    } catch (e) {}

    this.subscription = null;
  }

  async _cleanupSession() {
    if (!this.session) return;

    try {
      console.log('OPC UA 清理会话...');
      await this.session.close();
    } catch (e) {}

    try {
      this.session.removeAllListeners();
    } catch (e) {}
  }

  async _cleanupClient() {
    if (!this.client) return;

    try {
      console.log('OPC UA 清理客户端...');
      await this.client.disconnect();
    } catch (e) {}

    try {
      this.client.removeAllListeners();
    } catch (e) {}
  }

  async disconnect() {
    this.isReconnecting = false;
    this.reconnectAttempts = 0;

    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }

    await this._cleanupOldConnection();

    this.connected = false;
    this.simulationMode = false;

    console.log('OPC UA 适配器已断开连接');
  }

  async _ensureSubscription() {
    if (this.subscription) return this.subscription;

    const { ClientSubscription } = require('node-opcua');

    this.subscription = ClientSubscription.create(this.session, {
      requestedPublishingInterval: 1000,
      requestedLifetimeCount: 100,
      requestedMaxKeepAliveCount: 10,
      maxNotificationsPerPublish: 100,
      publishingEnabled: true,
      priority: 10
    });

    this.subscription.on('started', () => {
      console.log('OPC UA 订阅已启动');
    });

    this.subscription.on('keepalive', () => {});

    this.subscription.on('terminated', () => {
      console.log('OPC UA 订阅已终止');
      this.subscription = null;
    });

    this.subscription.on('error', (err) => {
      console.error('OPC UA 订阅错误:', err.message);
    });

    return this.subscription;
  }

  async subscribeToNode(nodeId, callback) {
    if (this.simulationMode) {
      if (!this._simulationInterval) {
        this._simulationInterval = setInterval(() => {
          this.monitoredItemCallbacks.forEach((callbacks, nid) => {
            const data = this.simulateRead(nid);
            callbacks.forEach(cb => {
              try {
                cb(data);
              } catch (e) {}
            });
          });
        }, 1000);
      }

      if (!this.monitoredItemCallbacks.has(nodeId)) {
        this.monitoredItemCallbacks.set(nodeId, []);
      }
      this.monitoredItemCallbacks.get(nodeId).push(callback);
      this.monitoredItems.set(nodeId, { simulation: true });

      return true;
    }

    if (!this.connected) {
      await this.connect();
    }

    if (this.monitoredItems.has(nodeId)) {
      if (!this.monitoredItemCallbacks.has(nodeId)) {
        this.monitoredItemCallbacks.set(nodeId, []);
      }
      this.monitoredItemCallbacks.get(nodeId).push(callback);
      return true;
    }

    try {
      const subscription = await this._ensureSubscription();
      const { ClientMonitoredItem, TimestampsToReturn } = require('node-opcua');

      const monitoredItem = ClientMonitoredItem.create(
        subscription,
        {
          nodeId,
          attributeId: this.AttributeIds ? this.AttributeIds.Value : 13
        },
        {
          samplingInterval: 1000,
          discardOldest: true,
          queueSize: 1
        },
        TimestampsToReturn.Both
      );

      monitoredItem.on('changed', (dataValue) => {
        const result = {
          value: dataValue.value ? dataValue.value.value : null,
          quality: dataValue.statusCode ? dataValue.statusCode.value : 0,
          timestamp: dataValue.sourceTimestamp || new Date()
        };

        const callbacks = this.monitoredItemCallbacks.get(nodeId) || [];
        callbacks.forEach(cb => {
          try {
            cb(result);
          } catch (e) {}
        });
      });

      monitoredItem.on('err', (err) => {
        console.warn(`OPC UA 监控项错误 ${nodeId}:`, err.message);
      });

      if (!this.monitoredItemCallbacks.has(nodeId)) {
        this.monitoredItemCallbacks.set(nodeId, []);
      }
      this.monitoredItemCallbacks.get(nodeId).push(callback);
      this.monitoredItems.set(nodeId, monitoredItem);

      return true;

    } catch (err) {
      console.error(`OPC UA 订阅节点失败 ${nodeId}:`, err.message);
      return false;
    }
  }

  async unsubscribeFromNode(nodeId) {
    const monitoredItem = this.monitoredItems.get(nodeId);
    if (monitoredItem) {
      try {
        if (typeof monitoredItem.terminate === 'function') {
          await monitoredItem.terminate();
        }
        if (typeof monitoredItem.removeAllListeners === 'function') {
          monitoredItem.removeAllListeners();
        }
      } catch (e) {}

      this.monitoredItems.delete(nodeId);
    }

    this.monitoredItemCallbacks.delete(nodeId);

    if (this.monitoredItems.size === 0) {
      await this._cleanupSubscription();
    }

    return true;
  }

  async readNode(nodeId) {
    if (this.simulationMode) {
      return this.simulateRead(nodeId);
    }

    if (!this.connected) {
      await this.connect();
      if (this.simulationMode) {
        return this.simulateRead(nodeId);
      }
    }

    try {
      const dataValue = await this.session.read({ nodeId });
      return {
        value: dataValue.value ? dataValue.value.value : null,
        quality: dataValue.statusCode ? dataValue.statusCode.value : 0,
        timestamp: dataValue.sourceTimestamp || new Date()
      };
    } catch (err) {
      console.error(`OPC UA 读取失败: ${err.message}`);

      if (err.message && (
        err.message.includes('connection') ||
        err.message.includes('timeout') ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT' ||
        err.message.includes('BadSession')
      )) {
        this.connected = false;
        await this._attemptReconnect();
        if (this.simulationMode) {
          return this.simulateRead(nodeId);
        }
      }

      return this.simulateRead(nodeId);
    }
  }

  async readNodes(nodeIds) {
    if (this.simulationMode) {
      const results = {};
      for (const nodeId of nodeIds) {
        results[nodeId] = this.simulateRead(nodeId);
      }
      return results;
    }

    if (!this.connected) {
      await this.connect();
      if (this.simulationMode) {
        const results = {};
        for (const nodeId of nodeIds) {
          results[nodeId] = this.simulateRead(nodeId);
        }
        return results;
      }
    }

    try {
      const nodesToRead = nodeIds.map(nodeId => ({ nodeId }));
      const dataValues = await this.session.read(nodesToRead);

      const results = {};
      nodeIds.forEach((nodeId, index) => {
        results[nodeId] = {
          value: dataValues[index].value ? dataValues[index].value.value : null,
          quality: dataValues[index].statusCode ? dataValues[index].statusCode.value : 0,
          timestamp: dataValues[index].sourceTimestamp || new Date()
        };
      });
      return results;
    } catch (err) {
      console.error(`OPC UA 批量读取失败: ${err.message}`);

      if (err.message && (
        err.message.includes('connection') ||
        err.message.includes('timeout') ||
        err.message.includes('BadSession')
      )) {
        this.connected = false;
        await this._attemptReconnect();
      }

      const results = {};
      for (const nodeId of nodeIds) {
        results[nodeId] = this.simulateRead(nodeId);
      }
      return results;
    }
  }

  async writeNode(nodeId, value, dataType = 'Double') {
    if (this.simulationMode) {
      console.log(`[模拟] 写入节点 ${nodeId}: ${value}`);
      return true;
    }

    if (!this.connected) {
      await this.connect();
    }

    try {
      const { DataType } = require('node-opcua');
      const dataTypeMap = {
        'Double': DataType.Double,
        'Float': DataType.Float,
        'Int32': DataType.Int32,
        'Int16': DataType.Int16,
        'UInt32': DataType.UInt32,
        'UInt16': DataType.UInt16,
        'Boolean': DataType.Boolean,
        'String': DataType.String
      };

      const opcDataType = dataTypeMap[dataType] || DataType.Double;

      await this.session.write({
        nodeId,
        attributeId: this.AttributeIds ? this.AttributeIds.Value : 13,
        value: {
          value: { dataType: opcDataType, value }
        }
      });
      return true;
    } catch (err) {
      console.error(`OPC UA 写入失败: ${err.message}`);

      if (err.message && (
        err.message.includes('connection') ||
        err.message.includes('BadSession')
      )) {
        this.connected = false;
        await this._attemptReconnect();
      }

      return false;
    }
  }

  simulateRead(nodeId) {
    let value;

    if (nodeId.includes('Flow') || nodeId.includes('flow')) {
      value = Math.round(450 + Math.sin(Date.now() / 2000) * 200 + Math.random() * 30);
    } else if (nodeId.includes('Temp') || nodeId.includes('temp')) {
      value = Math.round(35 + Math.sin(Date.now() / 4000) * 15 + Math.random() * 3);
    } else if (nodeId.includes('Pressure') || nodeId.includes('pressure')) {
      value = Math.round((5 + Math.sin(Date.now() / 6000) * 2 + Math.random() * 0.3) * 100) / 100;
    } else if (nodeId.includes('Level') || nodeId.includes('level')) {
      value = Math.round(75 + Math.sin(Date.now() / 8000) * 20 + Math.random() * 5);
    } else {
      value = Math.round(50 + Math.random() * 50);
    }

    return {
      value,
      quality: 1,
      timestamp: new Date()
    };
  }

  isConnected() {
    return this.connected;
  }

  isSimulationMode() {
    return this.simulationMode;
  }

  getSubscriptionStats() {
    return {
      monitoredItems: this.monitoredItems.size,
      callbacks: Array.from(this.monitoredItemCallbacks.values()).reduce((sum, arr) => sum + arr.length, 0),
      hasSubscription: !!this.subscription,
      isReconnecting: this.isReconnecting,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  getMemoryStats() {
    if (process.memoryUsage) {
      const mem = process.memoryUsage();
      return {
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + ' MB',
        rss: Math.round(mem.rss / 1024 / 1024) + ' MB'
      };
    }
    return {};
  }
}

module.exports = OpcUaAdapter;
