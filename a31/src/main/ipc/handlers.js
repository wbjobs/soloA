const { ipcMain } = require('electron');
const main = require('../main');

let realtimeData = {};
let alarmHistory = [];
let devices = [
  {
    id: 'plc-001',
    name: 'PLC-生产车间1',
    protocol: 'modbus',
    status: 'connected',
    ip: '192.168.1.100',
    port: 502,
    slaveId: 1
  },
  {
    id: 'opcua-001',
    name: 'OPC UA服务器',
    protocol: 'opcua',
    status: 'connected',
    endpoint: 'opc.tcp://localhost:4840'
  },
  {
    id: 'sensor-001',
    name: '温度传感器',
    protocol: 'modbus',
    status: 'connected',
    parent: 'plc-001'
  }
];

let tags = [
  {
    id: 'tag-temp',
    name: '车间温度',
    deviceId: 'plc-001',
    address: '40001',
    unit: '°C',
    min: 0,
    max: 100,
    alarmLow: 10,
    alarmHigh: 80
  },
  {
    id: 'tag-pressure',
    name: '管道压力',
    deviceId: 'plc-001',
    address: '40002',
    unit: 'MPa',
    min: 0,
    max: 10,
    alarmLow: 0.1,
    alarmHigh: 8
  },
  {
    id: 'tag-flow',
    name: '流量',
    deviceId: 'opcua-001',
    nodeId: 'ns=2;s=FlowRate',
    unit: 'm³/h',
    min: 0,
    max: 1000,
    alarmLow: 50,
    alarmHigh: 800
  }
];

ipcMain.handle('getDevices', async (event) => {
  return devices;
});

ipcMain.handle('getTags', async (event) => {
  return tags;
});

ipcMain.handle('getRealtimeData', async (event) => {
  return realtimeData;
});

ipcMain.handle('getAlarmHistory', async (event, { limit = 100 }) => {
  return alarmHistory.slice(-limit);
});

ipcMain.handle('acknowledgeAlarm', async (event, alarmId) => {
  const alarm = alarmHistory.find(a => a.id === alarmId);
  if (alarm) {
    alarm.acknowledged = true;
    alarm.acknowledgedAt = new Date().toISOString();
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('startDataCollection', async (event) => {
  return { success: true, message: '数据采集已启动' };
});

ipcMain.handle('stopDataCollection', async (event) => {
  return { success: true, message: '数据采集已停止' };
});

const broadcastRealtimeData = (data) => {
  Object.assign(realtimeData, data);
  const mainWindow = main.getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('realtime-data-update', realtimeData);
  }
};

const broadcastAlarm = (alarm) => {
  alarm.id = Date.now().toString();
  alarm.timestamp = new Date().toISOString();
  alarm.acknowledged = false;
  alarmHistory.push(alarm);
  
  if (alarmHistory.length > 1000) {
    alarmHistory.shift();
  }
  
  const mainWindow = main.getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('alarm-triggered', alarm);
  }
};

module.exports = {
  broadcastRealtimeData,
  broadcastAlarm,
  getTags: () => tags,
  getRealtimeData: () => realtimeData
};
