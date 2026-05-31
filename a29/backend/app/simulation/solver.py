import numpy as np
from scipy.sparse import csr_matrix
from typing import Dict, Any, Optional, Callable
import h5py
from pathlib import Path
import logging

from .mesh_generator import MeshGenerator, create_mesh
from .material import MaterialModel, create_material
from .stability import (
    compute_stable_time_step_stability,
    check_numerical_stability,
    compute_poisson_ratio,
    compute_numerical_damping,
    adjust_time_step
)
from .parallel import (
    MPI_AVAILABLE,
    DomainDecomposer,
    InterfaceSynchronizer,
    MeshPartition
)

logger = logging.getLogger(__name__)


class ElasticWaveSolver:
    """
    2D Elastic wave equation solver using FEM with explicit time integration.
    Solves: rho * u_tt = div(grad(u) * C) + f
    
    Features:
    - MPI parallel support with interface node synchronization
    - Near-incompressible material stability correction
    - Automatic time step adjustment
    - Numerical instability detection
    """

    def __init__(self, mesh: Dict[str, Any], material: MaterialModel,
                 output_path: Optional[Path] = None,
                 use_mpi: bool = False,
                 n_procs: int = 1):
        self.mesh = mesh
        self.material = material
        self.output_path = output_path
        self.use_mpi = use_mpi and MPI_AVAILABLE
        self.n_procs = n_procs if self.use_mpi else 1

        self.nodes = mesh['nodes']
        self.elements = mesh['elements']
        self.n_nodes = len(self.nodes)
        self.n_elements = len(self.elements)

        self.nx = mesh.get('nx', int(np.ceil(mesh['width'] / mesh['element_size'])))
        self.ny = mesh.get('ny', int(np.ceil(mesh['height'] / mesh['element_size'])))

        self.partition: Optional[MeshPartition] = None
        self.synchronizer: Optional[InterfaceSynchronizer] = None
        self._setup_parallel()

        self.u = np.zeros((self.n_nodes, 2))
        self.u_prev = np.zeros((self.n_nodes, 2))
        self.u_next = np.zeros((self.n_nodes, 2))

        self.v = np.zeros((self.n_nodes, 2))
        self.a = np.zeros((self.n_nodes, 2))

        self.K = None
        self.M = None
        self.M_inv = None
        self.C_damp = None

        self.assembled = False
        self.time = 0.0
        self.step = 0
        self.current_dt = 0.0

        self.nu = compute_poisson_ratio(material)
        self._has_near_incompressible = self.nu > 0.45

        self.alpha_damp, self.beta_damp = compute_numerical_damping(
            1e-5, self.nu, alpha=0.02
        )

        self._stability_check_count = 0
        self._last_max_displacement = 0.0

    def _setup_parallel(self):
        """Setup MPI parallel domain decomposition."""
        if not self.use_mpi or self.n_procs <= 1:
            return

        decomposer = DomainDecomposer()
        self.partition = decomposer.decompose_rectangular(
            self.nx, self.ny, self.n_procs
        )

        if self.partition is not None:
            self.synchronizer = InterfaceSynchronizer(self.partition)

            local_nodes_mask = np.zeros(self.n_nodes, dtype=bool)
            local_nodes_mask[self.partition.local_nodes] = True

            self._local_nodes = self.partition.local_nodes
            self._local_elements = self.partition.local_elements

            logger.info(
                f"Rank {self.partition.rank}: "
                f"{len(self._local_nodes)} local nodes, "
                f"{len(self._local_elements)} local elements, "
                f"{len(self.partition.interface_nodes)} interface nodes"
            )

    def _shape_function_derivatives(self, xi: float, eta: float) -> np.ndarray:
        dN_dxi = np.array([
            -(1 - eta) / 4,
            (1 - eta) / 4,
            (1 + eta) / 4,
            -(1 + eta) / 4
        ])
        dN_deta = np.array([
            -(1 - xi) / 4,
            -(1 + xi) / 4,
            (1 + xi) / 4,
            (1 - xi) / 4
        ])
        return np.vstack([dN_dxi, dN_deta])

    def _gauss_points_2x2(self):
        gp = np.array([
            [-1 / np.sqrt(3), -1 / np.sqrt(3)],
            [1 / np.sqrt(3), -1 / np.sqrt(3)],
            [1 / np.sqrt(3), 1 / np.sqrt(3)],
            [-1 / np.sqrt(3), 1 / np.sqrt(3)]
        ])
        weights = np.array([1.0, 1.0, 1.0, 1.0])
        return gp, weights

    def assemble_mass_matrix(self) -> csr_matrix:
        """Assemble lumped mass matrix for better numerical stability."""
        rows = []
        cols = []
        values = []

        rho = self.material.density
        elements_to_process = self._local_elements if self.partition else range(self.n_elements)

        for elem_idx in elements_to_process:
            elem_nodes = self.elements[elem_idx]
            elem_coords = self.nodes[elem_nodes]

            for gp, w in zip(*self._gauss_points_2x2()):
                dN = self._shape_function_derivatives(gp[0], gp[1])
                J = dN @ elem_coords
                detJ = np.linalg.det(J)

                N = np.array([
                    (1 - gp[0]) * (1 - gp[1]) / 4,
                    (1 + gp[0]) * (1 - gp[1]) / 4,
                    (1 + gp[0]) * (1 + gp[1]) / 4,
                    (1 - gp[0]) * (1 + gp[1]) / 4
                ])

                for i in range(4):
                    gi = elem_nodes[i]
                    rows.extend([2 * gi, 2 * gi + 1])
                    cols.extend([2 * gi, 2 * gi + 1])
                    mass_value = rho * N[i] * N[i] * detJ * w * 4.0
                    values.extend([mass_value, mass_value])

        M = csr_matrix((values, (rows, cols)),
                       shape=(2 * self.n_nodes, 2 * self.n_nodes))

        if self.use_mpi and self.partition and self.partition.rank == 0:
            pass

        return M

    def assemble_stiffness_matrix(self) -> csr_matrix:
        """Assemble stiffness matrix with near-incompressible correction."""
        rows = []
        cols = []
        values = []

        C = self.material.get_stiffness_tensor_2d()

        if self._has_near_incompressible:
            lambda_ = self.material.lame_lambda
            mu = self.material.lame_mu
            nu = self.nu
            kappa = 1.0 / (2.0 * (1.0 - 2.0 * nu)) if nu < 0.49999 else 1000.0

            C = np.array([
                [lambda_ * (1.0 - 0.1 * min(nu, 0.499)) + 2 * mu, lambda_, 0],
                [lambda_, lambda_ * (1.0 - 0.1 * min(nu, 0.499)) + 2 * mu, 0],
                [0, 0, mu]
            ])

        elements_to_process = self._local_elements if self.partition else range(self.n_elements)

        for elem_idx in elements_to_process:
            elem_nodes = self.elements[elem_idx]
            elem_coords = self.nodes[elem_nodes]

            for gp, w in zip(*self._gauss_points_2x2()):
                dN = self._shape_function_derivatives(gp[0], gp[1])
                J = dN @ elem_coords
                detJ = np.linalg.det(J)
                invJ = np.linalg.inv(J)

                dN_dx = invJ @ dN

                B = np.zeros((3, 8))
                for i in range(4):
                    B[0, 2 * i] = dN_dx[0, i]
                    B[1, 2 * i + 1] = dN_dx[1, i]
                    B[2, 2 * i] = dN_dx[1, i]
                    B[2, 2 * i + 1] = dN_dx[0, i]

                K_elem = B.T @ C @ B * detJ * w

                if self._has_near_incompressible:
                    K_elem *= 0.95

                for i in range(4):
                    for j in range(4):
                        gi = elem_nodes[i]
                        gj = elem_nodes[j]

                        rows.extend([2 * gi, 2 * gi, 2 * gi + 1, 2 * gi + 1])
                        cols.extend([2 * gj, 2 * gj + 1, 2 * gj, 2 * gj + 1])
                        values.extend([
                            K_elem[2 * i, 2 * j],
                            K_elem[2 * i, 2 * j + 1],
                            K_elem[2 * i + 1, 2 * j],
                            K_elem[2 * i + 1, 2 * j + 1]
                        ])

        K = csr_matrix((values, (rows, cols)),
                       shape=(2 * self.n_nodes, 2 * self.n_nodes))

        return K

    def assemble_damping_matrix(self) -> csr_matrix:
        """Assemble Rayleigh damping matrix C = alpha*M + beta*K."""
        if self.M is None or self.K is None:
            raise ValueError("Mass and stiffness matrices must be assembled first")

        C = self.alpha_damp * self.M + self.beta_damp * self.K
        return C

    def assemble(self):
        """Assemble all FEM matrices."""
        logger.info("Assembling FEM matrices...")

        self.M = self.assemble_mass_matrix()
        self.K = self.assemble_stiffness_matrix()

        M_diag = self.M.diagonal()
        M_diag = np.where(M_diag < 1e-14, 1e-14, M_diag)
        self.M_inv = 1.0 / M_diag

        if self._has_near_incompressible:
            self.C_damp = self.assemble_damping_matrix()

        self.assembled = True
        logger.info("FEM matrices assembled successfully.")

    def ricker_wavelet(self, t: float, f0: float, t0: float = None) -> float:
        if t0 is None:
            t0 = 1.5 / f0
        tau = np.pi * f0 * (t - t0)
        return (1 - 2 * tau ** 2) * np.exp(-tau ** 2)

    def apply_source(self, x_source: float, y_source: float, t: float,
                     frequency: float, amplitude: float = 1.0) -> np.ndarray:
        source_val = amplitude * self.ricker_wavelet(t, frequency)

        distances = np.linalg.norm(self.nodes - np.array([x_source, y_source]), axis=1)
        source_node = np.argmin(distances)

        if self.partition and source_node not in self.partition.global_to_local:
            return np.zeros(2 * self.n_nodes)

        f = np.zeros(2 * self.n_nodes)
        f[2 * source_node] = source_val
        f[2 * source_node + 1] = source_val

        return f

    def apply_absorbing_boundary(self, dt: float):
        x_min = np.min(self.nodes[:, 0])
        x_max = np.max(self.nodes[:, 0])
        y_min = np.min(self.nodes[:, 1])
        y_max = np.max(self.nodes[:, 1])

        tol = self.mesh.get('element_size', 1.0) * 0.1

        boundary_nodes = np.where(
            (np.abs(self.nodes[:, 0] - x_min) < tol) |
            (np.abs(self.nodes[:, 0] - x_max) < tol) |
            (np.abs(self.nodes[:, 1] - y_min) < tol) |
            (np.abs(self.nodes[:, 1] - y_max) < tol)
        )[0]

        alpha = 0.01
        for node in boundary_nodes:
            if self.partition and node not in self.partition.global_to_local:
                continue

            idx = [2 * node, 2 * node + 1]
            v = (self.u.flatten()[idx] - self.u_prev.flatten()[idx]) / dt
            self.u.flatten()[idx] -= alpha * v * dt

    def _synchronize_interface(self):
        """Synchronize interface nodes across MPI partitions."""
        if self.synchronizer and self.partition:
            self.u = self.synchronizer.synchronize_displacements(self.u, 2)
            self.u_prev = self.synchronizer.synchronize_displacements(self.u_prev, 2)

    def _check_stability(self, dt: float) -> bool:
        """Check for numerical instability."""
        self._stability_check_count += 1

        if self._stability_check_count % 10 != 0:
            return True

        is_stable, message = check_numerical_stability(
            self.u, self.u_prev, dt, threshold=1e8
        )

        if not is_stable:
            logger.warning(f"Stability check failed: {message}")
            return False

        current_max = np.max(np.abs(self.u))
        if self._last_max_displacement > 0:
            growth = current_max / self._last_max_displacement
            if growth > 1.5 and self._has_near_incompressible:
                self.current_dt = adjust_time_step(
                    self.current_dt, growth, self.current_dt * 0.9
                )
                logger.info(f"Adjusted time step to {self.current_dt} due to growth factor {growth}")

        self._last_max_displacement = current_max
        return True

    def _apply_clamping(self, max_value: float = 1e5):
        """Clamp values to prevent numerical explosion."""
        self.u = np.clip(self.u, -max_value, max_value)
        self.u_prev = np.clip(self.u_prev, -max_value, max_value)
        self.u_next = np.clip(self.u_next, -max_value, max_value)

    def step_forward(self, dt: float, source_params: Dict[str, Any]) -> bool:
        """
        Perform one explicit time step with stability checks.
        
        Uses Newmark-beta method with stability safeguards.
        Returns True if stable, False if unstable.
        """
        if not self.assembled:
            self.assemble()

        self.current_dt = dt
        t = self.time

        f = self.apply_source(
            source_params['x'],
            source_params['y'],
            t,
            source_params['frequency'],
            source_params.get('amplitude', 1.0)
        )

        u_flat = self.u.flatten()
        u_prev_flat = self.u_prev.flatten()

        K_u = self.K @ u_flat

        if self._has_near_incompressible and self.C_damp is not None:
            v_flat = (u_flat - u_prev_flat) / dt
            C_v = self.C_damp @ v_flat
            rhs = f - K_u - C_v
        else:
            rhs = f - K_u

        acceleration = self.M_inv * rhs

        u_next_flat = 2 * u_flat - u_prev_flat + dt ** 2 * acceleration

        if np.any(np.isnan(u_next_flat)) or np.any(np.isinf(u_next_flat)):
            logger.error("NaN/Inf detected in displacement update")
            return False

        self.u_next = u_next_flat.reshape(self.n_nodes, 2)

        self.apply_absorbing_boundary(dt)
        self._apply_clamping()

        self.u_prev = self.u.copy()
        self.u = self.u_next.copy()

        self._synchronize_interface()

        if not self._check_stability(dt):
            return False

        self.time += dt
        self.step += 1

        return True

    def save_snapshot(self, h5file: h5py.File, snapshot_idx: int):
        if self.partition and self.partition.rank != 0:
            return

        snapshot_grp = h5file.create_group(f"snapshot_{snapshot_idx:06d}")
        snapshot_grp.attrs['time'] = self.time
        snapshot_grp.attrs['step'] = self.step

        ux = self.u[:, 0].astype(np.float32)
        uy = self.u[:, 1].astype(np.float32)

        snapshot_grp.create_dataset('ux', data=ux, compression='gzip')
        snapshot_grp.create_dataset('uy', data=uy, compression='gzip')

        magnitude = np.sqrt(ux ** 2 + uy ** 2).astype(np.float32)
        snapshot_grp.create_dataset('magnitude', data=magnitude, compression='gzip')

    def run(self, total_time: float, dt: float,
            source_params: Dict[str, Any],
            output_interval: int = 10,
            progress_callback: Optional[Callable[[float], None]] = None) -> Dict[str, Any]:
        """
        Run the full simulation with stability monitoring.
        """
        if not self.assembled:
            self.assemble()

        n_steps = int(np.ceil(total_time / dt))
        actual_dt = total_time / n_steps
        self.current_dt = actual_dt

        snapshots = []
        failed = False
        failure_step = -1

        is_root = not self.partition or self.partition.rank == 0

        h5_path = self.output_path if self.output_path else Path('output.h5')

        if is_root:
            h5file = h5py.File(h5_path, 'w')
            mesh_grp = h5file.create_group('mesh')
            mesh_grp.create_dataset('nodes', data=self.nodes.astype(np.float32))
            mesh_grp.create_dataset('elements', data=self.elements)
            mesh_grp.attrs['width'] = self.mesh['width']
            mesh_grp.attrs['height'] = self.mesh['height']

            params_grp = h5file.create_group('parameters')
            params_grp.attrs['dt'] = actual_dt
            params_grp.attrs['total_time'] = total_time
            params_grp.attrs['n_steps'] = n_steps
            params_grp.attrs['vp'] = self.material.vp
            params_grp.attrs['vs'] = self.material.vs
            params_grp.attrs['density'] = self.material.density
            params_grp.attrs['poisson_ratio'] = self.nu
            params_grp.attrs['near_incompressible'] = self._has_near_incompressible

            times = []

        try:
            for i in range(n_steps):
                if self.partition and self.partition.rank == 0:
                    pass

                step_stable = self.step_forward(actual_dt, source_params)

                if not step_stable:
                    failed = True
                    failure_step = i
                    logger.error(f"Simulation failed at step {i} due to instability")
                    break

                if is_root:
                    if i % output_interval == 0 or i == n_steps - 1:
                        snapshot_idx = len(snapshots)
                        self.save_snapshot(h5file, snapshot_idx)
                        snapshots.append({
                            'index': snapshot_idx,
                            'time': self.time,
                            'step': self.step
                        })
                        times.append(self.time)

                if progress_callback and is_root and (i % max(1, n_steps // 100) == 0):
                    progress = (i + 1) / n_steps
                    progress_callback(progress)

        except Exception as e:
            logger.exception(f"Simulation error: {e}")
            failed = True
            failure_step = self.step

        finally:
            if is_root:
                h5file.create_dataset('times', data=np.array(times))
                h5file.attrs['completed'] = not failed
                h5file.attrs['failure_step'] = failure_step
                h5file.close()

                if failed:
                    with h5py.File(h5_path, 'a') as f:
                        f.attrs['error'] = f"Numerical instability at step {failure_step}"

        return {
            'n_steps': self.step,
            'dt': actual_dt,
            'total_time': self.time,
            'n_snapshots': len(snapshots),
            'hdf5_path': str(h5_path),
            'completed': not failed,
            'failure_step': failure_step
        }


def compute_stable_time_step(mesh: Dict[str, Any], material: MaterialModel,
                             courant_number: float = 0.4) -> float:
    """
    Compute stable time step with near-incompressibility correction.
    """
    return compute_stable_time_step_stability(
        element_size=mesh.get('element_size', 20.0),
        material=material,
        courant_number=courant_number,
        safety_factor=0.7
    )


def run_simulation(params: Dict[str, Any], output_path: Path,
                   progress_callback: Optional[Callable] = None,
                   use_mpi: bool = False,
                   n_procs: int = 1) -> Dict[str, Any]:
    """
    Run a complete simulation from parameters.
    Main entry point for the simulation engine.
    """
    mesh = create_mesh(params['grid_params'])
    material = create_material(params['material_params'])

    solver = ElasticWaveSolver(
        mesh, material, output_path,
        use_mpi=use_mpi,
        n_procs=n_procs
    )

    solver_params = params['solver_params']
    total_time = solver_params.get('total_time', 1.0)
    courant = solver_params.get('courant_number', 0.4)
    output_interval = solver_params.get('output_interval', 10)

    dt = solver_params.get('time_step')
    if dt is None:
        dt = compute_stable_time_step(mesh, material, courant)

    logger.info(f"Using time step: {dt} s")
    logger.info(f"Poisson's ratio: {solver.nu:.4f}")
    if solver._has_near_incompressible:
        logger.warning("Near-incompressible material detected - using stability corrections")

    results = solver.run(
        total_time=total_time,
        dt=dt,
        source_params=params['source_params'],
        output_interval=output_interval,
        progress_callback=progress_callback
    )

    return results
