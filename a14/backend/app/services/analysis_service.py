import MDAnalysis as mda
import numpy as np
from typing import Optional, Dict, Any, List


def calculate_rmsd(
    universe: mda.Universe,
    start: int = 0,
    stop: Optional[int] = None,
    step: int = 1,
    selection: str = "backbone",
    reference_selection: Optional[str] = None
) -> Dict[str, Any]:
    if reference_selection is None:
        reference_selection = selection
    
    universe.trajectory[0]
    reference = universe.select_atoms(reference_selection)
    reference_coords = reference.positions.copy()
    
    atom_group = universe.select_atoms(selection)
    
    if stop is None:
        stop = len(universe.trajectory)
    
    rmsd_values = []
    times = []
    frame_indices = []
    
    for ts in universe.trajectory[start:stop:step]:
        mobile = atom_group.positions
        
        ref_atoms = universe.select_atoms(reference_selection)
        ref_coords = ref_atoms.positions
        
        min_len = min(len(mobile), len(ref_coords))
        mobile_trunc = mobile[:min_len]
        ref_trunc = ref_coords[:min_len]
        
        mobile_centered = mobile_trunc - mobile_trunc.mean(axis=0)
        ref_centered = ref_trunc - ref_trunc.mean(axis=0)
        
        rmsd_val = np.sqrt(np.mean(np.sum((mobile_centered - ref_centered)**2, axis=1)))
        
        rmsd_values.append(float(rmsd_val))
        times.append(float(ts.time))
        frame_indices.append(int(ts.frame))
    
    return {
        'analysis_type': 'rmsd',
        'selection': selection,
        'reference_selection': reference_selection,
        'times': times,
        'frame_indices': frame_indices,
        'rmsd_values': rmsd_values,
        'units': 'angstrom',
        'summary': {
            'mean': float(np.mean(rmsd_values)) if rmsd_values else 0.0,
            'std': float(np.std(rmsd_values)) if rmsd_values else 0.0,
            'min': float(np.min(rmsd_values)) if rmsd_values else 0.0,
            'max': float(np.max(rmsd_values)) if rmsd_values else 0.0
        }
    }


