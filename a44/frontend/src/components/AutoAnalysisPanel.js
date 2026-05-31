import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  Chip,
  LinearProgress,
  Alert,
  IconButton,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import AddIcon from '@mui/icons-material/Add';

import { amrApi } from '../api-extensions';

const AutoAnalysisPanel = ({
  caseId,
  onRegionsFound,
  onError,
}) => {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const runAnalysis = useCallback(async () => {
    if (!caseId) return;

    setLoading(true);
    try {
      const response = await amrApi.analyzeAndSuggest(caseId);
      setAnalysis(response.data);
      
      if (onRegionsFound && response.data.suggested_regions?.length > 0) {
        onRegionsFound(response.data.suggested_regions);
      }
    } catch (error) {
      console.error('Analysis failed:', error);
      if (onError) onError('Analysis failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [caseId, onRegionsFound, onError]);

  const applySuggestions = async () => {
    if (!caseId) return;

    setLoading(true);
    try {
      const response = await amrApi.applySuggested(caseId);
      if (onRegionsFound) {
        onRegionsFound(null, response.data);
      }
    } catch (error) {
      console.error('Failed to apply suggestions:', error);
      if (onError) onError('Failed to apply suggestions');
    } finally {
      setLoading(false);
    }
  };

  const getQualityColor = (score) => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'warning';
    return 'error';
  };

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        <AutoFixHighIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
        Automatic Analysis
      </Typography>

      <Typography variant="body2" color="text.secondary" gutterBottom>
        Analyze solution gradients and suggest refinement regions
      </Typography>

      <Box mb={2}>
        <Button
          variant="contained"
          startIcon={loading ? <RefreshIcon /> : <AutoFixHighIcon />}
          onClick={runAnalysis}
          disabled={!caseId || loading}
          fullWidth
        >
          {loading ? 'Analyzing...' : 'Run Error Estimation'}
        </Button>
      </Box>

      {loading && (
        <Box mb={2}>
          <LinearProgress />
          <Typography variant="caption" display="block" align="center" sx={{ mt: 1 }}>
            Calculating gradients and detecting flow features...
          </Typography>
        </Box>
      )}

      {analysis && (
        <>
          {analysis.quality_analysis?.overall && (
            <Alert
              severity={analysis.quality_analysis.overall.needs_refinement ? 'warning' : 'success'}
              icon={analysis.quality_analysis.overall.needs_refinement ? <WarningIcon /> : <CheckCircleIcon />}
              sx={{ mb: 2 }}
            >
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography>
                  {analysis.quality_analysis.overall.needs_refinement
                    ? 'Refinement recommended'
                    : 'Solution quality is good'}
                </Typography>
                <Chip
                  label={`Quality: ${analysis.quality_analysis.overall.quality_score?.toFixed(0)}/100`}
                  color={getQualityColor(analysis.quality_analysis.overall.quality_score)}
                />
              </Box>
            </Alert>
          )}

          {analysis.quality_analysis?.pressure && (
            <Box mb={2}>
              <Typography variant="subtitle2" gutterBottom>
                Pressure Field Analysis
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <Typography variant="body2">High Error Points:</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" align="right">
                    {analysis.quality_analysis.pressure.high_error_points?.toLocaleString()}
                    ({analysis.quality_analysis.pressure.high_error_percentage?.toFixed(1)}%)
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2">Max Error:</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" align="right">
                    {analysis.quality_analysis.pressure.max_error?.toExponential(2)}
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          )}

          {analysis.quality_analysis?.velocity && (
            <Box mb={2}>
              <Typography variant="subtitle2" gutterBottom>
                Velocity Field Analysis
              </Typography>
              <Grid container spacing={1}>
                <Grid item xs={6}>
                  <Typography variant="body2">High Error Points:</Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" align="right">
                    {analysis.quality_analysis.velocity.high_error_points?.toLocaleString()}
                    ({analysis.quality_analysis.velocity.high_error_percentage?.toFixed(1)}%)
                  </Typography>
                </Grid>
              </Grid>
            </Box>
          )}

          {analysis.quality_analysis?.vortices && (
            <Box mb={2}>
              <Typography variant="subtitle2" gutterBottom>
                Detected Features
              </Typography>
              <Chip
                label={`Vortices: ${analysis.quality_analysis.vortices.vortex_points?.toLocaleString()} points`}
                color="info"
                size="small"
              />
            </Box>
          )}

          {analysis.suggested_regions?.length > 0 && (
            <>
              <Typography variant="subtitle2" gutterBottom>
                Suggested Refinement Regions ({analysis.suggested_regions.length})
              </Typography>
              
              {analysis.suggested_regions.map((region, idx) => (
                <Paper variant="outlined" sx={{ p: 2, mb: 1 }} key={region.id}>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Box>
                      <Chip
                        label={region.name}
                        color="warning"
                        size="small"
                        sx={{ mr: 1 }}
                      />
                      <Chip
                        label={`L${region.refinement_level}`}
                        variant="outlined"
                        size="small"
                        sx={{ mr: 1 }}
                      />
                      <Chip
                        label={`${region.n_points?.toLocaleString()} pts`}
                        size="small"
                      />
                    </Box>
                    <Typography variant="caption">
                      Center: ({region.center?.map(c => c.toFixed(2)).join(', ')})
                    </Typography>
                  </Box>
                </Paper>
              ))}

              <Button
                variant="contained"
                color="success"
                startIcon={<AddIcon />}
                onClick={applySuggestions}
                disabled={loading}
                fullWidth
                sx={{ mt: 1 }}
              >
                Apply All Suggestions
              </Button>
            </>
          )}

          {analysis.suggested_regions?.length === 0 && (
            <Alert severity="info">
              No refinement regions suggested. Solution quality is within acceptable limits.
            </Alert>
          )}
        </>
      )}
    </Paper>
  );
};

export default AutoAnalysisPanel;
