use crate::particle::{Particle, ParticleType, InteractionRules};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::time::Instant;
use std::collections::VecDeque;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationConfig {
    pub width: f32,
    pub height: f32,
    pub particle_count: usize,
    pub rules: InteractionRules,
    pub boundary_type: BoundaryType,
}

impl Default for SimulationConfig {
    fn default() -> Self {
        Self {
            width: 800.0,
            height: 600.0,
            particle_count: 10000,
            rules: InteractionRules::default(),
            boundary_type: BoundaryType::Wrap,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BoundaryType {
    Wrap,
    Bounce,
}

pub struct PopulationHistory {
    pub max_points: usize,
    pub counts: VecDeque<[usize; 3]>,
    pub fps: VecDeque<f32>,
    pub timestamps: VecDeque<f64>,
}

impl PopulationHistory {
    pub fn new(max_points: usize) -> Self {
        Self {
            max_points,
            counts: VecDeque::with_capacity(max_points),
            fps: VecDeque::with_capacity(max_points),
            timestamps: VecDeque::with_capacity(max_points),
        }
    }

    pub fn add_sample(&mut self, counts: [usize; 3], fps: f32, timestamp: f64) {
        self.counts.push_back(counts);
        self.fps.push_back(fps);
        self.timestamps.push_back(timestamp);

        while self.counts.len() > self.max_points {
            self.counts.pop_front();
            self.fps.pop_front();
            self.timestamps.pop_front();
        }
    }

    pub fn clear(&mut self) {
        self.counts.clear();
        self.fps.clear();
        self.timestamps.clear();
    }
}

pub struct Simulation {
    pub particles: Vec<Particle>,
    pub config: SimulationConfig,
    pub is_running: bool,
    pub last_update_time: Instant,
    pub population_history: PopulationHistory,
    pub evolution_speed: f64,
    pub start_time: f64,
    pub frame_count: u64,
    
    velocity_buffer: Vec<(f32, f32)>,
    spatial_hash: SpatialHash,
}

impl Simulation {
    pub fn new(config: SimulationConfig) -> Self {
        let particles = Self::initialize_particles(&config);
        let spatial_hash = SpatialHash::new(config.width, config.height, config.rules.attraction_radius);
        
        Self {
            particles,
            config,
            is_running: true,
            last_update_time: Instant::now(),
            population_history: PopulationHistory::new(200),
            evolution_speed: 1.0,
            start_time: Instant::now().elapsed().as_secs_f64(),
            frame_count: 0,
            velocity_buffer: Vec::with_capacity(1024),
            spatial_hash,
        }
    }

    fn initialize_particles(config: &SimulationConfig) -> Vec<Particle> {
        let mut rng = rand::thread_rng();
        let mut particles = Vec::with_capacity(config.particle_count);

        for _ in 0..config.particle_count {
            let x = rng.gen_range(0.0..config.width);
            let y = rng.gen_range(0.0..config.height);
            let particle_type = match rng.gen_range(0..3) {
                0 => ParticleType::A,
                1 => ParticleType::B,
                _ => ParticleType::C,
            };
            particles.push(Particle::new(x, y, particle_type));
        }

        particles
    }

    pub fn update(&mut self) {
        if !self.is_running {
            return;
        }

        let now = Instant::now();
        let dt = (now - self.last_update_time).as_secs_f32().min(0.05) * self.evolution_speed as f32;
        self.last_update_time = now;

        self.spatial_hash.update_cell_size(self.config.rules.attraction_radius);
        self.spatial_hash.build(&self.particles, &self.config);
        
        self.update_velocities_optimized();
        self.update_positions(dt);

        self.frame_count += 1;
        if self.frame_count % 10 == 0 {
            let counts = self.get_population_counts();
            let elapsed = now.elapsed().as_secs_f64();
            let fps = if elapsed > 0.0 {
                self.frame_count as f32 / elapsed as f32
            } else {
                0.0
            };
            self.population_history.add_sample(counts, fps, elapsed);
        }
    }

    fn update_velocities_optimized(&mut self) {
        let config = &self.config;
        let rules = &config.rules;
        let particles = &self.particles;
        
        if self.velocity_buffer.capacity() < particles.len() {
            self.velocity_buffer.reserve(particles.len() - self.velocity_buffer.capacity());
        }
        self.velocity_buffer.clear();
        self.velocity_buffer.resize(particles.len(), (0.0, 0.0));

        let attraction_radius_sq = rules.attraction_radius * rules.attraction_radius;
        let repulsion_radius = rules.repulsion_radius;
        let attraction_radius = rules.attraction_radius;

        for i in 0..particles.len() {
            let p1 = &particles[i];
            let mut ax = 0.0;
            let mut ay = 0.0;

            let neighbors = self.spatial_hash.get_neighbors(p1.x, p1.y, &self.config);
            
            for &j in &neighbors {
                if i == j {
                    continue;
                }

                let p2 = &particles[j];
                let dx = p2.x - p1.x;
                let dy = p2.y - p1.y;

                let (dx, dy) = match config.boundary_type {
                    BoundaryType::Wrap => Self::wrap_delta(dx, dy, config.width, config.height),
                    BoundaryType::Bounce => (dx, dy),
                };

                let dist_sq = dx * dx + dy * dy;
                if dist_sq > attraction_radius_sq {
                    continue;
                }

                let dist = dist_sq.sqrt();
                if dist < 0.001 {
                    continue;
                }

                let type1 = p1.particle_type.to_index();
                let type2 = p2.particle_type.to_index();

                let attraction = rules.attraction_strength[type1][type2];
                let repulsion = rules.repulsion_strength[type1][type2];

                let inv_dist = 1.0 / dist;
                let nx = dx * inv_dist;
                let ny = dy * inv_dist;

                if dist < repulsion_radius {
                    let factor = repulsion / (dist + 0.1);
                    ax -= nx * factor;
                    ay -= ny * factor;
                } else if dist < attraction_radius {
                    let factor = attraction / (dist + 0.1);
                    ax += nx * factor;
                    ay += ny * factor;
                }
            }

            self.velocity_buffer[i] = (ax, ay);
        }

        for (i, (ax, ay)) in self.velocity_buffer.iter().enumerate() {
            let p = &mut self.particles[i];
            p.vx += ax;
            p.vy += ay;

            p.vx *= rules.friction;
            p.vy *= rules.friction;

            let speed_sq = p.vx * p.vx + p.vy * p.vy;
            if speed_sq > rules.max_speed * rules.max_speed {
                let speed = speed_sq.sqrt();
                let scale = rules.max_speed / speed;
                p.vx *= scale;
                p.vy *= scale;
            }
        }
    }

    fn wrap_delta(mut dx: f32, mut dy: f32, width: f32, height: f32) -> (f32, f32) {
        while dx > width * 0.5 {
            dx -= width;
        }
        while dx < -width * 0.5 {
            dx += width;
        }
        while dy > height * 0.5 {
            dy -= height;
        }
        while dy < -height * 0.5 {
            dy += height;
        }
        (dx, dy)
    }

    fn update_positions(&mut self, dt: f32) {
        let config = &self.config;
        let width = config.width;
        let height = config.height;
        
        for p in &mut self.particles {
            p.x += p.vx * dt;
            p.y += p.vy * dt;

            match config.boundary_type {
                BoundaryType::Wrap => {
                    while p.x < 0.0 {
                        p.x += width;
                    }
                    while p.x >= width {
                        p.x -= width;
                    }
                    while p.y < 0.0 {
                        p.y += height;
                    }
                    while p.y >= height {
                        p.y -= height;
                    }
                }
                BoundaryType::Bounce => {
                    if p.x < 0.0 {
                        p.x = 0.0;
                        p.vx = -p.vx * 0.9;
                    } else if p.x > width {
                        p.x = width;
                        p.vx = -p.vx * 0.9;
                    }
                    if p.y < 0.0 {
                        p.y = 0.0;
                        p.vy = -p.vy * 0.9;
                    } else if p.y > height {
                        p.y = height;
                        p.vy = -p.vy * 0.9;
                    }
                }
            }
        }
    }

    pub fn get_population_counts(&self) -> [usize; 3] {
        let mut counts = [0, 0, 0];
        for p in &self.particles {
            counts[p.particle_type.to_index()] += 1;
        }
        counts
    }

    pub fn add_particle(&mut self, x: f32, y: f32, particle_type: ParticleType) {
        self.particles.push(Particle::new(x, y, particle_type));
    }

    pub fn remove_particles_at(&mut self, x: f32, y: f32, radius: f32) -> usize {
        let radius_sq = radius * radius;
        let initial_len = self.particles.len();
        self.particles.retain(|p| {
            let dx = p.x - x;
            let dy = p.y - y;
            dx * dx + dy * dy > radius_sq
        });
        initial_len - self.particles.len()
    }

    pub fn reset(&mut self) {
        self.particles = Self::initialize_particles(&self.config);
        self.frame_count = 0;
        self.last_update_time = Instant::now();
        self.start_time = Instant::now().elapsed().as_secs_f64();
        self.population_history.clear();
    }

    pub fn resize(&mut self, width: f32, height: f32) {
        let scale_x = width / self.config.width;
        let scale_y = height / self.config.height;

        for p in &mut self.particles {
            p.x *= scale_x;
            p.y *= scale_y;
        }

        self.config.width = width;
        self.config.height = height;
        self.spatial_hash.resize(width, height);
    }
}

struct SpatialHash {
    cell_size: f32,
    grid_width: usize,
    grid_height: usize,
    width: f32,
    height: f32,
    cells: Vec<Vec<usize>>,
}

impl SpatialHash {
    fn new(width: f32, height: f32, cell_size: f32) -> Self {
        let grid_width = ((width / cell_size).ceil() as usize).max(1);
        let grid_height = ((height / cell_size).ceil() as usize).max(1);
        
        Self {
            cell_size,
            grid_width,
            grid_height,
            width,
            height,
            cells: vec![Vec::new(); grid_width * grid_height],
        }
    }

    fn resize(&mut self, width: f32, height: f32) {
        self.width = width;
        self.height = height;
        self.grid_width = ((width / self.cell_size).ceil() as usize).max(1);
        self.grid_height = ((height / self.cell_size).ceil() as usize).max(1);
        self.cells = vec![Vec::new(); self.grid_width * self.grid_height];
    }

    fn update_cell_size(&mut self, cell_size: f32) {
        if (cell_size - self.cell_size).abs() > 1.0 {
            self.cell_size = cell_size;
            self.grid_width = ((self.width / cell_size).ceil() as usize).max(1);
            self.grid_height = ((self.height / cell_size).ceil() as usize).max(1);
            self.cells = vec![Vec::new(); self.grid_width * self.grid_height];
        }
    }

    fn get_cell_index(&self, x: f32, y: f32, config: &SimulationConfig) -> (usize, usize) {
        let (mut x, mut y) = match config.boundary_type {
            BoundaryType::Wrap => {
                let mut x = x;
                let mut y = y;
                while x < 0.0 { x += config.width; }
                while x >= config.width { x -= config.width; }
                while y < 0.0 { y += config.height; }
                while y >= config.height { y -= config.height; }
                (x, y)
            }
            BoundaryType::Bounce => {
                let x = x.clamp(0.0, config.width - 0.001);
                let y = y.clamp(0.0, config.height - 0.001);
                (x, y)
            }
        };
        
        let cell_x = (x / self.cell_size).floor() as usize;
        let cell_y = (y / self.cell_size).floor() as usize;
        
        (
            cell_x.min(self.grid_width - 1),
            cell_y.min(self.grid_height - 1),
        )
    }

    fn build(&mut self, particles: &[Particle], config: &SimulationConfig) {
        for cell in &mut self.cells {
            cell.clear();
        }

        for (i, p) in particles.iter().enumerate() {
            let (cx, cy) = self.get_cell_index(p.x, p.y, config);
            let idx = cy * self.grid_width + cx;
            if idx < self.cells.len() {
                self.cells[idx].push(i);
            }
        }
    }

    fn get_neighbors(&self, x: f32, y: f32, config: &SimulationConfig) -> Vec<usize> {
        let (cx, cy) = self.get_cell_index(x, y, config);
        let mut neighbors = Vec::with_capacity(64);

        for dy in [-1, 0, 1].iter() {
            for dx in [-1, 0, 1].iter() {
                let cell_x = cx as i32 + dx;
                let cell_y = cy as i32 + dy;

                let (cell_x, cell_y) = match config.boundary_type {
                    BoundaryType::Wrap => {
                        let mut cell_x = cell_x;
                        let mut cell_y = cell_y;
                        while cell_x < 0 { cell_x += self.grid_width as i32; }
                        while cell_x >= self.grid_width as i32 { cell_x -= self.grid_width as i32; }
                        while cell_y < 0 { cell_y += self.grid_height as i32; }
                        while cell_y >= self.grid_height as i32 { cell_y -= self.grid_height as i32; }
                        (cell_x as usize, cell_y as usize)
                    }
                    BoundaryType::Bounce => {
                        if cell_x < 0 || cell_x >= self.grid_width as i32 ||
                           cell_y < 0 || cell_y >= self.grid_height as i32 {
                            continue;
                        }
                        (cell_x as usize, cell_y as usize)
                    }
                };

                let idx = cell_y * self.grid_width + cell_x;
                if idx < self.cells.len() {
                    neighbors.extend_from_slice(&self.cells[idx]);
                }
            }
        }

        neighbors
    }
}
