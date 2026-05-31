import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Drawer,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  Grid,
  Card,
  CardContent,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

import { caseApi } from '../api';

const ComparePanel = ({ case1, onClose, cases }) => {
  const [case2Id, setCase2Id] = useState('');
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (case1 && case2Id) {
      loadComparison();
    }
  }, [case1, case2Id]);

  const loadComparison = async () => {
    setLoading(true);
    try {
      const response = await caseApi.compare(case1.id, case2Id);
      setComparison(response.data);
    } catch (error) {
      console.error('Failed to load comparison:', error);
    }
    setLoading(false);
  };

  const availableCases = cases?.filter(c => c.id !== case1?.id) || [];

  return (
    <Drawer
      anchor="right"
      open={!!case1}
      onClose={onClose}
      variant="persistent"
      sx={{
        '& .MuiDrawer-paper': { width: 480, boxSizing: 'border-box' },
      }}
    >
      <Box p={2}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">Case Comparison</Typography>
          <Button
            startIcon={<CloseIcon />}
            onClick={onClose}
            size="small"
          >
            Close
          </Button>
        </Box>

        {case1 && (
          <>
            <Grid container spacing={2} mb={2}>
              <Grid item xs={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="subtitle2">Case 1</Typography>
                    <Typography variant="h6">{case1.name}</Typography>
                    <Chip
                      label={case1.status}
                      size="small"
                      sx={{ mt: 1 }}
                    />
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth size="small">
                  <InputLabel>Select Case 2</InputLabel>
                  <Select
                    value={case2Id}
                    onChange={(e) => setCase2Id(e.target.value)}
                    label="Select Case 2"
                  >
                    {availableCases.map(c => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            {comparison && (
              <>
                <Typography variant="subtitle1" gutterBottom>
                  Mesh Quality Comparison
                </Typography>
                <TableContainer component={Paper}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Parameter</TableCell>
                        <TableCell align="right">{comparison.case1.name}</TableCell>
                        <TableCell align="right">{comparison.case2?.name}</TableCell>
                        <TableCell align="right">Delta</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {comparison.differences?.length > 0 ? (
                        comparison.differences.map((diff, idx) => (
                          <TableRow key={idx}>
                            <TableCell>{diff.parameter}</TableCell>
                            <TableCell align="right">{diff.case1_value}</TableCell>
                            <TableCell align="right">{diff.case2_value}</TableCell>
                            <TableCell align="right" color={diff.delta > 0 ? 'success' : 'error'}>
                              {diff.delta > 0 ? '+' : ''}{diff.delta.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} align="center">
                            No differences found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Grid container spacing={2} mt={2}>
                  <Grid item xs={6}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle2" gutterBottom>
                          {comparison.case1.name} Config
                        </Typography>
                        <Typography variant="body2">
                          Method: {comparison.case1.mesh_config?.method}
                        </Typography>
                        <Typography variant="body2">
                          Refinement: {comparison.case1.mesh_config?.refinement_level}
                        </Typography>
                        <Typography variant="body2">
                          Solver: {comparison.case1.solver_config?.solver}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={6}>
                    {comparison.case2 && (
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="subtitle2" gutterBottom>
                            {comparison.case2.name} Config
                          </Typography>
                          <Typography variant="body2">
                            Method: {comparison.case2.mesh_config?.method}
                          </Typography>
                          <Typography variant="body2">
                            Refinement: {comparison.case2.mesh_config?.refinement_level}
                          </Typography>
                          <Typography variant="body2">
                            Solver: {comparison.case2.solver_config?.solver}
                          </Typography>
                        </CardContent>
                      </Card>
                    )}
                  </Grid>
                </Grid>
              </>
            )}
          </>
        )}
      </Box>
    </Drawer>
  );
};

export default ComparePanel;
