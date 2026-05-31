import React, { useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  Card,
  CardContent,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Alert,
  LinearProgress,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import BarChartIcon from '@mui/icons-material/BarChart';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import { validationApi } from '../api-extensions';

const ValidationPanel = ({ caseId, onError }) => {
  const [loading, setLoading] = useState(false);
  const [referenceFile, setReferenceFile] = useState(null);
  const [validationResults, setValidationResults] = useState(null);
  const [quickReport, setQuickReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [openCompareDialog, setOpenCompareDialog] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);

  const loadQuickReport = useCallback(async () => {
    if (!caseId) return;
    
    setLoading(true);
    try {
      const response = await validationApi.getQuickReport(caseId);
      setQuickReport(response.data);
    } catch (error) {
      console.error('Failed to load quick report:', error);
      if (onError) onError('Failed to load quick report');
    } finally {
      setLoading(false);
    }
  }, [caseId, onError]);

  const loadHistory = useCallback(async () => {
    if (!caseId) return;
    
    try {
      const response = await validationApi.getCaseHistory(caseId);
      setHistory(response.data.results);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  }, [caseId]);

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      setReferenceFile(file);
    }
  };

  const runValidation = async () => {
    if (!caseId || !referenceFile) return;

    setLoading(true);
    try {
      const response = await validationApi.compareWithFile(caseId, referenceFile);
      setValidationResults(response.data);
      loadHistory();
    } catch (error) {
      console.error('Validation failed:', error);
      if (onError) onError('Validation failed');
    } finally {
      setLoading(false);
      setOpenCompareDialog(false);
    }
  };

  const downloadReport = async (resultId) => {
    if (!resultId) return;

    setDownloadingReport(true);
    try {
      const response = await validationApi.generateReport(resultId);
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `validation_report_${resultId}.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to generate report:', error);
      if (onError) onError('Failed to generate report');
    } finally {
      setDownloadingReport(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'success';
    if (score >= 60) return 'warning';
    return 'error';
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        <DescriptionIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
        Validation & Verification
      </Typography>

      <Grid container spacing={2} mb={2}>
        <Grid item xs={6}>
          <Button
            variant="contained"
            startIcon={<BarChartIcon />}
            onClick={loadQuickReport}
            disabled={!caseId || loading}
            fullWidth
          >
            Quick Analysis
          </Button>
        </Grid>
        <Grid item xs={6}>
          <Button
            variant="outlined"
            startIcon={<UploadFileIcon />}
            onClick={() => setOpenCompareDialog(true)}
            disabled={!caseId}
            fullWidth
          >
            Compare with Reference
          </Button>
        </Grid>
      </Grid>

      {loading && (
        <Box mb={2}>
          <LinearProgress />
        </Box>
      )}

      {quickReport && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="subtitle1" gutterBottom>
              Quick Analysis Report
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
                  <Typography variant="caption" display="block">Case</Typography>
                  <Typography variant="h6">{quickReport.case_name}</Typography>
                </Paper>
              </Grid>
              <Grid item xs={6}>
                <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
                  <Typography variant="caption" display="block">Time Steps</Typography>
                  <Typography variant="h6">{quickReport.solution_info?.time_steps}</Typography>
                </Paper>
              </Grid>
            </Grid>

            <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
              Mesh Information
            </Typography>
            <Grid container spacing={1}>
              <Grid item xs={4}>
                <Typography variant="body2">Points:</Typography>
              </Grid>
              <Grid item xs={8}>
                <Typography variant="body2" align="right">
                  {quickReport.mesh_info?.n_points?.toLocaleString()}
                </Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="body2">Cells:</Typography>
              </Grid>
              <Grid item xs={8}>
                <Typography variant="body2" align="right">
                  {quickReport.mesh_info?.n_cells?.toLocaleString()}
                </Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="body2">Max Non-Ortho:</Typography>
              </Grid>
              <Grid item xs={8}>
                <Typography variant="body2" align="right">
                  {quickReport.mesh_info?.max_non_ortho?.toFixed(1)}°
                </Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="body2">Max Skewness:</Typography>
              </Grid>
              <Grid item xs={8}>
                <Typography variant="body2" align="right">
                  {quickReport.mesh_info?.max_skewness?.toFixed(2)}
                </Typography>
              </Grid>
            </Grid>

            {quickReport.field_statistics && Object.keys(quickReport.field_statistics).length > 0 && (
              <>
                <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
                  Field Statistics
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Field</TableCell>
                        <TableCell align="right">Min</TableCell>
                        <TableCell align="right">Max</TableCell>
                        <TableCell align="right">Mean</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Object.entries(quickReport.field_statistics).map(([field, stats]) => (
                        <TableRow key={field}>
                          <TableCell>{field}</TableCell>
                          <TableCell align="right">
                            {stats.min?.toExponential(2) || stats.magnitude_min?.toExponential(2)}
                          </TableCell>
                          <TableCell align="right">
                            {stats.max?.toExponential(2) || stats.magnitude_max?.toExponential(2)}
                          </TableCell>
                          <TableCell align="right">
                            {stats.mean?.toExponential(2) || stats.magnitude_mean?.toExponential(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {validationResults && (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <CardContent>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle1">
                Validation Results
              </Typography>
              <Button
                variant="outlined"
                size="small"
                startIcon={downloadingReport ? <RefreshIcon /> : <DownloadIcon />}
                onClick={() => downloadReport(validationResults.result_id)}
                disabled={downloadingReport}
              >
                {downloadingReport ? 'Generating...' : 'Download PDF'}
              </Button>
            </Box>

            <Alert
              severity={validationResults.summary?.passed ? 'success' : 'error'}
              icon={validationResults.summary?.passed ? <CheckCircleIcon /> : <CancelIcon />}
              sx={{ mb: 2 }}
            >
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography>
                  {validationResults.summary?.passed ? 'Validation PASSED' : 'Validation FAILED'}
                </Typography>
                <Chip
                  label={`Score: ${validationResults.summary?.overall_score?.toFixed(1)}`}
                  color={getScoreColor(validationResults.summary?.overall_score)}
                />
              </Box>
            </Alert>

            {validationResults.summary?.fields?.length > 0 && (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Field</TableCell>
                      <TableCell align="right">L2 Error</TableCell>
                      <TableCell align="right">R²</TableCell>
                      <TableCell align="right">High Error</TableCell>
                      <TableCell align="center">Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {validationResults.summary.fields.map((field) => (
                      <TableRow key={field.name}>
                        <TableCell>{field.name}</TableCell>
                        <TableCell align="right">
                          {(field.relative_error * 100).toFixed(2)}%
                        </TableCell>
                        <TableCell align="right">
                          {field.r_squared?.toFixed(4)}
                        </TableCell>
                        <TableCell align="right">
                          {field.n_high_error_points?.toLocaleString()}
                        </TableCell>
                        <TableCell align="center">
                          {field.passed ? (
                            <CheckCircleIcon color="success" fontSize="small" />
                          ) : (
                            <CancelIcon color="error" fontSize="small" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      )}

      {history.length > 0 && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="subtitle2" gutterBottom>
              Validation History
            </Typography>
            <List dense>
              {history.map((item) => (
                <ListItem
                  key={item._id}
                  secondaryAction={
                    <IconButton
                      size="small"
                      onClick={() => downloadReport(item._id)}
                    >
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={
                      <Box display="flex" alignItems="center" gap={1}>
                        {item.summary?.passed ? (
                          <CheckCircleIcon color="success" fontSize="small" />
                        ) : (
                          <CancelIcon color="error" fontSize="small" />
                        )}
                        Score: {item.summary?.overall_score?.toFixed(1)}
                        <Chip
                          label={item.summary?.passed ? 'PASS' : 'FAIL'}
                          size="small"
                          color={item.summary?.passed ? 'success' : 'error'}
                          sx={{ ml: 1 }}
                        />
                      </Box>
                    }
                    secondary={new Date(item.created_at).toLocaleString()}
                  />
                </ListItem>
              ))}
            </List>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={openCompareDialog}
        onClose={() => setOpenCompareDialog(false)}
      >
        <DialogTitle>Compare with Reference Solution</DialogTitle>
        <DialogContent>
          <Box sx={{ width: 400, mt: 2 }}>
            <Typography variant="body2" gutterBottom>
              Upload a JSON file containing reference solution data.
            </Typography>
            <Typography variant="caption" color="text.secondary" gutterBottom display="block">
              Format: {'{ "U": [...], "p": [...], "k": [...], "epsilon": [...] }'}
            </Typography>
            
            <input
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
              id="reference-file-upload"
            />
            <label htmlFor="reference-file-upload">
              <Button
                variant="contained"
                component="span"
                startIcon={<UploadFileIcon />}
                fullWidth
                sx={{ mt: 2 }}
              >
                {referenceFile ? referenceFile.name : 'Select Reference File'}
              </Button>
            </label>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCompareDialog(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={runValidation}
            disabled={!referenceFile || loading}
          >
            Run Validation
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ValidationPanel;
