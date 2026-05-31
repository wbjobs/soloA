const MAX_POINTS_PER_BATCH = 100000;
const MAX_FACES_PER_BATCH = 200000;

function decimatePoints(points, factor) {
  if (factor >= 1.0 || points.length <= 1000) {
    return { points, indices: null };
  }

  const step = Math.max(1, Math.floor(1 / factor));
  const result = [];
  const mapping = new Map();

  for (let i = 0; i < points.length; i += step) {
    result.push(points[i]);
    mapping.set(i, result.length - 1);
  }

  return {
    points: new Float32Array(result.flat()),
    pointMapping: mapping
  };
}

function remapFaces(faces, pointMapping) {
  if (!pointMapping) {
    return { faces, polys: null };
  }

  const remapped = [];
  const polys = [];

  for (let i = 0; i < faces.length; i++) {
    const face = faces[i];
    const newFace = [];
    let valid = true;

    for (let j = 0; j < face.length; j++) {
      const mapped = pointMapping.get(face[j]);
      if (mapped === undefined) {
        valid = false;
        break;
      }
      newFace.push(mapped);
    }

    if (valid && newFace.length >= 3) {
      remapped.push(newFace);
      polys.push(newFace.length);
      polys.push(...newFace);
    }
  }

  return {
    faces: remapped,
    polys: new Uint32Array(polys)
  };
}

function convertToPolys(faces) {
  const polys = [];
  
  for (let i = 0; i < faces.length; i++) {
    const face = faces[i];
    polys.push(face.length);
    for (let j = 0; j < face.length; j++) {
      polys.push(face[j]);
    }
  }
  
  return new Uint32Array(polys);
}

function flattenPoints(points) {
  if (points instanceof Float32Array) {
    return points;
  }
  
  const flat = new Float32Array(points.length * 3);
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    flat[i * 3] = pt[0];
    flat[i * 3 + 1] = pt[1];
    flat[i * 3 + 2] = pt[2];
  }
  return flat;
}

function flattenFieldData(data, nComponents = 1) {
  if (!data || data.length === 0) {
    return new Float32Array(0);
  }
  
  if (data instanceof Float32Array) {
    return data;
  }
  
  const isVector = Array.isArray(data[0]);
  const length = isVector ? data.length * 3 : data.length;
  const flat = new Float32Array(length);
  
  for (let i = 0; i < data.length; i++) {
    if (isVector) {
      flat[i * 3] = data[i][0];
      flat[i * 3 + 1] = data[i][1];
      flat[i * 3 + 2] = data[i][2];
    } else {
      flat[i] = data[i];
    }
  }
  
  return flat;
}

function mergeChunks(chunks) {
  if (chunks.length === 0) {
    return { points: new Float32Array(), polys: new Uint32Array() };
  }

  let totalPoints = 0;
  let totalPolys = 0;

  for (const chunk of chunks) {
    totalPoints += chunk.points.length / 3;
    totalPolys += chunk.polys.length;
  }

  const mergedPoints = new Float32Array(totalPoints * 3);
  const mergedPolys = new Uint32Array(totalPolys);

  let pointOffset = 0;
  let polyOffset = 0;
  let baseIndex = 0;

  for (const chunk of chunks) {
    mergedPoints.set(chunk.points, pointOffset * 3);
    
    let i = 0;
    while (i < chunk.polys.length) {
      const nPoints = chunk.polys[i];
      mergedPolys[polyOffset] = nPoints;
      for (let j = 1; j <= nPoints; j++) {
        mergedPolys[polyOffset + j] = chunk.polys[i + j] + baseIndex;
      }
      polyOffset += nPoints + 1;
      i += nPoints + 1;
    }

    pointOffset += chunk.points.length / 3;
    baseIndex += chunk.points.length / 3;
  }

  return {
    points: mergedPoints,
    polys: mergedPolys.slice(0, polyOffset)
  };
}