def calculate_rmsf(
    universe: mda.Universe,
    start: int = 0,
    stop: Optional[int] = None,
    step: int = 1,
    selection: str = "name CA"
) -> Dict[str, Any]:
    atom_group = universe.select_atoms(selection)
    
    if stop is None:
        stop = len(universe.trajectory)
    
    n_atoms = len(atom_group)
    n_frames = max(1, (stop - start + step - 1) // step)
    
    coords = np.zeros((n_frames, n_atoms, 3), dtype=np.float64)
    times = []
    frame_indices = []
    
    for i, ts in enumerate(universe.trajectory[start:stop:step]):
        if i >= n_frames:
            break
        coords[i] = atom_group.positions
        times.append(float(ts.time))
        frame_indices.append(int(ts.frame))
    
    avg_coords = coords.mean(axis=0)
    
    fluctuations = np.zeros(n_atoms)
    for i in range(n_atoms):
        deviations = coords[:, i] - avg_coords[i]
        fluctuations[i] = np.sqrt(np.mean(np.sum(deviations**2, axis=1)))
    
    atom_names = atom_group.names.tolist()
    atom_resids = atom_group.resids.tolist()
    atom_resnames = atom_group.resnames.tolist()
    
    unique_resids = []
    residue_rmsf = []
    residue_names = []
    
    seen_resids = {}
    for resid, rmsf_val, resname in zip(atom_resids, fluctuations.tolist(), atom_resnames):
        if resid not in seen_resids:
            seen_resids[resid] = []
            unique_resids.append(resid)
            residue_names.append(resname)
        seen_resids[resid].append(rmsf_val)
    
    for resid in unique_resids:
        residue_rmsf.append(float(np.mean(seen_resids[resid])))
    
    return {
        'analysis_type': 'rmsf',
        'selection': selection,
        'atom_indices': atom_group.indices.tolist(),
        'atom_names': atom_names,
        'atom_resids': atom_resids,
        'atom_resnames': atom_resnames,
        'atom_rmsf_values': fluctuations.tolist(),
        'residue_ids': unique_resids,
        'residue_names': residue_names,
        'residue_rmsf_values': residue_rmsf,
        'units': 'angstrom',
        'times': times,
        'frame_indices': frame_indices,
        'summary': {
            'mean_atom': float(np.mean(fluctuations)) if len(fluctuations) > 0 else 0.0,
            'std_atom': float(np.std(fluctuations)) if len(fluctuations) > 0 else 0.0,
            'min_atom': float(np.min(fluctuations)) if len(fluctuations) > 0 else 0.0,
            'max_atom': float(np.max(fluctuations)) if len(fluctuations) > 0 else 0.0,
            'mean_residue': float(np.mean(residue_rmsf)) if residue_rmsf else 0.0,
            'std_residue': float(np.std(residue_rmsf)) if residue_rmsf else 0.0
        }
    }


def calculate_rdf(
    universe: mda.Universe,
    g1: str = "name O",
    g2: str = "name O",
    start: int = 0,
    stop: Optional[int] = None,
    step: int = 1,
    nbins: int = 75,
    range_start: float = 0.0,
    range_end: float = 15.0
) -> Dict[str, Any]:
    if stop is None:
        stop = len(universe.trajectory)
    
    n_frames = max(1, (stop - start + step - 1) // step)
    
    bins = np.linspace(range_start, range_end, nbins + 1)
    bin_centers = (bins[:-1] + bins[1:]) / 2.0
    histograms = np.zeros(nbins, dtype=np.float64)
    total_pairs = 0.0
    volumes = []
    
    for ts in universe.trajectory[start:stop:step]:
        if ts.dimensions is None:
            continue
        
        volume = np.prod(ts.dimensions[:3])
        volumes.append(volume)
        
        group1 = universe.select_atoms(g1)
        group2 = universe.select_atoms(g2)
        
        n1 = len(group1)
        n2 = len(group2)
        
        if n1 == 0 or n2 == 0:
            continue
        
        pos1 = group1.positions
        pos2 = group2.positions
        
        if len(pos1) > 0 and len(pos2) > 0:
            diff = pos1[:, np.newaxis, :] - pos2[np.newaxis, :, :]
            distances = np.sqrt(np.sum(diff ** 2, axis=-1))
            
            if g1 == g2:
                distances = distances[np.triu_indices(len(pos1), k=1)]
            else:
                distances = distances.flatten()
            
            hist, _ = np.histogram(distances, bins=bins)
            histograms += hist
            total_pairs += len(distances)
    
    if total_pairs == 0 or not volumes:
        return {
            'analysis_type': 'rdf',
            'g1': g1,
            'g2': g2,
            'r_values': bin_centers.tolist(),
            'gofr': [0.0] * len(bin_centers),
            'histogram': histograms.tolist(),
            'n_frames_analyzed': n_frames,
            'range': [range_start, range_end],
            'nbins': nbins,
            'units': 'angstrom'
        }
    
    avg_volume = np.mean(volumes)
    n_atoms_g1 = len(universe.select_atoms(g1))
    n_atoms_g2 = len(universe.select_atoms(g2))
    
    if n_atoms_g1 == 0 or n_atoms_g2 == 0:
        return {
            'analysis_type': 'rdf',
            'g1': g1,
            'g2': g2,
            'r_values': bin_centers.tolist(),
            'gofr': [0.0] * len(bin_centers),
            'histogram': histograms.tolist(),
            'n_frames_analyzed': n_frames,
            'range': [range_start, range_end],
            'nbins': nbins,
            'units': 'angstrom'
        }
    
    number_density_g2 = n_atoms_g2 / avg_volume
    bin_volumes = (4.0 / 3.0) * np.pi * (bins[1:]**3 - bins[:-1]**3)
    
    expected_pairs = number_density_g2 * bin_volumes
    
    gofr = histograms / (n_frames * n_atoms_g1 * expected_pairs)
    
    return {
        'analysis_type': 'rdf',
        'g1': g1,
        'g2': g2,
        'r_values': bin_centers.tolist(),
        'gofr': gofr.tolist(),
        'histogram': histograms.tolist(),
        'n_frames_analyzed': n_frames,
        'range': [range_start, range_end],
        'nbins': nbins,
        'units': 'angstrom',
        'summary': {
            'avg_volume': float(avg_volume),
            'g1_atoms': n_atoms_g1,
            'g2_atoms': n_atoms_g2,
            'max_gofr': float(np.max(gofr)) if len(gofr) > 0 else 0.0
        }
    }
