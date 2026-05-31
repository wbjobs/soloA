const ModbusAdapter = require('./modbusAdapter');
const OpcUaAdapter = require('./opcuaAdapter');

const driverInstances = new Map();

const createDriver = (device) => {
  const key = device.id;
  
  if (driverInstances.has(key)) {
    return driverInstances.get(key);
  }
  
  let driver;
  
  switch (device.protocol) {
    case 'modbus':
      driver = new ModbusAdapter({
        ip: device.ip,
        port: device.port,
        slaveId: device.slaveId || 1
      });
      break;
      
    case 'opcua':
      driver = new OpcUaAdapter({
        endpoint: device.endpoint
      });
      break;
      
    case 'mqtt':
      driver = null;
      console.warn('MQTT 驱动暂未实现');
      break;
      
    default:
      console.warn(`未知的协议类型: ${device.protocol}`);
      return null;
  }
  
  if (driver) {
    driverInstances.set(key, driver);
  }
  
  return driver;
};

const getDriver = (deviceId) => {
  return driverInstances.get(deviceId);
};

const disconnectAll = async () => {
  for (const [key, driver] of driverInstances) {
    try {
      await driver.disconnect();
    } catch (e) {
      console.error(`断开连接失败 ${key}:`, e.message);
    }
  }
  driverInstances.clear();
};

module.exports = {
  createDriver,
  getDriver,
  disconnectAll,
  ModbusAdapter,
  OpcUaAdapter
};
