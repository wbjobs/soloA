import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Slider,
  FormControlLabel,
  Switch,
  Paper,
  Chip,
  Grid,
  TextField,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  IconButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import BoltIcon from '@mui/icons-material/Bolt';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

import * as vtkMath from '@kitware/vtk.js/Common/Core/Math';
import vtkPoints from '@kitware/vtk.js/Common/Core/Points';
import vtkCellArray from '@kitware/vtk.js/Common/Core/CellArray';
import vtkPolyData from '@kitware/vtk.js/Common/DataModel/PolyData';
import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkPolyDataMapper from '@kitware/vtk.js/Rendering/Core/PolyDataMapper';
import vtkProperty from '@kitware/vtk.js/Rendering/Core/Property';
import vtkOutlineCornerFilter from '@kitware/vtk.js/Filters/General/OutlineCornerFilter';

const REFINEMENT_LEVELS = [
  { value: 0, label: 'Level 0 (No Refinement)' },
  { value: 1, label: 'Level 1 (2x)' },
  { value: 2, label: 'Level 2 (4x)' },
  { value: 3, label: 'Level 3 (8x)' },
  { value: 4, label: 'Level 4 (16x)' },
];

const PRIORITIES = ['low', 'medium', 'high'];

const createBoxRepresentation = (bounds) => {
  const [xmin, xmax, ymin, ymax, zmin, zmax] = bounds;
  
  const points = vtkPoints.newInstance();
  points.setNumberOfPoints(8);
  points.setPoint(0, xmin, ymin, zmin);
  points.setPoint(1, xmax, ymin, zmin);
  points.setPoint(2, xmax, ymax, zmin);
  points.setPoint(3, xmin, ymax, zmin);
  points.setPoint(4, xmin, ymin, zmax);
  points.setPoint(5, xmax, ymin, zmax);
  points.setPoint(6, xmax, ymax, zmax);
  points.setPoint(7, xmin, ymax, zmax);

  const polys = vtkCellArray.newInstance();
  polys.insertNextCell([0, 1, 2, 3]);
  polys.insertNextCell([4, 5, 6, 7]);
  polys.insertNextCell([0, 3, 7, 4]);
  polys.insertNextCell([1, 5, 6, 2]);
  polys.insertNextCell([0, 4, 5, 1]);
  polys.insertNextCell([2, 6, 7, 3]);

  const polyData = vtkPolyData.newInstance();
  polyData.setPoints(points);
  polyData.setPolys(polys);

  return polyData;
};

