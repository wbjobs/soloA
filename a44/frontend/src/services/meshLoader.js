import axios from 'axios';

const API_BASE = 'http://localhost:8000';

const LOAD_THRESHOLD = {
  SMALL: 500000,
  MEDIUM: 2000000,
  LARGE: 5000000
};

class MeshLoader {
  constructor() {
    this.workers = new Map();
    this.requests = new Map();
    this.cache = new Map();
  }

  getWorker() {
    const workerKey = 'mesh';
    if (!this.workers.has(workerKey)) {
      try {
        const WorkerClass = require('worker-loader!../workers/meshProcessor.worker.js').default;
        this.workers.set(workerKey, new WorkerClass());
      } catch (e) {
        console.warn('Web Worker not available, using fallback method');
        return null;
      }
    }
    return this.workers.get(workerKey);
  }

  async getMetadata(caseId) {
    const cacheKey = `meta_${caseId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const response = await axios.get(
      `${API_BASE}/api/data-opt/${caseId}/geometry-metadata`,
      {
        responseType: 'json',
        timeout: 30000
      }
    );

    this.cache.set(cacheKey, response.data);
    return response.data;
  }

  async loadPreview(caseId) {
    const cacheKey = `preview_${caseId}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const response = await axios.get(
      `${API_BASE}/api/data-opt/${caseId}/geometry-preview`,
      {
        responseType: 'arraybuffer',
        timeout: 60000
      }
    );

    const data = await this.decompressResponse(response);
    this.cache.set(cacheKey, data);
    return data;
  }

  async loadLOD(caseId, lod = 'medium', boundaryOnly = false) {
    const params = new URLSearchParams({
      lod,
      boundary_only: boundaryOnly
    });

    const cacheKey = `lod_${caseId}_${lod}_${boundaryOnly}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const response = await axios.get(
      `${API_BASE}/api/data-opt/${caseId}/geometry-lod?${params}`,
      {
        responseType: 'arraybuffer',
        timeout: 120000
      }
    );

    const data = await this.decompressResponse(response);
    this.cache.set(cacheKey, data);
    return data;
  }

  async loadChunked(caseId, lod = 'high', totalChunks = 4) {
    const metadata = await this.getMetadata(caseId);
    const actualChunks = metadata.chunks_needed || totalChunks;

    const loadChunk = async (chunkId) => {
      const params = new URLSearchParams({
        chunk_id: chunkId,
        total_chunks: actualChunks,
        lod
      });

      const response = await axios.get(
        `${API_BASE}/api/data-opt/${caseId}/geometry-chunked?${params}`,
        {
          responseType: 'arraybuffer',
          timeout: 60000
        }
      );

      return this.decompressResponse(response);
    };

    return {
      metadata,
      totalChunks: actualChunks,
      loadChunk,
      loadAllChunks: async (onProgress) => {
        const chunks = [];
        for (let i = 0; i < actualChunks; i++) {
          if (onProgress) {
            onProgress(i / actualChunks, `Loading chunk ${i + 1}/${actualChunks}`);
          }
          const chunk = await loadChunk(i);
          chunks.push(chunk);
        }
        return chunks;
      }
    };
  }

  async loadFieldChunked(caseId, fieldName, totalChunks = 4) {
    const loadChunk = async (chunkId) => {
      const params = new URLSearchParams({
        chunk_id: chunkId,
        total_chunks: totalChunks
      });

      const response = await axios.get(
        `${API_BASE}/api/data-opt/${caseId}/field-chunked/${fieldName}?${params}`,
        {
          responseType: 'arraybuffer',
          timeout: 60000
        }
      );

      return this.decompressResponse(response);
    };

    return {
      totalChunks,
      loadChunk,
      loadAllChunks: async () => {
        const chunks = [];
        let mergedData = null;
        let statistics = null;

        for (let i = 0; i < totalChunks; i++) {
          const chunk = await loadChunk(i);
          chunks.push(chunk);
          
          if (chunk.statistics) {
            statistics = chunk.statistics;
          }
        }

        if (chunks.length > 0) {
          const isVector = Array.isArray(chunks[0].data[0]);
          const totalLength = chunks.reduce((sum, c) => sum + c.data.length, 0);
          
          if (isVector) {
            mergedData = new Float32Array(totalLength * 3);
            let offset = 0;
            for (const chunk of chunks) {
              for (const vec of chunk.data) {
                mergedData[offset++] = vec[0];
                mergedData[offset++] = vec[1];
                mergedData[offset++] = vec[2];
              }
            }
          } else {
            mergedData = new Float32Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
              for (const val of chunk.data) {
                mergedData[offset++] = val;
              }
            }
          }
        }

        return {
          fieldName,
          data: mergedData,
          statistics,
          chunks
        };
      }
    };
  }

  async decompressResponse(response) {
    const encoding = response.headers['content-encoding'];
    let data;

    if (encoding === 'gzip') {
      try {
        const stream = new DecompressionStream('gzip');
        const blob = new Blob([response.data]);
        const ds = blob.stream().pipeThrough(stream);
        const response2 = new Response(ds);
        const arrayBuffer = await response2.arrayBuffer();
        data = JSON.parse(new TextDecoder().decode(arrayBuffer));
      } catch (e) {
        const text = new TextDecoder().decode(response.data);
        data = JSON.parse(text);
      }
    } else {
      const text = new TextDecoder().decode(response.data);
      data = JSON.parse(text);
    }

    return data;
  }

  getLoadStrategy(nCells) {
    if (nCells <= LOAD_THRESHOLD.SMALL) {
      return {
        strategy: 'direct',
        recommendedLOD: 'high',
        useChunks: false,
        useWorker: false
      };
    } else if (nCells <= LOAD_THRESHOLD.MEDIUM) {
      return {
        strategy: 'lod',
        recommendedLOD: 'medium',
        useChunks: false,
        useWorker: true
      };
    } else if (nCells <= LOAD_THRESHOLD.LARGE) {
      return {
        strategy: 'chunked',
        recommendedLOD: 'medium',
        useChunks: true,
        chunks: 4,
        useWorker: true
      };
    } else {
      return {
        strategy: 'chunked_heavy',
        recommendedLOD: 'low',
        useChunks: true,
        chunks: 8,
        useWorker: true,
        boundaryOnly: true
      };
    }
  }

  clearCache() {
    this.cache.clear();
  }

  dispose() {
    for (const worker of this.workers.values()) {
      worker.terminate();
    }
    this.workers.clear();
    this.cache.clear();
  }
}

export default new MeshLoader();
