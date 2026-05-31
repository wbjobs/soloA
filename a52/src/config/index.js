require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    name: process.env.DB_NAME || 'ota_service',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  },
  
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || ''
  },
  
  rsa: {
    privateKeyPath: process.env.RSA_PRIVATE_KEY || './keys/private.pem',
    publicKeyPath: process.env.RSA_PUBLIC_KEY || './keys/public.pem'
  },
  
  storage: {
    firmwarePath: process.env.STORAGE_PATH || './storage/firmware',
    maxFirmwareSize: parseInt(process.env.MAX_FIRMWARE_SIZE) || 104857600,
    chunkSize: parseInt(process.env.CHUNK_SIZE) || 1048576
  },
  
  encryption: {
    algorithm: 'RSA-SHA256'
  }
};
