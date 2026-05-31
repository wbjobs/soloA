import numpy as np
from numba import njit, float64, int64
from typing import Tuple, List, Optional
from app.simulation.gravity import find_collisions


@njit
def estimate_radius_from_mass(mass: float, density: float = 1000.0) -> float:
    volume = mass / density
    return (3 * volume / (4 * np.pi)) ** (1/3)


@njit
def merge_two_bodies(
    mass1: float, mass2: float,
    pos1: np.ndarray, pos2: np.ndarray,
    vel1: np.ndarray, vel2: np.ndarray,
    radius1: float, radius2: float,
    restitution: float = 0.0
) -> Tuple[float, np.ndarray, np.ndarray, float]:
    total_mass = mass1 + mass2
    new_pos = (mass1 * pos1 + mass2 * pos2) / total_mass
    new_vel = (mass1 * vel1 + mass2 * vel2) / total_mass
    total_volume = (4/3 * np.pi * radius1 ** 3) + (4/3 * np.pi * radius2 ** 3)
    new_radius = (3 * total_volume / (4 * np.pi)) ** (1/3)
    return total_mass, new_pos, new_vel, new_radius


def handle_collisions(
    positions: np.ndarray,
    velocities: np.ndarray,
    masses: np.ndarray,
    radii: np.ndarray,
    enable_merge: bool = True
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, List[int]]:
    n = len(masses)
    if n <= 1:
        return positions, velocities, masses, radii, []

    collisions = find_collisions(positions, radii)
    merged_mask = collisions != -1

    if not np.any(merged_mask):
        return positions, velocities, masses, radii, []

    keep_indices = []
    merged_pairs = []

    for i in range(n):
        if collisions[i] == -1 and not any(collisions[j] == i for j in range(i + 1, n)):
            keep_indices.append(i)
        elif collisions[i] == -1:
            target = i
            for j in range(n):
                if collisions[j] == i:
                    merged_pairs.append((target, j))

    if not merged_pairs:
        return positions, velocities, masses, radii, []

    new_positions = []
    new_velocities = []
    new_masses = []
    new_radii = []
    merged_indices = []

    used = set()

    for i in range(n):
        if i in used:
            continue
        if collisions[i] != -1:
            j = collisions[i]
            if j in used:
                continue

            merged_mass, merged_pos, merged_vel, merged_rad = merge_two_bodies(
                masses[i], masses[j],
                positions[i], positions[j],
                velocities[i], velocities[j],
                radii[i], radii[j]
            )
            new_positions.append(merged_pos)
            new_velocities.append(merged_vel)
            new_masses.append(merged_mass)
            new_radii.append(merged_rad)
            merged_indices.extend([i, j])
            used.add(i)
            used.add(j)
        else:
            new_positions.append(positions[i])
            new_velocities.append(velocities[i])
            new_masses.append(masses[i])
            new_radii.append(radii[i])

    if len(new_positions) == 0:
        return positions, velocities, masses, radii, []

    return (
        np.array(new_positions, dtype=np.float64),
        np.array(new_velocities, dtype=np.float64),
        np.array(new_masses, dtype=np.float64),
        np.array(new_radii, dtype=np.float64),
        merged_indices
    )


def resolve_overlaps(
    positions: np.ndarray,
    radii: np.ndarray,
    max_iterations: int = 10
) -> np.ndarray:
    n = len(positions)
    adjusted = positions.copy()

    for _ in range(max_iterations):
        moved = False
        for i in range(n):
            for j in range(i + 1, n):
                dx = adjusted[i, 0] - adjusted[j, 0]
                dy = adjusted[i, 1] - adjusted[j, 1]
                dz = adjusted[i, 2] - adjusted[j, 2]
                dist_sq = dx * dx + dy * dy + dz * dz
                min_dist = radii[i] + radii[j]

                if dist_sq < min_dist * min_dist and dist_sq > 0:
                    dist = np.sqrt(dist_sq)
                    overlap = min_dist - dist
                    dir_x = dx / dist
                    dir_y = dy / dist
                    dir_z = dz / dist

                    adjusted[i, 0] += dir_x * overlap * 0.5
                    adjusted[i, 1] += dir_y * overlap * 0.5
                    adjusted[i, 2] += dir_z * overlap * 0.5
                    adjusted[j, 0] -= dir_x * overlap * 0.5
                    adjusted[j, 1] -= dir_y * overlap * 0.5
                    adjusted[j, 2] -= dir_z * overlap * 0.5
                    moved = True

        if not moved:
            break

    return adjusted
