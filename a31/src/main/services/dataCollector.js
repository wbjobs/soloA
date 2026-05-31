const { createDriver, getDriver } = require('../drivers');
const { broadcastRealtimeData, getTags } = require('../ipc/handlers');
const { saveHistoryData } = require('../database/sqliteDb');

let pollingInterval = null;
let isRunning = false;
const connectedDrivers = new Map();

const DEFAULT_POLLING_RATE = 1000;

const initializeDrivers = async () => {
  const ipcHandlers = require('../ipc/handlers');
  const tags = ipcHandlers.getTags();
  
  const devices = [
    { id: 'plc-001', name: 'PLC-生产车间1', protocol: 'modbus', ip: '192.168.1.100', port: 502, slaveId: 1 },
    { id: 'opcua-001', name: 'OPC UA服务器', protocol: 'opcua', endpoint: 'opc.tcp://localhost:4840' }
  ];
  
  for (const device of devices) {
    try {
      const driver = createDriver(device);
      if (driver) {
        await driver.connect();
        connectedDrivers.set(device.id, driver);
        console.log(`设备连接成功: ${device.name} (${device.protocol})`);
      }
    } catch (err) {
      console.error(`设备连接失败 ${device.name}:`, err.message);
    }
  }
};

const pollData = async () => {
  if (!isRunning) return;
  
  try {
    const ipcHandlers = require('../ipc/handlers');
    const tags = ipcHandlers.getTags();
    const collectedData = {};
    
    for (const tag of tags) {
      try {
        const driver = connectedDrivers.get(tag.deviceId);
        if (!driver) continue;
        
        let value = null;
        
        if (tag.protocol === 'modbus' || tag.address) {
          const address = parseInt(tag.address);
          const values = await driver.readHoldingRegisters(address, 1);
          if (values && values.length > 0) {
            value = values[0];
          }
        } else if (tag.protocol === 'opcua' || tag.nodeId) {
          const result = await driver.readNode(tag.nodeId);
          if (result) {
            value = result.value;
          }
        }
        
        if (value !== null) {
          collectedData[tag.id] = {
            value,
            unit: tag.unit,
            timestamp: new Date().toISOString(),
            tagName: tag.name
          };
          
          saveHistoryData(tag.id, value, 1);
        }
        
      } catch (err) {
        console.warn(`读取标签 ${tag.name} 失败:`, err.message);
      }
    }
    
    if (Object.keys(collectedData).length > 0) {
      broadcastRealtimeData(collectedData);
    }
    
  } catch (err) {
    console.error('数据采集失败:', err.message);
  }
};

const startDataCollection = async (pollingRate = DEFAULT_POLLING_RATE) => {
  if (isRunning) {
    console.log('数据采集已在运行中');
    return;
  }
  
  await initializeDrivers();
  
  isRunning = true;
  pollingInterval = setInterval(pollData, pollingRate);
  
  console.log(`数据采集已启动 (${pollingRate}ms)`);
  return true;
};

const stopDataCollection = async () => {
  if (!isRunning) {
    console.log('数据采集未在运行');
    return;
  }
  
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  
  for (const [id, driver] of connectedDrivers) {
    try {
      await driver.disconnect();
      console.log(`设备已断开: ${id}`);
    } catch (err) {
      console.error(`断开设备失败 ${id}:`, err.message);
    }
  }
  connectedDrivers.clear();
  
  isRunning = false;
  console.log('数据采集已停止');
  return true;
};

const checkConnections = async () => {
  for (const [id, driver] of connectedDrivers) {
    if (!driver.isConnected()) {
      console.warn(`检测到设备 ${id} 断开连接，尝试重连...`);
      try {
        await driver.connect();
      } catch (err) {
        console.error(`重连失败 ${id}:`, err.message);
      }
    }
  }
};

setInterval(checkConnections, 10000);

startDataCollection();

module.exports = {
  startDataCollection,
  stopDataCollection,
  isRunning: () => isRunning,
  getConnectedDrivers: () => connectedDrivers
};
