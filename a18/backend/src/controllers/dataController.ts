import { Request, Response } from 'express';
import PipelineNode from '../models/PipelineNode';
import Pipeline from '../models/Pipeline';
import Layer from '../models/Layer';

export const exportData = async (req: Request, res: Response) => {
  try {
    const { includeNodes = true, includePipelines = true, includeLayers = true } = req.body;
    
    const exportData: any = {
      exportTime: new Date().toISOString(),
      version: '1.0'
    };
    
    if (includeNodes) {
      const nodes = await PipelineNode.findAll();
      exportData.nodes = nodes.map(node => node.toJSON());
    }
    
    if (includePipelines) {
      const pipelines = await Pipeline.findAll();
      exportData.pipelines = pipelines.map(pipeline => pipeline.toJSON());
    }
    
    if (includeLayers) {
      const layers = await Layer.findAll();
      exportData.layers = layers.map(layer => layer.toJSON());
    }
    
    res.json({
      success: true,
      data: exportData
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const importData = async (req: Request, res: Response) => {
  try {
    const { nodes, pipelines, layers, overwrite = false } = req.body;
    
    const importResults: any = {
      nodes: { imported: 0, errors: [] },
      pipelines: { imported: 0, errors: [] },
      layers: { imported: 0, errors: [] }
    };
    
    if (layers && layers.length > 0) {
      for (const layerData of layers) {
        try {
          if (overwrite) {
            await Layer.upsert(layerData);
          } else {
            await Layer.create(layerData);
          }
          importResults.layers.imported++;
        } catch (error) {
          importResults.layers.errors.push({
            data: layerData,
            error: (error as Error).message
          });
        }
      }
    }
    
    if (nodes && nodes.length > 0) {
      for (const nodeData of nodes) {
        try {
          if (overwrite) {
            await PipelineNode.upsert(nodeData);
          } else {
            await PipelineNode.create(nodeData);
          }
          importResults.nodes.imported++;
        } catch (error) {
          importResults.nodes.errors.push({
            data: nodeData,
            error: (error as Error).message
          });
        }
      }
    }
    
    if (pipelines && pipelines.length > 0) {
      for (const pipelineData of pipelines) {
        try {
          if (overwrite) {
            await Pipeline.upsert(pipelineData);
          } else {
            await Pipeline.create(pipelineData);
          }
          importResults.pipelines.imported++;
        } catch (error) {
          importResults.pipelines.errors.push({
            data: pipelineData,
            error: (error as Error).message
          });
        }
      }
    }
    
    res.json({
      success: true,
      data: importResults
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const exportToGeoJSON = async (req: Request, res: Response) => {
  try {
    const nodes = await PipelineNode.findAll();
    const pipelines = await Pipeline.findAll();
    
    const features: any[] = [];
    
    nodes.forEach(node => {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [node.x, node.y, node.z]
        },
        properties: {
          id: node.id,
          name: node.name,
          nodeType: node.nodeType,
          elevation: node.elevation,
          pressure: node.pressure,
          demand: node.demand,
          ...node.properties
        }
      });
    });
    
    pipelines.forEach(pipeline => {
      if (pipeline.geometry && pipeline.geometry.coordinates) {
        features.push({
          type: 'Feature',
          geometry: pipeline.geometry,
          properties: {
            id: pipeline.id,
            name: pipeline.name,
            material: pipeline.material,
            diameter: pipeline.diameter,
            length: pipeline.length,
            depth: pipeline.depth,
            status: pipeline.status,
            startNodeId: pipeline.startNodeId,
            endNodeId: pipeline.endNodeId,
            ...pipeline.properties
          }
        });
      }
    });
    
    const geojson = {
      type: 'FeatureCollection',
      features
    };
    
    res.json({
      success: true,
      data: geojson
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};

export const importGeoJSON = async (req: Request, res: Response) => {
  try {
    const { geojson, overwrite = false } = req.body;
    
    const results = {
      nodes: { imported: 0, errors: [] },
      pipelines: { imported: 0, errors: [] }
    };
    
    if (geojson && geojson.features) {
      for (const feature of geojson.features) {
        try {
          if (feature.geometry.type === 'Point') {
            const [x, y, z] = feature.geometry.coordinates;
            const nodeData = {
              id: feature.properties.id,
              name: feature.properties.name || '节点',
              nodeType: feature.properties.nodeType || 'junction',
              x,
              y,
              z: z || 0,
              elevation: feature.properties.elevation || 0,
              pressure: feature.properties.pressure || 0,
              demand: feature.properties.demand || 0,
              properties: { ...feature.properties }
            };
            
            if (overwrite) {
              await PipelineNode.upsert(nodeData);
            } else {
              await PipelineNode.create(nodeData);
            }
            results.nodes.imported++;
          } else if (feature.geometry.type === 'LineString') {
            const pipelineData = {
              id: feature.properties.id,
              name: feature.properties.name || '管道',
              startNodeId: feature.properties.startNodeId,
              endNodeId: feature.properties.endNodeId,
              material: feature.properties.material || 'Steel',
              diameter: feature.properties.diameter || 100,
              length: feature.properties.length || 0,
              depth: feature.properties.depth || 0,
              status: feature.properties.status || 'active',
              geometry: feature.geometry,
              properties: { ...feature.properties }
            };
            
            if (overwrite) {
              await Pipeline.upsert(pipelineData);
            } else {
              await Pipeline.create(pipelineData);
            }
            results.pipelines.imported++;
          }
        } catch (error) {
          if (feature.geometry.type === 'Point') {
            results.nodes.errors.push({ error: (error as Error).message });
          } else {
            results.pipelines.errors.push({ error: (error as Error).message });
          }
        }
      }
    }
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
};
