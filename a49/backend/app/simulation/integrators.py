import numpy as np
from typing import Callable, Tuple
from app.simulation.gravity import compute_accelerations_direct
from app.simulation.octree import compute_accelerations_barnes_hut
from app.simulation.relativity import compute_accelerations_1pn_direct
from app.schemas import IntegratorType, AlgorithmType


def _get_accelerations(
    positions: np.ndarray,
    velocities: np.ndarray,
    masses: np.ndarray,
    G: float,
    algorithm: AlgorithmType,
    theta: float,
    softening: float,
    enable_relativity: bool,
    c: float
) -> np.ndarray:
    if enable_relativity:
        return compute_accelerations_1pn_direct(
            positions, masses, velocities,
            G, c, softening
        )

    if algorithm == AlgorithmType.DIRECT:
        return compute_accelerations_direct(positions, masses, G, softening)
    else:
        return compute_accelerations_barnes_hut(positions, masses, G, theta, softening)


def integrate_euler(
    positions: np.ndarray,
    velocities: np.ndarray,
    masses: np.ndarray,
    G: float,
    dt: float,
    algorithm: AlgorithmType = AlgorithmType.BARNES_HUT,
    theta: float = 0.5,
    softening: float = 1e-10,
    enable_relativity: bool = False,
    c: float = 299792458.0
) -> Tuple[np.ndarray, np.ndarray]:
    accelerations = _get_accelerations(
        positions, velocities, masses, G,
        algorithm, theta, softening, enable_relativity, c
    )
    new_velocities = velocities + accelerations * dt
    new_positions = positions + new_velocities * dt
    return new_positions, new_velocities


def integrate_symplectic(
    positions: np.ndarray,
    velocities: np.ndarray,
    masses: np.ndarray,
    G: float,
    dt: float,
    algorithm: AlgorithmType = AlgorithmType.BARNES_HUT,
    theta: float = 0.5,
    softening: float = 1e-10,
    enable_relativity: bool = False,
    c: float = 299792458.0
) -> Tuple[np.ndarray, np.ndarray]:
    accelerations = _get_accelerations(
        positions, velocities, masses, G,
        algorithm, theta, softening, enable_relativity, c
    )
    velocities_half = velocities + accelerations * dt / 2.0
    new_positions = positions + velocities_half * dt
    new_accelerations = _get_accelerations(
        new_positions, velocities_half, masses, G,
        algorithm, theta, softening, enable_relativity, c
    )
    new_velocities = velocities_half + new_accelerations * dt / 2.0
    return new_positions, new_velocities


def integrate_rk4(
    positions: np.ndarray,
    velocities: np.ndarray,
    masses: np.ndarray,
    G: float,
    dt: float,
    algorithm: AlgorithmType = AlgorithmType.BARNES_HUT,
    theta: float = 0.5,
    softening: float = 1e-10,
    enable_relativity: bool = False,
    c: float = 299792458.0
) -> Tuple[np.ndarray, np.ndarray]:
    def derivative(pos: np.ndarray, vel: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        acc = _get_accelerations(
            pos, vel, masses, G,
            algorithm, theta, softening, enable_relativity, c
        )
        return vel, acc

    k1_pos, k1_vel = derivative(positions, velocities)
    k2_pos, k2_vel = derivative(
        positions + k1_pos * dt / 2.0,
        velocities + k1_vel * dt / 2.0
    )
    k3_pos, k3_vel = derivative(
        positions + k2_pos * dt / 2.0,
        velocities + k2_vel * dt / 2.0
    )
    k4_pos, k4_vel = derivative(
        positions + k3_pos * dt,
        velocities + k3_vel * dt
    )

    new_positions = positions + (k1_pos + 2 * k2_pos + 2 * k3_pos + k4_pos) * dt / 6.0
    new_velocities = velocities + (k1_vel + 2 * k2_vel + 2 * k3_vel + k4_vel) * dt / 6.0

    return new_positions, new_velocities


def get_integrator(integrator_type: IntegratorType) -> Callable:
    integrators = {
        IntegratorType.EULER: integrate_euler,
        IntegratorType.SYMPLECTIC: integrate_symplectic,
        IntegratorType.RK4: integrate_rk4
    }
    return integrators[integrator_type]
