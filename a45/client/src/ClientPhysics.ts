import { 
  PlayerInput, 
  EntitySnapshot,
  clamp,
  vec2Add,
  vec2Scale,
  vec2Length,
  vec2Normalize,
  vec2Sub,
  vec2Distance
} from '@space-trade/shared';
import { PendingInput } from './types';

export interface ReconciliationResult {
  state: {
    position: { x: number; y: number };
    velocity: { x: number; y: number };
    rotation: number;
    angularVelocity: number;
  };
  positionError: number;
  needsCorrection: boolean;
  correctionStrength: number;
}

export interface PhysicsState {
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  rotation: number;
  angularVelocity: number;
}

export class ClientPhysics {
  private static readonly FRICTION = 0.98;
  private static readonly MIN_CORRECTION_FACTOR = 0.05;
  private static readonly MAX_CORRECTION_FACTOR = 0.5;
  private static readonly ERROR_THRESHOLD_WARN = 10;
  private static readonly ERROR_THRESHOLD_CRITICAL = 50;
  private static readonly ERROR_THRESHOLD_TELEPORT = 100;
  private static readonly MAX_DELTA_TIME_MS = 50;
  private static readonly FIXED_DELTA_TIME_MS = 50;
  private static readonly SERVER_TICK_RATE = 50;
  private static readonly PREDICTION_HISTORY_SIZE = 60;

