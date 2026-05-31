import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemButton,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Menu,
  MenuItem,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';

import { caseApi } from '../api';

const STATUS_COLORS = {
  draft: 'default',
  meshing: 'info',
  mesh_ready: 'success',
  solving: 'warning',
  completed: 'success',
  failed: 'error',
};

const CaseList = ({ selectedCase, onSelect, onCompare }) => {
  const [cases, setCases] = useState([]);
  const [open, setOpen] = useState(false);
  const [newCase, setNewCase] = useState({
    name: '',
    description: '',
  });
  const [anchorEl, setAnchorEl] = useState(null);
  const [selectedMenuCase, setSelectedMenuCase] = useState(null);

  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async () => {
    try {
      const response = await caseApi.getAll();
      setCases(response.data);
    } catch (error) {
      console.error('Failed to load cases:', error);
    }
  };

  const handleCreate = async () => {
    try {
      const response = await caseApi.create({
        name: newCase.name,
        description: newCase.description,
        version: 1,
        mesh_config: {
          method: 'snappyHexMesh',
          base_mesh_size: [10, 10, 10],
          refinement_level: 2,
        },
        solver_config: {
          solver: 'simpleFoam',
          end_time: 1000,
          delta_t: 1,
          write_interval: 100,
          turbulence_model: 'kEpsilon',
        },
        boundary_conditions: [],
      });
      setOpen(false);
      setNewCase({ name: '', description: '' });
      loadCases();
      onSelect(response.data);
    } catch (error) {
      console.error('Failed to create case:', error);
    }
  };

  const handleMenuOpen = (event, caseItem) => {
    setAnchorEl(event.currentTarget);
    setSelectedMenuCase(caseItem);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedMenuCase(null);
  };

  const handleDuplicate = async () => {
    if (!selectedMenuCase) return;
    try {
      await caseApi.duplicate(selectedMenuCase.id, `${selectedMenuCase.name} (Copy)`);
      loadCases();
    } catch (error) {
      console.error('Failed to duplicate case:', error);
    }
    handleMenuClose();
  };

  const handleDelete = async () => {
    if (!selectedMenuCase) return;
    try {
      await caseApi.delete(selectedMenuCase.id);
      loadCases();
      if (selectedCase?.id === selectedMenuCase.id) {
        onSelect(null);
      }
    } catch (error) {
      console.error('Failed to delete case:', error);
    }
    handleMenuClose();
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Typography variant="h6">Cases</Typography>
        <IconButton color="primary" onClick={() => setOpen(true)}>
          <AddIcon />
        </IconButton>
      </Box>
      
      <List dense>
        {cases.map(caseItem => (
          <ListItem
            key={caseItem.id}
            disablePadding
            secondaryAction={
              <IconButton
                edge="end"
                onClick={(e) => handleMenuOpen(e, caseItem)}
              >
                <MoreVertIcon />
              </IconButton>
            }
          >
            <ListItemButton
              selected={selectedCase?.id === caseItem.id}
              onClick={() => onSelect(caseItem)}
            >
              <ListItemText
                primary={caseItem.name}
                secondary={
                  <Chip
                    label={caseItem.status}
                    size="small"
                    color={STATUS_COLORS[caseItem.status] || 'default'}
                    variant="outlined"
                  />
                }
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleDuplicate}>
          <ContentCopyIcon fontSize="small" sx={{ mr: 1 }} />
          Duplicate
        </MenuItem>
        <MenuItem onClick={() => { onCompare(selectedMenuCase); handleMenuClose(); }}>
          <CompareArrowsIcon fontSize="small" sx={{ mr: 1 }} />
          Compare
        </MenuItem>
        <MenuItem onClick={handleDelete}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>

      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>Create New Case</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                label="Name"
                value={newCase.name}
                onChange={(e) => setNewCase({ ...newCase, name: e.target.value })}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label="Description"
                value={newCase.description}
                onChange={(e) => setNewCase({ ...newCase, description: e.target.value })}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} variant="contained">Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CaseList;
