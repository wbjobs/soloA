import numpy as np
from numba import njit, float64


C = 299792458.0


@njit(float64[:](float64[:], float64, float64[:], float64, float64[:], float64[:], float64, float64, float64))
def _1pn_pairwise_acceleration(
    pos_i: np.ndarray,
    mass_i: float,
    pos_j: np.ndarray,
    mass_j: float,
    vel_i: np.ndarray,
    vel_j: np.ndarray,
    G: float,
    c_sq: float,
    eps_sq: float
) -> np.ndarray:
    dx = pos_j[0] - pos_i[0]
    dy = pos_j[1] - pos_i[1]
    dz = pos_j[2] - pos_i[2]
    r_sq = dx * dx + dy * dy + dz * dz + eps_sq
    r = np.sqrt(r_sq)
    r_cubed = r * r_sq
    r_fifth = r_sq * r_cubed

    v_i_sq = vel_i[0] * vel_i[0] + vel_i[1] * vel_i[1] + vel_i[2] * vel_i[2]
    v_j_sq = vel_j[0] * vel_j[0] + vel_j[1] * vel_j[1] + vel_j[2] * vel_j[2]

    dvx = vel_j[0] - vel_i[0]
    dvy = vel_j[1] - vel_i[1]
    dvz = vel_j[2] - vel_i[2]

    dot_r_vj = dx * vel_j[0] + dy * vel_j[1] + dz * vel_j[2]
    dot_r_vi = dx * vel_i[0] + dy * vel_i[1] + dz * vel_i[2]
    dot_r_dv = dx * dvx + dy * dvy + dz * dvz
    dot_vi_vj = vel_i[0] * vel_j[0] + vel_i[1] * vel_j[1] + vel_i[2] * vel_j[2]

    newtonian_factor = G * mass_j / r_cubed

    factor1 = 1.0 / c_sq * (
        v_i_sq + 2.0 * v_j_sq - 4.0 * dot_vi_vj -
        1.5 * (dot_r_vi / r) ** 2 -
        G * (2.0 * mass_i / r + 3.0 * mass_j / r)
    )

    factor2 = 1.0 / c_sq * (
        4.0 * G * mass_j / r * dot_r_vi +
        dot_r_dv * (3.0 * G * mass_i / r)
    ) / r

    acc = np.zeros(3, dtype=np.float64)
    acc[0] = newtonian_factor * (
        dx * (1.0 + factor1) -
        dvx * (4.0 / c_sq * dot_r_vi)
    )
    acc[1] = newtonian_factor * (
        dy * (1.0 + factor1) -
        dvy * (4.0 / c_sq * dot_r_vi)
    )
    acc[2] = newtonian_factor * (
        dz * (1.0 + factor1) -
        dvz * (4.0 / c_sq * dot_r_vi)
    )

    extra = newtonian_factor * 1.5 * factor2
    acc[0] += extra * dx / r
    acc[1] += extra * dy / r
    acc[2] += extra * dz / r

    return acc


@njit(float64[:, :](float64[:, :], float64[:], float64[:, :], float64[:], float64, float64, float64))
def compute_accelerations_1pn(
    positions: np.ndarray,
    masses: np.ndarray,
    velocities: np.ndarray,
    radii: np.ndarray,
    G: float,
    c: float,
    softening: float = 1e-10
) -> np.ndarray:
    n = positions.shape[0]
    accelerations = np.zeros_like(positions)
    c_sq = c * c
    eps_sq = softening ** 2

    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            acc = _1pn_pairwise_acceleration(
                positions[i], masses[i],
                positions[j], masses[j],
                velocities[i], velocities[j],
                G, c_sq, eps_sq
            )
            accelerations[i] += acc

    return accelerations


def compute_accelerations_1pn_direct(
    positions: np.ndarray,
    masses: np.ndarray,
    velocities: np.ndarray,
    G: float,
    c: float = C,
    softening: float = 1e-10
) -> np.ndarray:
    return compute_accelerations_1pn(
        positions, masses, velocities,
        np.zeros(len(masses), dtype=np.float64),
        G, c, softening
    )
