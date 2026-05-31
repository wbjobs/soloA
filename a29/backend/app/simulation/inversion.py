import numpy as np
from typing import Dict, Any, List, Tuple, Optional, Callable
from dataclasses import dataclass, field
from pathlib import Path
import h5py
import logging

from .material import MaterialModel
from .mesh_generator import create_mesh
from .solver import ElasticWaveSolver, compute_stable_time_step
from .postprocessing import WavefieldPostprocessor

logger = logging.getLogger(__name__)


@dataclass
class ReceiverData:
    """Observed or synthetic data at receiver stations."""
    x: float
    y: float
    time: np.ndarray
    ux: np.ndarray
    uy: np.ndarray


@dataclass
class SourceParameters:
    """Parameters to be inverted for source mechanism."""
    x: float
    y: float
    strike: float
    dip: float
    rake: float
    moment: float
    depth: float = 0.0

    def to_dict(self) -> Dict[str, float]:
        return {
            'x': self.x,
            'y': self.y,
            'strike': self.strike,
            'dip': self.dip,
            'rake': self.rake,
            'moment': self.moment,
            'depth': self.depth
        }


@dataclass
class InversionResult:
    """Results of the seismic source inversion."""
    best_source: SourceParameters
    initial_source: SourceParameters
    iterations: int
    final_misfit: float
    misfit_history: List[float]
    convergence: bool
    jacobian: Optional[np.ndarray] = None


