from pathlib import Path
from typing import Optional, Dict, Any
import MDAnalysis as mda
import numpy as np
import aiofiles

from ..config import settings


def detect_file_type(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    type_map = {
        '.gro': 'gro',
        '.trr': 'trr',
        '.xtc': 'xtc',
        '.dump': 'lammps-dump',
        '.pdb': 'pdb',
        '.xyz': 'xyz'
    }
    return type_map.get(ext, 'unknown')


async def save_upload_file(file_content: bytes, filename: str, project_id: int) -> str:
    project_dir = settings.upload_dir / f"project_{project_id}"
    project_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = project_dir / filename
    
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(file_content)
    
    return str(file_path)


def load_universe(topology_path: str, trajectory_path: Optional[str] = None) -> mda.Universe:
    if trajectory_path:
        u = mda.Universe(topology_path, trajectory_path)
    else:
        u = mda.Universe(topology_path)
    return u


def get_universe_info(universe: mda.Universe) -> Dict[str, Any]:
    n_atoms = len(universe.atoms)
    n_frames = len(universe.trajectory) if hasattr(universe.trajectory, '__len__') else 1
    
    frame = universe.trajectory[0]
    
    box = None
    if frame.dimensions is not None:
        box = frame.dimensions.tolist()
    
    residues = []
    for residue in universe.residues[:100]:
        residues.append({
            'id': residue.resid,
            'name': residue.resname,
            'num_atoms': len(residue.atoms)
        })
    
    atom_types = list(set(universe.atoms.names))
    
    return {
        'n_atoms': n_atoms,
        'n_frames': n_frames,
        'box': box,
        'residues': residues,
        'atom_types': atom_types,
        'has_velocities': 'velocities' in universe.trajectory.dt if n_frames > 0 else False,
        'has_forces': 'forces' in universe.trajectory.dt if n_frames > 0 else False,
        'time_step': universe.trajectory.dt if n_frames > 0 else None,
    }


def extract_frame_data(universe: mda.Universe, frame_idx: int) -> Dict[str, Any]:
    universe.trajectory[frame_idx]
    
    positions = universe.atoms.positions.tolist()
    atom_names = universe.atoms.names.tolist()
    atom_resnames = universe.atoms.resnames.tolist()
    atom_resids = universe.atoms.resids.tolist()
    elements = universe.atoms.elements.tolist() if hasattr(universe.atoms, 'elements') else None
    
    velocities = None
    if 'velocities' in universe.trajectory.dt:
        try:
            velocities = universe.atoms.velocities.tolist()
        except (AttributeError, ValueError):
            velocities = None
    
    forces = None
    if 'forces' in universe.trajectory.dt:
        try:
            forces = universe.atoms.forces.tolist()
        except (AttributeError, ValueError):
            forces = None
    
    return {
        'frame_index': frame_idx,
        'time': universe.trajectory.time,
        'positions': positions,
        'atom_names': atom_names,
        'atom_resnames': atom_resnames,
        'atom_resids': atom_resids,
        'elements': elements,
        'velocities': velocities,
        'forces': forces,
        'box': universe.trajectory.dimensions.tolist() if universe.trajectory.dimensions is not None else None
    }


def get_trajectory_frames(
    universe: mda.Universe, 
    start: int = 0, 
    stop: Optional[int] = None, 
    step: int = 1
) -> list:
    if stop is None:
        stop = len(universe.trajectory)
    
    frames_data = []
    for ts in universe.trajectory[start:stop:step]:
        frames_data.append({
            'frame_index': ts.frame,
            'time': ts.time,
            'box': ts.dimensions.tolist() if ts.dimensions is not None else None
        })
    
    return frames_data
