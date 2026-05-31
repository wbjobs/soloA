use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ParticleType {
    A,
    B,
    C,
}

impl ParticleType {
    pub fn to_index(self) -> usize {
        match self {
            ParticleType::A => 0,
            ParticleType::B => 1,
            ParticleType::C => 2,
        }
    }

    pub fn from_index(index: usize) -> Self {
        match index % 3 {
            0 => ParticleType::A,
            1 => ParticleType::B,
            2 => ParticleType::C,
            _ => ParticleType::A,
        }
    }

    pub fn color(self) -> [f32; 3] {
        match self {
            ParticleType::A => [1.0, 0.2, 0.2],
            ParticleType::B => [0.2, 1.0, 0.2],
            ParticleType::C => [0.2, 0.2, 1.0],
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct Particle {
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub particle_type: ParticleType,
}

impl Particle {
    pub fn new(x: f32, y: f32, particle_type: ParticleType) -> Self {
        Self {
            x,
            y,
            vx: 0.0,
            vy: 0.0,
            particle_type,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InteractionRules {
    pub attraction_strength: [[f32; 3]; 3],
    pub repulsion_strength: [[f32; 3]; 3],
    pub attraction_radius: f32,
    pub repulsion_radius: f32,
    pub friction: f32,
    pub max_speed: f32,
}

impl Default for InteractionRules {
    fn default() -> Self {
        let mut attraction = [[0.0; 3]; 3];
        let mut repulsion = [[0.0; 3]; 3];
        
        attraction[ParticleType::A.to_index()][ParticleType::B.to_index()] = 0.5;
        attraction[ParticleType::B.to_index()][ParticleType::C.to_index()] = 0.5;
        attraction[ParticleType::C.to_index()][ParticleType::A.to_index()] = 0.5;
        
        repulsion[ParticleType::A.to_index()][ParticleType::C.to_index()] = 0.3;
        repulsion[ParticleType::B.to_index()][ParticleType::A.to_index()] = 0.3;
        repulsion[ParticleType::C.to_index()][ParticleType::B.to_index()] = 0.3;
        
        Self {
            attraction_strength: attraction,
            repulsion_strength: repulsion,
            attraction_radius: 60.0,
            repulsion_radius: 20.0,
            friction: 0.95,
            max_speed: 5.0,
        }
    }
}
