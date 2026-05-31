class ModbusAdapter {
  constructor(config) {
    this.config = config;
    this.client = null;
    this.socket = null;
    this.connected = false;
    this.simulationMode = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 3000;
    this.isReconnecting = false;
    this.requestQueue = [];
    this._cleanupCallbacks = [];
  }

  async connect() {
    if (this.connected && !this.isReconnecting) {
      return true;
    }

    if (this.isReconnecting) {
      return new Promise((resolve) => {
        this._cleanupCallbacks.push(() => resolve(this.connected));
      });
    }

    this.isReconnecting = true;

    try {
      await this._cleanupOldConnection();

      const net = require('net');
      const { ModbusTCPClient } = require('jsmodbus');

      this.socket = new net.Socket({
        keepAlive: true,
        keepAliveInitialDelay: 10000
      });

      this.socket.setTimeout(30000);

      this.client = new ModbusTCPClient(this.socket, this.config.slaveId || 1);
      this._resetClientState();

      return new Promise((resolve, reject) => {
        const connectTimeout = setTimeout(() => {
          if (!this.connected) {
            this.socket.destroy();
            this.isReconnecting = false;
            console.warn(`Modbus TCP 连接超时 (${this.config.ip}:${this.config.port})，切换到模拟模式`);
            this.simulationMode = true;
            this.connected = true;
            this._notifyCleanupListeners();
            resolve(true);
          }
        }, 10000);

        this.socket.connect(this.config.port || 502, this.config.ip || '127.0.0.1', () => {
          clearTimeout(connectTimeout);
          this.connected = true;
          this.simulationMode = false;
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          this._processQueuedRequests();
          console.log(`Modbus TCP 连接成功: ${this.config.ip}:${this.config.port}`);
          this._notifyCleanupListeners();
          resolve(true);
        });

        this._setupSocketEvents(this.socket, connectTimeout, reject);
      });

    } catch (err) {
      console.warn(`Modbus 模块不可用或连接失败，启用模拟模式: ${err.message}`);
      this.simulationMode = true;
      this.connected = true;
      this.isReconnecting = false;
      this._notifyCleanupListeners();
      return true;
    }
  }

  _resetClientState() {
    if (this.client) {
      if (this.client._unitId !== undefined) {
        this.client._unitId = this.config.slaveId || 1;
      }
      if (this.client._timeout === undefined || this.client._timeout > 30000) {
        this.client.setTimeout(10000);
      }
    }
  }

  _setupSocketEvents(socket, connectTimeout, reject) {
    const errorHandler = (err) => {
      console.warn(`Modbus TCP 连接错误: ${err.message}`);
      if (connectTimeout) clearTimeout(connectTimeout);
      this._handleConnectionError(err, reject);
    };

    const closeHandler = () => {
      console.log('Modbus TCP 连接已关闭');
      this._handleConnectionClose();
    };

    const timeoutHandler = () => {
      console.warn('Modbus TCP 连接超时，将尝试重连');
      this.socket.end();
    };

    socket.once('error', errorHandler);
    socket.once('close', closeHandler);
    socket.on('timeout', timeoutHandler);

    this._cleanupCallbacks.push(() => {
      socket.removeListener('error', errorHandler);
      socket.removeListener('close', closeHandler);
      socket.removeListener('timeout', timeoutHandler);
    });
  }

  _handleConnectionError(err, reject) {
    this.connected = false;
    this.isReconnecting = false;

    if (reject) {
      reject(err);
    }

    this._attemptReconnect();
  }

  _handleConnectionClose() {
    this.connected = false;
    this._attemptReconnect();
  }

  async _attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`Modbus TCP 重连次数超限 (${this.maxReconnectAttempts}次)，切换到模拟模式`);
      this.simulationMode = true;
      this.connected = true;
      this.isReconnecting = false;
      this._notifyCleanupListeners();
      return;
    }

    if (this.isReconnecting) return;

    this.reconnectAttempts++;
    this.isReconnecting = true;

    console.log(`Modbus TCP 将在 ${this.reconnectDelay}ms 后尝试重连 (第 ${this.reconnectAttempts} 次)`);

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (err) {
        console.error(`Modbus TCP 重连失败: ${err.message}`);
        this.isReconnecting = false;
      }
    }, this.reconnectDelay);
  }

  async _cleanupOldConnection() {
    if (this.client) {
      try {
        if (this.client._requests) {
          this.client._requests.clear();
        }
        if (this.client._socket) {
          this.client._socket = null;
        }
      } catch (e) {}
    }

    if (this.socket) {
      try {
        this.socket.removeAllListeners();
        this.socket.destroy();
      } catch (e) {}
      this.socket = null;
    }

    this.client = null;
    this._notifyCleanupListeners();
    this._cleanupCallbacks = [];
  }

  _notifyCleanupListeners() {
    while (this._cleanupCallbacks.length > 0) {
      const callback = this._cleanupCallbacks.shift();
      try {
        callback();
      } catch (e) {}
    }
  }

  _queueRequest(requestFn) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ requestFn, resolve, reject });
      this._processQueuedRequests();
    });
  }

  async _processQueuedRequests() {
    if (!this.connected || this.simulationMode) return;

    while (this.requestQueue.length > 0 && this.connected) {
      const { requestFn, resolve, reject } = this.requestQueue.shift();
      try {
        const result = await requestFn();
        resolve(result);
      } catch (err) {
        reject(err);
      }
    }
  }

  async disconnect() {
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
    await this._cleanupOldConnection();
    this.connected = false;
    this.simulationMode = false;
    this.requestQueue = [];
    console.log('Modbus TCP 适配器已断开连接');
  }

  async readHoldingRegisters(address, quantity = 1) {
    if (this.simulationMode) {
      return this.simulateRead(address, quantity);
    }

    if (!this.connected) {
      await this.connect();
      if (this.simulationMode) {
        return this.simulateRead(address, quantity);
      }
    }

    try {
      const result = await this.client.readHoldingRegisters(address, quantity);
      if (!result || !result.response || !result.response.body) {
        throw new Error('Invalid response structure');
      }
      return result.response.body.values;
    } catch (err) {
      console.error(`Modbus 读取失败 (address: ${address}): ${err.message}`);

      if (err.message && (
        err.message.includes('Transaction') ||
        err.message.includes('timeout') ||
        err.message.includes('ECONN') ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT'
      )) {
        console.log('Modbus 检测到连接问题，触发重连');
        this.connected = false;
        await this._attemptReconnect();

        if (this.simulationMode) {
          return this.simulateRead(address, quantity);
        }

        try {
          const result = await this.client.readHoldingRegisters(address, quantity);
          return result.response.body.values;
        } catch (retryErr) {
          console.error(`Modbus 重试读取仍失败: ${retryErr.message}`);
          return this.simulateRead(address, quantity);
        }
      }

      return this.simulateRead(address, quantity);
    }
  }

  async readInputRegisters(address, quantity = 1) {
    if (this.simulationMode) {
      return this.simulateRead(address, quantity);
    }

    if (!this.connected) {
      await this.connect();
      if (this.simulationMode) {
        return this.simulateRead(address, quantity);
      }
    }

    try {
      const result = await this.client.readInputRegisters(address, quantity);
      return result.response.body.values;
    } catch (err) {
      console.error(`Modbus 读取输入寄存器失败 (address: ${address}): ${err.message}`);

      if (err.message && (
        err.message.includes('Transaction') ||
        err.message.includes('timeout') ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT'
      )) {
        this.connected = false;
        await this._attemptReconnect();
        if (this.simulationMode) {
          return this.simulateRead(address, quantity);
        }
      }

      return this.simulateRead(address, quantity);
    }
  }

  async writeSingleRegister(address, value) {
    if (this.simulationMode) {
      console.log(`[模拟] 写入寄存器 ${address}: ${value}`);
      return true;
    }

    if (!this.connected) {
      await this.connect();
    }

    try {
      await this.client.writeSingleRegister(address, value);
      return true;
    } catch (err) {
      console.error(`Modbus 写入失败: ${err.message}`);

      if (err.message && (
        err.message.includes('Transaction') ||
        err.code === 'ECONNRESET' ||
        err.code === 'ETIMEDOUT'
      )) {
        this.connected = false;
        await this._attemptReconnect();
      }

      return false;
    }
  }

  simulateRead(address, quantity) {
    const values = [];
    for (let i = 0; i < quantity; i++) {
      if (address === 40001) {
        values.push(Math.round(25 + Math.sin(Date.now() / 5000) * 20 + Math.random() * 5));
      } else if (address === 40002) {
        values.push(Math.round((3 + Math.sin(Date.now() / 7000) * 2 + Math.random() * 0.5) * 10) / 10);
      } else if (address === 40003) {
        values.push(Math.round(500 + Math.sin(Date.now() / 3000) * 200 + Math.random() * 50));
      } else {
        values.push(Math.floor(Math.random() * 1000));
      }
    }
    return values;
  }

  isConnected() {
    return this.connected;
  }

  isSimulationMode() {
    return this.simulationMode;
  }

  getReconnectStats() {
    return {
      attempts: this.reconnectAttempts,
      maxAttempts: this.maxReconnectAttempts,
      isReconnecting: this.isReconnecting
    };
  }
}

module.exports = ModbusAdapter;