class AdjointSourceInverter:
    """
    Seismic source inversion using the Adjoint Method.
    
    Solves the inverse problem:
        min_s L(u(s), d_obs)
    
    Where:
    - s: source parameters (location, mechanism, moment)
    - u(s): simulated wavefield
    - d_obs: observed seismograms
    - L: misfit function (e.g., L2 norm)
    
    Uses adjoint method to compute gradient:
        ∇_s L = -∫ u_adjoint · ∂f/∂s dt
    """

    def __init__(
        self,
        mesh_params: Dict[str, Any],
        material: MaterialModel,
        receivers: List[Tuple[float, float]],
        observed_data: Optional[List[ReceiverData]] = None,
        total_time: float = 1.0,
        dt: Optional[float] = None
    ):
        self.mesh_params = mesh_params
        self.material = material
        self.receivers = receivers
        self.observed_data = observed_data
        self.total_time = total_time
        self.dt = dt

        self.mesh = create_mesh(mesh_params)

        if dt is None:
            self.dt = compute_stable_time_step(self.mesh, material)

        self.nodes = self.mesh['nodes']
        self.n_nodes = len(self.nodes)
        self.n_receivers = len(receivers)

        self._setup_solver()

    def _setup_solver(self):
        """Setup the forward solver."""
        self.forward_solver = ElasticWaveSolver(
            self.mesh, self.material,
            use_mpi=False, n_procs=1
        )
        self.forward_solver.assemble()

        self.adjoint_solver = ElasticWaveSolver(
            self.mesh, self.material,
            use_mpi=False, n_procs=1
        )
        self.adjoint_solver.assemble()

    def compute_source_time_function(
        self, t: float, f0: float = 10.0, amplitude: float = 1.0
    ) -> float:
        """Ricker wavelet as source time function."""
        t0 = 1.5 / f0
        tau = np.pi * f0 * (t - t0)
        return amplitude * (1 - 2 * tau ** 2) * np.exp(-tau ** 2)

    def compute_dc_source(
        self,
        source: SourceParameters,
        time: float,
        f0: float = 10.0
    ) -> np.ndarray:
        """
        Compute double-couple (DC) source at a given time.
        Returns force vector for all nodes.
        """
        f = np.zeros(2 * self.n_nodes)

        distances = np.linalg.norm(
            self.nodes - np.array([source.x, source.y]), axis=1
        )
        source_node = np.argmin(distances)

        rad_amp = self._compute_radiation_pattern(source)
        stf = self.compute_source_time_function(time, f0)

        fx = rad_amp[0] * stf * source.moment
        fy = rad_amp[1] * stf * source.moment

        f[2 * source_node] = fx
        f[2 * source_node + 1] = fy

        return f

    def _compute_radiation_pattern(self, source: SourceParameters) -> Tuple[float, float]:
        """
        Compute radiation pattern for a double-couple source.
        Returns (fx, fy) amplitude coefficients for 2D P-SV problem.
        """
        strike_rad = np.radians(source.strike)
        dip_rad = np.radians(source.dip)
        rake_rad = np.radians(source.rake)

        Mxx = -np.sin(dip_rad) * np.cos(rake_rad) * np.sin(2 * strike_rad) - \
              np.sin(2 * dip_rad) * np.sin(rake_rad) * np.sin(strike_rad) ** 2

        Myy = np.sin(dip_rad) * np.cos(rake_rad) * np.sin(2 * strike_rad) - \
              np.sin(2 * dip_rad) * np.sin(rake_rad) * np.cos(strike_rad) ** 2

        Mxy = np.sin(dip_rad) * np.cos(rake_rad) * np.cos(2 * strike_rad) + \
              0.5 * np.sin(2 * dip_rad) * np.sin(rake_rad) * np.sin(2 * strike_rad)

        return 0.5 * (Mxx + Myy), Mxy

    def run_forward(
        self,
        source: SourceParameters,
        f0: float = 10.0,
        store_wavefield: bool = False
    ) -> Tuple[List[ReceiverData], Optional[List[np.ndarray]]]:
        """
        Run forward simulation for given source parameters.
        
        Returns:
            - Synthetic seismograms at receivers
            - (Optional) Stored wavefield snapshots for adjoint computation
        """
        logger.info(f"Running forward simulation for source: ({source.x}, {source.y})")

        self.forward_solver = ElasticWaveSolver(
            self.mesh, self.material,
            use_mpi=False, n_procs=1
        )
        self.forward_solver.assemble()

        n_steps = int(np.ceil(self.total_time / self.dt))
        actual_dt = self.total_time / n_steps

        synthetic_data = []
        for _ in self.receivers:
            synthetic_data.append({
                'time': [], 'ux': [], 'uy': []
            })

        wavefield_store = [] if store_wavefield else None

        for i in range(n_steps):
            t = i * actual_dt

            f_source = self.compute_dc_source(source, t, f0)
            self.forward_solver.u_prev = self.forward_solver.u.copy()

            u_flat = self.forward_solver.u.flatten()
            K_u = self.forward_solver.K @ u_flat

            if self.forward_solver._has_near_incompressible and self.forward_solver.C_damp is not None:
                v_flat = (u_flat - (self.forward_solver.u_prev.flatten() if i > 0 else 0)) / actual_dt
                C_v = self.forward_solver.C_damp @ v_flat
                rhs = f_source - K_u - C_v
            else:
                rhs = f_source - K_u

            acceleration = self.forward_solver.M_inv * rhs
            u_prev_flat = self.forward_solver.u_prev.flatten() if i > 0 else np.zeros_like(u_flat)

            if i == 0:
                u_next_flat = u_flat + 0.5 * actual_dt ** 2 * acceleration
            else:
                u_next_flat = 2 * u_flat - u_prev_flat + actual_dt ** 2 * acceleration

            self.forward_solver.u_next = u_next_flat.reshape(self.n_nodes, 2)

            self.forward_solver.u_prev = self.forward_solver.u.copy()
            self.forward_solver.u = self.forward_solver.u_next.copy()

            self.forward_solver.time = t + actual_dt
            self.forward_solver.step = i + 1

            for j, (rx, ry) in enumerate(self.receivers):
                distances = np.linalg.norm(self.nodes - np.array([rx, ry]), axis=1)
                rec_node = np.argmin(distances)

                synthetic_data[j]['time'].append(t)
                synthetic_data[j]['ux'].append(self.forward_solver.u[rec_node, 0])
                synthetic_data[j]['uy'].append(self.forward_solver.u[rec_node, 1])

            if store_wavefield and wavefield_store is not None:
                wavefield_store.append(self.forward_solver.u.copy())

        receiver_data = [
            ReceiverData(
                x=r[0], y=r[1],
                time=np.array(d['time']),
                ux=np.array(d['ux']),
                uy=np.array(d['uy'])
            )
            for r, d in zip(self.receivers, synthetic_data)
        ]

        return receiver_data, wavefield_store

    def compute_misfit(
        self,
        synthetic: List[ReceiverData],
        observed: List[ReceiverData]
    ) -> float:
        """
        Compute L2 misfit between synthetic and observed data.
        """
        misfit = 0.0

        for syn, obs in zip(synthetic, observed):
            ux_diff = syn.ux - obs.ux
            uy_diff = syn.uy - obs.uy

            misfit += 0.5 * np.sum(ux_diff ** 2 + uy_diff ** 2)

        return misfit

    def run_adjoint(
        self,
        synthetic: List[ReceiverData],
        observed: List[ReceiverData]
    ) -> np.ndarray:
        """
        Run adjoint simulation to compute gradient.
        
        Adjoint source: f_adj = d_syn - d_obs
        Run backward in time to get adjoint wavefield.
        """
        logger.info("Running adjoint simulation")

        self.adjoint_solver = ElasticWaveSolver(
            self.mesh, self.material,
            use_mpi=False, n_procs=1
        )
        self.adjoint_solver.assemble()

        n_steps = len(synthetic[0].time)
        dt = self.dt

        adjoint_wavefields = []

        u_adj_prev = np.zeros((self.n_nodes, 2))
        u_adj = np.zeros((self.n_nodes, 2))

        for i in range(n_steps - 1, -1, -1):
            t = i * dt

            f_adj = np.zeros(2 * self.n_nodes)

            for j, (syn, obs) in enumerate(zip(synthetic, observed)):
                rx, ry = self.receivers[j]
                distances = np.linalg.norm(self.nodes - np.array([rx, ry]), axis=1)
                rec_node = np.argmin(distances)

                ux_residual = syn.ux[i] - obs.ux[i]
                uy_residual = syn.uy[i] - obs.uy[i]

                f_adj[2 * rec_node] = ux_residual
                f_adj[2 * rec_node + 1] = uy_residual

            u_flat = u_adj.flatten()
            K_u = self.adjoint_solver.K @ u_flat

            rhs = f_adj - K_u
            acceleration = self.adjoint_solver.M_inv * rhs

            if i == n_steps - 1:
                u_next_flat = u_flat + 0.5 * dt ** 2 * acceleration
            else:
                u_next_flat = 2 * u_flat - u_adj_prev.flatten() + dt ** 2 * acceleration

            u_adj_next = u_next_flat.reshape(self.n_nodes, 2)

            u_adj_prev = u_adj.copy()
            u_adj = u_adj_next.copy()

            adjoint_wavefields.insert(0, u_adj.copy())

        return np.array(adjoint_wavefields)

    def compute_gradient(
        self,
        source: SourceParameters,
        adjoint_wavefields: np.ndarray,
        forward_wavefields: List[np.ndarray],
        f0: float = 10.0
    ) -> np.ndarray:
        """
        Compute gradient with respect to source parameters.
        Using: ∇_s L = ∫ u_adjoint · ∂f/∂s dt
        """
        n_steps = len(forward_wavefields)
        dt = self.dt

        grad = np.zeros(6)

        for i in range(n_steps):
            t = i * dt
            stf = self.compute_source_time_function(t, f0)
            dstf_dt = self._compute_stf_derivative(t, f0)

            distances = np.linalg.norm(
                self.nodes - np.array([source.x, source.y]), axis=1
            )
            source_node = np.argmin(distances)

            u_adj = adjoint_wavefields[i]

            rad_amp = self._compute_radiation_pattern(source)
            ∂f_∂x, ∂f_∂y = self._compute_source_location_derivative(source, source_node)
            ∂f_∂strike, ∂f_∂dip, ∂f_∂rake = self._compute_mechanism_derivative(source, source_node)

            u_adj_sx = u_adj[source_node, 0]
            u_adj_sy = u_adj[source_node, 1]

            grad[0] += dt * (u_adj_sx * ∂f_∂x[0] + u_adj_sy * ∂f_∂x[1])
            grad[1] += dt * (u_adj_sx * ∂f_∂y[0] + u_adj_sy * ∂f_∂y[1])
            grad[2] += dt * (u_adj_sx * ∂f_∂strike[0] + u_adj_sy * ∂f_∂strike[1])
            grad[3] += dt * (u_adj_sx * ∂f_∂dip[0] + u_adj_sy * ∂f_∂dip[1])
            grad[4] += dt * (u_adj_sx * ∂f_∂rake[0] + u_adj_sy * ∂f_∂rake[1])
            grad[5] += dt * (u_adj_sx * rad_amp[0] * stf + u_adj_sy * rad_amp[1] * stf)

        return grad

    def _compute_stf_derivative(self, t: float, f0: float) -> float:
        """Compute derivative of Ricker wavelet."""
        t0 = 1.5 / f0
        tau = np.pi * f0 * (t - t0)
        return -4 * np.pi * f0 * tau * np.exp(-tau ** 2) * (1 - tau ** 2)

    def _compute_source_location_derivative(
        self, source: SourceParameters, source_node: int
    ) -> Tuple[Tuple[float, float], Tuple[float, float]]:
        """Compute ∂f/∂x and ∂f/∂y."""
        dx = 1.0
        source_plus = SourceParameters(
            x=source.x + dx, y=source.y,
            strike=source.strike, dip=source.dip,
            rake=source.rake, moment=source.moment
        )
        source_minus = SourceParameters(
            x=source.x - dx, y=source.y,
            strike=source.strike, dip=source.dip,
            rake=source.rake, moment=source.moment
        )

        rad_plus = self._compute_radiation_pattern(source_plus)
        rad_minus = self._compute_radiation_pattern(source_minus)

        df_dx = ((rad_plus[0] - rad_minus[0]) / (2 * dx),
                 (rad_plus[1] - rad_minus[1]) / (2 * dx))

        source_plus = SourceParameters(
            x=source.x, y=source.y + dx,
            strike=source.strike, dip=source.dip,
            rake=source.rake, moment=source.moment
        )
        source_minus = SourceParameters(
            x=source.x, y=source.y - dx,
            strike=source.strike, dip=source.dip,
            rake=source.rake, moment=source.moment
        )

        rad_plus = self._compute_radiation_pattern(source_plus)
        rad_minus = self._compute_radiation_pattern(source_minus)

        df_dy = ((rad_plus[0] - rad_minus[0]) / (2 * dx),
                 (rad_plus[1] - rad_minus[1]) / (2 * dx))

        return df_dx, df_dy

    def _compute_mechanism_derivative(
        self, source: SourceParameters, source_node: int
    ) -> Tuple[Tuple[float, float], Tuple[float, float], Tuple[float, float]]:
        """Compute ∂f/∂strike, ∂f/∂dip, ∂f/∂rake."""
        d_angle = np.radians(1.0)

        def finite_difference(param: str, delta: float) -> Tuple[float, float]:
            kwargs = source.to_dict()
            kwargs[param] += delta
            rad_plus = self._compute_radiation_pattern(SourceParameters(**kwargs))

            kwargs[param] -= 2 * delta
            rad_minus = self._compute_radiation_pattern(SourceParameters(**kwargs))

            return ((rad_plus[0] - rad_minus[0]) / (2 * delta),
                    (rad_plus[1] - rad_minus[1]) / (2 * delta))

        df_dstrike = finite_difference('strike', d_angle)
        df_ddip = finite_difference('dip', d_angle)
        df_drake = finite_difference('rake', d_angle)

        return df_dstrike, df_ddip, df_drake

    def invert(
        self,
        initial_source: SourceParameters,
        observed_data: List[ReceiverData],
        max_iterations: int = 50,
        learning_rate: float = 0.01,
        tolerance: float = 1e-6,
        f0: float = 10.0,
        progress_callback: Optional[Callable[[int, float], None]] = None
    ) -> InversionResult:
        """
        Run the source inversion using gradient-based optimization.
        
        Parameters:
            initial_source: Initial guess for source parameters
            observed_data: Observed seismograms
            max_iterations: Maximum number of iterations
            learning_rate: Optimization step size
            tolerance: Convergence tolerance
            f0: Dominant frequency of source time function
            
        Returns:
            InversionResult with best source parameters
        """
        logger.info(f"Starting source inversion with {max_iterations} max iterations")

        current_source = SourceParameters(**initial_source.to_dict())
        best_source = SourceParameters(**initial_source.to_dict())

        misfit_history = []
        best_misfit = float('inf')

        for iteration in range(max_iterations):
            logger.info(f"Iteration {iteration + 1}/{max_iterations}")

            synthetic_data, forward_wavefields = self.run_forward(
                current_source, f0=f0, store_wavefield=True
            )

            misfit = self.compute_misfit(synthetic_data, observed_data)
            misfit_history.append(misfit)

            logger.info(f"  Misfit: {misfit:.6e}")

            if misfit < best_misfit:
                best_misfit = misfit
                best_source = SourceParameters(**current_source.to_dict())

            if progress_callback:
                progress_callback(iteration, misfit)

            if len(misfit_history) > 1:
                misfit_change = abs(misfit_history[-2] - misfit_history[-1]) / (abs(misfit_history[-2]) + 1e-10)
                if misfit_change < tolerance:
                    logger.info(f"Converged at iteration {iteration + 1}")
                    return InversionResult(
                        best_source=best_source,
                        initial_source=initial_source,
                        iterations=iteration + 1,
                        final_misfit=best_misfit,
                        misfit_history=misfit_history,
                        convergence=True
                    )

            adjoint_wavefields = self.run_adjoint(synthetic_data, observed_data)
            gradient = self.compute_gradient(
                current_source, adjoint_wavefields, forward_wavefields, f0
            )

            logger.info(f"  Gradient norm: {np.linalg.norm(gradient):.6e}")

            current_source = self._update_source_parameters(
                current_source, gradient, learning_rate
            )

        logger.info(f"Maximum iterations reached. Final misfit: {best_misfit:.6e}")

        return InversionResult(
            best_source=best_source,
            initial_source=initial_source,
            iterations=max_iterations,
            final_misfit=best_misfit,
            misfit_history=misfit_history,
            convergence=False
        )

    def _update_source_parameters(
        self,
        source: SourceParameters,
        gradient: np.ndarray,
        learning_rate: float
    ) -> SourceParameters:
        """Update source parameters using gradient descent."""
        lr_x = learning_rate * 10.0
        lr_angle = learning_rate * 100.0
        lr_moment = learning_rate * 1e-5

        return SourceParameters(
            x=source.x - lr_x * gradient[0],
            y=source.y - lr_x * gradient[1],
            strike=(source.strike - lr_angle * gradient[2]) % 360,
            dip=max(0.0, min(90.0, source.dip - lr_angle * gradient[3])),
            rake=(source.rake - lr_angle * gradient[4]) % 360,
            moment=max(1e-10, source.moment - lr_moment * gradient[5])
        )


