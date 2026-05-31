const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const routes = require('./routes');
const { connect, sync } = require('./database');
const redisService = require('./services/redisService');
const signatureService = require('./services/signatureService');
const retryService = require('./services/retryService');

const app = express();

app.use(helmet());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000
});
app.use('/api', apiLimiter);

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100
});
app.use('/api/firmware/upload', uploadLimiter);

app.use('/api', routes);

app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      error: `File upload error: ${err.message}`
    });
  }
  
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      error: err.message
    });
  }
  
  res.status(500).json({
    success: false,
    error: 'Internal Server Error'
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

const ensureDirectories = () => {
  const dirs = [
    config.storage.firmwarePath,
    path.join(config.storage.firmwarePath, 'temp'),
    './keys'
  ];
  
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
};

const generateKeysIfNeeded = async () => {
  const privateKeyPath = path.resolve(config.rsa.privateKeyPath);
  const publicKeyPath = path.resolve(config.rsa.publicKeyPath);
  
  if (!fs.existsSync(privateKeyPath) || !fs.existsSync(publicKeyPath)) {
    console.log('Generating RSA key pair...');
    const { publicKey, privateKey } = await signatureService.generateKeyPair();
    await signatureService.saveKeyPair(publicKey, privateKey, publicKeyPath, privateKeyPath);
    console.log('RSA key pair generated successfully.');
  }
};

const startServer = async () => {
  try {
    ensureDirectories();
    
    await connect();
    await sync(false);
    
    await redisService.connect();
    
    await generateKeysIfNeeded();
    await signatureService.initialize();
    
    await retryService.initialize();
    
    app.listen(config.port, () => {
      console.log(`OTA Firmware Service is running on port ${config.port}`);
      console.log(`Health check: http://localhost:${config.port}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

const gracefulShutdown = async () => {
  console.log('Shutting down gracefully...');
  
  try {
    await retryService.shutdown();
    console.log('Retry service stopped.');
  } catch (err) {
    console.error('Error during retry service shutdown:', err);
  }
  
  try {
    await redisService.disconnect();
    console.log('Redis connection closed.');
  } catch (err) {
    console.error('Error during Redis disconnection:', err);
  }
  
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

startServer();

module.exports = app;
