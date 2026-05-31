import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  CssBaseline,
  AppBar,
  Toolbar,
  Typography,
  Drawer,
  IconButton,
  Tabs,
  Tab,
  Paper,
  Grid,
  Button,
  LinearProgress,
  Snackbar,
  Alert,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import GridOnIcon from '@mui/icons-material/GridOn';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

import { caseApi, dataApi, createWebSocket } from './api';
import useStore from './store';

import CaseList from './components/CaseList';
import VtkViewer from './components/VtkViewer';
import PerformanceVtkViewer from './components/PerformanceVtkViewer';
import BoundaryConditionsPanel from './components/BoundaryConditionsPanel';
import SolverConfigPanel from './components/SolverConfigPanel';
import ViewerControls from './components/ViewerControls';
import ResidualsChart from './components/ResidualsChart';
import ComparePanel from './components/ComparePanel';
import AmrBoxWidget from './components/AmrBoxWidget';
import AutoAnalysisPanel from './components/AutoAnalysisPanel';
import ValidationPanel from './components/ValidationPanel';

import { amrApi } from './api-extensions';

const DRAWER_WIDTH = 320;

function App() {
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [geometry, setGeometry] = useState(null);
  const [fieldData, setFieldData] = useState(null);
  const [availableFields, setAvailableFields] = useState([]);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });
  const [compareCase, setCompareCase] = useState(null);
  const fileInputRef = useRef(null);
  const progressWsRef = useRef(null);
  const solverWsRef = useRef(null);

  const [amrRegions, setAmrRegions] = useState([]);
  const [rendererContext, setRendererContext] = useState(null);
  const [activePanel, setActivePanel] = useState('setup');

  const {
    currentCase,
    currentCaseData,
    setCurrentCase,
    setCurrentCaseData,
    viewMode,
    field,
    slice,
    isoSurface,
    representation,
    residuals,
    progress,
    setViewMode,
    setField,
    setSlice,
    setIsoSurface,
    setRepresentation,
    addResidual,
    clearResiduals,
    setProgress,
  } = useStore();

  useEffect(() => {
    if (currentCase) {
      loadCaseData(currentCase.id);
      loadGeometry(currentCase.id);
      loadFields(currentCase.id);
      loadAmrRegions(currentCase.id);
    } else {
      setGeometry(null);
      setFieldData(null);
      setAvailableFields([]);
      setAmrRegions([]);
    }
  }, [currentCase]);

  useEffect(() => {
    if (currentCase && viewMode === 'field' && field) {
      loadFieldData(currentCase.id, field);
    }
  }, [currentCase, viewMode, field]);

  useEffect(() => {
    if (currentCase) {
      connectWebSockets(currentCase.id);
    }

    return () => {
      if (progressWsRef.current) {
        progressWsRef.current.close();
      }
      if (solverWsRef.current) {
        solverWsRef.current.close();
      }
    };
  }, [currentCase]);

  const connectWebSockets = (caseId) => {
    if (progressWsRef.current) {
      progressWsRef.current.close();
    }
    if (solverWsRef.current) {
      solverWsRef.current.close();
    }

    progressWsRef.current = createWebSocket('progress', caseId);
    progressWsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'progress') {
        setProgress(data);
      }
    };

    solverWsRef.current = createWebSocket('solver', caseId);
    solverWsRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'log' && data.data) {
        addResidual(data.data);
      }
    };
  };

  const loadCaseData = async (caseId) => {
    try {
      const response = await caseApi.getFull(caseId);
      setCurrentCaseData(response.data);
    } catch (error) {
      console.error('Failed to load case data:', error);
    }
  };

  const loadGeometry = async (caseId) => {
    try {
      const response = await dataApi.getGeometry(caseId);
      setGeometry(response.data.geometry);
    } catch (error) {
      console.log('No geometry data available yet');
      setGeometry(null);
    }
  };

  const loadFields = async (caseId) => {
    try {
      const response = await dataApi.getFields(caseId);
      const allFields = new Set();
      response.data.fields_by_time?.forEach(fb => {
        fb.fields?.forEach(f => allFields.add(f));
      });
      setAvailableFields(Array.from(allFields));
    } catch (error) {
      console.log('No fields available yet');
      setAvailableFields([]);
    }
  };

  const loadFieldData = async (caseId, fieldName) => {
    try {
      const response = await dataApi.getField(caseId, fieldName);
      setFieldData(response.data);
    } catch (error) {
      console.log('No field data available');
      setFieldData(null);
    }
  };

  const handleCaseSelect = (caseItem) => {
    setCurrentCase(caseItem);
    clearResiduals();
    setProgress(null);
  };

  const handleStlUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !currentCase) return;

    try {
      setSnackbar({ open: true, message: 'Uploading STL...', severity: 'info' });
      await caseApi.uploadStl(currentCase.id, file);
      setSnackbar({ open: true, message: 'STL uploaded successfully', severity: 'success' });
      loadCaseData(currentCase.id);
    } catch (error) {
      setSnackbar({ open: true, message: 'Upload failed', severity: 'error' });
    }
  };

  const handleGenerateMesh = async () => {
    if (!currentCase) return;

    try {
      clearResiduals();
      setProgress(null);
      const response = await caseApi.generateMesh(currentCase.id);
      setSnackbar({ open: true, message: 'Mesh generation started', severity: 'info' });
      
      const checkProgress = async () => {
        try {
          const progressResponse = await caseApi.getProgress(response.data.task_id);
          setProgress(progressResponse.data);
          if (progressResponse.data.status !== 'completed' && progressResponse.data.status !== 'failed') {
            setTimeout(checkProgress, 2000);
          } else {
            loadCaseData(currentCase.id);
            loadGeometry(currentCase.id);
            setSnackbar({ 
              open: true, 
              message: `Mesh generation ${progressResponse.data.status}`, 
              severity: progressResponse.data.status === 'completed' ? 'success' : 'error' 
            });
          }
        } catch (e) {
          console.error('Progress check failed:', e);
        }
      };
      setTimeout(checkProgress, 1000);
    } catch (error) {
      setSnackbar({ open: true, message: 'Failed to start mesh generation', severity: 'error' });
    }
  };

  const handleRunSolver = async () => {
    if (!currentCase) return;

    try {
      clearResiduals();
      const response = await caseApi.runSolver(currentCase.id);
      setSnackbar({ open: true, message: 'Solver started', severity: 'info' });
      
      const checkProgress = async () => {
        try {
          const progressResponse = await caseApi.getProgress(response.data.task_id);
          setProgress(progressResponse.data);
          if (progressResponse.data.status !== 'completed' && progressResponse.data.status !== 'failed') {
            setTimeout(checkProgress, 2000);
          } else {
            loadCaseData(currentCase.id);
            loadFields(currentCase.id);
            setSnackbar({ 
              open: true, 
              message: `Solver ${progressResponse.data.status}`, 
              severity: progressResponse.data.status === 'completed' ? 'success' : 'error' 
            });
          }
        } catch (e) {
          console.error('Progress check failed:', e);
        }
      };
      setTimeout(checkProgress, 1000);
    } catch (error) {
      setSnackbar({ open: true, message: 'Failed to start solver', severity: 'error' });
    }
  };

  const handleBoundaryConditionsChange = (conditions) => {
    if (!currentCaseData) return;
    
    caseApi.update(currentCaseData.id, {
      boundary_conditions: conditions,
    }).then(() => {
      loadCaseData(currentCaseData.id);
    });
  };

  const handleSolverConfigChange = (config) => {
    if (!currentCaseData) return;
    
    caseApi.update(currentCaseData.id, {
      solver_config: config,
    });
  };

  const loadAmrRegions = async (caseId) => {
    try {
      const response = await amrApi.getRegions(caseId);
      setAmrRegions(response.data.regions || []);
    } catch (error) {
      console.log('No AMR regions yet');
      setAmrRegions([]);
    }
  };

  const handleRegionAdd = async (region) => {
    if (!currentCase) return;
    
    try {
      const response = await amrApi.addRegion(currentCase.id, region);
      setAmrRegions(prev => [...prev, response.data.region]);
      setSnackbar({ open: true, message: 'Region added successfully', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: 'Failed to add region', severity: 'error' });
    }
  };

  const handleRegionUpdate = async (region) => {
    if (!currentCase) return;
    
    try {
      await amrApi.updateRegion(currentCase.id, region.id, region);
      setAmrRegions(prev => prev.map(r => r.id === region.id ? region : r));
    } catch (error) {
      setSnackbar({ open: true, message: 'Failed to update region', severity: 'error' });
    }
  };

  const handleRegionDelete = async (regionId) => {
    if (!currentCase) return;
    
    try {
      await amrApi.deleteRegion(currentCase.id, regionId);
      setAmrRegions(prev => prev.filter(r => r.id !== regionId));
      setSnackbar({ open: true, message: 'Region deleted', severity: 'success' });
    } catch (error) {
      setSnackbar({ open: true, message: 'Failed to delete region', severity: 'error' });
    }
  };

  const handleAutoRegionsFound = (suggestedRegions, appliedResult) => {
    if (appliedResult) {
      loadAmrRegions(currentCase.id);
      setSnackbar({ 
        open: true, 
        message: `${appliedResult.applied} regions applied`, 
        severity: 'success' 
      });
    } else if (suggestedRegions) {
      setSnackbar({ 
        open: true, 
        message: `Found ${suggestedRegions.length} suggested regions`, 
        severity: 'info' 
      });
    }
  };

  const handleRendererReady = (context) => {
    setRendererContext(context);
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  const getGeometryBounds = () => {
    if (geometry?.bounds) {
      return geometry.bounds;
    }
    if (rendererContext?.metadata?.bounds) {
      return rendererContext.metadata.bounds;
    }
    return [-5, 5, -5, 5, -5, 5];
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          transition: (theme) =>
            theme.transitions.create(['margin', 'width'], {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
          ...(drawerOpen && {
            width: `calc(100% - ${DRAWER_WIDTH}px)`,
            marginLeft: `${DRAWER_WIDTH}px`,
            transition: (theme) =>
              theme.transitions.create(['margin', 'width'], {
                easing: theme.transitions.easing.easeOut,
                duration: theme.transitions.duration.enteringScreen,
              }),
          }),
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setDrawerOpen(!drawerOpen)}
            sx={{ mr: 2 }}
          >
            {drawerOpen ? <ChevronLeftIcon /> : <MenuIcon />}
          </IconButton>
          <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
            CFD Platform
          </Typography>
          {currentCase && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleStlUpload}
                accept=".stl"
                style={{ display: 'none' }}
              />
              <Button
                color="inherit"
                startIcon={<CloudUploadIcon />}
                onClick={() => fileInputRef.current?.click()}
                sx={{ mr: 1 }}
              >
                Upload STL
              </Button>
              <Button
                color="inherit"
                startIcon={<GridOnIcon />}
                onClick={handleGenerateMesh}
                sx={{ mr: 1 }}
              >
                Generate Mesh
              </Button>
            </>
          )}
        </Toolbar>
      </AppBar>

      <Drawer
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
          },
        }}
        variant="persistent"
        anchor="left"
        open={drawerOpen}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', p: 2 }}>
          <CaseList
            selectedCase={currentCase}
            onSelect={handleCaseSelect}
            onCompare={setCompareCase}
          />
        </Box>
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          height: '100vh',
          overflow: 'hidden',
          mt: 8,
          ml: drawerOpen ? 0 : -DRAWER_WIDTH,
          transition: (theme) =>
            theme.transitions.create('margin', {
              easing: theme.transitions.easing.sharp,
              duration: theme.transitions.duration.leavingScreen,
            }),
        }}
      >
        <Grid container sx={{ height: '100%' }}>
          <Grid item xs={9} sx={{ height: '100%', position: 'relative' }}>
            {currentCase ? (
              <PerformanceVtkViewer
                caseId={currentCase.id}
                viewMode={viewMode}
                fieldName={field}
                representation={representation}
                slice={slice}
                isoSurface={isoSurface}
                onRendererReady={handleRendererReady}
              />
            ) : (
              <Box
                sx={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Paper sx={{ p: 4 }}>
                  <Typography variant="h6" gutterBottom>
                    Select a case to begin
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Create a new case or select an existing one from the sidebar
                  </Typography>
                </Paper>
              </Box>
            )}
          </Grid>
          
          <Grid item xs={3} sx={{ height: '100%', overflow: 'auto', p: 2 }}>
            <Paper sx={{ p: 2, mb: 2 }}>
              <ViewerControls
                viewMode={viewMode}
                field={field}
                availableFields={availableFields}
                representation={representation}
                slice={slice}
                isoSurface={isoSurface}
                onViewModeChange={setViewMode}
                onFieldChange={setField}
                onRepresentationChange={setRepresentation}
                onSliceChange={setSlice}
                onIsoSurfaceChange={setIsoSurface}
              />
            </Paper>

            {currentCaseData && (
              <>
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Tabs
                    value={activePanel}
                    onChange={(e, v) => setActivePanel(v)}
                    variant="fullWidth"
                    sx={{ mb: 1 }}
                  >
                    <Tab label="Setup" value="setup" />
                    <Tab label="AMR" value="amr" />
                    <Tab label="Validate" value="validate" />
                  </Tabs>
                  
                  <Box sx={{ mt: 1 }}>
                    {activePanel === 'setup' && (
                      <Paper variant="outlined" sx={{ p: 1 }}>
                        <Tabs
                          value={activeTab}
                          onChange={handleTabChange}
                          variant="fullWidth"
                        >
                          <Tab label="Boundary" />
                          <Tab label="Solver" />
                          <Tab label="Residuals" />
                        </Tabs>
                        
                        <Box sx={{ mt: 1 }}>
                          {activeTab === 0 && (
                            <BoundaryConditionsPanel
                              boundaryConditions={currentCaseData.boundary_conditions}
                              patches={geometry?.boundary}
                              onChange={handleBoundaryConditionsChange}
                            />
                          )}
                          
                          {activeTab === 1 && (
                            <SolverConfigPanel
                              config={currentCaseData.solver_config}
                              progress={progress}
                              onRun={handleRunSolver}
                              onConfigChange={handleSolverConfigChange}
                            />
                          )}
                          
                          {activeTab === 2 && (
                            <ResidualsChart data={residuals} />
                          )}
                        </Box>
                      </Paper>
                    )}
                    
                    {activePanel === 'amr' && (
                      <Box>
                        {rendererContext?.getRenderer && rendererContext.getRenderer()?.renderer && (
                          <AmrBoxWidget
                            renderer={rendererContext.getRenderer().renderer}
                            regions={amrRegions}
                            onRegionAdd={handleRegionAdd}
                            onRegionUpdate={handleRegionUpdate}
                            onRegionDelete={handleRegionDelete}
                            geometryBounds={getGeometryBounds()}
                          />
                        )}
                        <AutoAnalysisPanel
                          caseId={currentCase?.id}
                          onRegionsFound={handleAutoRegionsFound}
                          onError={(msg) => setSnackbar({ open: true, message: msg, severity: 'error' })}
                        />
                      </Box>
                    )}
                    
                    {activePanel === 'validate' && (
                      <ValidationPanel
                        caseId={currentCase?.id}
                        onError={(msg) => setSnackbar({ open: true, message: msg, severity: 'error' })}
                      />
                    )}
                  </Box>
                </Paper>
              </>
            )}

            {currentCaseData?.mesh_quality && (
              <Paper sx={{ p: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Mesh Quality
                </Typography>
                <Grid container spacing={1}>
                  <Grid item xs={6}>
                    <Typography variant="body2">Cells:</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right">
                      {currentCaseData.mesh_quality.n_cells?.toLocaleString()}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2">Faces:</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right">
                      {currentCaseData.mesh_quality.n_faces?.toLocaleString()}
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2">Max Non-Ortho:</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right">
                      {currentCaseData.mesh_quality.non_ortho_max?.toFixed(1)}°
                    </Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2">Max Skewness:</Typography>
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" align="right">
                      {currentCaseData.mesh_quality.skewness_max?.toFixed(2)}
                    </Typography>
                  </Grid>
                </Grid>
              </Paper>
            )}
          </Grid>
        </Grid>
      </Box>

      <ComparePanel
        case1={compareCase}
        onClose={() => setCompareCase(null)}
        cases={useStore.getState().cases}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default App;
