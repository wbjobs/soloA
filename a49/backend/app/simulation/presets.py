import numpy as np
from typing import List
from app.schemas import BodyCreate, SimulationConfig


def create_solar_system_preset(scale: float = 1.0) -> SimulationConfig:
    return SimulationConfig(
        G=6.67430e-11,
        dt=3600 * 24 * 7,
        integrator="rk4",
        algorithm="barnes_hut",
        theta=0.7,
        enable_collision=True,
        save_history=True
    )


def create_solar_system_bodies(scale: float = 1.0) -> List[BodyCreate]:
    AU = 1.496e11 * scale
    bodies = [
        BodyCreate(
            name="Sun",
            mass=1.989e30,
            radius=6.9634e8 * scale,
            pos_x=0, pos_y=0, pos_z=0,
            vel_x=0, vel_y=0, vel_z=0,
            color="#fdb813"
        ),
        BodyCreate(
            name="Mercury",
            mass=3.301e23,
            radius=2.440e6 * scale,
            pos_x=0.387 * AU, pos_y=0, pos_z=0,
            vel_x=0, vel_y=47400, vel_z=0,
            color="#8c7853"
        ),
        BodyCreate(
            name="Venus",
            mass=4.867e24,
            radius=6.052e6 * scale,
            pos_x=0.723 * AU, pos_y=0, pos_z=0,
            vel_x=0, vel_y=35020, vel_z=0,
            color="#ffc649"
        ),
        BodyCreate(
            name="Earth",
            mass=5.972e24,
            radius=6.371e6 * scale,
            pos_x=AU, pos_y=0, pos_z=0,
            vel_x=0, vel_y=29780, vel_z=0,
            color="#4a90e2"
        ),
        BodyCreate(
            name="Mars",
            mass=6.39e23,
            radius=3.390e6 * scale,
            pos_x=1.524 * AU, pos_y=0, pos_z=0,
            vel_x=0, vel_y=24130, vel_z=0,
            color="#e27b58"
        ),
        BodyCreate(
            name="Jupiter",
            mass=1.898e27,
            radius=6.991e7 * scale,
            pos_x=5.203 * AU, pos_y=0, pos_z=0,
            vel_x=0, vel_y=13070, vel_z=0,
            color="#c88b3a"
        ),
        BodyCreate(
            name="Saturn",
            mass=5.683e26,
            radius=5.823e7 * scale,
            pos_x=9.537 * AU, pos_y=0, pos_z=0,
            vel_x=0, vel_y=9690, vel_z=0,
            color="#fad5a5"
        ),
        BodyCreate(
            name="Uranus",
            mass=8.681e25,
            radius=2.536e7 * scale,
            pos_x=19.19 * AU, pos_y=0, pos_z=0,
            vel_x=0, vel_y=6810, vel_z=0,
            color="#d1e7e7"
        ),
        BodyCreate(
            name="Neptune",
            mass=1.024e26,
            radius=2.462e7 * scale,
            pos_x=30.07 * AU, pos_y=0, pos_z=0,
            vel_x=0, vel_y=5430, vel_z=0,
            color="#5b5ddf"
        )
    ]
    return bodies


def create_binary_star_preset() -> SimulationConfig:
    return SimulationConfig(
        G=6.67430e-11,
        dt=3600 * 24,
        integrator="rk4",
        algorithm="barnes_hut",
        theta=0.5,
        enable_collision=False,
        save_history=True
    )


def create_binary_star_bodies() -> List[BodyCreate]:
    AU = 1.496e11
    m1 = 1.989e30
    m2 = 1.5 * 1.989e30
    d = 1.0 * AU

    total_mass = m1 + m2
    r1 = (m2 / total_mass) * d / 2
    r2 = (m1 / total_mass) * d / 2

    v = np.sqrt(6.67430e-11 * total_mass / (2 * (r1 + r2)))

    return [
        BodyCreate(
            name="Star_A",
            mass=m1,
            radius=6.9634e8,
            pos_x=-r1, pos_y=0, pos_z=0,
            vel_x=0, vel_y=v, vel_z=0,
            color="#ff6b6b"
        ),
        BodyCreate(
            name="Star_B",
            mass=m2,
            radius=5.9634e8,
            pos_x=r2, pos_y=0, pos_z=0,
            vel_x=0, vel_y=-v * m1 / m2, vel_z=0,
            color="#4ecdc4"
        )
    ]


def create_random_cluster_preset() -> SimulationConfig:
    return SimulationConfig(
        G=6.67430e-11,
        dt=3600 * 24 * 30,
        integrator="symplectic",
        algorithm="barnes_hut",
        theta=0.7,
        enable_collision=True,
        save_history=True
    )


