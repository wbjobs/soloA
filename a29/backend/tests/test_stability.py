"""Test scripts to verify bug fixes."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import numpy as np
from pathlib import Path

from app.simulation.material import MaterialModel
from app.simulation.stability import (
    compute_poisson_ratio,
    compute_stable_time_step_stability,
    check_numerical_stability,
    compute_numerical_damping
)
from app.simulation.mesh_generator import MeshGenerator


def test_poisson_ratio_computation():
    """Test Poisson's ratio calculation."""
    print("\n=== Testing Poisson's Ratio Calculation ===")

    materials = [
        ("Normal material", 3000, 1732, 2700),
        ("Slightly incompressible", 5000, 2500, 3000),
        ("Near-incompressible", 10000, 3000, 3500),
    ]

    for name, vp, vs, density in materials:
        material = MaterialModel(vp, vs, density)
        nu = compute_poisson_ratio(material)
        print(f"{name}: ν = {nu:.6f} (vp={vp}, vs={vs})")


def test_time_step_estimation():
    """Test time step estimation with different materials."""
    print("\n=== Testing Time Step Estimation ===")

    mesh_generator = MeshGenerator(width=1000, height=1000, element_size=20)
    mesh = mesh_generator.generate_rectangular_mesh()
    element_size = mesh['element_size']

    test_cases = [
        ("Normal (ν=0.25)", 3000, 1732, 2700),
        ("High Poisson (ν=0.40)", 4000, 1826, 3000),
        ("Near incompressible (ν=0.48)", 6000, 1936, 3500),
    ]

    for name, vp, vs, density in test_cases:
        material = MaterialModel(vp, vs, density)
        nu = compute_poisson_ratio(material)

        dt_old = 0.4 * element_size / max(vp, vs)
        dt_new = compute_stable_time_step_stability(element_size, material, 0.4, 0.7)

        print(f"\n{name} (ν={nu:.4f}):")
        print(f"  Old dt: {dt_old:.2e} s")
        print(f"  New dt: {dt_new:.2e} s")
        if dt_new < dt_old:
            print(f"  Reduction: {(1 - dt_new/dt_old)*100:.1f}%")


def test_stability_check():
    """Test numerical stability detection."""
    print("\n=== Testing Stability Check ===")

    stable_u = np.random.randn(100, 2) * 0.1
    stable_u_prev = stable_u * 0.9

    is_stable, msg = check_numerical_stability(stable_u, stable_u_prev, 1e-5)
    print(f"Stable case: stable={is_stable}, msg={msg}")

    nan_u = stable_u.copy()
    nan_u[0, 0] = np.nan
    is_stable, msg = check_numerical_stability(nan_u, stable_u_prev, 1e-5)
    print(f"NaN case: stable={is_stable}, msg={msg}")

    inf_u = stable_u.copy()
    inf_u[0, 0] = np.inf
    is_stable, msg = check_numerical_stability(inf_u, stable_u_prev, 1e-5)
    print(f"Inf case: stable={is_stable}, msg={msg}")

    large_u = np.random.randn(100, 2) * 1e9
    is_stable, msg = check_numerical_stability(large_u, stable_u_prev, 1e-5)
    print(f"Large value case: stable={is_stable}, msg={msg}")


def test_numerical_damping():
    """Test numerical damping computation."""
    print("\n=== Testing Numerical Damping ===")

    nu_values = [0.1, 0.3, 0.45, 0.49, 0.499]

    for nu in nu_values:
        alpha, beta = compute_numerical_damping(1e-5, nu, 0.02)
        print(f"ν={nu:.3f}: alpha={alpha:.4f}, beta={beta:.6f}")


def test_clamping():
    """Test value clamping to prevent explosion."""
    print("\n=== Testing Value Clamping ===")

    u = np.array([[1e10, -1e10], [1e20, -1e20], [0, 0]])
    max_value = 1e5

    u_clamped = np.clip(u, -max_value, max_value)

    print(f"Original u:")
    print(u)
    print(f"\nClamped u (max={max_value}):")
    print(u_clamped)
    print(f"\nMax clamped value: {np.max(np.abs(u_clamped)):.2e}")


if __name__ == "__main__":
    print("=" * 60)
    print("Testing Bug Fixes for FEM Solver")
    print("=" * 60)

    test_poisson_ratio_computation()
    test_time_step_estimation()
    test_stability_check()
    test_numerical_damping()
    test_clamping()

    print("\n" + "=" * 60)
    print("All tests completed!")
    print("=" * 60)
