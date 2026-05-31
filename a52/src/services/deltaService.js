const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Transform, pipeline } = require('stream');
const { promisify } = require('util');

const pipelineAsync = promisify(pipeline);

class DeltaService {
  constructor() {
    this.bsdiffPath = 'bsdiff';
    this.bspatchPath = 'bspatch';
    this.MEMORY_THRESHOLD = 100 * 1024 * 1024;
    this.BSDIFF_TIMEOUT = 300000;
  }

  async generateDelta(oldPath, newPath, deltaPath, options = {}) {
    const { useFallback = false, timeout = this.BSDIFF_TIMEOUT } = options;

    if (!fs.existsSync(oldPath)) {
      throw new Error(`Old file not found: ${oldPath}`);
    }
    if (!fs.existsSync(newPath)) {
      throw new Error(`New file not found: ${newPath}`);
    }

    const oldStats = fs.statSync(oldPath);
    const newStats = fs.statSync(newPath);

    const deltaDir = path.dirname(deltaPath);
    if (!fs.existsSync(deltaDir)) {
      fs.mkdirSync(deltaDir, { recursive: true });
    }

    if (useFallback || 
        oldStats.size > this.MEMORY_THRESHOLD || 
        newStats.size > this.MEMORY_THRESHOLD) {
      console.log('Using streaming delta generation for large files...');
      return await this.generateDeltaStreaming(oldPath, newPath, deltaPath);
    }

    return new Promise((resolve, reject) => {
      let timedOut = false;
      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        bsdiff.kill('SIGTERM');
        console.log('bsdiff timeout, falling back to streaming generation...');
        this.generateDeltaStreaming(oldPath, newPath, deltaPath)
          .then(resolve)
          .catch(reject);
      }, timeout);

      const bsdiff = spawn(this.bsdiffPath, [oldPath, newPath, deltaPath]);
      
      let stderr = '';
      
      bsdiff.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      bsdiff.on('close', (code) => {
        clearTimeout(timeoutTimer);
        
        if (timedOut) return;
        
        if (code === 0) {
          if (fs.existsSync(deltaPath)) {
            const stats = fs.statSync(deltaPath);
            resolve({
              success: true,
              deltaPath,
              size: stats.size,
              algorithm: 'bsdiff'
            });
          } else {
            reject(new Error('Delta file not created'));
          }
        } else {
          console.log(`bsdiff failed (code ${code}), falling back to streaming generation...`);
          this.generateDeltaStreaming(oldPath, newPath, deltaPath)
            .then(resolve)
            .catch(reject);
        }
      });
      
      bsdiff.on('error', (err) => {
        clearTimeout(timeoutTimer);
        
        if (timedOut) return;
        
        if (err.code === 'ENOENT') {
          console.log('bsdiff not found, using streaming generation...');
          this.generateDeltaStreaming(oldPath, newPath, deltaPath)
            .then(resolve)
            .catch(reject);
        } else {
          reject(err);
        }
      });
    });
  }

  async generateDeltaStreaming(oldPath, newPath, deltaPath) {
    console.log('Starting streaming delta generation...');
    
    const blockSize = 4096;
    const oldHashMap = new Map();
    const patches = [];
    
    let oldSize = 0;
    let newSize = 0;
    let oldHash = crypto.createHash('sha256');
    let newHash = crypto.createHash('sha256');

    const oldReadStream = fs.createReadStream(oldPath, { highWaterMark: blockSize });
    
    await new Promise((resolve, reject) => {
      let blockIndex = 0;
      
      oldReadStream.on('data', (chunk) => {
        const actualBlockSize = chunk.length;
        const blockHash = crypto.createHash('sha256').update(chunk).digest('hex');
        
        if (!oldHashMap.has(blockHash)) {
          oldHashMap.set(blockHash, blockIndex * blockSize);
        }
        
        oldHash.update(chunk);
        oldSize += actualBlockSize;
        blockIndex++;
      });
      
      oldReadStream.on('end', resolve);
      oldReadStream.on('error', reject);
    });

    const newReadStream = fs.createReadStream(newPath, { highWaterMark: blockSize });
    
    await new Promise((resolve, reject) => {
      let blockIndex = 0;
      
      newReadStream.on('data', (chunk) => {
        const actualBlockSize = chunk.length;
        const blockHash = crypto.createHash('sha256').update(chunk).digest('hex');
        
        newHash.update(chunk);
        newSize += actualBlockSize;
        
        if (oldHashMap.has(blockHash)) {
          patches.push({
            type: 'copy',
            offset: blockIndex * blockSize,
            length: actualBlockSize,
            sourceOffset: oldHashMap.get(blockHash)
          });
        } else {
          patches.push({
            type: 'new',
            offset: blockIndex * blockSize,
            length: actualBlockSize,
            data: chunk.toString('base64')
          });
        }
        
        blockIndex++;
      });
      
      newReadStream.on('end', resolve);
      newReadStream.on('error', reject);
    });

    const deltaData = {
      version: 2,
      algorithm: 'streaming',
      blockSize,
      oldSize,
      newSize,
      oldHash: oldHash.digest('hex'),
      newHash: newHash.digest('hex'),
      patches
    };

    const deltaDir = path.dirname(deltaPath);
    if (!fs.existsSync(deltaDir)) {
      fs.mkdirSync(deltaDir, { recursive: true });
    }

    await fs.promises.writeFile(
      deltaPath,
      JSON.stringify(deltaData),
      'utf8'
    );

    const stats = fs.statSync(deltaPath);
    console.log(`Streaming delta generated: ${patches.length} patches, ${stats.size} bytes`);
    
    return {
      success: true,
      deltaPath,
      size: stats.size,
      algorithm: 'streaming'
    };
  }

  async generateDeltaFallback(oldPath, newPath, deltaPath) {
    return await this.generateDeltaStreaming(oldPath, newPath, deltaPath);
  }

  async applyDelta(oldPath, deltaPath, newPath, options = {}) {
    const { timeout = this.BSDIFF_TIMEOUT } = options;

    if (!fs.existsSync(oldPath)) {
      throw new Error(`Old file not found: ${oldPath}`);
    }
    if (!fs.existsSync(deltaPath)) {
      throw new Error(`Delta file not found: ${deltaPath}`);
    }

    const newDir = path.dirname(newPath);
    if (!fs.existsSync(newDir)) {
      fs.mkdirSync(newDir, { recursive: true });
    }

    const deltaContent = await fs.promises.readFile(deltaPath, 'utf8');
    
    try {
      const deltaData = JSON.parse(deltaContent);
      
      if (deltaData.algorithm === 'streaming' || deltaData.algorithm === 'simple') {
        return await this.applyDeltaStreaming(oldPath, deltaData, newPath);
      }
    } catch (e) {
    }

    return new Promise((resolve, reject) => {
      let timedOut = false;
      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        bspatch.kill('SIGTERM');
        reject(new Error('bspatch timeout'));
      }, timeout);

      const bspatch = spawn(this.bspatchPath, [oldPath, newPath, deltaPath]);
      
      let stderr = '';
      
      bspatch.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      bspatch.on('close', (code) => {
        clearTimeout(timeoutTimer);
        
        if (timedOut) return;
        
        if (code === 0) {
          if (fs.existsSync(newPath)) {
            const stats = fs.statSync(newPath);
            resolve({
              success: true,
              newPath,
              size: stats.size
            });
          } else {
            reject(new Error('New file not created'));
          }
        } else {
          reject(new Error(`bspatch failed with code ${code}: ${stderr}`));
        }
      });
      
      bspatch.on('error', (err) => {
        clearTimeout(timeoutTimer);
        
        if (timedOut) return;
        
        if (err.code === 'ENOENT') {
          reject(new Error('bspatch not available. Please use streaming delta format.'));
        } else {
          reject(err);
        }
      });
    });
  }

  async applyDeltaStreaming(oldPath, deltaData, newPath) {
    if (!fs.existsSync(oldPath)) {
      throw new Error(`Old file not found: ${oldPath}`);
    }

    const oldStats = fs.statSync(oldPath);
    if (oldStats.size !== deltaData.oldSize) {
      throw new Error('Old file size mismatch');
    }

    const oldFile = fs.openSync(oldPath, 'r');
    const newFile = fs.openSync(newPath, 'w');

    try {
      const verifyHash = crypto.createHash('sha256');
      const blockSize = deltaData.blockSize || 4096;

      for (const patch of deltaData.patches) {
        if (patch.type === 'copy') {
          const buffer = Buffer.alloc(patch.length);
          fs.readSync(oldFile, buffer, 0, patch.length, patch.sourceOffset);
          fs.writeSync(newFile, buffer, 0, patch.length, patch.offset);
          verifyHash.update(buffer);
        } else if (patch.type === 'new') {
          const buffer = Buffer.from(patch.data, 'base64');
          fs.writeSync(newFile, buffer, 0, buffer.length, patch.offset);
          verifyHash.update(buffer);
        }
      }

      fs.closeSync(oldFile);
      fs.closeSync(newFile);

      const computedHash = verifyHash.digest('hex');
      if (computedHash !== deltaData.newHash) {
        fs.unlinkSync(newPath);
        throw new Error('New file hash mismatch after applying delta');
      }

      const stats = fs.statSync(newPath);
      return {
        success: true,
        newPath,
        size: stats.size
      };
    } catch (error) {
      try { fs.closeSync(oldFile); } catch (e) {}
      try { fs.closeSync(newFile); } catch (e) {}
      if (fs.existsSync(newPath)) {
        fs.unlinkSync(newPath);
      }
      throw error;
    }
  }

  async applyDeltaFallback(oldPath, deltaPath, newPath) {
    const deltaContent = await fs.promises.readFile(deltaPath, 'utf8');
    const deltaData = JSON.parse(deltaContent);
    return await this.applyDeltaStreaming(oldPath, deltaData, newPath);
  }

  calculateCompressionRatio(oldSize, deltaSize) {
    return {
      ratio: ((oldSize - deltaSize) / oldSize * 100).toFixed(2),
      saved: oldSize - deltaSize
    };
  }
}

module.exports = new DeltaService();