const AmrBoxWidget = ({
  renderer,
  regions,
  onRegionAdd,
  onRegionUpdate,
  onRegionDelete,
  geometryBounds = [-5, 5, -5, 5, -5, 5],
}) => {
  const actorsRef = useRef(new Map());
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [showAll, setShowAll] = useState(true);
  const [editingRegion, setEditingRegion] = useState(null);
  const [newRegionName, setNewRegionName] = useState('');
  const [newRefinementLevel, setNewRefinementLevel] = useState(2);
  const [newPriority, setNewPriority] = useState('medium');

  const getRegionColor = (region) => {
    if (region.type === 'auto') {
      return [0.9, 0.3, 0.3];
    }
    switch (region.priority) {
      case 'high': return [0.9, 0.3, 0.3];
      case 'low': return [0.3, 0.9, 0.3];
      default: return [0.3, 0.7, 0.9];
    }
  };

  const updateRegionActor = useCallback((region) => {
    if (!renderer || !region.bounds) return;

    const existingActor = actorsRef.current.get(region.id);
    if (existingActor) {
      renderer.removeActor(existingActor);
      existingActor.getMapper().delete();
      existingActor.delete();
    }

    if (!showAll && selectedRegion !== region.id) return;

    const polyData = createBoxRepresentation(region.bounds);
    
    const mapper = vtkPolyDataMapper.newInstance();
    mapper.setInputData(polyData);

    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);

    const property = actor.getProperty();
    property.setRepresentationToWireframe();
    property.setEdgeColor(...getRegionColor(region));
    property.setLineWidth(region.id === selectedRegion ? 4 : 2);
    property.setOpacity(region.id === selectedRegion ? 1.0 : 0.7);

    renderer.addActor(actor);
    actorsRef.current.set(region.id, actor);
  }, [renderer, showAll, selectedRegion]);

  const removeRegionActor = useCallback((regionId) => {
    if (!renderer) return;
    
    const actor = actorsRef.current.get(regionId);
    if (actor) {
      renderer.removeActor(actor);
      actor.getMapper().delete();
      actor.delete();
      actorsRef.current.delete(regionId);
    }
  }, [renderer]);

  useEffect(() => {
    if (!renderer) return;

    regions.forEach(region => {
      updateRegionActor(region);
    });

    return () => {
      actorsRef.current.forEach((actor) => {
        renderer.removeActor(actor);
        actor.getMapper().delete();
        actor.delete();
      });
      actorsRef.current.clear();
    };
  }, [regions, renderer, updateRegionActor]);

  const handleAddRegion = () => {
    const centerX = (geometryBounds[0] + geometryBounds[1]) / 2;
    const centerY = (geometryBounds[2] + geometryBounds[3]) / 2;
    const centerZ = (geometryBounds[4] + geometryBounds[5]) / 2;
    const size = 1.0;

    const newRegion = {
      id: Date.now(),
      name: newRegionName || `AMR_Region_${regions.length + 1}`,
      type: 'manual',
      bounds: [
        centerX - size, centerX + size,
        centerY - size, centerY + size,
        centerZ - size, centerZ + size
      ],
      center: [centerX, centerY, centerZ],
      min: [centerX - size, centerY - size, centerZ - size],
      max: [centerX + size, centerY + size, centerZ + size],
      refinement_level: newRefinementLevel,
      priority: newPriority,
      is_active: true,
    };

    onRegionAdd(newRegion);
    setSelectedRegion(newRegion.id);
  };

  const handleUpdateBounds = (axis, index, value) => {
    if (!selectedRegion) return;
    
    const region = regions.find(r => r.id === selectedRegion);
    if (!region) return;

    const newBounds = [...region.bounds];
    const axisIdx = axis === 'x' ? 0 : axis === 'y' ? 2 : 4;
    newBounds[axisIdx + index] = value;

    if (index === 0 && newBounds[axisIdx] > newBounds[axisIdx + 1]) {
      newBounds[axisIdx] = newBounds[axisIdx + 1];
    }
    if (index === 1 && newBounds[axisIdx + 1] < newBounds[axisIdx]) {
      newBounds[axisIdx + 1] = newBounds[axisIdx];
    }

    const updatedRegion = {
      ...region,
      bounds: newBounds,
      center: [
        (newBounds[0] + newBounds[1]) / 2,
        (newBounds[2] + newBounds[3]) / 2,
        (newBounds[4] + newBounds[5]) / 2
      ],
      min: [newBounds[0], newBounds[2], newBounds[4]],
      max: [newBounds[1], newBounds[3], newBounds[5]],
    };

    onRegionUpdate(updatedRegion);
  };

  const selectedRegionData = regions.find(r => r.id === selectedRegion);

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        <BoltIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
        AMR Region Manager
      </Typography>

      <Box mb={2}>
        <FormControlLabel
          control={
            <Switch
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
          }
          label="Show all regions"
        />
      </Box>

      <Grid container spacing={2} mb={2}>
        <Grid item xs={6}>
          <TextField
            label="Region Name"
            value={newRegionName}
            onChange={(e) => setNewRegionName(e.target.value)}
            size="small"
            fullWidth
            placeholder="AMR_Region_1"
          />
        </Grid>
        <Grid item xs={3}>
          <FormControl size="small" fullWidth>
            <InputLabel>Level</InputLabel>
            <Select
              value={newRefinementLevel}
              onChange={(e) => setNewRefinementLevel(e.target.value)}
              label="Level"
            >
              {REFINEMENT_LEVELS.slice(1, 5).map(l => (
                <MenuItem key={l.value} value={l.value}>{l.value}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={3}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddRegion}
            fullWidth
            sx={{ height: '100%' }}
          >
            Add
          </Button>
        </Grid>
      </Grid>

      {regions.length > 0 && (
        <>
          <Typography variant="subtitle2" gutterBottom>
            Active Regions ({regions.filter(r => r.is_active).length})
          </Typography>
          
          <Box maxHeight={200} overflow="auto" mb={2}>
            {regions.map((region) => (
              <Box
                key={region.id}
                display="flex"
                alignItems="center"
                p={1}
                bgcolor={selectedRegion === region.id ? 'action.selected' : 'transparent'}
                borderBottom="1px solid"
                borderColor="divider"
              >
                <Chip
                  label={region.name}
                  size="small"
                  color={region.type === 'auto' ? 'warning' : 'primary'}
                  sx={{ mr: 1, minWidth: 100 }}
                />
                <Chip
                  label={`L${region.refinement_level}`}
                  size="small"
                  variant="outlined"
                  sx={{ mr: 1 }}
                />
                <Chip
                  label={region.priority}
                  size="small"
                  color={region.priority === 'high' ? 'error' : region.priority === 'low' ? 'success' : 'default'}
                  sx={{ mr: 1 }}
                />
                <Box flexGrow={1} />
                <IconButton
                  size="small"
                  onClick={() => setSelectedRegion(region.id === selectedRegion ? null : region.id)}
                >
                  {selectedRegion === region.id ? <VisibilityOffIcon /> : <VisibilityIcon />}
                </IconButton>
                <IconButton
                  size="small"
                  onClick={() => onRegionDelete(region.id)}
                  color="error"
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
            ))}
          </Box>
        </>
      )}

      {selectedRegionData && (
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Edit: {selectedRegionData.name}
          </Typography>
          
          <Grid container spacing={1}>
            {['x', 'y', 'z'].map((axis, axisIdx) => (
              <Grid item xs={12} key={axis}>
                <Typography variant="caption" display="block">
                  {axis.toUpperCase()} Axis
                </Typography>
                <Grid container spacing={1}>
                  <Grid item xs={5}>
                    <TextField
                      label="Min"
                      type="number"
                      value={selectedRegionData.bounds[axisIdx * 2]}
                      onChange={(e) => handleUpdateBounds(axis, 0, parseFloat(e.target.value))}
                      size="small"
                      fullWidth
                      inputProps={{ step: 0.1 }}
                    />
                  </Grid>
                  <Grid item xs={5}>
                    <TextField
                      label="Max"
                      type="number"
                      value={selectedRegionData.bounds[axisIdx * 2 + 1]}
                      onChange={(e) => handleUpdateBounds(axis, 1, parseFloat(e.target.value))}
                      size="small"
                      fullWidth
                      inputProps={{ step: 0.1 }}
                    />
                  </Grid>
                  <Grid item xs={2}>
                    <TextField
                      label="Size"
                      type="number"
                      value={Math.abs(
                        selectedRegionData.bounds[axisIdx * 2 + 1] - selectedRegionData.bounds[axisIdx * 2]
                      ).toFixed(2)}
                      disabled
                      size="small"
                      fullWidth
                    />
                  </Grid>
                </Grid>
              </Grid>
            ))}
            
            <Grid item xs={6}>
              <FormControl size="small" fullWidth>
                <InputLabel>Refinement Level</InputLabel>
                <Select
                  value={selectedRegionData.refinement_level}
                  onChange={(e) => onRegionUpdate({
                    ...selectedRegionData,
                    refinement_level: e.target.value
                  })}
                  label="Refinement Level"
                >
                  {REFINEMENT_LEVELS.map(l => (
                    <MenuItem key={l.value} value={l.value}>{l.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={6}>
              <FormControl size="small" fullWidth>
                <InputLabel>Priority</InputLabel>
                <Select
                  value={selectedRegionData.priority}
                  onChange={(e) => onRegionUpdate({
                    ...selectedRegionData,
                    priority: e.target.value
                  })}
                  label="Priority"
                >
                  {PRIORITIES.map(p => (
                    <MenuItem key={p} value={p}>{p}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </Box>
      )}

      {regions.length === 0 && (
        <Box textAlign="center" py={3}>
          <HelpOutlineIcon color="action" sx={{ fontSize: 40, mb: 1 }} />
          <Typography color="text.secondary" variant="body2">
            No regions defined. Click "Add" to create a refinement region.
          </Typography>
        </Box>
      )}
    </Paper>
  );
};

export default AmrBoxWidget;
