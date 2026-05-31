import React, { useState } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Grid,
  Button,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

const BOUNDARY_TYPES = [
  { value: 'velocity_inlet', label: 'Velocity Inlet' },
  { value: 'pressure_outlet', label: 'Pressure Outlet' },
  { value: 'wall', label: 'Wall' },
  { value: 'symmetry', label: 'Symmetry' },
];

const BoundaryConditionsPanel = ({ boundaryConditions, patches, onChange }) => {
  const [conditions, setConditions] = useState(
    boundaryConditions?.length > 0
      ? boundaryConditions
      : (patches || []).map(patch => ({
          name: patch.name,
          type: patch.type === 'patch' ? 'velocity_inlet' : 'wall',
          parameters: {},
        }))
  );

  const handleTypeChange = (index, type) => {
    const newConditions = [...conditions];
    newConditions[index] = {
      ...newConditions[index],
      type,
      parameters: getDefaultParams(type),
    };
    setConditions(newConditions);
    onChange(newConditions);
  };

  const handleParamChange = (index, param, value) => {
    const newConditions = [...conditions];
    newConditions[index].parameters = {
      ...newConditions[index].parameters,
      [param]: value,
    };
    setConditions(newConditions);
    onChange(newConditions);
  };

  const getDefaultParams = (type) => {
    switch (type) {
      case 'velocity_inlet':
        return { velocity: [0, 0, 1], k: 0.1, epsilon: 0.1 };
      case 'pressure_outlet':
        return { pressure: 0 };
      default:
        return {};
    }
  };

  const renderParams = (condition, index) => {
    switch (condition.type) {
      case 'velocity_inlet':
        return (
          <Grid container spacing={2}>
            <Grid item xs={4}>
              <TextField
                label="Velocity X"
                type="number"
                value={condition.parameters?.velocity?.[0] || 0}
                onChange={(e) => {
                  const vel = condition.parameters?.velocity || [0, 0, 0];
                  handleParamChange(index, 'velocity', [parseFloat(e.target.value), vel[1], vel[2]]);
                }}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid item xs={4}>
              <TextField
                label="Velocity Y"
                type="number"
                value={condition.parameters?.velocity?.[1] || 0}
                onChange={(e) => {
                  const vel = condition.parameters?.velocity || [0, 0, 0];
                  handleParamChange(index, 'velocity', [vel[0], parseFloat(e.target.value), vel[2]]);
                }}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid item xs={4}>
              <TextField
                label="Velocity Z"
                type="number"
                value={condition.parameters?.velocity?.[2] || 0}
                onChange={(e) => {
                  const vel = condition.parameters?.velocity || [0, 0, 0];
                  handleParamChange(index, 'velocity', [vel[0], vel[1], parseFloat(e.target.value)]);
                }}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="k"
                type="number"
                value={condition.parameters?.k || 0.1}
                onChange={(e) => handleParamChange(index, 'k', parseFloat(e.target.value))}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label="epsilon"
                type="number"
                value={condition.parameters?.epsilon || 0.1}
                onChange={(e) => handleParamChange(index, 'epsilon', parseFloat(e.target.value))}
                fullWidth
                size="small"
              />
            </Grid>
          </Grid>
        );
      case 'pressure_outlet':
        return (
          <TextField
            label="Gauge Pressure"
            type="number"
            value={condition.parameters?.pressure || 0}
            onChange={(e) => handleParamChange(index, 'pressure', parseFloat(e.target.value))}
            fullWidth
            size="small"
          />
        );
      default:
        return null;
    }
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Boundary Conditions
      </Typography>
      {conditions.map((condition, index) => (
        <Accordion key={condition.name} defaultExpanded={index === 0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box display="flex" justifyContent="space-between" width="100%">
              <Typography>{condition.name}</Typography>
              <Typography color="text.secondary">
                {BOUNDARY_TYPES.find(t => t.value === condition.type)?.label || condition.type}
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <FormControl fullWidth size="small">
                  <InputLabel>Type</InputLabel>
                  <Select
                    value={condition.type}
                    onChange={(e) => handleTypeChange(index, e.target.value)}
                    label="Type"
                  >
                    {BOUNDARY_TYPES.map(type => (
                      <MenuItem key={type.value} value={type.value}>
                        {type.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                {renderParams(condition, index)}
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};

export default BoundaryConditionsPanel;
