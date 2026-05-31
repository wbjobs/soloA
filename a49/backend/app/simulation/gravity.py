import numpy as np
from numba import jit, float64, int64, prange, njit


@njit(float64[:](float64[:], float64, float64[:], float64, float64, float64))
def pairwise_force(
    pos_i: np.ndarray,
    mass_i: float,
    pos_j: np.ndarray,
    mass_j: float,
    G: float,
    eps_sq: float
) -> np.ndarray:
    dx = pos_j[0] - pos_i[0]
    dy = pos_j[1] - pos_i[1]
    dz = pos_j[2] - pos_i[2]
    dist_sq = dx * dx + dy * dy + dz * dz + eps_sq
    dist = np.sqrt(dist_sq)
    dist_cubed = dist * dist_sq
    factor = G * mass_i * mass_j / dist_cubed
    return np.array([factor * dx, factor * dy, factor * dz], dtype=np.float64)


@njit(float64[:](float64[:], float64[:], float64, float64, float64))
def pairwise_acceleration(
    pos_i: np.ndarray,
    pos_j: np.ndarray,
    mass_j: float,
    G: float,
    eps_sq: float
) -> np.ndarray:
    dx = pos_j[0] - pos_i[0]
    dy = pos_j[1] - pos_i[1]
    dz = pos_j[2] - pos_i[2]
    dist_sq = dx * dx + dy * dy + dz * dz + eps_sq
    dist = np.sqrt(dist_sq)
    dist_cubed = dist * dist_sq
    factor = G * mass_j / dist_cubed
    return np.array([factor * dx, factor * dy, factor * dz], dtype=np.float64)


@njit(float64[:, :](float64[:, :], float64[:], float64, float64), parallel=True)
def compute_forces_direct(
    positions: np.ndarray,
    masses: np.ndarray,
    G: float,
    softening: float = 1e-10
) -> np.ndarray:
    n = positions.shape[0]
    forces = np.zeros_like(positions)
    eps_sq = softening ** 2

    for i in prange(n):
        for j in range(n):
            if i == j:
                continue
            force = pairwise_force(
                positions[i], masses[i],
                positions[j], masses[j],
                G, eps_sq
            )
            forces[i] += force

    return forces


@njit(float64[:, :](float64[:, :], float64[:], float64, float64), parallel=True)
def compute_accelerations_direct(
    positions: np.ndarray,
    masses: np.ndarray,
    G: float,
    softening: float = 1e-10
) -> np.ndarray:
    n = positions.shape[0]
    accelerations = np.zeros_like(positions)
    eps_sq = softening ** 2

    for i in prange(n):
        for j in range(n):
            if i == j:
                continue
            acc = pairwise_acceleration(
                positions[i], positions[j], masses[j],
                G, eps_sq
            )
            accelerations[i] += acc

    return accelerations


@njit(int64[:](float64[:, :], float64[:]))
def find_collisions(positions: np.ndarray, radii: np.ndarray) -> np.ndarray:
    n = positions.shape[0]
    collisions = np.full(n, -1, dtype=np.int64)

    for i in range(n):
        if collisions[i] != -1:
            continue
        for j in range(i + 1, n):
            if collisions[j] != -1:
                continue
            dx = positions[i, 0] - positions[j, 0]
            dy = positions[i, 1] - positions[j, 1]
            dz = positions[i, 2] - positions[j, 2]
            dist_sq = dx * dx + dy * dy + dz * dz
            min_dist = radii[i] + radii[j]
            if dist_sq < min_dist * min_dist:
                collisions[j] = i
                break

    return collisions


@njit(float64[:](float64[:], float64[:], float64[:], float64[:]))
def merge_bodies(mass1: np.ndarray, mass2: np.ndarray, vel1: np.ndarray, vel2: np.ndarray) -> np.ndarray:
    total_mass = mass1[0] + mass2[0]
    vx = (mass1[0] * vel1[0] + mass2[0] * vel2[0]) / total_mass
    vy = (mass1[0] * vel1[1] + mass2[0] * vel2[1]) / total_mass
    vz = (mass1[0] * vel1[2] + mass2[0] * vel2[2]) / total_mass
    return np.array([vx, vy, vz], dtype=np.float64)
