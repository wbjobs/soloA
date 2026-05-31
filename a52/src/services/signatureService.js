const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');

class SignatureService {
  constructor() {
    this.privateKey = null;
    this.publicKey = null;
    this.algorithm = config.encryption.algorithm;
  }

  async initialize() {
    this.privateKey = await this.loadKey(config.rsa.privateKeyPath);
    this.publicKey = await this.loadKey(config.rsa.publicKeyPath);
  }

  async loadKey(filePath) {
    const absolutePath = path.resolve(filePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Key file not found: ${absolutePath}`);
    }
    return fs.promises.readFile(absolutePath, 'utf8');
  }

  async generateKeyPair() {
    return new Promise((resolve, reject) => {
      crypto.generateKeyPair('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      }, (err, publicKey, privateKey) => {
        if (err) {
          reject(err);
        } else {
          resolve({ publicKey, privateKey });
        }
      });
    });
  }

  async saveKeyPair(publicKey, privateKey, publicKeyPath, privateKeyPath) {
    await fs.promises.writeFile(publicKeyPath, publicKey);
    await fs.promises.writeFile(privateKeyPath, privateKey);
  }

  sign(data) {
    if (!this.privateKey) {
      throw new Error('Private key not initialized');
    }
    
    const signer = crypto.createSign(this.algorithm);
    signer.update(data);
    signer.end();
    
    const signature = signer.sign(this.privateKey, 'base64');
    return signature;
  }

  verify(data, signature) {
    if (!this.publicKey) {
      throw new Error('Public key not initialized');
    }
    
    const verifier = crypto.createVerify(this.algorithm);
    verifier.update(data);
    verifier.end();
    
    return verifier.verify(this.publicKey, signature, 'base64');
  }

  async signFile(filePath) {
    const fileContent = await fs.promises.readFile(filePath);
    return this.sign(fileContent);
  }

  async verifyFile(filePath, signature) {
    const fileContent = await fs.promises.readFile(filePath);
    return this.verify(fileContent, signature);
  }

  calculateChecksum(data, algorithm = 'sha256') {
    const hash = crypto.createHash(algorithm);
    hash.update(data);
    return hash.digest('hex');
  }

  async calculateFileChecksum(filePath, algorithm = 'sha256') {
    const fileContent = await fs.promises.readFile(filePath);
    return this.calculateChecksum(fileContent, algorithm);
  }
}

module.exports = new SignatureService();
