import numpy as np
import h5py
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple


class WavefieldPostprocessor:
    """Postprocessing utilities for wavefield data."""

    def __init__(self, hdf5_path: Path):
        self.hdf5_path = Path(hdf5_path)
        self._cache = {}

    def _open_hdf5(self) -> h5py.File:
        return h5py.File(self.hdf5_path, 'r')

    def get_mesh_info(self) -> Dict[str, Any]:
        """Get mesh information from HDF5."""
        with self._open_hdf5() as f:
            mesh_grp = f['mesh']
            return {
                'nodes': mesh_grp['nodes'][:],
                'elements': mesh_grp['elements'][:],
                'width': mesh_grp.attrs['width'],
                'height': mesh_grp.attrs['height']
            }

    def get_parameters(self) -> Dict[str, Any]:
        """Get simulation parameters."""
        with self._open_hdf5() as f:
            params_grp = f['parameters']
            return {
                'dt': params_grp.attrs['dt'],
                'total_time': params_grp.attrs['total_time'],
                'n_steps': params_grp.attrs['n_steps'],
                'vp': params_grp.attrs['vp'],
                'vs': params_grp.attrs['vs'],
                'density': params_grp.attrs['density']
            }

    def get_snapshot_count(self) -> int:
        """Get number of snapshots."""
        with self._open_hdf5() as f:
            return sum(1 for key in f.keys() if key.startswith('snapshot_'))

    def get_times(self) -> np.ndarray:
        """Get all snapshot times."""
        with self._open_hdf5() as f:
            if 'times' in f:
                return f['times'][:]
        return np.array([])

    def get_snapshot(self, index: int) -> Dict[str, Any]:
        """Get a specific snapshot by index."""
        with self._open_hdf5() as f:
            snapshot_key = f"snapshot_{index:06d}"
            if snapshot_key not in f:
                raise ValueError(f"Snapshot {index} not found")

            snap = f[snapshot_key]
            return {
                'time': snap.attrs['time'],
                'step': snap.attrs['step'],
                'ux': snap['ux'][:],
                'uy': snap['uy'][:],
                'magnitude': snap['magnitude'][:]
            }

    def interpolate_to_grid(self, data: np.ndarray, nodes: np.ndarray,
                            nx: int = 100, ny: int = 100) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Interpolate scattered node data to a regular grid.
        Useful for visualization.
        """
        from scipy.interpolate import griddata

        x_min, x_max = nodes[:, 0].min(), nodes[:, 0].max()
        y_min, y_max = nodes[:, 1].min(), nodes[:, 1].max()

        xi = np.linspace(x_min, x_max, nx)
        yi = np.linspace(y_min, y_max, ny)
        XI, YI = np.meshgrid(xi, yi)

        grid_data = griddata(nodes, data, (XI, YI), method='linear', fill_value=0)

        return XI, YI, grid_data

    def get_waveform_at_point(self, x: float, y: float) -> Dict[str, Any]:
        """Extract waveform time series at a specific receiver point."""
        mesh_info = self.get_mesh_info()
        nodes = mesh_info['nodes']

        distances = np.linalg.norm(nodes - np.array([x, y]), axis=1)
        node_idx = np.argmin(distances)

        times = []
        ux_vals = []
        uy_vals = []

        n_snapshots = self.get_snapshot_count()
        for i in range(n_snapshots):
            snap = self.get_snapshot(i)
            times.append(snap['time'])
            ux_vals.append(snap['ux'][node_idx])
            uy_vals.append(snap['uy'][node_idx])

        return {
            'time': np.array(times),
            'ux': np.array(ux_vals),
            'uy': np.array(uy_vals),
            'node_index': int(node_idx),
            'actual_position': nodes[node_idx]
        }

    def get_all_snapshots_for_visualization(self, nx: int = 50, ny: int = 50) -> Dict[str, Any]:
        """Get all snapshots interpolated to a regular grid for visualization."""
        mesh_info = self.get_mesh_info()
        nodes = mesh_info['nodes']

        times = self.get_times()
        n_snapshots = len(times)

        ux_frames = []
        uy_frames = []
        magnitude_frames = []

        for i in range(n_snapshots):
            snap = self.get_snapshot(i)

            _, _, ux_grid = self.interpolate_to_grid(snap['ux'], nodes, nx, ny)
            _, _, uy_grid = self.interpolate_to_grid(snap['uy'], nodes, nx, ny)
            _, _, mag_grid = self.interpolate_to_grid(snap['magnitude'], nodes, nx, ny)

            ux_frames.append(ux_grid.astype(np.float32))
            uy_frames.append(uy_grid.astype(np.float32))
            magnitude_frames.append(mag_grid.astype(np.float32))

        return {
            'times': times,
            'ux': np.array(ux_frames),
            'uy': np.array(uy_frames),
            'magnitude': np.array(magnitude_frames),
            'nx': nx,
            'ny': ny,
            'width': mesh_info['width'],
            'height': mesh_info['height']
        }

    def get_snapshot_for_web(self, index: int, nx: int = 64, ny: int = 64) -> Dict[str, Any]:
        """Get a single snapshot optimized for web visualization."""
        mesh_info = self.get_mesh_info()
        nodes = mesh_info['nodes']

        snap = self.get_snapshot(index)

        XI, YI, ux_grid = self.interpolate_to_grid(snap['ux'], nodes, nx, ny)
        _, _, uy_grid = self.interpolate_to_grid(snap['uy'], nodes, nx, ny)
        _, _, mag_grid = self.interpolate_to_grid(snap['magnitude'], nodes, nx, ny)

        ux_normalized = self._normalize(ux_grid)
        uy_normalized = self._normalize(uy_grid)
        mag_normalized = self._normalize(mag_grid)

        return {
            'time': float(snap['time']),
            'step': int(snap['step']),
            'index': index,
            'nx': nx,
            'ny': ny,
            'width': float(mesh_info['width']),
            'height': float(mesh_info['height']),
            'x_coords': XI[0, :].tolist(),
            'y_coords': YI[:, 0].tolist(),
            'ux': ux_normalized.tolist(),
            'uy': uy_normalized.tolist(),
            'magnitude': mag_normalized.tolist(),
            'ux_raw': ux_grid.tolist(),
            'uy_raw': uy_grid.tolist(),
            'magnitude_raw': mag_grid.tolist()
        }

    def _normalize(self, data: np.ndarray) -> np.ndarray:
        """Normalize data to [0, 1] range."""
        min_val = data.min()
        max_val = data.max()
        if max_val == min_val:
            return np.zeros_like(data)
        return (data - min_val) / (max_val - min_val)

    def get_seismogram(self, receivers: List[Tuple[float, float]]) -> Dict[str, Any]:
        """Get seismograms at multiple receiver points."""
        results = []
        for x, y in receivers:
            wf = self.get_waveform_at_point(x, y)
            results.append({
                'receiver_x': x,
                'receiver_y': y,
                'actual_x': float(wf['actual_position'][0]),
                'actual_y': float(wf['actual_position'][1]),
                'time': wf['time'].tolist(),
                'ux': wf['ux'].tolist(),
                'uy': wf['uy'].tolist()
            })
        return {'seismograms': results}
