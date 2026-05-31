import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Box,
  CircularProgress,
  Typography,
  Alert,
  Chip,
  LinearProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import MemoryIcon from '@mui/icons-material/Memory';
import SpeedIcon from '@mui/icons-material/Speed';
import WarningIcon from '@mui/icons-material/Warning';

import VtkRendererService from '../services/vtkRenderer';
import meshLoader from '../services/meshLoader';

const PerformanceVtkViewer = ({
  caseId,
  viewMode = 'mesh',
  fieldName,
  representation = 'surface',
  slice = null,
  isoSurface = null,
  onProgress,
  onError,
  onRendererReady,
}) => {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadMessage, setLoadMessage] = useState('');
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [isLargeMesh, setIsLargeMesh] = useState(false);
  const [renderQuality, setRenderQuality] = useState('balanced');

  const getRendererInstance = useCallback(() => {
    return rendererRef.current;
  }, []);

  useEffect(() => {
    if (onRendererReady && rendererRef.current) {
      onRendererReady({
        getRenderer: getRendererInstance,
        metadata
      });
    }
  }, [onRendererReady, getRendererInstance, metadata]);

  const loadMesh = useCallback(async () => {
    if (!caseId || !containerRef.current) return;

    setLoading(true);
    setError(null);
    setLoadProgress(0);

    try {
      setLoadMessage('Getting mesh metadata...');
      const meta = await meshLoader.getMetadata(caseId);
      setMetadata(meta);

      const strategy = meshLoader.getLoadStrategy(meta.n_faces);
      setIsLargeMesh(meta.n_faces > 500000);

      setLoadMessage(`Loading preview mesh (${meta.n_faces.toLocaleString()} faces)...`);
      setLoadProgress(0.1);

      let processedGeometry = null;

      if (strategy.strategy === 'direct') {
        const geometryData = await meshLoader.loadLOD(caseId, 'high');
        await processGeometry(geometryData.geometry, strategy.recommendedLOD);
      } else {
        const previewData = await meshLoader.loadPreview(caseId);
        await processGeometry(previewData.geometry, 'preview');
        
        setLoadMessage(`Loading ${strategy.recommendedLOD} quality mesh...`);
        setLoadProgress(0.4);

        if (strategy.useChunks) {
          const chunkedLoader = await meshLoader.loadChunked(
            caseId,
            strategy.recommendedLOD,
            strategy.chunks
          );

          const chunks = [];
          for (let i = 0; i < chunkedLoader.totalChunks; i++) {
            setLoadMessage(`Loading chunk ${i + 1}/${chunkedLoader.totalChunks}...`);
            setLoadProgress(0.4 + (i / chunkedLoader.totalChunks) * 0.4);
            
            const chunkData = await chunkedLoader.loadChunk(i);
            chunks.push(chunkData.chunk);
            
            if (rendererRef.current && i === 0) {
              const worker = meshLoader.getWorker();
              if (worker) {
                worker.postMessage({
                  type: 'PROCESS_CHUNK',
                  payload: {
                    chunk: chunkData.chunk,
                    chunkId: i,
                    totalChunks: chunkedLoader.totalChunks
                  }
                });
                
                await new Promise((resolve) => {
                  const handler = (e) => {
                    if (e.data.type === 'CHUNK_READY' && e.data.payload.chunkId === i) {
                      rendererRef.current.addGeometry(
                        e.data.payload,
                        `chunk_${i}`,
                        {
                          representation,
                          showEdges: viewMode === 'mesh',
                          color: [
                            0.4 + Math.random() * 0.3,
                            0.5 + Math.random() * 0.3,
                            0.7 + Math.random() * 0.3
                          ]
                        }
                      );
                      worker.removeEventListener('message', handler);
                      resolve();
                    }
                  };
                  worker.addEventListener('message', handler);
                });
              }
            }
          }

          setLoadMessage('Merging chunks...');
          setLoadProgress(0.85);

          if (strategy.useWorker) {
            const worker = meshLoader.getWorker();
            if (worker) {
              const processedChunks = chunks.map((chunk, idx) => ({
                points: new Float32Array(chunk.points.flat(2)),
                polys: createPolysArray(chunk.faces)
              }));
              
              worker.postMessage({
                type: 'MERGE_CHUNKS',
                payload: { chunks: processedChunks }
              });

              await new Promise((resolve) => {
                const handler = (e) => {
                  if (e.data.type === 'MERGED_READY') {
                    processedGeometry = e.data.payload;
                    worker.removeEventListener('message', handler);
                    resolve();
                  }
                };
                worker.addEventListener('message', handler);
              });
            }
          }
        } else {
          const lodData = await meshLoader.loadLOD(caseId, strategy.recommendedLOD);
          setLoadProgress(0.6);
          
          await processGeometry(lodData.geometry, strategy.recommendedLOD);
        }
      }

      setLoadProgress(0.95);
      setLoadMessage('Initializing renderer...');

      if (rendererRef.current) {
        rendererRef.current.resetCamera();
        setStats(rendererRef.current.getStats());
      }

      setLoadProgress(1.0);
      setLoadMessage('Complete');

    } catch (err) {
      console.error('Failed to load mesh:', err);
      setError(err.message);
      if (onError) onError(err);
    } finally {
      setLoading(false);
    }
  }, [caseId, viewMode, representation]);

  const createPolysArray = (faces) => {
    const polys = [];
    for (const face of faces) {
      polys.push(face.length);
      polys.push(...face);
    }
    return new Uint32Array(polys);
  };

  const processGeometry = async (geometry, lodLevel) => {
    const worker = meshLoader.getWorker();
    
    if (worker) {
      worker.postMessage({
        type: 'PROCESS_GEOMETRY',
        payload: {
          points: geometry.points,
          faces: geometry.faces,
          lodFactor: getLodFactor(lodLevel)
        }
      });

      const handler = (e) => {
        if (e.data.type === 'PROGRESS') {
          setLoadProgress(0.3 + e.data.payload.progress * 0.3);
          setLoadMessage(e.data.payload.message);
        }
      };
      worker.addEventListener('message', handler);

      return new Promise((resolve) => {
        const completeHandler = (e) => {
          if (e.data.type === 'GEOMETRY_READY') {
            worker.removeEventListener('message', handler);
            worker.removeEventListener('message', completeHandler);
            
            if (rendererRef.current) {
              rendererRef.current.removeActor('main');
              rendererRef.current.addGeometry(
                e.data.payload,
                'main',
                {
                  representation,
                  showEdges: viewMode === 'mesh'
                }
              );
            }
            resolve(e.data.payload);
          }
        };
        worker.addEventListener('message', completeHandler);
      });
    } else {
      const flatPoints = new Float32Array(geometry.points.flat(2));
      const polys = createPolysArray(geometry.faces);
      
      const bounds = calculateBounds(flatPoints);
      
      if (rendererRef.current) {
        rendererRef.current.addGeometry(
          {
            points: flatPoints,
            polys,
            nPoints: geometry.n_points,
            nFaces: geometry.n_faces,
            ...bounds
          },
          'main',
          {
            representation,
            showEdges: viewMode === 'mesh'
          }
        );
      }
      
      return {
        points: flatPoints,
        polys,
        nPoints: geometry.n_points,
        nFaces: geometry.n_faces,
        ...bounds
      };
    }
  };

  const getLodFactor = (level) => {
    const factors = {
      preview: 0.1,
      low: 0.25,
      medium: 0.5,
      high: 1.0
    };
    return factors[level] || 1.0;
  };

  const calculateBounds = (points) => {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < points.length; i += 3) {
      minX = Math.min(minX, points[i]);
      minY = Math.min(minY, points[i + 1]);
      minZ = Math.min(minZ, points[i + 2]);
      maxX = Math.max(maxX, points[i]);
      maxY = Math.max(maxY, points[i + 1]);
      maxZ = Math.max(maxZ, points[i + 2]);
    }

    return {
      bounds: [minX, maxX, minY, maxY, minZ, maxZ],
      center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]
    };
  };

  useEffect(() => {
    if (!containerRef.current) return;

    rendererRef.current = new VtkRendererService();
    rendererRef.current.initialize(containerRef.current);

    return () => {
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (caseId) {
      loadMesh();
    }
  }, [caseId]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setQualityMode(renderQuality);
    }
  }, [renderQuality]);

  useEffect(() => {
    if (!rendererRef.current) return;

    const actors = ['main', 'chunk_0', 'chunk_1', 'chunk_2', 'chunk_3'];
    actors.forEach(id => {
      const existingActor = rendererRef.current.actors.get(id);
      if (existingActor) {
        const prop = existingActor.getProperty();
        prop.setEdgeVisibility(viewMode === 'mesh');
        
        if (representation === 'wireframe') {
          prop.setRepresentationToWireframe();
        } else if (representation === 'points') {
          prop.setRepresentationToPoints();
          prop.setPointSize(3);
        } else {
          prop.setRepresentationToSurface();
        }
      }
    });

    rendererRef.current.render();
  }, [viewMode, representation]);

  useEffect(() => {
    if (!rendererRef.current) return;

    if (slice?.enabled) {
      const axisIndex = { x: 0, y: 1, z: 2 }[slice.axis];
      
      rendererRef.current.createSlice({
        origin: metadata?.bounds ? [
          metadata.bounds[axisIndex * 2] + 
          (metadata.bounds[axisIndex * 2 + 1] - metadata.bounds[axisIndex * 2]) * slice.position,
          0, 0
        ].map((v, i) => i === axisIndex ? v : metadata?.bounds ? metadata.bounds[i * 2] : 0) : [0, 0, 0],
        normal: [
          slice.axis === 'x' ? 1 : 0,
          slice.axis === 'y' ? 1 : 0,
          slice.axis === 'z' ? 1 : 0
        ]
      });
    } else {
      rendererRef.current.removeSlice();
    }
  }, [slice, metadata]);

  useEffect(() => {
    if (!rendererRef.current) return;

    if (isoSurface?.enabled && fieldName) {
      rendererRef.current.createIsoSurface(
        isoSurface.value,
        fieldName
      );
    } else {
      rendererRef.current.removeIsoSurface();
    }
  }, [isoSurface, fieldName]);

  const handleRefresh = () => {
    if (rendererRef.current) {
      rendererRef.current.removeActor('main');
      for (let i = 0; i < 8; i++) {
        rendererRef.current.removeActor(`chunk_${i}`);
      }
    }
    loadMesh();
  };

  const statsIntervalRef = useRef(null);

  useEffect(() => {
    statsIntervalRef.current = setInterval(() => {
      if (rendererRef.current) {
        setStats(rendererRef.current.getStats());
      }
    }, 2000);

    return () => {
      if (statsIntervalRef.current) {
        clearInterval(statsIntervalRef.current);
      }
    };
  }, []);

  return (
    <Box sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {loading && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          <CircularProgress size={60} sx={{ mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            {loadMessage}
          </Typography>
          <Box sx={{ width: '60%', mt: 2 }}>
            <LinearProgress
              variant="determinate"
              value={loadProgress * 100}
              sx={{ height: 8, borderRadius: 4 }}
            />
            <Typography variant="body2" align="center" sx={{ mt: 1 }}>
              {Math.round(loadProgress * 100)}%
            </Typography>
          </Box>
          {isLargeMesh && (
            <Box sx={{ mt: 2 }}>
              <Chip
                icon={<WarningIcon />}
                label="Large mesh detected - using optimized loading"
                color="warning"
                variant="outlined"
              />
            </Box>
          )}
        </Box>
      )}

      {error && (
        <Box
          sx={{
            position: 'absolute',
            top: 16,
            left: 16,
            right: 16,
            zIndex: 20,
          }}
        >
          <Alert
            severity="error"
            action={
              <IconButton
                color="inherit"
                size="small"
                onClick={handleRefresh}
              >
                <RefreshIcon />
              </IconButton>
            }
          >
            {error}
          </Alert>
        </Box>
      )}

      {!loading && stats && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            zIndex: 10,
            display: 'flex',
            gap: 1,
          }}
        >
          <Chip
            icon={<SpeedIcon />}
            label={`${stats.fps} FPS`}
            color={stats.fps >= 30 ? 'success' : stats.fps >= 15 ? 'warning' : 'error'}
            size="small"
          />
          <Chip
            icon={<MemoryIcon />}
            label={`${stats.memoryMB.toFixed(1)} MB`}
            color="info"
            size="small"
          />
          <Tooltip title="Render Quality">
            <Chip
              label={renderQuality}
              onClick={() => {
                const modes = ['performance', 'balanced', 'high'];
                const currentIdx = modes.indexOf(renderQuality);
                setRenderQuality(modes[(currentIdx + 1) % modes.length]);
              }}
              color="primary"
              clickable
              size="small"
            />
          </Tooltip>
          <Tooltip title="Reload Mesh">
            <IconButton
              size="small"
              onClick={handleRefresh}
              sx={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            >
              <RefreshIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {!loading && metadata && stats && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            zIndex: 10,
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Cells: {metadata.n_faces?.toLocaleString()} | Points: {metadata.n_points?.toLocaleString()}
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default PerformanceVtkViewer;