  private static lastError: number = 0;
  private static averageError: number = 0;
  private static errorFrameCount: number = 0;

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
      state = this.applyPhysicsStep(state, input, stepTime, maxSpeed, maxAcceleration, maxAngularSpeed);
      remainingTime -= stepTime;
    }
    
    return state;
  }

  private static applyPhysicsStep(
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

  static reconcileWithServer(
    currentState: PhysicsState,
    serverSnapshot: EntitySnapshot,
    pendingInputs: PendingInput[],
    maxSpeed: number,
    maxAcceleration: number,
    maxAngularSpeed: number,
    currentTime: number = Date.now()
  ): ReconciliationResult {
    const serverState: PhysicsState = {
      position: { ...serverSnapshot.position },
      velocity: { ...serverSnapshot.velocity },
      rotation: serverSnapshot.rotation,
      angularVelocity: serverSnapshot.angularVelocity
    };

    let predictedState = { ...serverState };

    const sortedInputs = [...pendingInputs]
      .filter(p => p.input.sequence > serverSnapshot.sequence)
      .sort((a, b) => a.input.sequence - b.input.sequence);

    let accumulatedTime = 0;
    for (let i = 0; i < sortedInputs.length; i++) {
      const pending = sortedInputs[i];
      let deltaTime: number;
      
      if (i === 0) {
        deltaTime = Math.max(0, Math.min(pending.timestamp - serverSnapshot.timestamp, this.MAX_DELTA_TIME_MS));
      } else {
        deltaTime = Math.max(0, Math.min(pending.timestamp - sortedInputs[i - 1].timestamp, this.MAX_DELTA_TIME_MS));
      }
      
      if (deltaTime > 0 && deltaTime < 1000) {
        accumulatedTime += deltaTime;
        predictedState = this.predictState(
          predictedState,
          pending.input,
          deltaTime,
          maxSpeed,
          maxAcceleration,
          maxAngularSpeed
        );
      }
    }

    const positionError = vec2Distance(currentState.position, predictedState.position);
    const serverPredictedError = vec2Distance(currentState.position, serverState.position);

    this.updateErrorMetrics(positionError);

    let correctionFactor = this.calculateAdaptiveCorrectionFactor(
      positionError, 
      currentState, 
      predictedState
    );

    let finalState: PhysicsState;
    let needsCorrection = true;

    if (positionError < 1.0) {
      finalState = currentState;
      needsCorrection = false;
      correctionFactor = 0;
    } else if (positionError > this.ERROR_THRESHOLD_TELEPORT) {
      console.warn(`[Reconciliation] Critical error (${positionError.toFixed(1)}px), teleporting to server position`);
      finalState = predictedState;
      correctionFactor = 1.0;
    } else if (serverPredictedError > this.ERROR_THRESHOLD_CRITICAL && positionError < this.ERROR_THRESHOLD_CRITICAL) {
      finalState = this.smoothInterpolate(currentState, predictedState, correctionFactor * 1.5);
    } else {
      finalState = this.smoothInterpolate(currentState, predictedState, correctionFactor);
    }

    if (positionError > this.ERROR_THRESHOLD_WARN) {
      console.debug(
        `[Reconciliation] Delta: ${positionError.toFixed(1)}px, ` +
        `Factor: ${correctionFactor.toFixed(3)}, ` +
        `Pending inputs: ${sortedInputs.length}`
      );
    }

    return {
      state: finalState,
      positionError,
      needsCorrection,
      correctionStrength: correctionFactor
    };
  }

  private static smoothInterpolate(
    from: PhysicsState,
    to: PhysicsState,
    factor: number
  ): PhysicsState {
    const clampedFactor = clamp(factor, 0, 1);

    return {
      position: {
        x: from.position.x + (to.position.x - from.position.x) * clampedFactor,
        y: from.position.y + (to.position.y - from.position.y) * clampedFactor
      },
      velocity: {
        x: from.velocity.x + (to.velocity.x - from.velocity.x) * clampedFactor,
        y: from.velocity.y + (to.velocity.y - from.velocity.y) * clampedFactor
      },
      rotation: from.rotation + this.normalizeAngle(to.rotation - from.rotation) * clampedFactor,
      angularVelocity: from.angularVelocity + (to.angularVelocity - from.angularVelocity) * clampedFactor
    };
  }

  private static calculateAdaptiveCorrectionFactor(
    positionError: number,
    currentState: PhysicsState,
    predictedState: PhysicsState
  ): number {
    if (positionError <= 1.0) {
      return 0;
    }

    const speed = vec2Length(currentState.velocity);
    const predictedSpeed = vec2Length(predictedState.velocity);
    const speedFactor = Math.max(speed, predictedSpeed);

    let baseFactor: number;
    if (positionError <= this.ERROR_THRESHOLD_WARN) {
      baseFactor = (positionError / this.ERROR_THRESHOLD_WARN) * 0.15;
    } else if (positionError <= this.ERROR_THRESHOLD_CRITICAL) {
      const t = (positionError - this.ERROR_THRESHOLD_WARN) / 
                (this.ERROR_THRESHOLD_CRITICAL - this.ERROR_THRESHOLD_WARN);
      baseFactor = 0.15 + t * 0.25;
    } else if (positionError <= this.ERROR_THRESHOLD_TELEPORT) {
      const t = (positionError - this.ERROR_THRESHOLD_CRITICAL) / 
                (this.ERROR_THRESHOLD_TELEPORT - this.ERROR_THRESHOLD_CRITICAL);
      baseFactor = 0.4 + t * 0.5;
    } else {
      baseFactor = 1.0;
    }

    const speedMultiplier = 1.0 + Math.min(speedFactor / 500, 1.0);
    const finalFactor = clamp(
      baseFactor * speedMultiplier,
      this.MIN_CORRECTION_FACTOR,
      this.MAX_CORRECTION_FACTOR
    );

    return finalFactor;
  }

  private static updateErrorMetrics(positionError: number): void {
    this.lastError = positionError;
    this.errorFrameCount++;
    
    const alpha = 0.1;
    this.averageError = (1 - alpha) * this.averageError + alpha * positionError;

    if (this.errorFrameCount % 100 === 0 && this.averageError > this.ERROR_THRESHOLD_WARN) {
      console.warn(
        `[Reconciliation] High average error: ${this.averageError.toFixed(1)}px ` +
        `(last: ${this.lastError.toFixed(1)}px). Check network latency or clock sync.`
      );
    }
  }

  static getLastError(): number {
    return this.lastError;
  }

  static getAverageError(): number {
    return this.averageError;
  }

  private static normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  static createPredictionBuffer(): PredictionBuffer {
    return new PredictionBuffer(this.PREDICTION_HISTORY_SIZE);
  }
}

export class PredictionBuffer {
  private buffer: Map<number, PhysicsState> = new Map();
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  saveState(sequence: number, state: PhysicsState): void {
    this.buffer.set(sequence, {
      position: { ...state.position },
      velocity: { ...state.velocity },
      rotation: state.rotation,
      angularVelocity: state.angularVelocity
    });

    if (this.buffer.size > this.maxSize) {
      const oldestKey = Math.min(...this.buffer.keys());
      this.buffer.delete(oldestKey);
    }
  }

  getState(sequence: number): PhysicsState | null {
    return this.buffer.get(sequence) || null;
  }

  getStatesSince(sequence: number): Map<number, PhysicsState> {
    const result = new Map<number, PhysicsState>();
    for (const [seq, state] of this.buffer) {
      if (seq > sequence) {
        result.set(seq, state);
      }
    }
    return result;
  }

  clear(): void {
    this.buffer.clear();
  }

  size(): number {
    return this.buffer.size;
  }
}