def create_random_cluster_bodies(n_bodies: int = 100, scale: float = 1.0) -> List[BodyCreate]:
    np.random.seed(42)
    bodies = []
    center_mass = 1e30 * scale
    radius_scale = 1e12 * scale
    vel_scale = 1e4 * np.sqrt(scale)

    bodies.append(BodyCreate(
        name="Center",
        mass=center_mass,
        radius=1e9 * scale,
        pos_x=0, pos_y=0, pos_z=0,
        vel_x=0, vel_y=0, vel_z=0,
        color="#ffffff"
    ))

    colors = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#ffeaa7", "#dfe6e9", "#fd79a8", "#a29bfe"]

    for i in range(n_bodies - 1):
        r = np.random.uniform(radius_scale * 0.1, radius_scale)
        theta = np.random.uniform(0, np.pi)
        phi = np.random.uniform(0, 2 * np.pi)

        x = r * np.sin(theta) * np.cos(phi)
        y = r * np.sin(theta) * np.sin(phi)
        z = r * np.cos(theta)

        v_mag = np.sqrt(6.67430e-11 * center_mass / r) * np.random.uniform(0.5, 1.2)
        v_x = -np.sin(phi) * v_mag
        v_y = np.cos(phi) * v_mag
        v_z = np.random.uniform(-v_mag * 0.1, v_mag * 0.1)

        mass = np.random.uniform(1e24, 1e27) * scale

        bodies.append(BodyCreate(
            name=f"Star_{i}",
            mass=mass,
            radius=np.cbrt(mass) * 1e-8,
            pos_x=x, pos_y=y, pos_z=z,
            vel_x=v_x, vel_y=v_y, vel_z=v_z,
            color=colors[i % len(colors)]
        ))

    return bodies


PRESETS = {
    "solar_system": {
        "config": create_solar_system_preset,
        "bodies": create_solar_system_bodies,
        "description": "简化版太阳系，包含太阳和8颗行星"
    },
    "binary_star": {
        "config": create_binary_star_preset,
        "bodies": create_binary_star_bodies,
        "description": "双星系统，展示两体问题的轨道运动"
    },
    "star_cluster": {
        "config": create_random_cluster_preset,
        "bodies": lambda: create_random_cluster_bodies(n_bodies=50),
        "description": "随机生成的星团（50颗天体）"
    }
}


def create_relativistic_mercury_preset() -> SimulationConfig:
    return SimulationConfig(
        G=6.67430e-11,
        dt=3600 * 24,
        integrator="rk4",
        algorithm="direct",
        theta=0.7,
        enable_collision=False,
        save_history=True,
        enable_relativity=True,
        c=299792458.0,
        softening=1e-10
    )


def create_relativistic_mercury_bodies() -> List[BodyCreate]:
    AU = 1.496e11
    return [
        BodyCreate(
            name="Sun",
            mass=1.989e30,
            radius=6.9634e8,
            pos_x=0, pos_y=0, pos_z=0,
            vel_x=0, vel_y=0, vel_z=0,
            color="#fdb813"
        ),
        BodyCreate(
            name="Mercury",
            mass=3.301e23,
            radius=2.440e6,
            pos_x=0.387 * AU, pos_y=0, pos_z=0,
            vel_x=0, vel_y=47400, vel_z=0,
            color="#8c7853"
        ),
        BodyCreate(
            name="Venus",
            mass=4.867e24,
            radius=6.052e6,
            pos_x=0.723 * AU, pos_y=0, pos_z=0,
            vel_x=0, vel_y=35020, vel_z=0,
            color="#ffc649"
        ),
        BodyCreate(
            name="Earth",
            mass=5.972e24,
            radius=6.371e6,
            pos_x=AU, pos_y=0, pos_z=0,
            vel_x=0, vel_y=29780, vel_z=0,
            color="#4a90e2"
        ),
        BodyCreate(
            name="Mars",
            mass=6.39e23,
            radius=3.390e6,
            pos_x=1.524 * AU, pos_y=0, pos_z=0,
            vel_x=0, vel_y=24130, vel_z=0,
            color="#e27b58"
        ),
        BodyCreate(
            name="Jupiter",
            mass=1.898e27,
            radius=6.991e7,
            pos_x=5.203 * AU, pos_y=0, pos_z=0,
            vel_x=0, vel_y=13070, vel_z=0,
            color="#c88b3a"
        )
    ]


def create_asteroid_belt_preset() -> SimulationConfig:
    return SimulationConfig(
        G=6.67430e-11,
        dt=3600 * 24 * 30,
        integrator="symplectic",
        algorithm="barnes_hut",
        theta=0.7,
        enable_collision=False,
        save_history=True
    )


