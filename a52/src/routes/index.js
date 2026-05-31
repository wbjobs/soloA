const express = require('express');
const multer = require('multer');
const path = require('path');
const config = require('../config');

const firmwareController = require('../controllers/firmwareController');
const deltaController = require('../controllers/deltaController');
const taskController = require('../controllers/taskController');
const rollbackController = require('../controllers/rollbackController');
const deviceController = require('../controllers/deviceController');
const { 
  PolicyController, 
  AlertController, 
  RetryController 
} = require('../controllers/policyController');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(config.storage.firmwarePath, 'temp');
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '_' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: config.storage.maxFirmwareSize
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.bin', '.hex', '.img', '.tar', '.gz'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed types: .bin, .hex, .img, .tar, .gz'));
    }
  }
});

router.post('/firmware/upload', upload.single('firmware'), firmwareController.uploadFirmware);
router.get('/firmware', firmwareController.getFirmwareList);
router.get('/firmware/:id', firmwareController.getFirmware);
router.put('/firmware/:id/activate', firmwareController.activateFirmware);
router.delete('/firmware/:id', firmwareController.deleteFirmware);
router.get('/firmware/:id/download', firmwareController.downloadFirmware);
router.get('/firmware/:id/chunks/:chunkIndex', firmwareController.getChunk);

router.post('/delta/generate', deltaController.generateDelta);
router.get('/delta', deltaController.getDeltaList);
router.get('/delta/:id', deltaController.getDelta);
router.get('/delta/:id/download', deltaController.downloadDelta);
router.delete('/delta/:id', deltaController.deleteDelta);

router.post('/tasks', taskController.createTask);
router.post('/tasks/:id/start', taskController.startTask);
router.post('/tasks/:id/cancel', taskController.cancelTask);
router.get('/tasks', taskController.getTaskList);
router.get('/tasks/:id', taskController.getTask);
router.post('/tasks/:taskId/devices/:deviceId/status', taskController.reportDeviceStatus);
router.get('/devices/:deviceId/status', taskController.getDeviceStatus);
router.post('/tasks/:taskId/devices/:deviceId/chunks/:chunkIndex/complete', taskController.reportChunkComplete);
router.get('/tasks/:taskId/devices/:deviceId/chunks', taskController.getChunkStatus);
router.post('/tasks/:taskId/devices/:deviceId/resume', taskController.resumeDownload);
router.get('/tasks/:taskId/devices/:deviceId/next-chunk', taskController.getNextChunk);

router.get('/devices/:deviceId/history', rollbackController.getDeviceHistory);
router.post('/rollback/tasks', rollbackController.createRollbackTask);
router.post('/rollback/tasks/:taskId/execute', rollbackController.executeRollback);
router.post('/rollback/tasks/:taskId/devices/:deviceId/complete', rollbackController.markRollbackComplete);
router.post('/rollback/devices/:deviceId/version/:version', rollbackController.rollbackToVersion);

router.post('/devices', deviceController.registerDevice);
router.get('/devices', deviceController.getDeviceList);
router.get('/devices/:id', deviceController.getDevice);
router.put('/devices/:id', deviceController.updateDeviceStatus);
router.delete('/devices/:id', deviceController.deleteDevice);
router.post('/devices/:id/heartbeat', deviceController.heartbeat);
router.get('/devices/:deviceId/policy-match', PolicyController.checkPolicyMatch);

router.post('/policies', PolicyController.createPolicy);
router.get('/policies', PolicyController.getPolicyList);
router.get('/policies/:id', PolicyController.getPolicy);
router.put('/policies/:id', PolicyController.updatePolicy);
router.delete('/policies/:id', PolicyController.deletePolicy);
router.get('/policies/:id/devices', PolicyController.getPolicyDevices);

router.get('/alerts', AlertController.getAlertList);
router.get('/alerts/stats', AlertController.getAlertStats);
router.get('/alerts/latest', AlertController.getLatestAlerts);
router.get('/alerts/:id', AlertController.getAlert);
router.post('/alerts/:id/acknowledge', AlertController.acknowledgeAlert);
router.post('/alerts/batch/acknowledge', AlertController.acknowledgeAlerts);
router.post('/alerts/all/acknowledge', AlertController.acknowledgeAll);
router.delete('/alerts/:id', AlertController.deleteAlert);

router.get('/retries', RetryController.getAllRetries);
router.get('/retries/:taskId/:deviceId', RetryController.getRetryStatus);
router.post('/retries/:taskId/:deviceId/cancel', RetryController.cancelRetry);
router.post('/retries/:taskId/cancel-all', RetryController.cancelAllRetries);

module.exports = router;