function calculateBounds(points) {
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
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    size: Math.sqrt(
      Math.pow(maxX - minX, 2) +
      Math.pow(maxY - minY, 2) +
      Math.pow(maxZ - minZ, 2)
    )
  };
}

function decompressGzip(arrayBuffer) {
  try {
    const stream = new DecompressionStream('gzip');
    const blob = new Blob([arrayBuffer]);
    return blob.stream().pipeThrough(stream);
  } catch (e) {
    return null;
  }
}

self.onmessage = async function(e) {
  const { type, payload } = e.data;

  try {
    switch (type) {
      case 'PROCESS_GEOMETRY': {
        const { points: rawPoints, faces: rawFaces, lodFactor = 1.0 } = payload;
        
        self.postMessage({ type: 'PROGRESS', progress: 0.1, message: 'Decimating mesh...' });
        
        const { points: decimatedPoints, pointMapping } = decimatePoints(rawPoints, lodFactor);
        
        self.postMessage({ type: 'PROGRESS', progress: 0.4, message: 'Remapping faces...' });
        
        const flatPoints = flattenPoints(decimatedPoints);
        const { polys } = remapFaces(rawFaces, pointMapping);
        
        self.postMessage({ type: 'PROGRESS', progress: 0.7, message: 'Calculating bounds...' });
        
        const bounds = calculateBounds(flatPoints);
        
        self.postMessage({ type: 'PROGRESS', progress: 1.0, message: 'Complete' });
        
        self.postMessage({
          type: 'GEOMETRY_READY',
          payload: {
            points: flatPoints,
            polys: polys || convertToPolys(rawFaces),
            nPoints: flatPoints.length / 3,
            nFaces: rawFaces.length,
            ...bounds
          }
        }, [flatPoints.buffer, (polys || convertToPolys(rawFaces)).buffer]);
        break;
      }

      case 'PROCESS_CHUNK': {
        const { chunk, chunkId, totalChunks } = payload;
        
        const flatPoints = flattenPoints(chunk.points);
        const polys = convertToPolys(chunk.faces);
        const bounds = calculateBounds(flatPoints);
        
        self.postMessage({
          type: 'CHUNK_READY',
          payload: {
            chunkId,
            totalChunks,
            points: flatPoints,
            polys,
            ...bounds,
            isLast: chunkId === totalChunks - 1
          }
        }, [flatPoints.buffer, polys.buffer]);
        break;
      }

      case 'MERGE_CHUNKS': {
        const { chunks } = payload;
        
        self.postMessage({ type: 'PROGRESS', progress: 0.5, message: 'Merging chunks...' });
        
        const merged = mergeChunks(chunks);
        const bounds = calculateBounds(merged.points);
        
        self.postMessage({
          type: 'MERGED_READY',
          payload: {
            ...merged,
            ...bounds,
            nPoints: merged.points.length / 3
          }
        }, [merged.points.buffer, merged.polys.buffer]);
        break;
      }

      case 'PROCESS_FIELD': {
        const { data, fieldName, nComponents = 1 } = payload;
        
        const flatData = flattenFieldData(data, nComponents);
        
        let min = Infinity, max = -Infinity;
        for (let i = 0; i < flatData.length; i++) {
          min = Math.min(min, flatData[i]);
          max = Math.max(max, flatData[i]);
        }
        
        self.postMessage({
          type: 'FIELD_READY',
          payload: {
            fieldName,
            data: flatData,
            nComponents,
            range: [min, max]
          }
        }, [flatData.buffer]);
        break;
      }

      case 'DECIMATE_QUICK': {
        const { points: rawPoints, faces: rawFaces, factor } = payload;
        
        const result = decimatePoints(rawPoints, factor);
        const remapped = remapFaces(rawFaces, result.pointMapping);
        
        self.postMessage({
          type: 'DECIMATE_READY',
          payload: {
            points: flattenPoints(result.points),
            polys: remapped.polys,
            pointMapping: result.pointMapping
          }
        });
        break;
      }
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      payload: { message: error.message, stack: error.stack }
    });
  }
};
