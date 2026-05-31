import numpy as np
from numba import njit, float64
from typing import List


@njit
def _create_octant_center(center: np.ndarray, size: float, octant_idx: int) -> np.ndarray:
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
def _pairwise_force(
    pos_i: np.ndarray,
    mass_i: float,
    pos_j: np.ndarray,
    mass_j: float,
    G: float,
    eps: float
) -> np.ndarray:
    dx = pos_j[0] - pos_i[0]
    dy = pos_j[1] - pos_i[1]
    dz = pos_j[2] - pos_i[2]
    dist_sq = dx * dx + dy * dy + dz * dz + eps
    dist = np.sqrt(dist_sq)
    dist_cubed = dist * dist_sq
    factor = G * mass_i * mass_j / dist_cubed
    return np.array([factor * dx, factor * dy, factor * dz], dtype=np.float64)


class OctreeNode:
    __slots__ = [
        'center', 'size', 'mass', 'com',
        'children', 'body_index', 'body_indices',
        'n_bodies'
    ]

    def __init__(self, center: np.ndarray, size: float):
        self.center = center.copy()
        self.size = size
        self.mass = 0.0
        self.com = np.zeros(3, dtype=np.float64)
        self.children: List['OctreeNode'] = [None] * 8
        self.body_index = -1
        self.body_indices: List[int] = []
        self.n_bodies = 0

    def is_leaf(self) -> bool:
        return self.body_index >= 0 or (self.n_bodies > 0 and all(c is None for c in self.children))

    def is_empty(self) -> bool:
        return self.n_bodies == 0

    def add_to_com(self, pos: np.ndarray, mass: float) -> None:
        if self.mass == 0:
            self.com = pos.copy()
        else:
            total_mass = self.mass + mass
            self.com = (self.com * self.mass + pos * mass) / total_mass
        self.mass = total_mass
        self.n_bodies += 1

    def insert(self, body_idx: int, positions: np.ndarray, masses: np.ndarray) -> bool:
        pos = positions[body_idx]
        mass = masses[body_idx]

        half = self.size / 2.0
        if (np.abs(pos[0] - self.center[0]) > half or
            np.abs(pos[1] - self.center[1]) > half or
            np.abs(pos[2] - self.center[2]) > half):
            return False

        if self.n_bodies == 0:
            self.body_index = body_idx
            self.add_to_com(pos, mass)
            self.body_indices.append(body_idx)
            return True

        old_body_idx = self.body_index

        if self.body_index >= 0:
            self.body_index = -1
            self._subdivide()
            if old_body_idx >= 0:
                self._insert_into_child(old_body_idx, positions, masses)

        self.add_to_com(pos, mass)
        self.body_indices.append(body_idx)
        self._insert_into_child(body_idx, positions, masses)

        return True

    def _subdivide(self) -> None:
        new_size = self.size / 2.0
        for oct_idx in range(8):
            child_center = _create_octant_center(self.center, self.size, oct_idx)
            self.children[oct_idx] = OctreeNode(child_center, new_size)

    def _insert_into_child(self, body_idx: int, positions: np.ndarray, masses: np.ndarray) -> None:
        oct_idx = _get_octant_index(positions[body_idx], self.center)
        self.children[oct_idx].insert(body_idx, positions, masses)


class Octree:
    def __init__(self, positions: np.ndarray, masses: np.ndarray):
        self.positions = positions
        self.masses = masses
        self.n = len(positions)

        if self.n == 0:
            self.root = None
            return

        min_pos = np.min(positions, axis=0)
        max_pos = np.max(positions, axis=0)
        center = (min_pos + max_pos) / 2.0
        size = np.max(max_pos - min_pos) * 1.5
        if size <= 0:
            size = 1.0

        self.root = OctreeNode(center, size)
        for i in range(self.n):
            self.root.insert(i, positions, masses)

    def compute_force(
        self,
        target_idx: int,
        G: float,
        theta: float,
        softening: float
    ) -> np.ndarray:
        if self.root is None:
            return np.zeros(3, dtype=np.float64)
        return self._compute_force_recursive(
            self.root, target_idx, G, theta, softening ** 2
        )

    def _compute_force_recursive(
        self,
        node: OctreeNode,
        target_idx: int,
        G: float,
        theta: float,
        eps_sq: float
    ) -> np.ndarray:
        if node is None or node.is_empty():
            return np.zeros(3, dtype=np.float64)

        target_pos = self.positions[target_idx]
        target_mass = self.masses[target_idx]

        if node.body_index >= 0:
            if node.body_index == target_idx:
                return np.zeros(3, dtype=np.float64)
            return _pairwise_force(
                target_pos, target_mass,
                self.positions[node.body_index], self.masses[node.body_index],
                G, eps_sq
            )

        dx = node.com[0] - target_pos[0]
        dy = node.com[1] - target_pos[1]
        dz = node.com[2] - target_pos[2]
        dist_sq = dx * dx + dy * dy + dz * dz
        dist = np.sqrt(dist_sq) if dist_sq > 0 else 1e-20

        all_children_none = all(c is None or c.is_empty() for c in node.children)

        if all_children_none:
            force = np.zeros(3, dtype=np.float64)
            for idx in node.body_indices:
                if idx == target_idx:
                    continue
                force += _pairwise_force(
                    target_pos, target_mass,
                    self.positions[idx], self.masses[idx],
                    G, eps_sq
                )
            return force

        if node.size / dist < theta:
            return _pairwise_force(
                target_pos, target_mass,
                node.com, node.mass,
                G, eps_sq
            )

        force = np.zeros(3, dtype=np.float64)
        for child in node.children:
            if child is not None and not child.is_empty():
                force += self._compute_force_recursive(
                    child, target_idx, G, theta, eps_sq
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

    if n <= 20:
        eps_sq = softening ** 2
        for i in range(n):
            for j in range(n):
                if i == j:
                    continue
                forces[i] += _pairwise_force(
                    positions[i], masses[i],
                    positions[j], masses[j],
                    G, eps_sq
                )
        return forces

    tree = Octree(positions, masses)

    for i in range(n):
        forces[i] = tree.compute_force(i, G, theta, softening)

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