def run_source_inversion(
    params: Dict[str, Any],
    progress_callback: Optional[Callable] = None
) -> Dict[str, Any]:
    """
    Run source inversion from parameters.
    
    Parameters dict structure:
    {
        'mesh_params': {...},
        'material_params': {'vp': ..., 'vs': ..., 'density': ...},
        'receivers': [[x1, y1], [x2, y2], ...],
        'observed_data_path': 'path/to/observed.h5' or 'synthetic',
        'synthetic_source': {...},  # for synthetic test
        'initial_source': {'x': ..., 'y': ..., 'strike': ..., 'dip': ..., 'rake': ..., 'moment': ...},
        'inversion_params': {
            'max_iterations': 50,
            'learning_rate': 0.01,
            'f0': 10.0
        }
    }
    """
    from .material import create_material

    material = create_material(params['material_params'])

    receivers = params['receivers']

    if params.get('observed_data_path') == 'synthetic':
        true_source = SourceParameters(**params['synthetic_source'])

        inverter = AdjointSourceInverter(
            mesh_params=params['mesh_params'],
            material=material,
            receivers=receivers,
            total_time=params.get('total_time', 1.0)
        )

        logger.info("Generating synthetic observed data...")
        observed_data, _ = inverter.run_forward(
            true_source,
            f0=params['inversion_params'].get('f0', 10.0)
        )
    else:
        observed_data = _load_observed_data(params['observed_data_path'])

    initial_source = SourceParameters(**params['initial_source'])

    inverter = AdjointSourceInverter(
        mesh_params=params['mesh_params'],
        material=material,
        receivers=receivers,
        observed_data=observed_data,
        total_time=params.get('total_time', 1.0)
    )

    inv_params = params.get('inversion_params', {})

    result = inverter.invert(
        initial_source=initial_source,
        observed_data=observed_data,
        max_iterations=inv_params.get('max_iterations', 50),
        learning_rate=inv_params.get('learning_rate', 0.01),
        tolerance=inv_params.get('tolerance', 1e-6),
        f0=inv_params.get('f0', 10.0),
        progress_callback=progress_callback
    )

    return {
        'best_source': result.best_source.to_dict(),
        'initial_source': result.initial_source.to_dict(),
        'iterations': result.iterations,
        'final_misfit': result.final_misfit,
        'misfit_history': result.misfit_history,
        'converged': result.convergence
    }


def _load_observed_data(file_path: str) -> List[ReceiverData]:
    """Load observed seismogram data from HDF5 file."""
    data = []
    with h5py.File(file_path, 'r') as f:
        n_receivers = f.attrs.get('n_receivers', 0)
        for i in range(n_receivers):
            grp = f[f'receiver_{i:03d}']
            data.append(ReceiverData(
                x=grp.attrs['x'],
                y=grp.attrs['y'],
                time=grp['time'][:],
                ux=grp['ux'][:],
                uy=grp['uy'][:]
            ))
    return data
