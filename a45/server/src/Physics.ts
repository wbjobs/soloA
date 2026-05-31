import { PlayerInput, PlayerShip, clamp, vec2Add, vec2Scale, vec2Length, vec2Normalize } from '@space-trade/shared';

export interface PhysicsState {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  rotation: number;
  angularVelocity: number;
}

export class PhysicsEngine {
  private static readonly FRICTION = 0.98;
  private static readonly MAX_DELTA_TIME_MS = 50;
  private static readonly FIXED_DELTA_TIME_MS = 50;

  static updateShip(
    ship: PlayerShip,
    input: PlayerInput,
    deltaTimeMs: number
  ): void {
    const clampedDelta = Math.min(deltaTimeMs, this.MAX_DELTA_TIME_MS);
    
    let remainingTime = clampedDelta;
    
    while (remainingTime > 0) {
      const stepTime = Math.min(remainingTime, this.FIXED_DELTA_TIME_MS);
      this.applyPhysicsStep(ship, input, stepTime);
      remainingTime -= stepTime;
    }
  }

  private static applyPhysicsStep(
    ship: PlayerShip,
    input: PlayerInput,
    deltaTimeMs: number
  ): void {
    const dt = deltaTimeMs / 1000;

    const turnAmount = clamp(input.turn, -1, 1);
    ship.angularVelocity = turnAmount * ship.maxAngularSpeed;
    ship.rotation += ship.angularVelocity * dt;
    ship.rotation = this.normalizeAngle(ship.rotation);

    const throttle = clamp(input.throttle, 0, 1);
    const acceleration = throttle * ship.maxAcceleration;
    
    const forwardVector = {
      x: Math.cos(ship.rotation),
      y: Math.sin(ship.rotation)
    };

    const velocityDelta = vec2Scale(forwardVector, acceleration * dt);
    ship.velocity = vec2Add(ship.velocity, velocityDelta);

    const speed = vec2Length(ship.velocity);
    if (speed > ship.maxSpeed) {
      const normalizedVelocity = vec2Normalize(ship.velocity);
      ship.velocity = vec2Scale(normalizedVelocity, ship.maxSpeed);
    }

    if (throttle < 0.01) {
      ship.velocity = vec2Scale(ship.velocity, this.FRICTION);
      if (vec2Length(ship.velocity) < 0.01) {
        ship.velocity = { x: 0, y: 0 };
      }
    }

    ship.position = vec2Add(ship.position, vec2Scale(ship.velocity, dt));
  }

  static predictState(
    initialState: PhysicsState,
    input: PlayerInput,
    deltaTimeMs: number,
    maxSpeed: number,
    maxAcceleration: number,
    maxAngularSpeed: number
  ): PhysicsState {
    const clampedDelta = Math.min(deltaTimeMs, this.MAX_DELTA_TIME_MS);
    
    let state: PhysicsState = {
      position: { ...initialState.position },
      velocity: { ...initialState.velocity },
      rotation: initialState.rotation,
      angularVelocity: initialState.angularVelocity
    };
    
    let remainingTime = clampedDelta;
    
    while (remainingTime > 0) {
      const stepTime = Math.min(remainingTime, this.FIXED_DELTA_TIME_MS);
      state = this.applyPredictionStep(state, input, stepTime, maxSpeed, maxAcceleration, maxAngularSpeed);
      remainingTime -= stepTime;
    }
    
    return state;
  }

  private static applyPredictionStep(
    state: PhysicsState,
    input: PlayerInput,
    deltaTimeMs: number,
    maxSpeed: number,
    maxAcceleration: number,
    maxAngularSpeed: number
  ): PhysicsState {
    const dt = deltaTimeMs / 1000;

    let { position, velocity, rotation, angularVelocity } = { ...state };

    const turnAmount = clamp(input.turn, -1, 1);
    angularVelocity = turnAmount * maxAngularSpeed;
    rotation += angularVelocity * dt;
    rotation = this.normalizeAngle(rotation);

    const throttle = clamp(input.throttle, 0, 1);
    const acceleration = throttle * maxAcceleration;

    const forwardVector = {
      x: Math.cos(rotation),
      y: Math.sin(rotation)
    };

    const velocityDelta = vec2Scale(forwardVector, acceleration * dt);
    velocity = vec2Add(velocity, velocityDelta);

    const speed = vec2Length(velocity);
    if (speed > maxSpeed) {
      const normalizedVelocity = vec2Normalize(velocity);
      velocity = vec2Scale(normalizedVelocity, maxSpeed);
    }

    if (throttle < 0.01) {
      velocity = vec2Scale(velocity, this.FRICTION);
      if (vec2Length(velocity) < 0.01) {
        velocity = { x: 0, y: 0 };
      }
    }

    position = vec2Add(position, vec2Scale(velocity, dt));

    return { position, velocity, rotation, angularVelocity };
  }

  private static normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }
}
