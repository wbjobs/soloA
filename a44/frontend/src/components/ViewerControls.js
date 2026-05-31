import React from 'react';
import {
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  Switch,
  FormControlLabel,
  Divider,
  Grid,
  Chip,
} from '@mui/material';

const REPRESENTATIONS = [
  { value: 'surface', label: 'Surface' },
  { value: 'wireframe', label: 'Wireframe' },
  { value: 'points', label: 'Points' },
];

const VIEW_MODES = [
  { value: 'mesh', label: 'Mesh' },
  { value: 'field', label: 'Field' },
];

const ViewerControls = ({
  viewMode,
  field,
  availableFields,
  representation,
  slice,
  isoSurface,
  onViewModeChange,
  onFieldChange,
  onRepresentationChange,
  onSliceChange,
  onIsoSurfaceChange,
}) => {
  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        Viewer Controls
      </Typography>
      
      <FormControl fullWidth size="small" sx={{ mb: 2 }}>
        <InputLabel>View Mode</InputLabel>
        <Select
          value={viewMode}
          onChange={(e) => onViewModeChange(e.target.value)}
          label="View Mode"
        >
          {VIEW_MODES.map(mode => (
            <MenuItem key={mode.value} value={mode.value}>{mode.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {viewMode === 'field' && availableFields?.length > 0 && (
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>Field</InputLabel>
          <Select
            value={field}
            onChange={(e) => onFieldChange(e.target.value)}
            label="Field"
          >
            {availableFields.map(f => (
              <MenuItem key={f} value={f}>{f}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      <FormControl fullWidth size="small" sx={{ mb: 2 }}>
        <InputLabel>Representation</InputLabel>
        <Select
          value={representation}
          onChange={(e) => onRepresentationChange(e.target.value)}
          label="Representation"
        >
          {REPRESENTATIONS.map(rep => (
            <MenuItem key={rep.value} value={rep.value}>{rep.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle1" gutterBottom>
        Slice
      </Typography>
      <FormControlLabel
        control={
          <Switch
            checked={slice.enabled}
            onChange={(e) => onSliceChange({ enabled: e.target.checked })}
          />
        }
        label="Enable Slice"
      />
      
      {slice.enabled && (
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <FormControl fullWidth size="small">
              <InputLabel>Axis</InputLabel>
              <Select
                value={slice.axis}
                onChange={(e) => onSliceChange({ axis: e.target.value })}
                label="Axis"
              >
                <MenuItem value="x">X</MenuItem>
                <MenuItem value="y">Y</MenuItem>
                <MenuItem value="z">Z</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <Typography gutterBottom>Position: {(slice.position * 100).toFixed(1)}%</Typography>
            <Slider
              value={slice.position}
              onChange={(e, val) => onSliceChange({ position: val })}
              min={0}
              max={1}
              step={0.01}
            />
          </Grid>
        </Grid>
      )}

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle1" gutterBottom>
        Iso Surface
      </Typography>
      <FormControlLabel
        control={
          <Switch
            checked={isoSurface.enabled}
            onChange={(e) => onIsoSurfaceChange({ enabled: e.target.checked })}
          />
        }
        label="Enable Iso Surface"
      />
      
      {isoSurface.enabled && (
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <Typography gutterBottom>Iso Value: {(isoSurface.value * 100).toFixed(1)}%</Typography>
            <Slider
              value={isoSurface.value}
              onChange={(e, val) => onIsoSurfaceChange({ value: val })}
              min={0}
              max={1}
              step={0.01}
            />
          </Grid>
        </Grid>
      )}
    </Box>
  );
};

export default ViewerControls;
