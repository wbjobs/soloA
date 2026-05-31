import numpy as np
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
from app.schemas import (
    SimulationConfig, IntegratorType, AlgorithmType,
    BodyCreate, BodyResponse
)
from app.simulation.integrators import get_integrator
from app.simulation.collision import handle_collisions, estimate_radius_from_mass


@dataclass
class SimulationState:
    step: int
    time: float
    positions: np.ndarray
    velocities: np.ndarray
    masses: np.ndarray
    radii: np.ndarray
    colors: List[str]
    names: List[str]
    history: List[np.ndarray] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "step": self.step,
            "time": self.time,
            "bodies": [
                {
                    "name": self.names[i] if i < len(self.names) else f"Body_{i}",
                    "mass": float(self.masses[i]),
                    "radius": float(self.radii[i]),
                    "position": {
                        "x": float(self.positions[i, 0]),
                        "y": float(self.positions[i, 1]),
                        "z": float(self.positions[i, 2])
                    },
                    "velocity": {
                        "x": float(self.velocities[i, 0]),
                        "y": float(self.velocities[i, 1]),
                        "z": float(self.velocities[i, 2])
                    },
                    "color": self.colors[i] if i < len(self.colors) else "#ffffff"
                }
                for i in range(len(self.masses))
            ],
            "history": [
                [float(p) for p in pos.flatten()]
                for pos in self.history[-100:]
            ] if self.history else []
        }


class NBodySimulation:
    def __init__(
        self,
        config: SimulationConfig,
        bodies: List[BodyCreate]
    ):
        self.config = config
        self.integrator = get_integrator(config.integrator)
        self._init_state(bodies)

    def _init_state(self, bodies: List[BodyCreate]) -> None:
        n = len(bodies)
        self.state = SimulationState(
            step=0,
            time=0.0,
            positions=np.zeros((n, 3), dtype=np.float64),
            velocities=np.zeros((n, 3), dtype=np.float64),
            masses=np.zeros(n, dtype=np.float64),
            radii=np.zeros(n, dtype=np.float64),
            colors=[],
            names=[],
            history=[]
        )

        for i, body in enumerate(bodies):
            self.state.positions[i] = [body.pos_x, body.pos_y, body.pos_z]
            self.state.velocities[i] = [body.vel_x, body.vel_y, body.vel_z]
            self.state.masses[i] = body.mass
            self.state.radii[i] = body.radius if body.radius else estimate_radius_from_mass(body.mass)
            self.state.colors.append(body.color or "#ffffff")
            self.state.names.append(body.name or f"Body_{i}")

        self.state.history.append(self.state.positions.copy())

    def step(self, steps: int = 1) -> SimulationState:
        for _ in range(steps):
            new_positions, new_velocities = self.integrator(
                self.state.positions,
                self.state.velocities,
                self.state.masses,
                self.config.G,
                self.config.dt,
                self.config.algorithm,
                self.config.theta,
                self.config.softening,
                self.config.enable_relativity,
                self.config.c
            )

            if self.config.enable_collision:
                new_positions, new_velocities, new_masses, new_radii, merged = handle_collisions(
                    new_positions,
                    new_velocities,
                    self.state.masses,
                    self.state.radii
                )

                if merged:
                    self.state.positions = new_positions
                    self.state.velocities = new_velocities
                    self.state.masses = new_masses
                    self.state.radii = new_radii
                    remaining = [i for i in range(len(self.state.masses)) if i not in merged]
                    self.state.colors = [self.state.colors[i] for i in range(len(self.state.masses)) if len(self.state.colors) > i]
                    self.state.names = [self.state.names[i] for i in range(len(self.state.masses)) if len(self.state.names) > i]
                else:
                    self.state.positions = new_positions
                    self.state.velocities = new_velocities
            else:
                self.state.positions = new_positions
                self.state.velocities = new_velocities

            self.state.step += 1
            self.state.time += self.config.dt

            if self.config.save_history:
                self.state.history.append(self.state.positions.copy())
                if len(self.state.history) > 1000:
                    self.state.history = self.state.history[-1000:]

        return self.state

    def get_state(self) -> SimulationState:
        return self.state

    def set_time_scale(self, scale: float) -> None:
        self.config.dt = abs(self.config.dt) * scale if scale != 0 else 0

    def pause(self) -> None:
        self._original_dt = getattr(self, '_original_dt', self.config.dt)
        self.config.dt = 0

    def resume(self) -> None:
        if hasattr(self, '_original_dt'):
            self.config.dt = self._original_dt

    def get_bounding_box(self) -> Tuple[np.ndarray, np.ndarray]:
        if len(self.state.positions) == 0:
            return np.zeros(3), np.zeros(3)
        return np.min(self.state.positions, axis=0), np.max(self.state.positions, axis=0)

    def get_center_of_mass(self) -> np.ndarray:
        if len(self.state.masses) == 0 or np.sum(self.state.masses) == 0:
            return np.zeros(3)
        return np.sum(self.state.positions * self.state.masses[:, np.newaxis], axis=0) / np.sum(self.state.masses)

    def export_history(self, format_type: str = "json") -> Any:
        history_data = {
            "config": {
                "G": self.config.G,
                "dt": self.config.dt,
                "integrator": self.config.integrator.value,
                "algorithm": self.config.algorithm.value,
                "theta": self.config.theta
            },
            "initial_state": {
                "bodies": [
                    {
                        "name": self.state.names[i] if i < len(self.state.names) else f"Body_{i}",
                        "mass": float(self.state.masses[i]),
                        "radius": float(self.state.radii[i]),
                        "color": self.state.colors[i] if i < len(self.state.colors) else "#ffffff"
                    }
                    for i in range(len(self.state.masses))
                ]
            },
            "trajectory": [
                {
                    "step": step,
                    "positions": [[float(p) for p in pos] for pos in positions]
                }
                for step, positions in enumerate(self.state.history)
            ]
        }

        if format_type == "csv":
            csv_lines = ["step,body_id,x,y,z,vx,vy,vz,mass"]
            for step_idx, positions in enumerate(self.state.history):
                for i in range(len(self.state.masses)):
                    if i < len(positions):
                        pos = positions[i]
                        vel = self.state.velocities[i] if step_idx == len(self.state.history) - 1 else [0, 0, 0]
                        csv_lines.append(f"{step_idx},{i},{pos[0]},{pos[1]},{pos[2]},{vel[0]},{vel[1]},{vel[2]},{self.state.masses[i]}")
            return "\n".join(csv_lines)

        return history_data


class SimulationManager:
    def __init__(self):
        self._simulations: Dict[int, NBodySimulation] = {}

    def create_simulation(
        self,
        sim_id: int,
        config: SimulationConfig,
        bodies: List[BodyCreate]
    ) -> NBodySimulation:
        sim = NBodySimulation(config, bodies)
        self._simulations[sim_id] = sim
        return sim

    def get_simulation(self, sim_id: int) -> Optional[NBodySimulation]:
        return self._simulations.get(sim_id)

    def remove_simulation(self, sim_id: int) -> None:
        if sim_id in self._simulations:
            del self._simulations[sim_id]

    def has_simulation(self, sim_id: int) -> bool:
        return sim_id in self._simulations


simulation_manager = SimulationManager()
