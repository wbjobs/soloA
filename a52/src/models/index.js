const Firmware = require('./Firmware');
const DeltaPackage = require('./DeltaPackage');
const UpdateTask = require('./UpdateTask');
const DeviceUpdateStatus = require('./DeviceUpdateStatus');
const DeviceVersionHistory = require('./DeviceVersionHistory');
const Device = require('./Device');
const ChunkDownloadRecord = require('./ChunkDownloadRecord');
const UpdatePolicy = require('./UpdatePolicy');
const AlertLog = require('./AlertLog');

Firmware.hasMany(DeltaPackage, { foreignKey: 'from_firmware_id', as: 'fromDeltaPackages' });
Firmware.hasMany(DeltaPackage, { foreignKey: 'to_firmware_id', as: 'toDeltaPackages' });

DeltaPackage.belongsTo(Firmware, { foreignKey: 'from_firmware_id', as: 'fromFirmware' });
DeltaPackage.belongsTo(Firmware, { foreignKey: 'to_firmware_id', as: 'toFirmware' });

Firmware.hasMany(UpdateTask, { foreignKey: 'firmware_id' });
UpdateTask.belongsTo(Firmware, { foreignKey: 'firmware_id' });

UpdateTask.hasMany(DeviceUpdateStatus, { foreignKey: 'task_id' });
DeviceUpdateStatus.belongsTo(UpdateTask, { foreignKey: 'task_id' });

Device.hasMany(DeviceUpdateStatus, { foreignKey: 'device_id' });
DeviceUpdateStatus.belongsTo(Device, { foreignKey: 'device_id' });

Device.hasMany(DeviceVersionHistory, { foreignKey: 'device_id' });
DeviceVersionHistory.belongsTo(Device, { foreignKey: 'device_id' });

Firmware.hasMany(DeviceVersionHistory, { foreignKey: 'firmware_id' });
DeviceVersionHistory.belongsTo(Firmware, { foreignKey: 'firmware_id' });

Device.belongsTo(Firmware, { foreignKey: 'current_firmware_id', as: 'currentFirmware' });

UpdateTask.hasMany(ChunkDownloadRecord, { foreignKey: 'task_id' });
ChunkDownloadRecord.belongsTo(UpdateTask, { foreignKey: 'task_id' });

Device.hasMany(ChunkDownloadRecord, { foreignKey: 'device_id' });
ChunkDownloadRecord.belongsTo(Device, { foreignKey: 'device_id' });

Device.hasMany(AlertLog, { foreignKey: 'device_id' });
AlertLog.belongsTo(Device, { foreignKey: 'device_id' });

UpdateTask.hasMany(AlertLog, { foreignKey: 'task_id' });
AlertLog.belongsTo(UpdateTask, { foreignKey: 'task_id' });

UpdatePolicy.hasMany(AlertLog, { foreignKey: 'policy_id' });
AlertLog.belongsTo(UpdatePolicy, { foreignKey: 'policy_id' });

module.exports = {
  Firmware,
  DeltaPackage,
  UpdateTask,
  DeviceUpdateStatus,
  DeviceVersionHistory,
  Device,
  ChunkDownloadRecord,
  UpdatePolicy,
  AlertLog
};
