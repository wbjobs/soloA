import React, { useState } from 'react';
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Grid,
  Card,
  CardContent,
  Button,
  LinearProgress,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

const SOLVERS = [
  { value: 'simpleFoam', label: 'simpleFoam (Steady State)' },
  { value: 'pisoFoam', label: 'pisoFoam (Transient)' },
  { value: 'icoFoam', label: 'icoFoam (Laminar)' },
];

const TURBULENCE_MODELS = [
  { value: 'kEpsilon', label: 'k-epsilon' },
  { value: 'kOmega', label: 'k-omega' },
  { value: 'laminar', label: 'Laminar' },
];

const SolverConfigPanel = ({ config, progress, onRun, onConfigChange }) => {
  const [localConfig, setLocalConfig] = useState(config || {
    solver: 'simpleFoam',
    end_time: 1000,
    delta_t: 1,
    write_interval: 100,
    turbulence_model: 'kEpsilon',
  });

  const handleChange = (field, value) => {
    const newConfig = { ...localConfig, [field]: value };
    setLocalConfig(newConfig);
    onConfigChange(newConfig);
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Solver Configuration
      </Typography>
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <FormControl fullWidth size="small">
                <InputLabel>Solver</InputLabel>
                <Select
                  value={localConfig.solver}
                  onChange={(e) => handleChange('solver', e.target.value)}
                  label="Solver"
                >
                  {SOLVERS.map(solver => (
                    <MenuItem key={solver.value} value={solver.value}>
                      {solver.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth size="small">
                <InputLabel>Turbulence Model</InputLabel>
                <Select
                  value={localConfig.turbulence_model}
                  onChange={(e) => handleChange('turbulence_model', e.target.value)}
                  label="Turbulence Model"
                >
                  {TURBULENCE_MODELS.map(model => (
                    <MenuItem key={model.value} value={model.value}>
                      {model.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={4}>
              <TextField
                label="End Time"
                type="number"
                value={localConfig.end_time}
                onChange={(e) => handleChange('end_time', parseFloat(e.target.value))}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid item xs={4}>
              <TextField
                label="Delta T"
                type="number"
                value={localConfig.delta_t}
                onChange={(e) => handleChange('delta_t', parseFloat(e.target.value))}
                fullWidth
                size="small"
              />
            </Grid>
            <Grid item xs={4}>
              <TextField
                label="Write Interval"
                type="number"
                value={localConfig.write_interval}
                onChange={(e) => handleChange('write_interval', parseInt(e.target.value))}
                fullWidth
                size="small"
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      {progress && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="body2" gutterBottom>
              {progress.message}
            </Typography>
            <LinearProgress
              variant={progress.status === 'running' ? 'indeterminate' : 'determinate'}
              value={progress.progress * 100}
            />
            <Typography variant="caption" color="text.secondary">
              {Math.round(progress.progress * 100)}%
            </Typography>
          </CardContent>
        </Card>
      )}
      <Button
        variant="contained"
        color="primary"
        startIcon={<PlayArrowIcon />}
        onClick={onRun}
        fullWidth
        disabled={progress?.status === 'running'}
      >
        Run Solver
      </Button>
    </Box>
  );
};

export default SolverConfigPanel;
