import numpy as np
from numba import njit
from typing import Tuple, List


@njit
def _create_octant_center(center: np.ndarray, size: float, octant_idx: int) -> np.ndarray:
    half = size / 2.0
    quarter = size / 4.0
    new_center = center.copy()
    if octant_idx & 1:
        new_center[0] += quarter
    else:
        new_center[0] -= quarter
    if octant_idx & 2:
        new_center[1] += quarter
    else:
        new_center[1] -= quarter
    if octant_idx & 4:
        new_center[2] += quarter
    else:
        new_center[2] -= quarter
    return new_center


@njit
def _get_octant_index(pos: np.ndarray, center: np.ndarray) -> int:
    idx = 0
    if pos[0] > center[0]:
        idx |= 1
    if pos[1] > center[1]:
        idx |= 2
    if pos[2] > center[2]:
        idx |= 4
    return idx


@njit
def _is_in_octant(pos: np.ndarray, center: np.ndarray, size: float) -> bool:
    half = size / 2.0
    return (np.abs(pos[0] - center[0]) <= half and
            np.abs(pos[1] - center[1]) <= half and
            np.abs(pos[2] - center[2]) <= half)


@njit
def _compute_pairwise_force(
    pos_i: np.ndarray,
    mass_i: float,
    pos_j: np.ndarray,
    mass_j: float,
    G: float,
    softening: float
) -> np.ndarray:
    force = np.zeros(3, dtype=np.float64)
    dx = pos_j[0] - pos_i[0]
    dy = pos_j[1] - pos_i[1]
    dz = pos_j[2] - pos_i[2]
    dist_sq = dx * dx + dy * dy + dz * dz + softening * softening
    dist = np.sqrt(dist_sq)
    dist_cubed = dist * dist_sq
    factor = G * mass_i * mass_j / dist_cubed
    force[0] = factor * dx
    force[1] = factor * dy
    force[2] = factor * dz
    return force


@njit
def _build_tree_recursive(
    positions: np.ndarray,
    masses: np.ndarray,
    indices: np.ndarray,
    center: np.ndarray,
    size: float
) -> Tuple:
    n = len(indices)

    if n == 0:
        return (0, np.zeros(3, dtype=np.float64), 0.0, -1, indices)

    if n == 1:
        i = indices[0]
        cm = positions[i].copy()
        total_mass = masses[i]
        return (1, cm, total_mass, i, indices)

    octants = [np.empty(0, dtype=np.int64) for _ in range(8)]
    for idx in indices:
        pos = positions[idx]
        oct_idx = _get_octant_index(pos, center)
        octants[oct_idx] = np.append(octants[oct_idx], idx)

    child_nodes = [None] * 8
    total_mass = 0.0
    cm = np.zeros(3, dtype=np.float64)
    has_children = False

    new_size = size / 2.0

    for oct_idx in range(8):
        oct_indices = octants[oct_idx]
        if len(oct_indices) == 0:
            continue

        oct_center = _create_octant_center(center, size, oct_idx)
        child = _build_tree_recursive(
            positions, masses, oct_indices, oct_center, new_size
        )
        child_nodes[oct_idx] = child

        child_type, child_cm, child_mass, _, _ = child
        if child_mass > 0:
            cm += child_cm * child_mass
            total_mass += child_mass
            if child_type > 0:
                has_children = True

    if total_mass > 0:
        cm /= total_mass

    node_type = 2 if has_children else 0

    return (node_type, cm, total_mass, -1, indices)


class Octree:
    def __init__(self, positions: np.ndarray, masses: np.ndarray):
        self.n = len(positions)
        if self.n == 0:
            self.root = None
            self.center = np.zeros(3, dtype=np.float64)
            self.size = 0.0
            return

        min_pos = np.min(positions, axis=0)
        max_pos = np.max(positions, axis=0)
        center = (min_pos + max_pos) / 2.0
        size = np.max(max_pos - min_pos) * 1.1
        if size <= 0:
            size = 1.0

        indices = np.arange(self.n, dtype=np.int64)
        self.root = _build_tree_recursive(
            positions, masses, indices, center, size
        )
        self.center = center
        self.size = size
        self.positions = positions
        self.masses = masses

    def _compute_force_from_node(
        self,
        node,
        target_idx: int,
        target_pos: np.ndarray,
        target_mass: float,
        G: float,
        theta: float,
        softening: float,
        size: float
    ) -> np.ndarray:
        if node is None:
            return np.zeros(3, dtype=np.float64)

        node_type, cm, node_mass, single_idx, node_indices = node

        if node_mass <= 0:
            return np.zeros(3, dtype=np.float64)

        if node_type == 1:
            if single_idx == target_idx:
                return np.zeros(3, dtype=np.float64)
            return _compute_pairwise_force(
                target_pos, target_mass, cm, node_mass, G, softening
            )

        if node_type == 0:
            force = np.zeros(3, dtype=np.float64)
            for idx in node_indices:
                if idx == target_idx:
                    continue
                force += _compute_pairwise_force(
                    target_pos, target_mass,
                    self.positions[idx], self.masses[idx],
                    G, softening
                )
            return force

        dx = cm[0] - target_pos[0]
        dy = cm[1] - target_pos[1]
        dz = cm[2] - target_pos[2]
        dist_sq = dx * dx + dy * dy + dz * dz
        dist = np.sqrt(dist_sq) if dist_sq > 0 else 1e-20

        if size / dist < theta:
            return _compute_pairwise_force(
                target_pos, target_mass, cm, node_mass, G, softening
            )

        force = np.zeros(3, dtype=np.float64)
        new_size = size / 2.0

        children_info = node[5:] if len(node) > 5 else []

        if node_type == 2:
            for oct_idx in range(8):
                child = children_info[oct_idx] if oct_idx < len(children_info) else None
                if child is not None and child[0] != 0:
                    force += self._compute_force_from_node(
                        child, target_idx, target_pos, target_mass,
                        G, theta, softening, new_size
                    )

        return force


def compute_forces_barnes_hut(
    positions: np.ndarray,
    masses: np.ndarray,
    G: float,
    theta: float = 0.5,
    softening: float = 1e-10
) -> np.ndarray:
    n = positions.shape[0]
    forces = np.zeros_like(positions)

    if n <= 1:
        return forces

    if n <= 10:
        for i in range(n):
            for j in range(n):
                if i == j:
                    continue
                forces[i] += _compute_pairwise_force(
                    positions[i], masses[i],
                    positions[j], masses[j],
                    G, softening
                )
        return forces

    tree = Octree(positions, masses)

    for i in range(n):
        forces[i] = tree._compute_force_from_node(
            tree.root, i, positions[i], masses[i],
            G, theta, softening, tree.size
        )

    return forces


def compute_accelerations_barnes_hut(
    positions: np.ndarray,
    masses: np.ndarray,
    G: float,
    theta: float = 0.5,
    softening: float = 1e-10
) -> np.ndarray:
    forces = compute_forces_barnes_hut(positions, masses, G, theta, softening)
    accelerations = np.zeros_like(forces)
    for i in range(len(masses)):
        if masses[i] > 0:
            accelerations[i] = forces[i] / masses[i]
    return accelerations
