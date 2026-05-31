import numpy as np
from typing import Dict, Any, Tuple, Optional
from .material import MaterialModel


def compute_poisson_ratio(material: MaterialModel) -> float:
    """Compute Poisson's ratio from Lame parameters."""
    lambda_ = material.lame_lambda
    mu = material.lame_mu

    if lambda_ + mu <= 0:
        return 0.0

    nu = lambda_ / (2 * (lambda_ + mu))
    return max(-1.0, min(0.49999, nu))


def compute_bulk_modulus(material: MaterialModel) -> float:
    """Compute bulk modulus K."""
    return material.lame_lambda + (2.0 / 3.0) * material.lame_mu


def compute_shear_modulus(material: MaterialModel) -> float:
    """Compute shear modulus G."""
    return material.lame_mu


def compute_wave_velocities(material: MaterialModel) -> Tuple[float, float]:
    """Compute P-wave and S-wave velocities with near-incompressibility correction."""
    rho = material.density
    lambda_ = material.lame_lambda
    mu = material.lame_mu

    if rho <= 0:
        return 1000.0, 500.0

    vp = np.sqrt((lambda_ + 2 * mu) / rho) if (lambda_ + 2 * mu) > 0 else 1000.0
    vs = np.sqrt(mu / rho) if mu > 0 else 500.0

    return float(vp), float(vs)


def compute_element_max_eigenvalue(
    element_size: float,
    material: MaterialModel,
    nu: Optional[float] = None
) -> float:
    """
    Compute maximum eigenvalue for time step estimation.
    For near-incompressible materials (nu -> 0.5), uses a more conservative estimate.
    """
    if nu is None:
        nu = compute_poisson_ratio(material)

    vp, vs = compute_wave_velocities(material)

    if nu > 0.49:
        correction_factor = 0.5
        lambda_corrected = 2 * material.lame_mu * nu / (1 - 2 * nu)
        if lambda_corrected > 0 and lambda_corrected < float('inf'):
            vp_corrected = np.sqrt((lambda_corrected + 2 * material.lame_mu) / material.density)
            if vp_corrected < vp:
                vp = vp_corrected

        h_eff = element_size / 2.0
    else:
        correction_factor = 1.0
        h_eff = element_size

    lambda_max = (vp ** 2) * (12.0 / (h_eff ** 2))

    return lambda_max * correction_factor


def compute_stable_time_step_stability(
    element_size: float,
    material: MaterialModel,
    courant_number: float = 0.4,
    safety_factor: float = 0.7
) -> float:
    """
    Compute stable time step with near-incompressibility handling.
    
    For explicit dynamics with near-incompressible materials:
    - Standard CFL: dt = C * h / vp
    - Near-incompressible: dt = C * h / (vp * sqrt(1/(1-2nu)))
    
    Also adds numerical damping to prevent high-frequency oscillations.
    """
    nu = compute_poisson_ratio(material)
    vp, vs = compute_wave_velocities(material)

    if nu > 0.49:
        stability_factor = np.sqrt(2.0 * (1 - nu) / (1 - 2 * nu))
        h_eff = element_size / 2.0
        dt_cfl = courant_number * h_eff / (vp * stability_factor)
    elif nu > 0.45:
        stability_factor = 1.0 + 10.0 * (nu - 0.45)
        dt_cfl = courant_number * element_size / (vp * stability_factor)
    else:
        dt_cfl = courant_number * element_size / max(vp, vs)

    dt_stable = dt_cfl * safety_factor

    dt_min = 1e-9
    dt_max = 0.1

    return max(dt_min, min(dt_max, dt_stable))


def compute_numerical_damping(
    dt: float,
    nu: float,
    alpha: float = 0.05
) -> Tuple[float, float]:
    """
    Compute Rayleigh damping coefficients.
    For near-incompressible materials, adds more damping to high frequencies.
    """
    if nu > 0.49:
        alpha_damping = alpha * 5.0
        beta_damping = alpha * 0.01
    elif nu > 0.4:
        alpha_damping = alpha * 2.0
        beta_damping = alpha * 0.05
    else:
        alpha_damping = alpha
        beta_damping = alpha * 0.1

    return alpha_damping, beta_damping


def check_numerical_stability(
    u: np.ndarray,
    u_prev: np.ndarray,
    dt: float,
    threshold: float = 1e6
) -> Tuple[bool, str]:
    """
    Check for numerical instability (NaN, infinity, or excessive growth).
    Returns (is_stable, message).
    """
    if np.any(np.isnan(u)):
        return False, "NaN detected in displacement field"

    if np.any(np.isinf(u)):
        return False, "Infinity detected in displacement field"

    u_max = np.max(np.abs(u))
    u_prev_max = np.max(np.abs(u_prev)) if u_prev.size > 0 else 0

    if u_max > threshold:
        return False, f"Excessive displacement detected: {u_max}"

    if u_prev_max > 0 and u_max / u_prev_max > 10.0:
        return False, f"Rapid growth detected: {u_max / u_prev_max}x"

    if np.any(np.isnan(u_prev)) or np.any(np.isinf(u_prev)):
        return False, "Previous state contains NaN/Inf"

    return True, "Stable"


def adjust_time_step(
    current_dt: float,
    growth_factor: float,
    max_dt: float,
    min_dt: float = 1e-10
) -> float:
    """
    Adaptively adjust time step based on solution growth.
    """
    if growth_factor < 1.0:
        new_dt = min(current_dt * 1.1, max_dt)
    elif growth_factor < 2.0:
        new_dt = current_dt * 0.9
    else:
        new_dt = max(current_dt * 0.5, min_dt)

    return new_dt