def create_asteroid_belt_bodies(n_asteroids: int = 200) -> List[BodyCreate]:
    np.random.seed(42)
    AU = 1.496e11

    bodies = []

    bodies.append(BodyCreate(
        name="Sun",
        mass=1.989e30,
        radius=6.9634e8,
        pos_x=0, pos_y=0, pos_z=0,
        vel_x=0, vel_y=0, vel_z=0,
        color="#fdb813"
    ))

    bodies.append(BodyCreate(
        name="Jupiter",
        mass=1.898e27,
        radius=6.991e7,
        pos_x=5.203 * AU, pos_y=0, pos_z=0,
        vel_x=0, vel_y=13070, vel_z=0,
        color="#c88b3a"
    ))

    kirkwood_gaps = [2.06, 2.50, 2.82, 2.95, 3.27]

    colors = ["#d4a574", "#c9a86c", "#b8956e", "#a67c52", "#8b6914", "#cd853f", "#daa520"]

    asteroid_count = 0
    while asteroid_count < n_asteroids:
        r_au = np.random.uniform(2.0, 3.5)

        in_gap = False
        for gap in kirkwood_gaps:
            if abs(r_au - gap) < 0.05:
                in_gap = True
                break

        if in_gap and np.random.random() < 0.95:
            continue

        r = r_au * AU
        theta = np.random.uniform(-0.1, 0.1)
        phi = np.random.uniform(0, 2 * np.pi)

        x = r * np.cos(phi)
        y = r * np.sin(phi)
        z = r * np.sin(theta)

        v_mag = np.sqrt(6.67430e-11 * 1.989e30 / r)
        v_x = -v_mag * np.sin(phi) * (1 + np.random.uniform(-0.05, 0.05))
        v_y = v_mag * np.cos(phi) * (1 + np.random.uniform(-0.05, 0.05))
        v_z = v_mag * np.sin(theta) * np.random.uniform(-0.1, 0.1)

        mass = np.random.uniform(1e15, 1e19)
        radius = np.cbrt(mass) * 1e-7

        bodies.append(BodyCreate(
            name=f"Asteroid_{asteroid_count}",
            mass=mass,
            radius=radius,
            pos_x=x, pos_y=y, pos_z=z,
            vel_x=v_x, vel_y=v_y, vel_z=v_z,
            color=colors[asteroid_count % len(colors)]
        ))
        asteroid_count += 1

    return bodies


def create_habitable_zone_demo_preset() -> SimulationConfig:
    return SimulationConfig(
        G=6.67430e-11,
        dt=3600 * 24 * 10,
        integrator="rk4",
        algorithm="barnes_hut",
        theta=0.7,
        enable_collision=False,
        save_history=True
    )


def create_habitable_zone_demo_bodies() -> List[BodyCreate]:
    AU = 1.496e11

    bodies = [
        BodyCreate(
            name="Sun",
            mass=1.989e30,
            radius=6.9634e8,
            pos_x=0, pos_y=0, pos_z=0,
            vel_x=0, vel_y=0, vel_z=0,
            color="#fdb813"
        ),
        BodyCreate(
            name="Mercury",
            mass=3.301e23,
            radius=2.440e6,
            pos_x=0.387 * AU, pos_y=0, pos_z=0,
            vel_x=0, vel_y=47400, vel_z=0,
            color="#8c7853"
        ),
        BodyCreate(
            name="Venus",
            mass=4.867e24,
            radius=6.052e6,
            pos_x=0.723 * AU, pos_y=0, pos_z=0,
            vel_x=0, vel_y=35020, vel_z=0,
            color="#ffc649"
        ),
        BodyCreate(
            name="Earth",
            mass=5.972e24,
            radius=6.371e6,
            pos_x=AU, pos_y=0, pos_z=0,
            vel_x=0, vel_y=29780, vel_z=0,
            color="#4a90e2"
        ),
        BodyCreate(
            name="Mars",
            mass=6.39e23,
            radius=3.390e6,
            pos_x=1.524 * AU, pos_y=0, pos_z=0,
            vel_x=0, vel_y=24130, vel_z=0,
            color="#e27b58"
        ),
        BodyCreate(
            name="Habitable_Inner",
            mass=1e20,
            radius=1e6,
            pos_x=0.95 * AU, pos_y=0, pos_z=0,
            vel_x=0, vel_y=30500, vel_z=0,
            color="#00ff88"
        ),
        BodyCreate(
            name="Habitable_Outer",
            mass=1e20,
            radius=1e6,
            pos_x=1.67 * AU, pos_y=0, pos_z=0,
            vel_x=0, vel_y=23000, vel_z=0,
            color="#00ccff"
        )
    ]

    return bodies


PRESETS["relativistic_mercury"] = {
    "config": create_relativistic_mercury_preset,
    "bodies": create_relativistic_mercury_bodies,
    "description": "相对论水星进动模拟（1PN修正，展示近日点进动）"
}

PRESETS["asteroid_belt"] = {
    "config": create_asteroid_belt_preset,
    "bodies": create_asteroid_belt_bodies,
    "description": "小行星带 + 木星，展示 Kirkwood 间隙（200颗小行星）"
}

PRESETS["habitable_zone"] = {
    "config": create_habitable_zone_demo_preset,
    "bodies": create_habitable_zone_demo_bodies,
    "description": "宜居带演示，包含内外边界标记天体"
}

